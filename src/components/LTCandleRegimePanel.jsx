import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import PositionBanner from './PositionBanner';

const LTCandleRegimePanel = ({ socket, quotes }) => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStatus = async () => {
    try {
      setError(null);
      const response = await api.getLTCandleRegimeStatus();
      if (response) {
        setStatus(response);
      } else {
        setStatus({ success: false, error: 'No response', message: 'signal-generator may not be running' });
      }
    } catch (err) {
      setError('Failed to fetch LT Candle Regime status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !status) {
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg p-2">
        <h3 className="text-[15px] font-bold text-white mb-2">LT Candle Regime</h3>
        <div className="text-gray-400 text-[15px]">Loading...</div>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg p-2">
        <h3 className="text-[15px] font-bold text-white mb-2">LT Candle Regime</h3>
        <div className="text-red-400 text-[15px]">{error}</div>
        <button onClick={fetchStatus} className="mt-1 px-2 py-0.5 bg-blue-600 text-white text-[15px] rounded hover:bg-blue-700">Retry</button>
      </div>
    );
  }

  if (status && status.success === false) {
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg p-2">
        <h3 className="text-[15px] font-bold text-white mb-2">LT Candle Regime</h3>
        <div className="text-yellow-400 text-[15px] mb-1">Service not running</div>
        <div className="text-gray-500 text-[15px]">{status.message}</div>
      </div>
    );
  }

  const internals = status?.internals;
  const position = status?.position;
  const readiness = status?.evaluation_readiness;

  const sentiment = internals?.sentiment;
  const levelStates = internals?.levelStates || {};
  const cooldownRemaining = internals?.cooldownRemaining || 0;
  const inCooldown = internals?.inCooldown || false;
  const nextLatchIn = internals?.nextLatchIn || 0;

  // Badge logic
  const getBadge = () => {
    if (position?.side) return { color: position.side === 'buy' ? 'bg-green-600' : 'bg-red-600', text: position.side === 'buy' ? 'LONG' : 'SHORT' };
    if (inCooldown) return { color: 'bg-yellow-600', text: 'COOLDOWN' };
    if (readiness?.ready) return { color: 'bg-green-800', text: 'READY' };
    return { color: 'bg-gray-600', text: 'WAITING' };
  };
  const badge = getBadge();

  // State color helper
  const stateColor = (state) => {
    if (state === 'ABOVE') return 'text-green-400';
    if (state === 'BELOW') return 'text-red-400';
    if (state === 'STRADDLE') return 'text-yellow-400';
    return 'text-gray-500';
  };

  const latchMin = Math.floor(nextLatchIn / 60);
  const latchSec = nextLatchIn % 60;

  const nqPrice = quotes?.NQ?.last || quotes?.MNQ?.last;

  // Find the closest level to triggering
  const levelEntries = Object.entries(levelStates);
  const closestLevel = levelEntries
    .filter(([, d]) => d.triggerDist != null && d.triggerDist >= 0)
    .sort((a, b) => a[1].triggerDist - b[1].triggerDist)[0]?.[0] || null;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg p-2">
      {/* Header */}
      <div className="flex justify-between items-center mb-1.5 flex-shrink-0">
        <h3 className="text-[15px] font-bold text-white">LT Candle Regime</h3>
        <div className={`px-1.5 py-0.5 rounded text-[15px] font-medium text-white ${badge.color}`}>
          {badge.text}
        </div>
      </div>

      <PositionBanner productPosition={status?.product_position} />

      <div className="flex flex-col flex-1 justify-between min-h-0">
        {/* Sentiment + Next Latch */}
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-[15px]">
            <span className="text-gray-300">Sentiment </span>
            <span className={`font-mono font-bold ${sentiment === 'BULLISH' ? 'text-green-400' : sentiment === 'BEARISH' ? 'text-red-400' : 'text-gray-500'}`}>
              {sentiment || '--'}
            </span>
          </span>
          <span className="text-[15px] text-gray-400">
            Next LT sample: {latchMin}:{String(latchSec).padStart(2, '0')}
          </span>
        </div>

        {/* LT Levels Table */}
        <div className="bg-gray-700 rounded p-1.5 mb-1.5">
          <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-2 text-[15px] mb-0.5">
            <span className="text-gray-400 font-medium">Level</span>
            <span className="text-gray-400 font-medium text-right">Price</span>
            <span className="text-gray-400 font-medium text-right">State</span>
            <span className="text-gray-400 font-medium text-right">Trigger</span>
          </div>
          {levelEntries.map(([name, data]) => {
            const isClosest = name === closestLevel;
            const rowBg = isClosest
              ? data.pendingSignal === 'LONG' ? 'bg-green-900/30 border-green-600/40'
              : data.pendingSignal === 'SHORT' ? 'bg-red-900/30 border-red-600/40'
              : 'bg-yellow-900/30 border-yellow-600/40'
              : 'border-gray-600';
            return (
              <div key={name} className={`grid grid-cols-[auto_1fr_auto_auto] gap-x-2 text-[15px] py-0.5 border-t ${rowBg} ${isClosest ? 'rounded px-1 -mx-1' : ''}`}>
                <span className={`font-mono ${isClosest ? 'text-white font-bold' : 'text-white'}`}>{name}</span>
                <span className="text-white font-mono text-right">
                  {data.price ? data.price.toFixed(1) : '--'}
                </span>
                <span className={`font-mono font-bold text-right ${stateColor(data.candleState)}`}>
                  {data.candleState || '--'}
                </span>
                <div className="flex items-center justify-end gap-1 min-w-[100px]">
                  {data.pendingSignal && data.pendingSignal !== 'EITHER' && (
                    <span className={`text-[11px] font-bold px-1 rounded ${
                      data.pendingSignal === 'LONG' ? 'bg-green-800 text-green-300' : 'bg-red-800 text-red-300'
                    }`}>
                      {data.pendingSignal === 'LONG' ? '↑' : '↓'}{data.pendingSignal}
                    </span>
                  )}
                  {data.pendingSignal === 'EITHER' && (
                    <span className="text-[11px] font-bold px-1 rounded bg-yellow-800 text-yellow-300">↕STRADDLE</span>
                  )}
                  <span className={`font-mono text-[13px] ${
                    isClosest ? 'text-white font-bold' : 'text-gray-400'
                  }`}>
                    {data.triggerDist != null ? `${data.triggerDist.toFixed(1)}pts` : '--'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Strategy Config */}
        <div className="bg-gray-700 rounded p-1.5 mb-1.5">
          <div className="flex justify-between text-[15px]">
            <span className="text-gray-300">Direction</span>
            <span className="text-white font-mono">{internals?.direction || '--'}</span>
          </div>
          <div className="flex justify-between text-[15px]">
            <span className="text-gray-300">Hold / Trail</span>
            <span className="text-white font-mono">
              {internals?.holdBars || '--'}m BE / {internals?.ratchetTrigger || '--'}pt → {internals?.ratchetTrailDist || '--'}pt trail
            </span>
          </div>
          {inCooldown && (
            <div className="flex justify-between text-[15px]">
              <span className="text-gray-300">Cooldown</span>
              <span className="text-yellow-400 font-mono">{cooldownRemaining}s</span>
            </div>
          )}
        </div>

        {/* Position details when in position */}
        {position?.side && (
          <div className="bg-gray-700 rounded p-1.5">
            <div className="flex justify-between text-[15px]">
              <span className="text-gray-300">Entry</span>
              <span className="text-white font-mono">{position.entryPrice?.toFixed(2)}</span>
            </div>
            {nqPrice && position.entryPrice && (
              <div className="flex justify-between text-[15px]">
                <span className="text-gray-300">P&L</span>
                <span className={`font-mono font-bold ${
                  (position.side === 'buy' ? nqPrice - position.entryPrice : position.entryPrice - nqPrice) >= 0
                    ? 'text-green-400' : 'text-red-400'
                }`}>
                  {((position.side === 'buy' ? nqPrice - position.entryPrice : position.entryPrice - nqPrice)).toFixed(2)} pts
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LTCandleRegimePanel;
