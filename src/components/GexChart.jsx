import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import { api } from '../services/api';
import LsStatusChip from './LsStatusChip';

// Suppress ResizeObserver error (benign browser warning from lightweight-charts)
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

// EOD force-flat time (wall clock, ET). Mirrors trade-orchestrator's
// EOD_CUTOFF_ET=15:45 (see memory/production-eod-cutoff.md). Edit here if
// the orchestrator's cutoff ever changes.
const EOD_CUTOFF_HOUR_ET = 15;
const EOD_CUTOFF_MIN_ET = 45;

/** Minutes from now until `HH:MM` ET. Negative if past. */
function minsUntilEt(targetHour, targetMin) {
  const nowEt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hour12: false,
  }).format(new Date());
  // "15:45" or "9:45"; "24:NN" rolls to "00:NN" in some locales — coerce.
  const [hStr, mStr] = nowEt.split(':');
  const h = Number(hStr) === 24 ? 0 : Number(hStr);
  const m = Number(mStr);
  return (targetHour * 60 + targetMin) - (h * 60 + m);
}

/** "1h 47m" / "12m" / "—" for a duration in minutes. */
function fmtMins(mins) {
  if (mins == null || Number.isNaN(mins)) return '—';
  if (mins < 0) return '—';
  if (mins < 60) return `${Math.floor(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.floor(mins % 60);
  return `${h}h ${m}m`;
}

/** Floating per-position badge: strategy / side / qty / entry / timers / pnl. */
function PositionBadge({ position: p }) {
  const isLong = p.side === 'long';
  const qty = Math.abs(Number(p.netPos) || 1);
  const sideColor = isLong ? 'text-green-400' : 'text-red-400';
  const stratLabel = (p.strategy || 'UNATTRIBUTED').replace(/_/g, ' ');
  const openedAtMs = p.openedAt ? Date.parse(p.openedAt) : null;
  const inTradeMins = openedAtMs ? (Date.now() - openedAtMs) / 60000 : null;
  const eodMins = minsUntilEt(EOD_CUTOFF_HOUR_ET, EOD_CUTOFF_MIN_ET);
  const pnl = typeof p.unrealizedPnL === 'number' ? p.unrealizedPnL : null;
  const pnlColor = pnl == null ? 'text-gray-300' : pnl >= 0 ? 'text-green-400' : 'text-red-400';

  return (
    <div className="bg-gray-900 bg-opacity-85 rounded px-2 py-1.5 text-[10px] leading-tight min-w-[140px] border border-gray-700">
      <div className={`font-bold ${sideColor} mb-0.5`}>
        {stratLabel}
      </div>
      <div className="text-gray-300">
        {isLong ? 'LONG' : 'SHORT'} {qty} @ {Number(p.entryPrice)?.toFixed(2) || '—'}
      </div>
      <div className="flex justify-between gap-2 text-gray-400 mt-0.5">
        <span>open</span>
        <span className="text-gray-200">{fmtMins(inTradeMins)}</span>
      </div>
      <div className="flex justify-between gap-2 text-gray-400">
        <span>EOD in</span>
        <span className={eodMins != null && eodMins <= 15 ? 'text-yellow-400 font-bold' : 'text-gray-200'}>
          {fmtMins(eodMins)}
        </span>
      </div>
      {pnl != null && (
        <div className="flex justify-between gap-2 text-gray-400 mt-0.5 border-t border-gray-700 pt-0.5">
          <span>P&L</span>
          <span className={pnlColor + ' font-bold'}>
            {pnl >= 0 ? '+' : ''}${pnl.toFixed(0)}
          </span>
        </div>
      )}
    </div>
  );
}

const GexChart = ({ quote, gexData, strategyStatus, product = 'nq', getCandlesFn, ltLevels, lsStatus, onProductChange }) => {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const priceLinesRef = useRef([]);
  const positionLinesRef = useRef([]);
  const ltLinesRef = useRef([]);
  const candleHistoryRef = useRef([]);
  const currentPriceRef = useRef(null);
  const productRef = useRef(product);
  // [2026-05-21] Zero-Gamma (ZG) is now rendered as a single horizontal
  // priceLine alongside CW/PW/R/S (see GEX-level useEffect), not as a
  // LineSeries history. The prior history-line implementation drew a
  // stepped path through every ZG update over a 1h window; replacing it
  // with a priceLine matches the visual style of every other GEX level
  // and removes the time-series accumulation cost.

  const [chartReady, setChartReady] = useState(false);

  // Live open positions for the chart's current product (NQ or ES). Polled
  // every 5s from /api/positions and filtered down to the symbols on this
  // chart. Drives both the on-chart entry/TP/SL price lines AND the floating
  // strategy badge with time-in-trade + time-to-EOD-flat countdowns.
  const [livePositions, setLivePositions] = useState([]);
  // Ticker for live countdown re-renders (1Hz). Keeps the badge timers fresh
  // without re-fetching /api/positions every second.
  const [, setTickNow] = useState(Date.now());

  const isNQ = product === 'nq';
  const isES = product === 'es';
  const chartTitle = isES ? 'ES vs GEX Levels' : 'NQ vs GEX Levels';
  const productLabel = isES ? 'ES' : 'NQ';

  const fetchCandles = useCallback(
    (count) => getCandlesFn ? getCandlesFn(count) : api.getCandles(count),
    [getCandlesFn]
  );

  const gexLevels = useMemo(() => {
    if (isNQ) {
      const tradier = gexData?.tradier;
      if (!tradier || (!tradier.gammaFlip && !tradier.callWall)) return null;
      return {
        zeroGamma: tradier.gammaFlip, callWall: tradier.callWall, putWall: tradier.putWall,
        resistance: tradier.resistance?.filter(Boolean) || [],
        support: tradier.support?.filter(Boolean) || [],
      };
    } else {
      const tradier = gexData?.tradier;
      if (tradier && (tradier.gammaFlip || tradier.callWall)) {
        return {
          zeroGamma: tradier.gammaFlip, callWall: tradier.callWall, putWall: tradier.putWall,
          resistance: tradier.resistance?.filter(Boolean) || [],
          support: tradier.support?.filter(Boolean) || [],
        };
      }
      const levels = gexData?.cboe?.levels;
      if (!levels || (!levels.gamma_flip && !levels.call_wall)) return null;
      return {
        zeroGamma: levels.gamma_flip || levels.zero_gamma, callWall: levels.call_wall, putWall: levels.put_wall,
        resistance: levels.resistance?.filter(Boolean) || [],
        support: levels.support?.filter(Boolean) || [],
      };
    }
  }, [gexData, isNQ]);

  const loading = isNQ ? !gexData?.tradier : (!gexData?.tradier && !gexData?.cboe);
  const error = null;

  const strategyDisplay = useMemo(() => {
    const currentPrice = quote?.close;
    const support1 = gexLevels?.support?.[0];
    const resistance1 = gexLevels?.resistance?.[0];
    const distanceToS1 = currentPrice && support1 ? currentPrice - support1 : null;
    const distanceToR1 = currentPrice && resistance1 ? resistance1 - currentPrice : null;
    const isReady = strategyStatus?.evaluation_readiness?.ready ?? false;
    const inPosition = strategyStatus?.position?.in_position ?? false;
    const inSession = strategyStatus?.strategy?.session?.in_session ?? false;
    const cooldown = strategyStatus?.strategy?.cooldown ?? {};
    const pendingOrders = strategyStatus?.pending_orders ?? { count: 0, orders: [] };
    const position = strategyStatus?.position?.current;
    const blockers = strategyStatus?.evaluation_readiness?.blockers ?? [];

    let statusBadge = { text: 'LOADING', color: 'bg-gray-500' };
    if (strategyStatus) {
      if (inPosition) statusBadge = { text: 'IN POSITION', color: 'bg-yellow-500' };
      else if (isReady) statusBadge = { text: 'READY', color: 'bg-green-500' };
      else statusBadge = { text: 'BLOCKED', color: 'bg-red-500' };
    }

    return { currentPrice, support1, resistance1, distanceToS1, distanceToR1, isReady, inPosition, inSession, cooldown, pendingOrders, position, blockers, statusBadge };
  }, [quote?.close, gexLevels, strategyStatus]);

  useEffect(() => { productRef.current = product; }, [product]);

  // Poll open positions for this chart's product. Symbol filter: NQ chart
  // matches "NQ*"/"MNQ*"; ES matches "ES*"/"MES*". `accountId` is intentionally
  // not filtered — we want to see ALL open positions regardless of account.
  useEffect(() => {
    let cancelled = false;
    const wantedRoots = product === 'nq' ? ['NQ', 'MNQ'] : ['ES', 'MES'];
    const matchesProduct = (sym) => {
      if (!sym) return false;
      const root = String(sym).replace(/[FGHJKMNQUVXZ]\d{1,2}$/i, '').toUpperCase();
      return wantedRoots.includes(root);
    };

    const tick = async () => {
      try {
        const all = await api.getAllPositions();
        if (cancelled) return;
        const filtered = (Array.isArray(all) ? all : [])
          .filter(p => p && p.netPos && matchesProduct(p.symbol));
        setLivePositions(filtered);
      } catch {
        // Network blip — keep previous state, retry next interval.
      }
    };

    tick();
    const id = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [product]);

  // 1Hz tick to refresh time-in-trade / EOD countdown displays without
  // re-fetching positions.
  useEffect(() => {
    if (livePositions.length === 0) return;
    const id = setInterval(() => setTickNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [livePositions.length]);

  // Clear chart data when product switches to prevent stale lines
  useEffect(() => {
    if (seriesRef.current) seriesRef.current.setData([]);
    priceLinesRef.current.forEach(line => { try { seriesRef.current?.removePriceLine(line); } catch {} });
    priceLinesRef.current = [];
    ltLinesRef.current.forEach(line => { try { seriesRef.current?.removePriceLine(line); } catch {} });
    ltLinesRef.current = [];
    positionLinesRef.current.forEach(line => { try { seriesRef.current?.removePriceLine(line); } catch {} });
    positionLinesRef.current = [];
  }, [product]);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current || chartRef.current) return;

    const containerWidth = chartContainerRef.current.clientWidth || 600;
    const containerHeight = chartContainerRef.current.clientHeight || 300;

    const chart = createChart(chartContainerRef.current, {
      width: containerWidth,
      height: containerHeight,
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
            timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false,
          });
        },
      },
      rightPriceScale: {
        borderColor: '#374151',
        autoScale: true,
        scaleMargins: { top: 0.05, bottom: 0.05 },
        entireTextOnly: true,
      },
      crosshair: { mode: 1 },
      localization: {
        priceFormatter: (price) => price.toFixed(2),
        timeFormatter: (time) => {
          const date = new Date(time * 1000);
          return date.toLocaleTimeString('en-US', {
            timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false,
          });
        },
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e', downColor: '#ef4444',
      borderUpColor: '#22c55e', borderDownColor: '#ef4444',
      wickUpColor: '#22c55e', wickDownColor: '#ef4444',
      priceLineVisible: true, lastValueVisible: true,
      priceFormat: { type: 'price', precision: 2, minMove: 0.25 },
      autoscaleInfoProvider: () => {
        const price = currentPriceRef.current;
        const buffer = productRef.current === 'es' ? 30 : 100;
        if (price) {
          return { priceRange: { minValue: price - buffer, maxValue: price + buffer }, margins: { above: 0, below: 0 } };
        }
        return null;
      },
    });

    chartRef.current = chart;
    seriesRef.current = series;
    setChartReady(true);

    // ResizeObserver for dynamic sizing
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (chartRef.current) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            chartRef.current.applyOptions({ width, height });
          }
        }
      }
    });
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      setChartReady(false);
    };
  }, []);

  // Update price ref for auto-zoom
  useEffect(() => {
    const price = quote?.close;
    if (!price) return;
    const prevPrice = currentPriceRef.current;
    const rescaleThreshold = isES ? 5 : 10;
    if (!prevPrice || Math.abs(price - prevPrice) > rescaleThreshold) {
      currentPriceRef.current = price;
      if (chartRef.current && seriesRef.current && candleHistoryRef.current.length > 0) {
        seriesRef.current.setData(candleHistoryRef.current);
        chartRef.current.timeScale().fitContent();
      }
    }
  }, [quote?.close, isES]);

  // Fetch initial candle history
  useEffect(() => {
    if (!chartReady || !seriesRef.current) return;
    const fetchCandleHistory = async () => {
      try {
        const data = await fetchCandles(180);
        if (!data?.candles || data.candles.length === 0) return;
        const candles = data.candles.map(c => ({
          time: Math.floor(new Date(c.timestamp).getTime() / 1000),
          open: c.open, high: c.high, low: c.low, close: c.close
        }));
        candles.sort((a, b) => a.time - b.time);
        const uniqueCandles = candles.filter((c, i, arr) => i === arr.length - 1 || c.time !== arr[i + 1].time);
        const lastCandle = uniqueCandles[uniqueCandles.length - 1];
        if (lastCandle) currentPriceRef.current = lastCandle.close;
        candleHistoryRef.current = uniqueCandles;
        seriesRef.current.setData(uniqueCandles);
        const now = Math.floor(Date.now() / 1000);
        chartRef.current?.timeScale().setVisibleRange({ from: now - 3600, to: now });
      } catch (error) {
        console.warn(`Failed to load ${productLabel} candle history:`, error);
      }
    };
    fetchCandleHistory();
  }, [chartReady, fetchCandles, productLabel]);

  // Update candlestick data with real-time OHLC
  useEffect(() => {
    if (!seriesRef.current || !quote?.close || !chartReady) return;
    // L1 ticks (Schwab 1Hz, candleTimestamp=null) update the in-progress
    // bar; CHART_FUTURES bars (1/min, candleTimestamp set) finalize it.
    //
    // [2026-05-26 fix] Bucket OHLCV bars by their candleTimestamp (the bar's
    // actual minute), NOT the publish-time `quote.timestamp`. Schwab
    // CHART_FUTURES bars for minute T frequently arrive 1-3s into minute T+1
    // (network latency), so floor(publish_ts/60) lands in T+1 and the bar's
    // OHLC overwrites the wrong candle. THIS is the only logic change vs
    // the prior version — everything else (setData on new bar, etc.) is
    // unchanged because the prior version was working except for this dup.
    const hasCandelOHLCV = !!quote.candleTimestamp;
    const tickTsSec = quote.timestamp ? new Date(quote.timestamp).getTime() / 1000 : Math.floor(Date.now() / 1000);
    const ohlcvTsSec = hasCandelOHLCV ? new Date(quote.candleTimestamp).getTime() / 1000 : tickTsSec;
    const candleTime = Math.floor(ohlcvTsSec / 60) * 60;
    const candle = {
      time: candleTime,
      open: hasCandelOHLCV ? quote.open : quote.close,
      high: hasCandelOHLCV ? quote.high : quote.close,
      low: hasCandelOHLCV ? quote.low : quote.close,
      close: quote.close
    };
    const history = candleHistoryRef.current;
    const lastCandle = history[history.length - 1];

    // Helper: setData() resets the visible time scale (snaps the chart back
    // to right-anchored default), which is disruptive when the user has
    // panned/zoomed. Preserve their view across setData calls. Lightweight-
    // charts has no built-in "setData but keep view" — capture-and-restore
    // is the standard workaround.
    const preserveView = (mutator) => {
      const ts = chartRef.current?.timeScale();
      const visibleRange = ts?.getVisibleLogicalRange?.() ?? null;
      mutator();
      if (visibleRange && ts) {
        try { ts.setVisibleLogicalRange(visibleRange); } catch {}
      }
    };

    if (lastCandle && lastCandle.time === candleTime) {
      if (hasCandelOHLCV) { lastCandle.open = candle.open; lastCandle.high = candle.high; lastCandle.low = candle.low; }
      else { lastCandle.high = Math.max(lastCandle.high, candle.close); lastCandle.low = Math.min(lastCandle.low, candle.close); }
      lastCandle.close = candle.close;
      seriesRef.current.update(lastCandle);    // .update() does NOT reset the time scale
    } else if (!lastCandle || candleTime > lastCandle.time) {
      history.push(candle);
      // [2026-05-26 fix] Cap was 60 (= 1 hour), but the initial fetch loads
      // 180 (= 3 hours). Over the first 2 hours of live trading, .shift()
      // pruned the fetched candles down to 60, manifesting as "the chart
      // suddenly shows only the last hour". Cap is now 600 (10 hours) so
      // a normal session never trims fetched data.
      if (history.length > 600) history.shift();
      preserveView(() => seriesRef.current.setData(history));
    } else {
      const existingIndex = history.findIndex(c => c.time === candleTime);
      if (existingIndex >= 0) {
        if (hasCandelOHLCV) { history[existingIndex] = candle; }
        else { history[existingIndex].high = Math.max(history[existingIndex].high, candle.close); history[existingIndex].low = Math.min(history[existingIndex].low, candle.close); history[existingIndex].close = candle.close; }
        preserveView(() => seriesRef.current.setData(history));
      }
    }
  }, [quote, chartReady]);

  // GEX level lines
  useEffect(() => {
    if (!seriesRef.current || !gexLevels || !chartReady) return;
    priceLinesRef.current.forEach(line => { try { seriesRef.current.removePriceLine(line); } catch (e) {} });
    priceLinesRef.current = [];
    const createLine = (price, title, color, lineStyle = 0) => {
      if (!price || price === 0) return;
      try {
        const line = seriesRef.current.createPriceLine({ price, color, lineWidth: 2, lineStyle, axisLabelVisible: true, title });
        priceLinesRef.current.push(line);
      } catch (e) {}
    };
    createLine(gexLevels.callWall, 'CW', '#ef4444', 0);
    createLine(gexLevels.putWall, 'PW', '#22c55e', 0);
    // Zero Gamma — single horizontal line that snaps to the current value
    // on every gexLevels update (same behavior as CW/PW/R/S). Color stays
    // the previous ZG yellow (#eab308) to match the legend chip.
    createLine(gexLevels.zeroGamma, 'ZG', '#eab308', 0);
    gexLevels.resistance?.forEach((level, i) => createLine(level, `R${i + 1}`, '#f97316', 2));
    gexLevels.support?.forEach((level, i) => createLine(level, `S${i + 1}`, '#06b6d4', 2));
  }, [gexLevels, chartReady]);

  // Position lines: render entry / TP / SL for each live position on this
  // chart's product. Replaces the prior IV-SKEW-GEX-only overlay that
  // hard-coded TP/SL at entry ±7/±3 — now uses real broker-side levels for
  // any active strategy (GEX-LT-3M, GEX-FLIP-IVPCT, GEX-LEVEL-FADE,
  // LS-FLIP-TRIGGER-BAR, etc.).
  useEffect(() => {
    if (!seriesRef.current || !chartReady) return;
    positionLinesRef.current.forEach(line => { try { seriesRef.current.removePriceLine(line); } catch (e) {} });
    positionLinesRef.current = [];

    const createPositionLine = (price, title, color, lineStyle = 0, lineWidth = 2) => {
      if (price == null || Number.isNaN(Number(price)) || Number(price) === 0) return;
      try {
        const line = seriesRef.current.createPriceLine({
          price: Number(price), color, lineWidth, lineStyle,
          axisLabelVisible: true, title,
        });
        positionLinesRef.current.push(line);
      } catch (e) { /* lightweight-charts can throw mid-resize */ }
    };

    for (const pos of livePositions) {
      const qty = Math.abs(Number(pos.netPos) || 1);
      // +N for long, -N for short. Avoids the visual collision with GEX
      // "S1" support / "L1" level labels also drawn on this chart.
      const sidePrefix = pos.side === 'long' ? '+' : '-';
      const stratTag = (pos.strategy || '?').replace(/_/g, ' ').slice(0, 16);
      createPositionLine(pos.entryPrice, `${sidePrefix}${qty} ${stratTag}`, '#ffffff', 0, 2);
      createPositionLine(pos.takeProfit, 'TP',  '#22c55e', 2, 1);
      createPositionLine(pos.stopLoss,   'SL',  '#ef4444', 2, 1);
    }
  }, [livePositions, chartReady]);

  // LT level lines
  useEffect(() => {
    if (!seriesRef.current || !chartReady) return;
    ltLinesRef.current.forEach(line => { try { seriesRef.current.removePriceLine(line); } catch (e) {} });
    ltLinesRef.current = [];
    if (!ltLevels) return;
    const createLtLine = (price, title, color) => {
      if (!price || price === 0) return;
      try {
        const line = seriesRef.current.createPriceLine({ price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title });
        ltLinesRef.current.push(line);
      } catch (e) {}
    };
    const levels = [
      { key: 'L2', name: 'LT34' },
      { key: 'L3', name: 'LT55' },
      { key: 'L4', name: 'LT144' },
      { key: 'L5', name: 'LT377' },
      { key: 'L6', name: 'LT610' },
    ];
    levels.forEach(({ key, name }) => {
      createLtLine(ltLevels[key], name, '#a855f7');
    });
  }, [ltLevels, chartReady]);

  const getStatusMessage = () => {
    if (loading && !gexLevels) return 'Loading GEX levels...';
    if (error && !gexLevels) return error;
    if (!quote?.close) return `Waiting for ${productLabel} price data...`;
    return null;
  };
  const statusMessage = getStatusMessage();

  const getDistanceColor = (distance) => {
    if (distance === null) return 'text-gray-400';
    const absDistance = Math.abs(distance);
    if (absDistance <= 3) return 'text-green-400 animate-pulse';
    if (absDistance <= 10) return 'text-yellow-400';
    return 'text-gray-300';
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg">
      {/* Header */}
      <div className="flex justify-between items-center px-2 py-1 flex-shrink-0">
        <div className="flex items-center gap-2">
          {onProductChange ? (
            <div className="flex gap-1">
              <button onClick={() => onProductChange('nq')} className={`px-2 py-0.5 rounded text-xs font-bold transition-colors ${product === 'nq' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-white'}`}>NQ</button>
              <button onClick={() => onProductChange('es')} className={`px-2 py-0.5 rounded text-xs font-bold transition-colors ${product === 'es' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-white'}`}>ES</button>
            </div>
          ) : (
            <h3 className="text-xs font-bold text-white">{chartTitle}</h3>
          )}
          {strategyStatus && (
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold text-white ${strategyDisplay.statusBadge.color}`}>
              {strategyDisplay.statusBadge.text}
            </span>
          )}
          <LsStatusChip status={lsStatus} />
        </div>
        <div className="flex items-center gap-3 text-[9px] text-gray-400">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>CW</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-yellow-500"></span>ZG</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>PW</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span>S1</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>R1</span>
        </div>
      </div>

      {/* Chart container - fills remaining space */}
      <div className="relative flex-1 min-h-0">
        <div ref={chartContainerRef} className="absolute inset-0" />

        {/* Distance overlay (top-left) - NQ only */}
        {isNQ && !statusMessage && strategyDisplay.currentPrice && (
          <div className="absolute top-2 left-2 bg-gray-900 bg-opacity-80 rounded px-2 py-1.5 text-[10px] z-10">
            <div className="font-semibold text-gray-300 mb-1">Distance to Entry</div>
            <div className="flex flex-col gap-0.5">
              <div className="flex justify-between gap-3">
                <span className="text-cyan-400">S1:</span>
                <span className={getDistanceColor(strategyDisplay.distanceToS1)}>
                  {strategyDisplay.distanceToS1 !== null ? `${strategyDisplay.distanceToS1 > 0 ? '+' : ''}${strategyDisplay.distanceToS1.toFixed(1)}` : '--'}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-orange-400">R1:</span>
                <span className={getDistanceColor(strategyDisplay.distanceToR1)}>
                  {strategyDisplay.distanceToR1 !== null ? `${strategyDisplay.distanceToR1 > 0 ? '+' : ''}${strategyDisplay.distanceToR1.toFixed(1)}` : '--'}
                </span>
              </div>
            </div>
            {(strategyDisplay.distanceToS1 !== null && Math.abs(strategyDisplay.distanceToS1) <= 3) && (
              <div className="mt-0.5 text-green-400 font-bold text-center animate-pulse text-[9px]">LONG ENTRY</div>
            )}
            {(strategyDisplay.distanceToR1 !== null && Math.abs(strategyDisplay.distanceToR1) <= 3) && (
              <div className="mt-0.5 text-green-400 font-bold text-center animate-pulse text-[9px]">SHORT ENTRY</div>
            )}
          </div>
        )}

        {/* ES strategy overlay */}
        {isES && !statusMessage && strategyStatus && (
          <div className="absolute top-2 left-2 bg-gray-900 bg-opacity-80 rounded px-2 py-1.5 text-[10px] z-10">
            <div className="font-semibold text-gray-300 mb-1">ES Cross-Signal</div>
            {strategyStatus?.composite_score != null && (
              <div className="flex justify-between gap-3">
                <span className="text-gray-400">Score:</span>
                <span className={strategyStatus.composite_score > 0 ? 'text-green-400' : strategyStatus.composite_score < 0 ? 'text-red-400' : 'text-gray-300'}>
                  {strategyStatus.composite_score > 0 ? '+' : ''}{strategyStatus.composite_score?.toFixed?.(1) || strategyStatus.composite_score}
                </span>
              </div>
            )}
            {strategyStatus?.signal && (
              <div className="flex justify-between gap-3">
                <span className="text-gray-400">Signal:</span>
                <span className={strategyStatus.signal === 'buy' ? 'text-green-400' : strategyStatus.signal === 'sell' ? 'text-red-400' : 'text-gray-300'}>
                  {strategyStatus.signal.toUpperCase()}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Position badges (top-right, stacked) — one per live position on
            this chart's product. Shows strategy/side/qty/entry plus countdown
            timers for time-in-trade and time until EOD force-flat (15:45 ET). */}
        {livePositions.length > 0 && (
          <div className="absolute top-2 right-2 flex flex-col gap-1.5 z-10">
            {livePositions.map((p) => (
              <PositionBadge key={`${p.accountId}-${p.symbol}-${p.strategy || 'X'}`} position={p} />
            ))}
          </div>
        )}

        {/* Overlay message when waiting for data */}
        {statusMessage && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-90 z-10">
            <span className={error ? 'text-red-400' : 'text-gray-400'}>{statusMessage}</span>
          </div>
        )}
      </div>

      {/* Footer status bar */}
      <div className="px-2 py-1 border-t border-gray-700 flex-shrink-0">
        <div className="flex flex-wrap justify-between items-center gap-2 text-[10px]">
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400">Session:</span>
            <span className={strategyDisplay.inSession ? 'text-green-400' : 'text-gray-500'}>
              {strategyDisplay.inSession ? 'RTH' : 'Outside'}
            </span>
          </div>
          {isNQ && (
            <>
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400">CD:</span>
                <span className={strategyDisplay.cooldown.in_cooldown ? 'text-yellow-400' : 'text-green-400'}>
                  {strategyDisplay.cooldown.in_cooldown ? `${strategyDisplay.cooldown.seconds_remaining}s` : 'Ready'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400">Pos:</span>
                <span className={strategyDisplay.inPosition ? 'text-yellow-400' : 'text-gray-300'}>
                  {strategyDisplay.inPosition ? `${strategyDisplay.position?.side?.toUpperCase()} @ ${strategyDisplay.position?.entry_price?.toFixed(0)}` : 'Flat'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400">Pend:</span>
                <span className={strategyDisplay.pendingOrders.count > 0 ? 'text-yellow-400' : 'text-gray-300'}>
                  {strategyDisplay.pendingOrders.count > 0
                    ? `${strategyDisplay.pendingOrders.count} (${strategyDisplay.pendingOrders.orders[0]?.candleCount || 0}/${strategyDisplay.pendingOrders.timeout_candles || 3})`
                    : '0'}
                </span>
              </div>
              {strategyDisplay.blockers.length > 0 && !strategyDisplay.inPosition && (
                <div className="flex items-center gap-1">
                  <span className="text-red-400 text-[9px]">{strategyDisplay.blockers[0]}</span>
                </div>
              )}
            </>
          )}
          {isES && (
            <div className="flex items-center gap-1.5">
              <span className="text-gray-400">Pos:</span>
              <span className={strategyDisplay.inPosition ? 'text-yellow-400' : 'text-gray-300'}>
                {strategyDisplay.inPosition ? `${strategyDisplay.position?.side?.toUpperCase()} @ ${strategyDisplay.position?.entry_price?.toFixed(0)}` : 'Flat'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GexChart;
