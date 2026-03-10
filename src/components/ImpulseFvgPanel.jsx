import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

const ImpulseFvgPanel = ({ socket, quotes }) => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStatus = async () => {
    try {
      setError(null);
      const response = await api.getImpulseFvgStatus();
      if (response) {
        setStatus(response);
      } else {
        setStatus({ success: false, error: 'No response', message: 'signal-generator may not be running' });
      }
    } catch (err) {
      setError('Failed to fetch impulse-fvg status');
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
        <h3 className="text-[15px] font-bold text-white mb-2">Impulse FVG</h3>
        <div className="text-gray-400 text-[15px]">Loading...</div>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg p-2">
        <h3 className="text-[15px] font-bold text-white mb-2">Impulse FVG</h3>
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
        <h3 className="text-[15px] font-bold text-white mb-2">Impulse FVG</h3>
        <div className="text-yellow-400 text-[15px] mb-1">Service not running</div>
        <div className="text-gray-500 text-[15px]">{status.message}</div>
      </div>
    );
  }

  const internals = status?.internals;
  const position = status?.position;
  const readiness = status?.evaluation_readiness;
  const strategy = status?.strategy;

  const lastImpulse = internals?.lastImpulse;
  const lastSignal = internals?.lastSignalInfo;
  const cooldown = internals?.cooldown || {};
  const eventWindow = internals?.eventWindow || {};
  const params = internals?.params || {};
  const mode = internals?.mode || 'no-fvg-fade';
  const signalCount = internals?.signalCount || 0;

  // Event window labels and active window detection
  const eventWindowLabels = [
    { start: 8 * 60 + 25, end: 8 * 60 + 40, label: 'Economic Data' },
    { start: 9 * 60 + 28, end: 9 * 60 + 37, label: 'Market Open' },
    { start: 9 * 60 + 58, end: 10 * 60 + 7, label: '10am Data' },
    { start: 13 * 60 + 58, end: 14 * 60 + 15, label: 'FOMC' },
    { start: 14 * 60 + 28, end: 14 * 60 + 42, label: 'FOMC Press' },
  ];

  const getActiveEventWindow = () => {
    if (!eventWindow.in_window) return null;
    const now = new Date();
    const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hour12: false });
    const [h, m] = etStr.split(':').map(Number);
    const etMinutes = h * 60 + m;
    for (const w of eventWindowLabels) {
      if (etMinutes >= w.start && etMinutes <= w.end) {
        const remainMin = Math.floor((w.end - etMinutes));
        const remainSec = 60 - now.getSeconds();
        return { ...w, remainMin, remainSec: remainSec % 60 };
      }
    }
    return null;
  };
  const activeWindow = getActiveEventWindow();

  // Status badge
  const getStatusBadge = () => {
    if (!status?.enabled) return { color: 'bg-gray-600', text: 'DISABLED' };
    if (eventWindow.in_window) return { color: 'bg-yellow-600', text: 'EVENT WINDOW' };
    if (cooldown.remaining_s > 0) return { color: 'bg-blue-600', text: 'COOLDOWN' };
    if (strategy?.session?.in_session === false) return { color: 'bg-gray-600', text: 'OUT OF SESSION' };
    return { color: 'bg-green-700', text: 'ACTIVE' };
  };
  const badge = getStatusBadge();

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg p-2">
      {/* Header */}
      <div className="flex justify-between items-center mb-1.5 flex-shrink-0">
        <h3 className="text-[15px] font-bold text-white">Impulse FVG</h3>
        {status?.timestamp && (
          <span className="text-[15px] text-gray-300">{new Date(status.timestamp).toLocaleTimeString()}</span>
        )}
        <div className={`px-1.5 py-0.5 rounded text-[15px] font-medium text-white ${badge.color}`}>
          {badge.text}
        </div>
      </div>

      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Mode + Signal Count */}
        <div className="bg-gray-700 rounded p-1.5 mb-1.5 flex-shrink-0">
          <div className="flex items-center justify-between text-[15px]">
            <span className="text-gray-300">
              Mode: <span className="text-white font-medium">{mode === 'no-fvg-fade' ? 'No-FVG Fade' : mode === 'fvg-pullback' ? 'FVG Pullback' : 'Both'}</span>
            </span>
            <span className="text-gray-300">
              Signals: <span className="text-white font-mono">{signalCount}</span>
            </span>
          </div>
          {cooldown.remaining_s > 0 && (
            <div className="text-[13px] text-blue-400 mt-0.5">
              Cooldown: {Math.floor(cooldown.remaining_s / 60)}m {cooldown.remaining_s % 60}s
            </div>
          )}
        </div>

        {/* Active Event Window */}
        {activeWindow && (
          <div className="bg-yellow-900/30 border border-yellow-600/50 rounded p-1.5 mb-1.5 flex-shrink-0">
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-yellow-400 font-medium">
                Event Window: {activeWindow.label}
              </span>
              <span className="text-yellow-300 font-mono">
                ~{activeWindow.remainMin}m {activeWindow.remainSec}s
              </span>
            </div>
            <div className="text-[12px] text-yellow-600 mt-0.5">
              {Math.floor(activeWindow.start / 60)}:{String(activeWindow.start % 60).padStart(2, '0')} - {Math.floor(activeWindow.end / 60)}:{String(activeWindow.end % 60).padStart(2, '0')} ET &middot; Impulses ignored
            </div>
          </div>
        )}

        {/* Last Impulse Detected */}
        <div className="bg-gray-700 rounded p-1.5 mb-1.5 flex-shrink-0">
          <div className="text-[13px] text-gray-400 mb-0.5">Last Impulse</div>
          {lastImpulse ? (
            <div className="space-y-0.5 text-[13px]">
              <div className="flex items-center gap-2">
                <span className={lastImpulse.direction === 'bullish' ? 'text-green-400' : 'text-red-400'}>
                  {lastImpulse.direction === 'bullish' ? '▲' : '▼'} {lastImpulse.direction.toUpperCase()}
                </span>
                <span className="text-white font-mono">{lastImpulse.bodySize}pt body</span>
                <span className="text-gray-400">{lastImpulse.range}pt range</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={lastImpulse.fvgFormed ? 'text-purple-400' : 'text-orange-400'}>
                  {lastImpulse.fvgFormed ? `FVG (${lastImpulse.fvgGapSize}pt gap)` : 'No FVG'}
                </span>
                <span className="text-gray-500">
                  {new Date(lastImpulse.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-gray-500 text-[13px]">No impulse detected yet</div>
          )}
        </div>

        {/* Last Signal */}
        {lastSignal && (
          <div className="bg-gray-700 rounded p-1.5 mb-1.5 flex-shrink-0">
            <div className="text-[13px] text-gray-400 mb-0.5">Last Signal</div>
            <div className="flex items-center gap-2 text-[13px]">
              <span className={lastSignal.side === 'buy' ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                {lastSignal.side?.toUpperCase()}
              </span>
              <span className="text-gray-300">
                {lastSignal.setup === 'fvg_pullback' ? 'FVG Pullback' : 'No-FVG Fade'}
              </span>
              <span className="text-white font-mono">@ {lastSignal.price?.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-2 text-[13px] mt-0.5">
              <span className="text-red-400 font-mono">SL {lastSignal.stop_loss?.toFixed(2)}</span>
              <span className="text-green-400 font-mono">TP {lastSignal.take_profit?.toFixed(2)}</span>
              <span className="text-gray-500">{new Date(lastSignal.timestamp).toLocaleTimeString()}</span>
            </div>
          </div>
        )}

        {/* Readiness / Blockers */}
        {readiness && (
          <div className="bg-gray-700 rounded p-1.5 mb-1.5 flex-shrink-0">
            <div className="text-[13px] text-gray-300 mb-0.5">Readiness</div>
            <div className="space-y-0.5 text-[13px]">
              {readiness.conditions_met?.map((c, i) => (
                <div key={i} className="text-green-400">{'\u2713'} {c}</div>
              ))}
              {readiness.blockers?.map((b, i) => (
                <div key={i} className="text-red-400">{'\u2717'} {b}</div>
              ))}
            </div>
          </div>
        )}

        {/* Position State */}
        {position?.in_position && position.current && (
          <div className="bg-yellow-900/30 border border-yellow-600 rounded px-1.5 py-1 mb-1.5 flex-shrink-0 text-[15px]">
            <span className="text-yellow-400 font-semibold">IN POSITION</span>
            <span className="text-gray-300 ml-2">
              {position.current.side?.toUpperCase()} {position.current.symbol} @ {position.current.entryPrice?.toFixed(2) || position.current.entry_price?.toFixed(2)}
            </span>
          </div>
        )}

        {/* Exit Params */}
        <div className="flex gap-2 text-[13px] px-1 flex-shrink-0 flex-wrap">
          <span><span className="text-gray-400">Body</span> <span className="text-white font-mono">{'\u2265'}{params.minBodyPoints}pt</span></span>
          <span><span className="text-gray-400">Tgt</span> <span className="text-green-400 font-mono">{params.noFvgTargetPoints}pt</span></span>
          <span><span className="text-gray-400">Stop</span> <span className="text-red-400 font-mono">+{params.noFvgStopBuffer}pt</span></span>
          <span><span className="text-gray-400">Trail</span> <span className="text-cyan-400 font-mono">{params.trailingTrigger}/{params.trailingOffset}pt</span></span>
          <span><span className="text-gray-400">MaxRisk</span> <span className="text-orange-400 font-mono">{params.noFvgMaxRisk}pt</span></span>
        </div>
      </div>
    </div>
  );
};

export default ImpulseFvgPanel;
