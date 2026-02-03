import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createChart, CandlestickSeries, LineSeries } from 'lightweight-charts';
import { api } from '../services/api';

// Suppress ResizeObserver error (benign browser warning from lightweight-charts)
// Must use capture phase to intercept before webpack-dev-server overlay
if (typeof window !== 'undefined') {
  const resizeObserverHandler = (e) => {
    if (e.message?.includes?.('ResizeObserver loop') ||
        e.error?.message?.includes?.('ResizeObserver loop')) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  };
  window.addEventListener('error', resizeObserverHandler, true);
}

const GexChart = ({ nqQuote, height = 300, gexData, strategyStatus }) => {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const zgSeriesRef = useRef(null); // Zero Gamma time series
  const priceLinesRef = useRef([]);
  const positionLinesRef = useRef([]); // Position entry/target/stop lines
  const candleHistoryRef = useRef([]); // Candlestick history for OHLC data
  const zgHistoryRef = useRef([]); // Zero Gamma history
  const currentPriceRef = useRef(null); // For auto-zoom around current price

  const [chartReady, setChartReady] = useState(false);

  // Transform gexData prop to gexLevels format
  const gexLevels = useMemo(() => {
    const tradier = gexData?.tradier;
    if (!tradier || (!tradier.gammaFlip && !tradier.callWall)) return null;
    return {
      zeroGamma: tradier.gammaFlip,
      callWall: tradier.callWall,
      putWall: tradier.putWall,
      resistance: tradier.resistance?.filter(Boolean) || [],
      support: tradier.support?.filter(Boolean) || [],
    };
  }, [gexData]);

  const loading = !gexData?.tradier;
  const error = null;

  // Compute strategy display values
  const strategyDisplay = useMemo(() => {
    const currentPrice = nqQuote?.close;
    const support1 = gexLevels?.support?.[0];
    const resistance1 = gexLevels?.resistance?.[0];

    // Distance to entry levels
    const distanceToS1 = currentPrice && support1 ? currentPrice - support1 : null;
    const distanceToR1 = currentPrice && resistance1 ? resistance1 - currentPrice : null;

    // Strategy readiness
    const isReady = strategyStatus?.evaluation_readiness?.ready ?? false;
    const inPosition = strategyStatus?.position?.in_position ?? false;
    const inSession = strategyStatus?.strategy?.session?.in_session ?? false;
    const cooldown = strategyStatus?.strategy?.cooldown ?? {};
    const pendingOrders = strategyStatus?.pending_orders ?? { count: 0, orders: [] };
    const position = strategyStatus?.position?.current;
    const blockers = strategyStatus?.evaluation_readiness?.blockers ?? [];

    // Determine status badge
    let statusBadge = { text: 'LOADING', color: 'bg-gray-500' };
    if (strategyStatus) {
      if (inPosition) {
        statusBadge = { text: 'IN POSITION', color: 'bg-yellow-500' };
      } else if (isReady) {
        statusBadge = { text: 'READY', color: 'bg-green-500' };
      } else {
        statusBadge = { text: 'BLOCKED', color: 'bg-red-500' };
      }
    }

    return {
      currentPrice,
      support1,
      resistance1,
      distanceToS1,
      distanceToR1,
      isReady,
      inPosition,
      inSession,
      cooldown,
      pendingOrders,
      position,
      blockers,
      statusBadge,
    };
  }, [nqQuote?.close, gexLevels, strategyStatus]);

  // Initialize chart - always runs since container is always rendered
  useEffect(() => {
    if (!chartContainerRef.current || chartRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth || 600,
      height,
      layout: {
        background: { type: 'solid', color: '#1f2937' },
        textColor: '#d1d5db',
      },
      grid: {
        vertLines: { color: '#374151' },
        horzLines: { color: '#374151' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: '#374151',
        tickMarkFormatter: (time) => {
          const date = new Date(time * 1000);
          return date.toLocaleTimeString('en-US', {
            timeZone: 'America/New_York',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
        },
      },
      rightPriceScale: {
        borderColor: '#374151',
        autoScale: true,
        scaleMargins: {
          top: 0.05,
          bottom: 0.05,
        },
        entireTextOnly: true,
      },
      crosshair: {
        mode: 1, // Magnet mode
      },
      localization: {
        priceFormatter: (price) => price.toFixed(2),
        timeFormatter: (time) => {
          const date = new Date(time * 1000);
          return date.toLocaleTimeString('en-US', {
            timeZone: 'America/New_York',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
        },
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',         // Green for bullish candles
      downColor: '#ef4444',       // Red for bearish candles
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      priceLineVisible: true,
      lastValueVisible: true,
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.25,
      },
      // Auto-zoom to 100 points above and below current price
      autoscaleInfoProvider: () => {
        const price = currentPriceRef.current;
        const buffer = 100;

        if (price) {
          return {
            priceRange: {
              minValue: price - buffer,
              maxValue: price + buffer,
            },
            margins: {
              above: 0,
              below: 0,
            },
          };
        }

        return null;
      },
    });

    // Zero Gamma line series (yellow, step line to show level changes)
    const zgSeries = chart.addSeries(LineSeries, {
      color: '#eab308',
      lineWidth: 2,
      lineType: 1, // 0=Simple, 1=WithSteps, 2=Curved
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'ZG',
      // Use same auto-scale as main series to prevent range expansion
      autoscaleInfoProvider: () => null, // Don't contribute to auto-scale
    });

    chartRef.current = chart;
    seriesRef.current = series;
    zgSeriesRef.current = zgSeries;
    setChartReady(true);

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      zgSeriesRef.current = null;
      setChartReady(false);
    };
  }, [height]);

  // Update price ref for auto-zoom
  useEffect(() => {
    const price = nqQuote?.close;
    if (!price) return;

    // Only update and rescale if price moved significantly (more than 10 points)
    const prevPrice = currentPriceRef.current;
    if (!prevPrice || Math.abs(price - prevPrice) > 10) {
      currentPriceRef.current = price;

      // Trigger rescale
      if (chartRef.current && seriesRef.current && candleHistoryRef.current.length > 0) {
        seriesRef.current.setData(candleHistoryRef.current);
        chartRef.current.timeScale().fitContent();
      }
    }
  }, [nqQuote?.close]);

  // Fetch initial candle history on mount
  useEffect(() => {
    if (!chartReady || !seriesRef.current) return;

    const fetchCandleHistory = async () => {
      try {
        const data = await api.getCandles(60);
        if (!data?.candles || data.candles.length === 0) {
          console.warn('No candle history available');
          return;
        }

        // Transform backend candles to chart format
        const candles = data.candles.map(c => ({
          time: Math.floor(new Date(c.timestamp).getTime() / 1000),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close
        }));

        // Sort by time and deduplicate by timestamp (keep last occurrence)
        candles.sort((a, b) => a.time - b.time);
        const uniqueCandles = candles.filter((c, i, arr) =>
          i === arr.length - 1 || c.time !== arr[i + 1].time
        );

        // Set current price from last candle BEFORE setData so autoscale works
        const lastCandle = uniqueCandles[uniqueCandles.length - 1];
        if (lastCandle) {
          currentPriceRef.current = lastCandle.close;
        }

        // Initialize chart with historical data
        candleHistoryRef.current = uniqueCandles;
        seriesRef.current.setData(uniqueCandles);

        // Set time scale to show the past hour
        const now = Math.floor(Date.now() / 1000);
        const oneHourAgo = now - 3600;
        chartRef.current?.timeScale().setVisibleRange({
          from: oneHourAgo,
          to: now,
        });

        console.log(`Loaded ${uniqueCandles.length} historical candles (${candles.length - uniqueCandles.length} duplicates removed)`);
      } catch (error) {
        console.warn('Failed to load candle history:', error);
      }
    };

    fetchCandleHistory();
  }, [chartReady]);

  // Update candlestick data with real-time OHLC updates
  useEffect(() => {
    if (!seriesRef.current || !nqQuote?.close || !chartReady) return;

    // Get timestamp and round to minute boundary for 1-minute candles
    const timestamp = nqQuote.timestamp
      ? new Date(nqQuote.timestamp).getTime() / 1000
      : Math.floor(Date.now() / 1000);
    const candleTime = Math.floor(timestamp / 60) * 60;

    // Build candle from quote data
    const candle = {
      time: candleTime,
      open: nqQuote.open || nqQuote.close,
      high: nqQuote.high || nqQuote.close,
      low: nqQuote.low || nqQuote.close,
      close: nqQuote.close
    };

    const history = candleHistoryRef.current;
    const lastCandle = history[history.length - 1];

    if (lastCandle && lastCandle.time === candleTime) {
      // Update current candle - high/low may have expanded
      lastCandle.high = Math.max(lastCandle.high, candle.high);
      lastCandle.low = Math.min(lastCandle.low, candle.low);
      lastCandle.close = candle.close;
      seriesRef.current.update(lastCandle);
    } else if (!lastCandle || candleTime > lastCandle.time) {
      // New candle started (only if time is advancing)
      history.push(candle);
      // Keep last 60 candles (1 hour of 1-min data)
      if (history.length > 60) {
        history.shift();
      }
      seriesRef.current.setData(history);
    } else {
      // Candle with older timestamp - check if it already exists and update
      const existingIndex = history.findIndex(c => c.time === candleTime);
      if (existingIndex >= 0) {
        // Update existing candle instead of adding duplicate
        history[existingIndex] = candle;
        seriesRef.current.setData(history);
      }
      // If not found and older than oldest, ignore it
    }

    // Extend ZG line to current time (step line stays flat until value changes)
    const now = Math.floor(Date.now() / 1000);
    if (zgSeriesRef.current && zgHistoryRef.current.length > 0) {
      const zgHistory = zgHistoryRef.current;
      const firstZg = zgHistory[0];
      const lastZg = zgHistory[zgHistory.length - 1];
      if (now > lastZg.time) {
        // Build clean data array with extension points
        const chartData = zgHistory.map(p => ({ time: p.time, value: p.value }));

        // Extend left to one hour ago
        const oneHourAgo = now - 3600;
        if (firstZg.time > oneHourAgo) {
          chartData.unshift({ time: oneHourAgo, value: firstZg.value });
        }

        // Extend right to current time
        chartData.push({ time: now, value: lastZg.value });

        // Sort and deduplicate to ensure ascending order (safety measure)
        chartData.sort((a, b) => a.time - b.time);
        const uniqueChartData = chartData.filter((p, i, arr) =>
          i === arr.length - 1 || p.time !== arr[i + 1].time
        );

        zgSeriesRef.current.setData(uniqueChartData);
      }
    }
  }, [nqQuote, chartReady]);

  // GEX level lines
  useEffect(() => {
    if (!seriesRef.current || !gexLevels || !chartReady) return;

    // Remove existing price lines
    priceLinesRef.current.forEach(line => {
      try {
        seriesRef.current.removePriceLine(line);
      } catch (e) {
        // Line may already be removed
      }
    });
    priceLinesRef.current = [];

    const createLine = (price, title, color, lineStyle = 0) => {
      if (!price || price === 0) return;
      try {
        const line = seriesRef.current.createPriceLine({
          price,
          color,
          lineWidth: 2,
          lineStyle, // 0 = solid, 2 = dashed
          axisLabelVisible: true,
          title,
        });
        priceLinesRef.current.push(line);
      } catch (e) {
        // Silently ignore price line errors
      }
    };

    // Main levels (solid lines) - Zero Gamma is now a time series
    createLine(gexLevels.callWall, 'CW', '#ef4444', 0);   // Red (resistance)
    createLine(gexLevels.putWall, 'PW', '#22c55e', 0);    // Green (support)

    // Resistance levels (dashed orange)
    gexLevels.resistance?.forEach((level, i) => {
      createLine(level, `R${i + 1}`, '#f97316', 2);
    });

    // Support levels (dashed cyan)
    gexLevels.support?.forEach((level, i) => {
      createLine(level, `S${i + 1}`, '#06b6d4', 2);
    });

    // Update Zero Gamma time series (step line)
    // Needs 2+ points to draw a line, so we always extend to "now"
    if (zgSeriesRef.current && gexLevels.zeroGamma) {
      const now = Math.floor(Date.now() / 1000);
      const history = zgHistoryRef.current;

      // Keep last hour of real data points
      const filtered = history.filter(p => now - p.time < 3600);

      // Check if we need to add or update a point
      const lastPoint = filtered[filtered.length - 1];
      if (!lastPoint) {
        // No points yet - add first point
        filtered.push({ time: now, value: gexLevels.zeroGamma });
      } else if (lastPoint.time === now) {
        // Same timestamp - update value in place (prevents duplicates)
        lastPoint.value = gexLevels.zeroGamma;
      } else if (lastPoint.value !== gexLevels.zeroGamma) {
        // Value changed and time advanced - add new point
        filtered.push({ time: now, value: gexLevels.zeroGamma });
      }

      zgHistoryRef.current = filtered;

      // Build clean data array for chart
      const chartData = filtered.map(p => ({ time: p.time, value: p.value }));
      if (chartData.length > 0) {
        const first = chartData[0];
        const last = chartData[chartData.length - 1];

        // Extend left to one hour ago so line fills the chart
        const oneHourAgo = now - 3600;
        if (first.time > oneHourAgo) {
          chartData.unshift({ time: oneHourAgo, value: first.value });
        }

        // Extend right to current time
        if (now > last.time) {
          chartData.push({ time: now, value: last.value });
        }
      }

      // Sort and deduplicate to ensure ascending order (safety measure)
      chartData.sort((a, b) => a.time - b.time);
      const uniqueChartData = chartData.filter((p, i, arr) =>
        i === arr.length - 1 || p.time !== arr[i + 1].time
      );

      zgSeriesRef.current.setData(uniqueChartData);
    }

  }, [gexLevels, chartReady]);

  // Position lines (entry, target, stop) when in position
  useEffect(() => {
    if (!seriesRef.current || !chartReady) return;

    // Remove existing position lines
    positionLinesRef.current.forEach(line => {
      try {
        seriesRef.current.removePriceLine(line);
      } catch (e) {
        // Line may already be removed
      }
    });
    positionLinesRef.current = [];

    // Add position lines if in position
    const position = strategyStatus?.position?.current;
    if (position && strategyStatus?.position?.in_position) {
      const createPositionLine = (price, title, color, lineStyle = 0, lineWidth = 2) => {
        if (!price || price === 0) return;
        try {
          const line = seriesRef.current.createPriceLine({
            price,
            color,
            lineWidth,
            lineStyle,
            axisLabelVisible: true,
            title,
          });
          positionLinesRef.current.push(line);
        } catch (e) {
          // Silently ignore
        }
      };

      // Entry price (white solid)
      createPositionLine(position.entry_price, 'ENTRY', '#ffffff', 0, 2);

      // Get target and stop from the strategy params (7pt target, 3pt stop for scalp)
      const isLong = position.side === 'long';
      const targetPrice = isLong ? position.entry_price + 7 : position.entry_price - 7;
      const stopPrice = isLong ? position.entry_price - 3 : position.entry_price + 3;

      // Target (green dashed)
      createPositionLine(targetPrice, 'TGT', '#22c55e', 2, 1);
      // Stop (red dashed)
      createPositionLine(stopPrice, 'STOP', '#ef4444', 2, 1);
    }
  }, [strategyStatus?.position, chartReady]);

  // Determine status message
  const getStatusMessage = () => {
    if (loading && !gexLevels) return 'Loading GEX levels...';
    if (error && !gexLevels) return error;
    if (!nqQuote?.close) return 'Waiting for NQ price data...';
    return null;
  };

  const statusMessage = getStatusMessage();

  // Helper to format distance with color
  const getDistanceColor = (distance) => {
    if (distance === null) return 'text-gray-400';
    const absDistance = Math.abs(distance);
    if (absDistance <= 3) return 'text-green-400 animate-pulse';
    if (absDistance <= 10) return 'text-yellow-400';
    return 'text-gray-300';
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      {/* Header with title, legend, and status badge */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-white">NQ vs GEX Levels</h3>
          {/* Strategy Status Badge */}
          <span className={`px-2 py-0.5 rounded text-xs font-bold text-white ${strategyDisplay.statusBadge.color}`}>
            {strategyDisplay.statusBadge.text}
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            CW
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
            ZG
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            PW
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-cyan-500"></span>
            S1
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-orange-500"></span>
            R1
          </span>
        </div>
      </div>

      {/* Chart container with distance overlay */}
      <div className="relative w-full">
        <div ref={chartContainerRef} style={{ height: `${height}px`, width: '100%' }} />

        {/* Distance to entry levels overlay (top-left) */}
        {!statusMessage && strategyDisplay.currentPrice && (
          <div className="absolute top-2 left-2 bg-gray-900 bg-opacity-80 rounded px-3 py-2 text-xs">
            <div className="font-semibold text-gray-300 mb-1">Distance to Entry</div>
            <div className="flex flex-col gap-1">
              <div className="flex justify-between gap-4">
                <span className="text-cyan-400">S1 (Long):</span>
                <span className={getDistanceColor(strategyDisplay.distanceToS1)}>
                  {strategyDisplay.distanceToS1 !== null
                    ? `${strategyDisplay.distanceToS1 > 0 ? '+' : ''}${strategyDisplay.distanceToS1.toFixed(1)} pts`
                    : '--'}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-orange-400">R1 (Short):</span>
                <span className={getDistanceColor(strategyDisplay.distanceToR1)}>
                  {strategyDisplay.distanceToR1 !== null
                    ? `${strategyDisplay.distanceToR1 > 0 ? '+' : ''}${strategyDisplay.distanceToR1.toFixed(1)} pts`
                    : '--'}
                </span>
              </div>
            </div>
            {/* Entry zone indicator */}
            {(strategyDisplay.distanceToS1 !== null && Math.abs(strategyDisplay.distanceToS1) <= 3) && (
              <div className="mt-1 text-green-400 font-bold text-center animate-pulse">
                ⚡ LONG ENTRY ZONE
              </div>
            )}
            {(strategyDisplay.distanceToR1 !== null && Math.abs(strategyDisplay.distanceToR1) <= 3) && (
              <div className="mt-1 text-green-400 font-bold text-center animate-pulse">
                ⚡ SHORT ENTRY ZONE
              </div>
            )}
          </div>
        )}

        {/* Position info overlay (top-right) */}
        {strategyDisplay.inPosition && strategyDisplay.position && (
          <div className="absolute top-2 right-2 bg-gray-900 bg-opacity-80 rounded px-3 py-2 text-xs">
            <div className={`font-bold mb-1 ${strategyDisplay.position.side === 'long' ? 'text-green-400' : 'text-red-400'}`}>
              {strategyDisplay.position.side?.toUpperCase()} @ {strategyDisplay.position.entry_price?.toFixed(2)}
            </div>
            {strategyDisplay.currentPrice && (
              <div className="text-gray-300">
                P&L: <span className={strategyDisplay.position.side === 'long'
                  ? (strategyDisplay.currentPrice >= strategyDisplay.position.entry_price ? 'text-green-400' : 'text-red-400')
                  : (strategyDisplay.currentPrice <= strategyDisplay.position.entry_price ? 'text-green-400' : 'text-red-400')
                }>
                  {strategyDisplay.position.side === 'long'
                    ? (strategyDisplay.currentPrice - strategyDisplay.position.entry_price).toFixed(2)
                    : (strategyDisplay.position.entry_price - strategyDisplay.currentPrice).toFixed(2)
                  } pts
                </span>
              </div>
            )}
          </div>
        )}

        {/* Overlay message when waiting for data */}
        {statusMessage && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-90"
            style={{ height: `${height}px` }}
          >
            <span className={error ? 'text-red-400' : 'text-gray-400'}>
              {statusMessage}
            </span>
          </div>
        )}
      </div>

      {/* Footer status bar */}
      <div className="mt-3 pt-3 border-t border-gray-700">
        <div className="flex flex-wrap justify-between items-center gap-4 text-xs">
          {/* Session status */}
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Session:</span>
            <span className={strategyDisplay.inSession ? 'text-green-400' : 'text-gray-500'}>
              {strategyDisplay.inSession ? 'RTH ✓' : 'Outside RTH'}
            </span>
          </div>

          {/* Cooldown status */}
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Cooldown:</span>
            <span className={strategyDisplay.cooldown.in_cooldown ? 'text-yellow-400' : 'text-green-400'}>
              {strategyDisplay.cooldown.in_cooldown
                ? `${strategyDisplay.cooldown.seconds_remaining}s`
                : 'Ready'}
            </span>
          </div>

          {/* Position status */}
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Position:</span>
            <span className={strategyDisplay.inPosition ? 'text-yellow-400' : 'text-gray-300'}>
              {strategyDisplay.inPosition
                ? `${strategyDisplay.position?.side?.toUpperCase()} @ ${strategyDisplay.position?.entry_price?.toFixed(0)}`
                : 'Flat'}
            </span>
          </div>

          {/* Pending orders */}
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Pending:</span>
            <span className={strategyDisplay.pendingOrders.count > 0 ? 'text-yellow-400' : 'text-gray-300'}>
              {strategyDisplay.pendingOrders.count > 0
                ? `${strategyDisplay.pendingOrders.count} (${strategyDisplay.pendingOrders.orders[0]?.candleCount || 0}/${strategyDisplay.pendingOrders.timeout_candles || 3} candles)`
                : '0'}
            </span>
          </div>

          {/* Blockers (if any) */}
          {strategyDisplay.blockers.length > 0 && !strategyDisplay.inPosition && (
            <div className="flex items-center gap-2">
              <span className="text-red-400">⚠</span>
              <span className="text-red-400 text-xs">
                {strategyDisplay.blockers[0]}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GexChart;
