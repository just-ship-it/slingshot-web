import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import PositionBanner from './PositionBanner';

/**
 * LS-Flip-Trigger-Bar dashboard panel.
 *
 * Intentionally simple — the strategy mechanics are too: one boolean (LS
 * bullish/bearish) flips on 1m bar close, fire a limit at fib midpoint of
 * that bar, stop at opposite extreme, target at same-side extreme. The
 * panel just surfaces the last flip and the most recent signal's levels.
 *
 * Backend: GET /api/strategy/ls-flip-trigger-bar/status → proxies to
 * signal-generator's /strategy/status/ls-flip-trigger-bar, which calls
 * LsFlipTriggerBarStrategy.getInternalState().
 */
const LsFlipTriggerBarPanel = ({ socket, quotes }) => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStatus = async () => {
    try {
      setError(null);
      const response = await api.getLsFlipTriggerBarStatus();
      if (response) {
        setStatus(response);
      } else {
        setStatus({ success: false, error: 'No response', message: 'signal-generator may not be running' });
      }
    } catch (err) {
      setError('Failed to fetch LS Flip Trigger Bar status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10_000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !status) {
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg p-2">
        <h3 className="text-[15px] font-bold text-white mb-2">LS Flip Trigger Bar</h3>
        <div className="text-gray-400 text-[15px]">Loading...</div>
      </div>
    );
  }
  if (error && !status) {
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg p-2">
        <h3 className="text-[15px] font-bold text-white mb-2">LS Flip Trigger Bar</h3>
        <div className="text-red-400 text-[15px]">{error}</div>
        <button onClick={fetchStatus} className="mt-1 px-2 py-0.5 bg-blue-600 text-white text-[15px] rounded hover:bg-blue-700">Retry</button>
      </div>
    );
  }
  if (status && status.success === false) {
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg p-2">
        <h3 className="text-[15px] font-bold text-white mb-2">LS Flip Trigger Bar</h3>
        <div className="text-yellow-400 text-[15px] mb-1">Service not running</div>
        <div className="text-gray-500 text-[15px]">{status.message}</div>
      </div>
    );
  }

  const internals = status?.internals || {};
  const position = status?.position;
  const enabled = status?.enabled;
  const params = internals.params || {};
  const lastFlip = internals.lastFlip;
  const lastSignal = internals.lastSignal;
  const rejectReason = internals.lastRejectReason;
  const atrWarm = internals.atrWarm;

  const fmtTime = (ms) => {
    if (!ms) return '—';
    return new Date(ms).toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }) + ' ET';
  };
  const minsAgo = (ms) => {
    if (!ms) return null;
    const diff = Math.floor((Date.now() - ms) / 60_000);
    if (diff < 1) return 'just now';
    if (diff < 60) return `${diff}m ago`;
    const h = Math.floor(diff / 60); const m = diff % 60;
    return `${h}h ${m}m ago`;
  };

  // Header badge: position > pending signal > LS state > waiting
  let badge;
  if (position?.side) {
    badge = { color: position.side === 'buy' ? 'bg-green-600' : 'bg-red-600', text: position.side === 'buy' ? 'LONG' : 'SHORT' };
  } else if (!enabled) {
    badge = { color: 'bg-gray-700', text: 'DISABLED' };
  } else if (!atrWarm) {
    badge = { color: 'bg-yellow-600', text: 'WARMING' };
  } else if (lastFlip?.sentiment === 'BULLISH') {
    badge = { color: 'bg-green-800', text: 'BULLISH' };
  } else if (lastFlip?.sentiment === 'BEARISH') {
    badge = { color: 'bg-red-800', text: 'BEARISH' };
  } else {
    badge = { color: 'bg-gray-600', text: 'WAITING' };
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg p-2">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[15px] font-bold text-white">LS Flip Trigger Bar</h3>
        <span className={`px-1.5 py-0.5 text-[12px] font-semibold text-white rounded ${badge.color}`}>{badge.text}</span>
      </div>

      {position?.side && <PositionBanner position={position} />}

      {/* Last LS flip */}
      <div className="mb-2">
        <div className="text-gray-400 text-[11px] uppercase tracking-wide mb-0.5">Last LS Flip</div>
        {lastFlip ? (
          <div className="flex items-baseline justify-between">
            <span className={`text-[15px] font-semibold ${lastFlip.sentiment === 'BULLISH' ? 'text-green-400' : 'text-red-400'}`}>
              {lastFlip.sentiment}
            </span>
            <span className="text-[12px] text-gray-400">
              {fmtTime(lastFlip.timestamp)} <span className="text-gray-500">({minsAgo(lastFlip.timestamp)})</span>
            </span>
          </div>
        ) : (
          <div className="text-[13px] text-gray-500">No flips observed yet</div>
        )}
      </div>

      {/* Last signal (entry / stop / target) */}
      <div className="mb-2">
        <div className="text-gray-400 text-[11px] uppercase tracking-wide mb-0.5">Last Signal</div>
        {lastSignal ? (
          <div className="space-y-0.5">
            <div className="flex items-baseline justify-between">
              <span className={`text-[14px] font-semibold ${lastSignal.direction === 'long' ? 'text-green-400' : 'text-red-400'}`}>
                {lastSignal.direction === 'long' ? 'LONG' : 'SHORT'} {lastSignal.symbol}
              </span>
              <span className="text-[11px] text-gray-400">{fmtTime(lastSignal.ts)}</span>
            </div>
            <div className="grid grid-cols-3 gap-1 text-[13px]">
              <div className="text-center">
                <div className="text-[10px] text-gray-500">ENTRY</div>
                <div className="text-white font-mono">{lastSignal.entryPrice}</div>
              </div>
              <div className="text-center">
                <div className="text-[10px] text-gray-500">STOP</div>
                <div className="text-red-300 font-mono">{lastSignal.stopLoss}</div>
              </div>
              <div className="text-center">
                <div className="text-[10px] text-gray-500">TARGET</div>
                <div className="text-green-300 font-mono">{lastSignal.takeProfit}</div>
              </div>
            </div>
            <div className="text-[10px] text-gray-500 text-center">
              cb_atr {lastSignal.cbAtr} / ATR(20) {lastSignal.atr20}
            </div>
          </div>
        ) : (
          <div className="text-[13px] text-gray-500">
            No signals yet{rejectReason ? <span className="text-gray-600"> · last reject: {rejectReason}</span> : null}
          </div>
        )}
      </div>

      {/* Params summary */}
      <div className="mt-auto pt-1 border-t border-gray-700">
        <div className="text-[10px] text-gray-500 leading-tight">
          fib {params.fib} · cb_atr&lt;{params.cbAtrMax} · maxHold {params.maxHoldBars}m · fill timeout {params.fillTimeoutCandles}m
        </div>
        <div className="text-[10px] text-gray-500 leading-tight">
          block hours ET [{(params.blockedHoursEt || []).join(', ')}] · EOD {params.eodCutoffEt || '—'}
        </div>
      </div>
    </div>
  );
};

export default LsFlipTriggerBarPanel;
