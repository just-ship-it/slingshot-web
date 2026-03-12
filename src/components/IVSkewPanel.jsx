import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

const IVSkewPanel = ({ socket, quotes }) => {
  const [ivData, setIvData] = useState(null);
  const [gexLevels, setGexLevels] = useState(null);
  const [nqPrice, setNqPrice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [candleCountdown, setCandleCountdown] = useState(0);
  const [strategyBlockers, setStrategyBlockers] = useState([]);
  const [cooldownData, setCooldownData] = useState(null);

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

  // Fetch strategy status for blockers and cooldown
  const fetchStrategyStatus = async () => {
    try {
      const response = await api.getIVSkewGexStatus();
      if (response?.evaluation_readiness?.blockers) {
        setStrategyBlockers(response.evaluation_readiness.blockers);
      } else {
        setStrategyBlockers([]);
      }
      if (response?.cooldown) {
        setCooldownData(response.cooldown);
      }
    } catch (err) {
      // silent
    }
  };

  // Local cooldown countdown — tick every second between API polls
  useEffect(() => {
    if (!cooldownData?.in_cooldown || cooldownData.seconds_remaining <= 0) return;
    const timer = setInterval(() => {
      setCooldownData(prev => {
        if (!prev || prev.seconds_remaining <= 1) return { ...prev, in_cooldown: false, seconds_remaining: 0 };
        return { ...prev, seconds_remaining: prev.seconds_remaining - 1 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownData?.in_cooldown, cooldownData?.seconds_remaining > 0]);

  // Initial fetch and polling
  useEffect(() => {
    fetchIVSkew();
    fetchGexLevels();
    fetchStrategyStatus();

    // Refresh IV every 30 seconds, GEX every 60 seconds, strategy every 10 seconds
    const ivInterval = setInterval(fetchIVSkew, 30000);
    const gexInterval = setInterval(fetchGexLevels, 60000);
    const stratInterval = setInterval(fetchStrategyStatus, 10000);

    return () => {
      clearInterval(ivInterval);
      clearInterval(gexInterval);
      clearInterval(stratInterval);
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
    const tradeSupportLevels = ['S1', 'S2', 'S3', 'S4', 'S5', 'PutWall', 'GF'];
    const tradeResistanceLevels = ['R1', 'R2', 'R3', 'R4', 'R5', 'CallWall', 'GF'];

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
    if (gammaFlip && tradeSupportLevels.includes('GF') && gammaFlip < price) {
      allSupportLevels.push({ type: 'GF', level: gammaFlip });
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
    if (gammaFlip && tradeResistanceLevels.includes('GF') && gammaFlip > price) {
      allResistanceLevels.push({ type: 'GF', level: gammaFlip });
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
    if (skew === null || skew === undefined) return 'text-gray-300';
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
      <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg p-2">
        <h3 className="text-[15px] font-bold text-white mb-2">IV Skew</h3>
        <div className="text-gray-300 text-[15px]">Loading IV data...</div>
      </div>
    );
  }

  if (error && !ivData) {
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg p-2">
        <h3 className="text-[15px] font-bold text-white mb-2">IV Skew</h3>
        <div className="text-red-400 text-[15px]">{error}</div>
        <button
          onClick={fetchIVSkew}
          className="mt-1 px-2 py-0.5 bg-blue-600 text-white text-[15px] rounded hover:bg-blue-700"
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

  // Overall signal readiness (suppressed during cooldown)
  const inCooldown = cooldownData?.in_cooldown;
  const longReady = ivOk && skewLongOk && supportNear && !inCooldown;
  const shortReady = ivOk && skewShortOk && resistanceNear && !inCooldown;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg p-2">
      {/* Header */}
      <div className="flex justify-between items-center mb-1.5 flex-shrink-0">
        <h3 className="text-[15px] font-bold text-white">IV Skew</h3>
        {ivData?.timestamp && (
          <span className="text-[15px] text-gray-300">{new Date(ivData.timestamp).toLocaleTimeString()}</span>
        )}
        <div className={`px-1.5 py-0.5 rounded text-[15px] font-medium text-white ${signalBadge.color}`}>
          {signalBadge.text}
        </div>
      </div>

      {ivData ? (
        <div className="flex flex-col flex-1 justify-between min-h-0">
          {/* Skew + IV row */}
          <div className="bg-gray-700 rounded p-1.5 mb-1.5">
            <div className="flex justify-between items-center">
              <span className="text-gray-300 text-[15px]">ATM Skew (P-C)</span>
              <span className={`text-base font-mono font-bold ${getSkewColor(ivData.skew)}`}>
                {formatSkew(ivData.skew)}
              </span>
            </div>
          </div>

          {/* IV Details + Open Interest */}
          <div className="grid grid-cols-3 gap-1 mb-1.5">
            <div className="bg-gray-700 rounded px-1.5 py-1">
              <div className="text-[15px] text-gray-300">Call IV</div>
              <div className="text-[15px] font-mono text-green-400">{formatPercent(ivData.callIV)}</div>
            </div>
            <div className="bg-gray-700 rounded px-1.5 py-1">
              <div className="text-[15px] text-gray-300">Put IV</div>
              <div className="text-[15px] font-mono text-red-400">{formatPercent(ivData.putIV)}</div>
            </div>
            <div className="bg-gray-700 rounded px-1.5 py-1">
              <div className="text-[15px] text-gray-300">Avg IV</div>
              <div className={`text-[15px] font-mono ${ivOk ? 'text-cyan-400' : 'text-orange-400'}`}>{formatPercent(ivData.iv)}</div>
            </div>
            <div className="bg-gray-700 rounded px-1.5 py-1">
              <div className="text-[15px] text-gray-300">Call Open Int</div>
              <div className="text-[15px] font-mono text-green-400">{ivData.callOI?.toLocaleString() || '—'}</div>
            </div>
            <div className="bg-gray-700 rounded px-1.5 py-1">
              <div className="text-[15px] text-gray-300">Put Open Int</div>
              <div className="text-[15px] font-mono text-red-400">{ivData.putOI?.toLocaleString() || '—'}</div>
            </div>
            <div className="bg-gray-700 rounded px-1.5 py-1">
              <div className="text-[15px] text-gray-300">ATM Strike</div>
              <div className="text-[15px] font-mono text-white">{ivData.atmStrike?.toFixed(0) || '—'}</div>
            </div>
          </div>

          {/* GEX Level Proximity */}
          {gexProximity && (
            <div className="bg-gray-700 rounded p-1.5 mb-1.5">
              <div className="text-[15px] text-gray-300 mb-1">GEX Proximity ({LEVEL_PROXIMITY}pt threshold)</div>
              <div className="space-y-1 font-mono text-[15px]">
                <div className={`flex items-center rounded px-1.5 py-1 ${supportNear ? 'bg-green-900/30 border border-green-600' : 'bg-gray-600'}`}>
                  <span className="text-gray-300 flex-1" style={{ fontFamily: 'inherit' }}>Support</span>
                  <span className="text-cyan-400 w-[4.5rem] text-right flex-shrink-0">{(gexProximity.support || gexProximity.closestSupport)?.type || '—'}</span>
                  <span className="text-gray-300 w-20 text-right flex-shrink-0">
                    {(gexProximity.support || gexProximity.closestSupport) ? (Math.round((gexProximity.support || gexProximity.closestSupport).level * 4) / 4).toFixed(2) : '—'}
                  </span>
                  <span className={`w-20 text-right flex-shrink-0 ${supportNear ? 'text-green-400 font-bold' : 'text-gray-300'}`}>
                    {(gexProximity.support || gexProximity.closestSupport) ? `${(Math.round((gexProximity.support || gexProximity.closestSupport).distance * 4) / 4).toFixed(2)}pt` : '—'}
                  </span>
                  <span className="w-4 text-center flex-shrink-0">{supportNear ? <span className="text-green-400">✓</span> : ''}</span>
                </div>
                <div className={`flex items-center rounded px-1.5 py-1 ${resistanceNear ? 'bg-red-900/30 border border-red-600' : 'bg-gray-600'}`}>
                  <span className="text-gray-300 flex-1" style={{ fontFamily: 'inherit' }}>Resistance</span>
                  <span className="text-orange-400 w-[4.5rem] text-right flex-shrink-0">{(gexProximity.resistance || gexProximity.closestResistance)?.type || '—'}</span>
                  <span className="text-gray-300 w-20 text-right flex-shrink-0">
                    {(gexProximity.resistance || gexProximity.closestResistance) ? (Math.round((gexProximity.resistance || gexProximity.closestResistance).level * 4) / 4).toFixed(2) : '—'}
                  </span>
                  <span className={`w-20 text-right flex-shrink-0 ${resistanceNear ? 'text-red-400 font-bold' : 'text-gray-300'}`}>
                    {(gexProximity.resistance || gexProximity.closestResistance) ? `${(Math.round((gexProximity.resistance || gexProximity.closestResistance).distance * 4) / 4).toFixed(2)}pt` : '—'}
                  </span>
                  <span className="w-4 text-center flex-shrink-0">{resistanceNear ? <span className="text-red-400">✓</span> : ''}</span>
                </div>
              </div>
            </div>
          )}

          {/* Signal Readiness — merged Long/Short into rows */}
          <div className="bg-gray-700 rounded p-1.5 mb-1.5">
            <div className="flex justify-between items-center mb-1">
              <div className="text-[15px] text-gray-300">Signal Readiness</div>
              <span className={`text-[15px] font-mono font-bold ${candleCountdown <= 5 ? 'text-yellow-400 animate-pulse' : 'text-cyan-400'}`}>
                {candleCountdown}s
              </span>
            </div>
            <div className="space-y-0.5 text-[15px]">
              {inCooldown && (
                <div className="flex items-center justify-between bg-yellow-900/30 border border-yellow-600/50 rounded px-1.5 py-0.5 mb-0.5">
                  <span className="text-yellow-400 font-semibold">COOLDOWN</span>
                  <span className="text-yellow-400 font-mono font-bold">
                    {Math.floor(cooldownData.seconds_remaining / 60)}:{String(cooldownData.seconds_remaining % 60).padStart(2, '0')}
                  </span>
                </div>
              )}
              <div className="flex items-center">
                <span className="text-cyan-400 font-semibold w-16 flex-shrink-0">LONG</span>
                <span className={`flex-1 ${skewLongOk ? 'text-green-400' : 'text-gray-300'}`}>{skewLongOk ? '✓' : '○'} Skew</span>
                <span className={`flex-1 ${ivOk ? 'text-green-400' : 'text-gray-300'}`}>{ivOk ? '✓' : '○'} IV</span>
                <span className={`flex-1 ${supportNear ? 'text-green-400' : 'text-gray-300'}`}>{supportNear ? '✓' : '○'} Support</span>
                {longReady && <span className="text-green-400 font-bold animate-pulse flex-shrink-0">READY</span>}
              </div>
              <div className="flex items-center">
                <span className="text-orange-400 font-semibold w-16 flex-shrink-0">SHORT</span>
                <span className={`flex-1 ${skewShortOk ? 'text-red-400' : 'text-gray-300'}`}>{skewShortOk ? '✓' : '○'} Skew</span>
                <span className={`flex-1 ${ivOk ? 'text-green-400' : 'text-gray-300'}`}>{ivOk ? '✓' : '○'} IV</span>
                <span className={`flex-1 ${resistanceNear ? 'text-red-400' : 'text-gray-300'}`}>{resistanceNear ? '✓' : '○'} Resist</span>
                {shortReady && <span className="text-red-400 font-bold animate-pulse flex-shrink-0">READY</span>}
              </div>
            </div>
          </div>

          {/* Strategy Blockers */}
          {strategyBlockers.length > 0 && (
            <div className="bg-gray-700 rounded p-1.5 mb-1.5">
              <div className="space-y-0.5 text-[12px]">
                {strategyBlockers.map((b, i) => (
                  <div key={i} className="text-yellow-400">{b}</div>
                ))}
              </div>
            </div>
          )}

        </div>
      ) : (
        <div className="text-gray-300 text-[15px] text-center py-2">
          No IV data available
        </div>
      )}

    </div>
  );
};

export default IVSkewPanel;
