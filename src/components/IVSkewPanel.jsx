import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

const IVSkewPanel = ({ socket, quotes }) => {
  const [ivData, setIvData] = useState(null);
  const [gexLevels, setGexLevels] = useState(null);
  const [nqPrice, setNqPrice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [candleCountdown, setCandleCountdown] = useState(0);

  // Update candle countdown every second
  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const secondsRemaining = 60 - now.getSeconds();
      setCandleCountdown(secondsRemaining === 60 ? 0 : secondsRemaining);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  // Get NQ price from quotes prop (quotes use 'close' not 'price')
  useEffect(() => {
    if (quotes?.NQ?.close) {
      setNqPrice(quotes.NQ.close);
    } else if (quotes?.MNQ?.close) {
      setNqPrice(quotes.MNQ.close);
    }
  }, [quotes]);

  // Strategy thresholds (should match backend config)
  const MIN_IV = 0.18; // 18%
  const NEG_SKEW_THRESHOLD = -0.01; // -1% for longs
  const POS_SKEW_THRESHOLD = 0.01; // +1% for shorts
  const LEVEL_PROXIMITY = 25; // points

  // Fetch IV skew data
  const fetchIVSkew = async () => {
    try {
      setError(null);
      const response = await api.getIVSkew();
      if (response) {
        setIvData(response);
        setLoading(false);
      }
    } catch (err) {
      setError('Failed to fetch IV skew data');
      console.error('Error fetching IV skew:', err);
      setLoading(false);
    }
  };

  // Fetch GEX levels
  const fetchGexLevels = async () => {
    try {
      const response = await api.getTradierGexLevels();
      if (response) {
        setGexLevels(response);
      }
    } catch (err) {
      console.error('Error fetching GEX levels:', err);
    }
  };

  // Initial fetch and polling
  useEffect(() => {
    fetchIVSkew();
    fetchGexLevels();

    // Refresh IV every 30 seconds, GEX every 60 seconds
    const ivInterval = setInterval(fetchIVSkew, 30000);
    const gexInterval = setInterval(fetchGexLevels, 60000);

    return () => {
      clearInterval(ivInterval);
      clearInterval(gexInterval);
    };
  }, []);

  // WebSocket updates for real-time data
  useEffect(() => {
    if (!socket?.socket) return;

    const handleIVUpdate = (data) => {
      setIvData(data);
      setLoading(false);
      setError(null);
    };

    const handlePriceUpdate = (data) => {
      if (data.symbol === 'NQ' || data.symbol === 'MNQ') {
        setNqPrice(data.price);
      }
    };

    const handleGexUpdate = (data) => {
      // WebSocket sends { cboe, tradier } - extract tradier for this panel
      if (data?.tradier) {
        setGexLevels(data.tradier);
      } else if (data && !data.cboe) {
        // Fallback: if data doesn't have cboe/tradier structure, use as-is
        setGexLevels(data);
      }
    };

    socket.socket.on('iv_skew', handleIVUpdate);
    socket.socket.on('ivSkew', handleIVUpdate);
    socket.socket.on('market_data', handlePriceUpdate);
    socket.socket.on('gex_levels', handleGexUpdate);

    return () => {
      socket.socket.off('iv_skew', handleIVUpdate);
      socket.socket.off('ivSkew', handleIVUpdate);
      socket.socket.off('market_data', handlePriceUpdate);
      socket.socket.off('gex_levels', handleGexUpdate);
    };
  }, [socket]);

  // Calculate distance to nearest GEX level
  // Mirrors strategy's findNearestLevel() logic exactly
  const calculateGexProximity = () => {
    if (!gexLevels || !nqPrice) return null;

    const price = nqPrice;

    // Strategy's tradeable level types
    const tradeSupportLevels = ['S1', 'S2', 'S3', 'S4', 'S5', 'PutWall', 'GammaFlip'];
    const tradeResistanceLevels = ['R1', 'R2', 'R3', 'R4', 'R5', 'CallWall', 'GammaFlip'];

    // Build support levels array (mirrors strategy logic)
    const allSupportLevels = [];

    // S1-S5 from support array
    const supportArray = gexLevels.nq_support || gexLevels.support || [];
    supportArray.forEach((level, i) => {
      const type = `S${i + 1}`;
      if (level && tradeSupportLevels.includes(type)) {
        allSupportLevels.push({ type, level });
      }
    });

    // PutWall
    const putWall = gexLevels.nq_put_wall || gexLevels.putWall;
    if (putWall && tradeSupportLevels.includes('PutWall')) {
      allSupportLevels.push({ type: 'PutWall', level: putWall });
    }

    // GammaFlip (as support when price is above it)
    const gammaFlip = gexLevels.nq_gamma_flip || gexLevels.gammaFlip;
    if (gammaFlip && tradeSupportLevels.includes('GammaFlip') && gammaFlip < price) {
      allSupportLevels.push({ type: 'GammaFlip', level: gammaFlip });
    }

    // Build resistance levels array (mirrors strategy logic)
    const allResistanceLevels = [];

    // R1-R5 from resistance array
    const resistanceArray = gexLevels.nq_resistance || gexLevels.resistance || [];
    resistanceArray.forEach((level, i) => {
      const type = `R${i + 1}`;
      if (level && tradeResistanceLevels.includes(type)) {
        allResistanceLevels.push({ type, level });
      }
    });

    // CallWall
    const callWall = gexLevels.nq_call_wall || gexLevels.callWall;
    if (callWall && tradeResistanceLevels.includes('CallWall')) {
      allResistanceLevels.push({ type: 'CallWall', level: callWall });
    }

    // GammaFlip (as resistance when price is below it)
    if (gammaFlip && tradeResistanceLevels.includes('GammaFlip') && gammaFlip > price) {
      allResistanceLevels.push({ type: 'GammaFlip', level: gammaFlip });
    }

    // Find nearest support within proximity threshold
    let nearestSupport = null;
    for (const lvl of allSupportLevels) {
      const dist = Math.abs(price - lvl.level);
      if (dist <= LEVEL_PROXIMITY) {
        if (!nearestSupport || dist < nearestSupport.distance) {
          nearestSupport = { ...lvl, distance: dist };
        }
      }
    }

    // Also find closest support even if outside threshold (for display)
    let closestSupport = null;
    for (const lvl of allSupportLevels) {
      const dist = Math.abs(price - lvl.level);
      if (!closestSupport || dist < closestSupport.distance) {
        closestSupport = { ...lvl, distance: dist };
      }
    }

    // Find nearest resistance within proximity threshold
    let nearestResistance = null;
    for (const lvl of allResistanceLevels) {
      const dist = Math.abs(price - lvl.level);
      if (dist <= LEVEL_PROXIMITY) {
        if (!nearestResistance || dist < nearestResistance.distance) {
          nearestResistance = { ...lvl, distance: dist };
        }
      }
    }

    // Also find closest resistance even if outside threshold (for display)
    let closestResistance = null;
    for (const lvl of allResistanceLevels) {
      const dist = Math.abs(price - lvl.level);
      if (!closestResistance || dist < closestResistance.distance) {
        closestResistance = { ...lvl, distance: dist };
      }
    }

    return {
      support: nearestSupport,
      resistance: nearestResistance,
      closestSupport,
      closestResistance,
      price
    };
  };

  // Get skew color based on value
  const getSkewColor = (skew) => {
    if (skew === null || skew === undefined) return 'text-gray-400';
    if (skew < -0.02) return 'text-green-400';
    if (skew < -0.01) return 'text-green-300';
    if (skew > 0.02) return 'text-red-400';
    if (skew > 0.01) return 'text-red-300';
    return 'text-yellow-400';
  };

  // Get signal badge color and text
  const getSignalBadge = (signal) => {
    const badges = {
      'strongly_bullish': { color: 'bg-green-600', text: 'STRONGLY BULLISH' },
      'bullish': { color: 'bg-green-500', text: 'BULLISH' },
      'strongly_bearish': { color: 'bg-red-600', text: 'STRONGLY BEARISH' },
      'bearish': { color: 'bg-red-500', text: 'BEARISH' },
      'neutral': { color: 'bg-gray-500', text: 'NEUTRAL' }
    };
    return badges[signal] || { color: 'bg-gray-500', text: signal?.toUpperCase() || 'UNKNOWN' };
  };

  // Format percentage
  const formatPercent = (value) => {
    if (value === null || value === undefined) return '—';
    return `${(value * 100).toFixed(2)}%`;
  };

  // Format skew with sign
  const formatSkew = (value) => {
    if (value === null || value === undefined) return '—';
    const percent = (value * 100).toFixed(3);
    const sign = value > 0 ? '+' : '';
    return `${sign}${percent}%`;
  };

  if (loading && !ivData) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-3">IV Skew</h3>
        <div className="text-gray-400 text-sm">Loading IV data...</div>
      </div>
    );
  }

  if (error && !ivData) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-3">IV Skew</h3>
        <div className="text-red-400 text-sm">{error}</div>
        <button
          onClick={fetchIVSkew}
          className="mt-2 px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const signalBadge = getSignalBadge(ivData?.signal);
  const gexProximity = calculateGexProximity();

  // Determine signal readiness conditions
  const ivOk = ivData?.iv >= MIN_IV;
  const skewLongOk = ivData?.skew < NEG_SKEW_THRESHOLD;
  const skewShortOk = ivData?.skew > POS_SKEW_THRESHOLD;
  const supportNear = gexProximity?.support?.distance <= LEVEL_PROXIMITY;
  const resistanceNear = gexProximity?.resistance?.distance <= LEVEL_PROXIMITY;

  // Overall signal readiness
  const longReady = ivOk && skewLongOk && supportNear;
  const shortReady = ivOk && skewShortOk && resistanceNear;

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-white">IV Skew</h3>
        <div className={`px-2 py-1 rounded text-xs font-medium text-white ${signalBadge.color}`}>
          {signalBadge.text}
        </div>
      </div>

      {ivData ? (
        <>
          {/* Main Skew Display */}
          <div className="bg-gray-700 rounded p-3 mb-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">ATM Skew (Put - Call)</span>
              <span className={`text-2xl font-mono font-bold ${getSkewColor(ivData.skew)}`}>
                {formatSkew(ivData.skew)}
              </span>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {ivData.skew < 0 ? 'Calls expensive (bullish flow)' : ivData.skew > 0 ? 'Puts expensive (bearish hedging)' : 'Balanced'}
            </div>
          </div>

          {/* IV Details Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-700 rounded p-2">
              <div className="text-xs text-gray-500">Call IV</div>
              <div className="text-lg font-mono text-green-400">
                {formatPercent(ivData.callIV)}
              </div>
            </div>
            <div className="bg-gray-700 rounded p-2">
              <div className="text-xs text-gray-500">Put IV</div>
              <div className="text-lg font-mono text-red-400">
                {formatPercent(ivData.putIV)}
              </div>
            </div>
            <div className="bg-gray-700 rounded p-2">
              <div className="text-xs text-gray-500">Avg IV</div>
              <div className={`text-lg font-mono ${ivOk ? 'text-cyan-400' : 'text-orange-400'}`}>
                {formatPercent(ivData.iv)}
              </div>
            </div>
            <div className="bg-gray-700 rounded p-2">
              <div className="text-xs text-gray-500">ATM Strike</div>
              <div className="text-lg font-mono text-white">
                {ivData.atmStrike?.toFixed(0) || '—'}
              </div>
            </div>
          </div>

          {/* GEX Level Proximity - Mirrors strategy's findNearestLevel() */}
          {gexProximity && (
            <div className="mt-3 bg-gray-700 rounded p-3">
              <div className="text-xs text-gray-500 mb-2">
                GEX Level Proximity (NQ @ {gexProximity.price?.toFixed(2)}) — {LEVEL_PROXIMITY}pt threshold
              </div>
              <div className="grid grid-cols-2 gap-3">
                {/* Support Distance */}
                <div className={`rounded p-2 h-24 ${supportNear ? 'bg-green-900/30 border border-green-600' : 'bg-gray-600'}`}>
                  <div className="text-xs text-gray-400">Nearest Support</div>
                  {(gexProximity.support || gexProximity.closestSupport) ? (
                    <>
                      <div className="text-xs text-cyan-400 font-semibold">
                        {(gexProximity.support || gexProximity.closestSupport).type}
                      </div>
                      <div className="text-sm font-mono text-cyan-400">
                        {(gexProximity.support || gexProximity.closestSupport).level.toFixed(2)}
                      </div>
                      <div className={`text-lg font-mono font-bold ${supportNear ? 'text-green-400' : 'text-gray-300'}`}>
                        {(gexProximity.support || gexProximity.closestSupport).distance.toFixed(1)} pts
                        {supportNear && <span className="text-xs ml-2">✓</span>}
                      </div>
                    </>
                  ) : (
                    <div className="text-gray-500">—</div>
                  )}
                </div>

                {/* Resistance Distance */}
                <div className={`rounded p-2 h-24 ${resistanceNear ? 'bg-red-900/30 border border-red-600' : 'bg-gray-600'}`}>
                  <div className="text-xs text-gray-400">Nearest Resistance</div>
                  {(gexProximity.resistance || gexProximity.closestResistance) ? (
                    <>
                      <div className="text-xs text-orange-400 font-semibold">
                        {(gexProximity.resistance || gexProximity.closestResistance).type}
                      </div>
                      <div className="text-sm font-mono text-orange-400">
                        {(gexProximity.resistance || gexProximity.closestResistance).level.toFixed(2)}
                      </div>
                      <div className={`text-lg font-mono font-bold ${resistanceNear ? 'text-red-400' : 'text-gray-300'}`}>
                        {(gexProximity.resistance || gexProximity.closestResistance).distance.toFixed(1)} pts
                        {resistanceNear && <span className="text-xs ml-2">✓</span>}
                      </div>
                    </>
                  ) : (
                    <div className="text-gray-500">—</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Signal Readiness Checklist */}
          <div className="mt-3 bg-gray-700 rounded p-3">
            <div className="flex justify-between items-center mb-2">
              <div className="text-xs text-gray-500">Signal Readiness</div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Next candle:</span>
                <span className={`text-sm font-mono font-bold ${candleCountdown <= 5 ? 'text-yellow-400 animate-pulse' : 'text-cyan-400'}`}>
                  {candleCountdown}s
                </span>
              </div>
            </div>

            {/* Long Conditions */}
            <div className="mb-2">
              <div className="text-xs text-cyan-400 font-semibold mb-1">LONG Conditions:</div>
              <div className="grid grid-cols-3 gap-1 text-xs">
                <div className={skewLongOk ? 'text-green-400' : 'text-gray-500'}>
                  {skewLongOk ? '✓' : '○'} Skew &lt; -1%
                </div>
                <div className={ivOk ? 'text-green-400' : 'text-gray-500'}>
                  {ivOk ? '✓' : '○'} IV ≥ 18%
                </div>
                <div className={supportNear ? 'text-green-400' : 'text-gray-500'}>
                  {supportNear ? '✓' : '○'} Near Support
                </div>
              </div>
              {longReady && (
                <div className="mt-1 text-xs text-green-400 font-bold animate-pulse">
                  → LONG SIGNAL READY
                </div>
              )}
            </div>

            {/* Short Conditions */}
            <div>
              <div className="text-xs text-orange-400 font-semibold mb-1">SHORT Conditions:</div>
              <div className="grid grid-cols-3 gap-1 text-xs">
                <div className={skewShortOk ? 'text-red-400' : 'text-gray-500'}>
                  {skewShortOk ? '✓' : '○'} Skew &gt; +1%
                </div>
                <div className={ivOk ? 'text-green-400' : 'text-gray-500'}>
                  {ivOk ? '✓' : '○'} IV ≥ 18%
                </div>
                <div className={resistanceNear ? 'text-red-400' : 'text-gray-500'}>
                  {resistanceNear ? '✓' : '○'} Near Resistance
                </div>
              </div>
              {shortReady && (
                <div className="mt-1 text-xs text-red-400 font-bold animate-pulse">
                  → SHORT SIGNAL READY
                </div>
              )}
            </div>
          </div>

          {/* Open Interest */}
          {(ivData.callOI || ivData.putOI) && (
            <div className="mt-2 bg-gray-700 rounded p-2">
              <div className="text-xs text-gray-500 mb-1">ATM Open Interest</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-400">Call OI:</span>
                  <span className="text-green-400 ml-1 font-mono">
                    {ivData.callOI?.toLocaleString() || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Put OI:</span>
                  <span className="text-red-400 ml-1 font-mono">
                    {ivData.putOI?.toLocaleString() || '—'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-gray-400 text-sm text-center py-4">
          No IV data available
        </div>
      )}

      {/* Last Update */}
      {ivData?.timestamp && (
        <div className="mt-2 text-xs text-gray-500 text-center">
          Last update: {new Date(ivData.timestamp).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
};

export default IVSkewPanel;
