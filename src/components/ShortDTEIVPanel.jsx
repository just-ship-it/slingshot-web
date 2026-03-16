import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import PositionBanner from './PositionBanner';

const ShortDTEIVPanel = ({ socket, quotes }) => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [countdown, setCountdown] = useState(0);

  // 15-minute candle countdown
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const totalSec = now.getMinutes() * 60 + now.getSeconds();
      setCountdown(900 - (totalSec % 900));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      setError(null);
      const response = await api.getShortDTEIVStatus();
      if (response) {
        setStatus(response);
      } else {
        setStatus({ success: false, error: 'No response', message: 'signal-generator may not be running' });
      }
    } catch (err) {
      setError('Failed to fetch short-DTE IV status');
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
        <h3 className="text-[15px] font-bold text-white mb-2">Short-DTE IV</h3>
        <div className="text-gray-400 text-[15px]">Loading...</div>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg p-2">
        <h3 className="text-[15px] font-bold text-white mb-2">Short-DTE IV</h3>
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

  if (status && status.success === false) {
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg p-2">
        <h3 className="text-[15px] font-bold text-white mb-2">Short-DTE IV</h3>
        <div className="text-yellow-400 text-[15px] mb-1">Service not running</div>
        <div className="text-gray-500 text-[15px]">{status.message}</div>
      </div>
    );
  }

  const internals = status?.internals;
  const position = status?.position;
  const readiness = status?.evaluation_readiness;
  const strategy = status?.strategy;

  const ivSnap = internals?.ivSnapshot;
  const ivChange = internals?.ivChange;
  const provider = internals?.providerStatus;
  const params = internals?.params;
  const sigDir = internals?.signalDirection;

  const isWarming = provider && !provider.ready;

  // Badge logic
  const getBadge = () => {
    if (!provider) return { color: 'bg-gray-600', text: 'DISABLED' };
    if (isWarming) return { color: 'bg-blue-600', text: 'WARMING UP' };
    if (sigDir === 'long') return { color: 'bg-green-600', text: 'LONG SIGNAL' };
    if (sigDir === 'short') return { color: 'bg-red-600', text: 'SHORT SIGNAL' };
    if (readiness?.ready) return { color: 'bg-green-800', text: 'READY' };
    return { color: 'bg-gray-600', text: 'WAITING' };
  };

  const badge = getBadge();

  const fmtIV = (v) => v != null ? (v * 100).toFixed(1) + '%' : '--';
  const fmtChange = (v) => v != null ? (v > 0 ? '+' : '') + (v * 100).toFixed(2) + '%' : '--';

  // Threshold bar: map change to position within [-maxRange, +maxRange]
  const maxRange = params?.ivChangeThreshold ? params.ivChangeThreshold * 3 : 0.03;
  const changeVal = ivChange?.change ?? 0;
  const barPct = Math.min(Math.max(changeVal / maxRange, -1), 1) * 50; // -50 to +50
  const threshPct = params?.ivChangeThreshold ? (params.ivChangeThreshold / maxRange) * 50 : 0;

  const countdownMin = Math.floor(countdown / 60);
  const countdownSec = countdown % 60;

  // Quality dots
  const qualityDots = (q) => {
    const max = 3;
    const val = q ?? 0;
    return Array.from({ length: max }, (_, i) => (
      <span
        key={i}
        className={`inline-block w-2 h-2 rounded-full ${i < val ? 'bg-green-400' : 'bg-gray-600'}`}
      />
    ));
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg p-2">
      {/* Header */}
      <div className="flex justify-between items-center mb-1.5 flex-shrink-0">
        <h3 className="text-[15px] font-bold text-white">Short-DTE IV</h3>
        {status?.timestamp && (
          <span className="text-[15px] text-gray-300">{new Date(status.timestamp).toLocaleTimeString()}</span>
        )}
        <div className={`px-1.5 py-0.5 rounded text-[15px] font-medium text-white ${badge.color}`}>
          {badge.text}
        </div>
      </div>

      <PositionBanner productPosition={status?.product_position} />

      <div className="flex flex-col flex-1 justify-between min-h-0">
        {/* IV Levels */}
        {!isWarming && ivSnap && (
          <div className="bg-gray-700 rounded p-1.5 mb-1.5">
            <div className="flex justify-between text-[15px] mb-0.5">
              <span><span className="text-gray-300">0-DTE</span> <span className="text-white font-mono">{fmtIV(ivSnap.dte0_avg_iv)}</span></span>
              <span><span className="text-gray-300">1-DTE</span> <span className="text-white font-mono">{fmtIV(ivSnap.dte1_avg_iv)}</span></span>
            </div>
            <div className="flex justify-between text-[15px] mb-0.5">
              <span><span className="text-gray-300">Skew</span> <span className="text-white font-mono">{ivSnap.skew != null ? ivSnap.skew.toFixed(4) : '--'}</span></span>
              <span>
                <span className="text-gray-300">Term</span>{' '}
                <span className={`font-mono ${ivSnap.termInverted ? 'text-red-400' : 'text-green-400'}`}>
                  {ivSnap.termInverted ? 'INVERTED' : 'NORMAL'}
                </span>
              </span>
            </div>
            <div className="flex justify-between text-[15px]">
              <span><span className="text-gray-300">QQQ</span> <span className="text-white font-mono">{ivSnap.spotPrice ? '$' + ivSnap.spotPrice.toFixed(2) : '--'}</span></span>
              <span className="flex items-center gap-1">
                <span className="text-gray-300">Quality</span>
                {qualityDots(ivSnap.quality)}
              </span>
            </div>
          </div>
        )}

        {/* IV Change — focal point */}
        {!isWarming && ivChange && (
          <div className="bg-gray-700 rounded p-1.5 mb-1.5">
            {/* Large IV change display */}
            <div className="text-center mb-1">
              <span className={`text-2xl font-mono font-bold ${
                ivChange.direction === 'drop' ? 'text-green-400' : ivChange.direction === 'spike' ? 'text-red-400' : 'text-gray-400'
              }`}>
                {ivChange.direction === 'drop' ? '\u25BC ' : ivChange.direction === 'spike' ? '\u25B2 ' : ''}
                {fmtChange(ivChange.change)}
              </span>
            </div>

            {/* Threshold bar */}
            <div className="relative h-3 bg-gray-600 rounded-full overflow-hidden mb-1">
              {/* Center line */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-px h-full bg-gray-400"></div>
              </div>
              {/* Threshold markers */}
              <div className="absolute h-full w-px bg-green-500/40" style={{ left: `${50 - threshPct}%` }}></div>
              <div className="absolute h-full w-px bg-red-500/40" style={{ left: `${50 + threshPct}%` }}></div>
              {/* Change bar */}
              {ivChange.change != null && (
                <div
                  className={`absolute top-0 h-full rounded-full transition-all duration-300 ${changeVal <= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                  style={{
                    left: changeVal <= 0 ? `${50 + barPct}%` : '50%',
                    width: `${Math.abs(barPct)}%`
                  }}
                ></div>
              )}
            </div>

            {/* Direction text */}
            <div className="text-center text-[15px]">
              {ivChange.aboveThreshold ? (
                <span className={ivChange.direction === 'drop' ? 'text-green-400' : 'text-red-400'}>
                  {ivChange.direction === 'drop' ? 'IV DROP \u2192 LONG' : 'IV SPIKE \u2192 SHORT'}
                </span>
              ) : (
                <span className="text-gray-400">
                  Below threshold ({(params?.ivChangeThreshold * 100).toFixed(1)}%)
                </span>
              )}
            </div>
          </div>
        )}

        {/* Status row */}
        <div className="flex items-center gap-2 text-[15px] mb-1.5 px-1">
          <span className={`font-mono ${countdown <= 30 ? 'text-yellow-400 animate-pulse' : 'text-cyan-400'}`}>
            Next eval: {countdownMin}m {String(countdownSec).padStart(2, '0')}s
          </span>
          {strategy?.cooldown?.in_cooldown && (
            <span className="text-yellow-400">CD {strategy.cooldown.seconds_remaining}s</span>
          )}
          {provider && (
            <span className="text-gray-300 ml-auto">
              {provider.ready
                ? `${provider.snapshots} buffered`
                : `Warming up (${provider.snapshots}/${provider.snapshotsNeeded ?? 2})`
              }
            </span>
          )}
        </div>

        {/* Readiness */}
        {readiness && (
          <div className="bg-gray-700 rounded p-1.5 mb-1.5">
            <div className="space-y-0.5 text-[15px]">
              {readiness.conditions_met?.map((c, i) => (
                <div key={i} className="text-green-400">{'\u2713'} {c}</div>
              ))}
              {readiness.blockers?.filter(b => !b.startsWith('Position held by')).map((b, i) => (
                <div key={i} className="text-red-400">{'\u2717'} {b}</div>
              ))}
            </div>
          </div>
        )}

        {/* Exit Params */}
        {params && (
          <div className="flex gap-2 text-[15px] px-1 mb-1">
            <span><span className="text-gray-300">Tgt</span> <span className="text-green-400 font-mono">{params.targetPoints}pt</span></span>
            <span><span className="text-gray-300">Stp</span> <span className="text-red-400 font-mono">{params.stopPoints}pt</span></span>
            <span><span className="text-gray-300">MaxHold</span> <span className="text-cyan-400 font-mono">{params.maxHoldBars}bars</span></span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ShortDTEIVPanel;
