import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

const REGIME_COLORS = {
  strong_positive: 'text-green-400',
  positive: 'text-green-300',
  neutral: 'text-yellow-400',
  negative: 'text-red-300',
  strong_negative: 'text-red-400'
};

const REGIME_LABELS = {
  strong_positive: 'STRONG +',
  positive: 'POSITIVE',
  neutral: 'NEUTRAL',
  negative: 'NEGATIVE',
  strong_negative: 'STRONG -'
};

const ESCrossSignalPanel = ({ socket, quotes }) => {
  const [status, setStatus] = useState(null);
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

  // Fetch ES cross-signal status
  const fetchStatus = async () => {
    try {
      setError(null);
      const response = await api.getESCrossSignalStatus();
      if (response) {
        setStatus(response);
      } else {
        setStatus({ success: false, error: 'No response', message: 'siggen-es-cross may not be running' });
      }
    } catch (err) {
      setError('Failed to fetch ES cross-signal status');
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch and polling every 10 seconds
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !status) {
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg p-2">
        <h3 className="text-[15px] font-bold text-white mb-2">ES Cross-Signal</h3>
        <div className="text-gray-400 text-[15px]">Loading...</div>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg p-2">
        <h3 className="text-[15px] font-bold text-white mb-2">ES Cross-Signal</h3>
        <div className="text-red-400 text-[15px]">{error}</div>
        <button
          onClick={fetchStatus}
          className="mt-1 px-2 py-0.5 bg-blue-600 text-white text-[15px] rounded hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  // Handle service not running
  if (status && status.success === false) {
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg p-2">
        <h3 className="text-[15px] font-bold text-white mb-2">ES Cross-Signal</h3>
        <div className="text-yellow-400 text-[15px] mb-1">Service not running</div>
        <div className="text-gray-500 text-[15px]">{status.message}</div>
      </div>
    );
  }

  const internals = status?.internals;
  const gexLevels = status?.gex_levels;
  const strategy = status?.strategy;
  const position = status?.position;
  const readiness = status?.evaluation_readiness;
  const compositeScore = internals?.compositeScore ?? 0;
  const longThreshold = internals?.longThreshold ?? 2;
  const shortThreshold = internals?.shortThreshold ?? -2;
  const activeSignals = internals?.activeSignals || [];

  // Score color and badge
  const getScoreColor = (score) => {
    if (score >= longThreshold) return 'text-green-400';
    if (score > 0) return 'text-green-300';
    if (score <= shortThreshold) return 'text-red-400';
    if (score < 0) return 'text-red-300';
    return 'text-gray-400';
  };

  const getScoreBadge = () => {
    if (compositeScore >= longThreshold) return { color: 'bg-green-600', text: 'LONG SIGNAL' };
    if (compositeScore <= shortThreshold) return { color: 'bg-red-600', text: 'SHORT SIGNAL' };
    if (compositeScore > 0) return { color: 'bg-green-900', text: `BULLISH (${compositeScore})` };
    if (compositeScore < 0) return { color: 'bg-red-900', text: `BEARISH (${compositeScore})` };
    return { color: 'bg-gray-600', text: 'NEUTRAL' };
  };

  const scoreBadge = getScoreBadge();
  const esPrice = gexLevels?.futures_spot || quotes?.ES?.close || null;
  const regime = gexLevels?.regime;

  // Signal type display helpers
  const getSignalTypeLabel = (type) => {
    switch (type) {
      case 'down_through': return 'LT Down-Through';
      case 'up_through': return 'LT Up-Through';
      case 'regime_improving': return 'Regime Improving';
      case 'regime_deteriorating': return 'Regime Deteriorating';
      default: return type;
    }
  };

  const getSignalTypeColor = (type) => {
    if (type === 'down_through' || type === 'regime_improving') return 'text-green-400';
    if (type === 'up_through' || type === 'regime_deteriorating') return 'text-red-400';
    return 'text-gray-400';
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg p-2">
      {/* Header */}
      <div className="flex justify-between items-center mb-1.5 flex-shrink-0">
        <h3 className="text-[15px] font-bold text-white">ES Cross-Signal</h3>
        {status?.timestamp && (
          <span className="text-[15px] text-gray-300">{new Date(status.timestamp).toLocaleTimeString()}</span>
        )}
        <div className={`px-1.5 py-0.5 rounded text-[15px] font-medium text-white ${scoreBadge.color}`}>
          {scoreBadge.text}
        </div>
      </div>

      <div className="flex flex-col flex-1 justify-between min-h-0">
      {/* Score + Regime + Price row */}
      <div className="bg-gray-700 rounded p-1.5 mb-1.5">
        <div className="grid grid-cols-3 items-center">
          <span className={`text-[15px] font-semibold ${regime ? REGIME_COLORS[regime] || 'text-gray-400' : 'text-gray-500'}`}>
            {regime ? REGIME_LABELS[regime] || regime : '---'}
          </span>
          <span className={`text-lg font-mono font-bold text-center ${getScoreColor(compositeScore)}`}>
            {compositeScore > 0 ? '+' : ''}{compositeScore}
          </span>
          <span className="text-[15px] font-mono text-white text-right">
            ES {esPrice ? esPrice.toFixed(2) : '---'}
          </span>
        </div>
        {/* Score bar */}
        <div className="mt-1 relative h-2 bg-gray-600 rounded-full overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-px h-full bg-gray-400"></div>
          </div>
          <div className="absolute h-full w-px bg-green-500/50" style={{ left: `${50 + (longThreshold / 6) * 50}%` }}></div>
          <div className="absolute h-full w-px bg-red-500/50" style={{ left: `${50 + (shortThreshold / 6) * 50}%` }}></div>
          <div
            className={`absolute top-0 h-full rounded-full transition-all duration-300 ${compositeScore >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
            style={{
              left: compositeScore >= 0 ? '50%' : `${50 + (compositeScore / 6) * 50}%`,
              width: `${Math.abs(compositeScore / 6) * 50}%`
            }}
          ></div>
        </div>
      </div>

      {/* Active Signal Events */}
      <div className="bg-gray-700 rounded p-1.5 mb-1.5">
        <div className="flex justify-between items-center mb-0.5">
          <span className="text-[15px] text-gray-300">Signals ({activeSignals.length})</span>
          <span className="text-[15px] text-gray-300">
            {internals?.signalDecayMs ? `${Math.round(internals.signalDecayMs / 60000)}m window` : ''}
          </span>
        </div>
        {activeSignals.length > 0 ? (
          <div className="space-y-0.5">
            {activeSignals.map((signal, i) => (
              <div key={i} className="flex justify-between items-center text-[15px]">
                <span className={getSignalTypeColor(signal.type)}>
                  {signal.score > 0 ? '+' : ''}{signal.score} {getSignalTypeLabel(signal.type)}
                  {signal.levelNum ? ` L${signal.levelNum}` : ''}
                  {signal.from ? ` (${signal.from}->${signal.to})` : ''}
                </span>
                <span className="text-gray-300 font-mono">
                  {signal.age_seconds < 60 ? `${signal.age_seconds}s` : `${Math.round(signal.age_seconds / 60)}m`}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-gray-300 text-[15px] text-center">No active signals</div>
        )}
      </div>

      {/* ES GEX Levels — compact inline */}
      {gexLevels && (
        <div className="bg-gray-700 rounded p-1.5 mb-1.5 text-[15px]">
          <div className="flex gap-2">
            <span className="text-gray-300">S:</span>
            <span className="text-cyan-400 font-mono">{gexLevels.support?.slice(0, 3).map(s => s?.toFixed(0)).join('/') || '---'}</span>
            <span className="text-gray-300 ml-auto">R:</span>
            <span className="text-orange-400 font-mono">{gexLevels.resistance?.slice(0, 3).map(r => r?.toFixed(0)).join('/') || '---'}</span>
          </div>
          <div className="flex gap-2 mt-0.5">
            <span className="text-gray-300">PW:</span>
            <span className="text-cyan-400 font-mono">{gexLevels.put_wall?.toFixed(0) || '---'}</span>
            <span className="text-gray-300 ml-auto">CW:</span>
            <span className="text-orange-400 font-mono">{gexLevels.call_wall?.toFixed(0) || '---'}</span>
          </div>
        </div>
      )}

      {/* LT Levels — single row */}
      {status?.lt_levels && (
        <div className="bg-gray-700 rounded p-1.5 mb-1.5">
          <div className="flex items-center gap-1 text-[15px]">
            <span className="text-[15px] text-gray-300">LT</span>
            {[
              { key: 'L2', label: 'L3' },
              { key: 'L3', label: 'L4' },
              { key: 'L4', label: 'L5' },
              { key: 'L5', label: 'L6' },
              { key: 'L6', label: 'L7' }
            ].map(({ key, label }) => {
              const level = status.lt_levels[key];
              const isAbovePrice = esPrice && level > esPrice;
              return (
                <span key={key} className={`font-mono ${isAbovePrice ? 'text-orange-400' : 'text-cyan-400'}`}>
                  {level ? level.toFixed(0) : '---'}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Signal Readiness + Cooldown */}
      <div className="bg-gray-700 rounded p-1.5 mb-1.5">
        <div className="flex justify-between items-center mb-0.5">
          <div className="text-[15px] text-gray-300">Readiness</div>
          <div className="flex items-center gap-1">
            {strategy?.cooldown?.in_cooldown && (
              <span className="text-[15px] text-yellow-400">
                CD {strategy.cooldown.seconds_remaining}s
              </span>
            )}
            <span className={`text-[15px] font-mono font-bold ${candleCountdown <= 5 ? 'text-yellow-400 animate-pulse' : 'text-cyan-400'}`}>
              {candleCountdown}s
            </span>
          </div>
        </div>
        {readiness && (
          <div className="space-y-0.5 text-[15px]">
            {readiness.conditions_met?.map((c, i) => (
              <div key={i} className="text-green-400">✓ {c}</div>
            ))}
            {readiness.blockers?.map((b, i) => (
              <div key={i} className="text-red-400">✗ {b}</div>
            ))}
          </div>
        )}
      </div>

      {/* Position State */}
      {position?.in_position && position.current && (
        <div className="bg-yellow-900/30 border border-yellow-600 rounded px-1.5 py-1 mb-1.5 text-[15px]">
          <span className="text-yellow-400 font-semibold">IN POSITION</span>
          <span className="text-gray-300 ml-2">
            {position.current.side?.toUpperCase()} {position.current.symbol} @ {position.current.entry_price?.toFixed(2)}
          </span>
        </div>
      )}

      {/* Exit Parameters — inline */}
      {internals?.exitParams && (
        <div className="flex gap-2 text-[15px] px-1 mb-1">
          <span><span className="text-gray-300">Tgt</span> <span className="text-green-400 font-mono">{internals.exitParams.targetPoints}pt</span></span>
          <span><span className="text-gray-300">Stp</span> <span className="text-red-400 font-mono">{internals.exitParams.stopPoints}pt</span></span>
          <span><span className="text-gray-300">BE</span> <span className="text-cyan-400 font-mono">{internals.exitParams.breakevenStop ? `${internals.exitParams.breakevenTrigger}pt` : 'Off'}</span></span>
        </div>
      )}
      </div>

    </div>
  );
};

export default ESCrossSignalPanel;
