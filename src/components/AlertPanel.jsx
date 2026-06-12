import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ChevronDown } from 'lucide-react';
import { api } from '../services/api';

const MAX_ALERTS = 50;

// Derive where a breakeven / trailing stop engages and where the stop moves to,
// from the signal's entry price + direction + the raw point distances the engine
// carries (breakevenTrigger/Offset, trailingTrigger/Offset). Purely informational.
// For a LONG, "favorable" is up; for a SHORT, "favorable" is down.
const stopManagementInfo = (sig, direction) => {
  const entry = sig?.price;
  if (entry == null || (direction !== 'LONG' && direction !== 'SHORT')) return null;
  const sign = direction === 'LONG' ? 1 : -1;
  const fmt = (n) => Number(n).toFixed(2);
  const out = {};

  // Breakeven: one-time jump once MFE >= trigger. Stop moves to entry ± offset.
  const beTrig = sig.breakevenTrigger;
  if ((sig.breakevenStop || beTrig) && Number(beTrig) > 0) {
    const off = Number(sig.breakevenOffset) || 0;
    const newStop = entry + sign * off; // +off locks `off` pts of profit
    const lock = off > 0 ? `lock +${off}pt` : off < 0 ? `allow ${off}pt` : 'breakeven';
    out.be = {
      engage: fmt(entry + sign * beTrig),
      trigger: beTrig,
      newStop: fmt(newStop),
      lock,
    };
  }

  // Trailing: ratchets `offset` pts behind the running extreme once MFE >= trigger.
  const trTrig = sig.trailingTrigger;
  const trOff = sig.trailingOffset;
  if (Number(trTrig) > 0 && Number(trOff) > 0) {
    out.trail = {
      engage: fmt(entry + sign * trTrig),
      trigger: trTrig,
      offset: trOff,
    };
  }

  // LS-BE-on-flip overlay (orchestrator arms BE on first adverse 1m LS flip).
  if (sig.lsBeOnFlip) {
    const off = Number(sig.lsBeOffset) || 0;
    out.lsBe = {
      newStop: fmt(entry + sign * off),
      lock: off > 0 ? `lock +${off}pt` : off < 0 ? `allow ${off}pt` : 'breakeven',
    };
  }

  return (out.be || out.trail || out.lsBe) ? out : null;
};

// "Expires HH:MM ET (...)" — when the trade is force-closed if it never hits
// stop/target. Backend (orchestrator) computes the binding time from the
// per-signal max-hold and the EOD flatten cutoff; we just format it to ET.
const expiryLabel = (sig) => {
  if (!sig?.expiresAt) return null;
  const d = new Date(sig.expiresAt);
  if (isNaN(d.getTime())) return null;
  const t = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
  if (sig.expiryReason === 'eod') return `Expires ${t} ET (EOD flatten)`;
  if (sig.expiryReason === 'max_hold') {
    const mh = Number(sig.maxHoldBars);
    return `Expires ${t} ET (max hold${Number.isFinite(mh) ? ` ${mh}m` : ''})`;
  }
  return `Expires ${t} ET`;
};

const ResendButton = ({ signal, accounts }) => {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  if (!signal?.strategy || !signal?.symbol) return null;

  const handleResend = async (targetAccountId = null) => {
    setSending(true);
    setResult(null);
    setOpen(false);
    try {
      await api.resendSignal(signal, targetAccountId);
      setResult('ok');
    } catch (err) {
      setResult('fail');
    }
    setSending(false);
    setTimeout(() => setResult(null), 3000);
  };

  // Filter out shadow accounts
  const shadowIds = new Set(
    (accounts || []).filter(a => a.tracking?.via || a.config?.tracking?.via)
      .map(a => a.tracking?.via || a.config?.tracking?.via)
  );
  const visibleAccounts = (accounts || []).filter(a => !shadowIds.has(a.id));

  return (
    <div className="relative inline-flex items-center ml-1">
      <button
        onClick={() => handleResend(null)}
        disabled={sending}
        className="text-[10px] px-1.5 py-0.5 rounded-l bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-blue-500/30 disabled:opacity-50"
        title="Resend to all routed accounts"
      >
        {sending ? <RefreshCw className="w-3 h-3 animate-spin inline" /> : 'Resend'}
      </button>
      <button
        onClick={() => setOpen(prev => !prev)}
        className="text-[10px] px-1 py-0.5 rounded-r bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-l-0 border-blue-500/30"
      >
        <ChevronDown className="w-3 h-3" />
      </button>
      {result === 'ok' && <span className="ml-1 text-[10px] text-green-400">Sent</span>}
      {result === 'fail' && <span className="ml-1 text-[10px] text-red-400">Failed</span>}
      {open && (
        <div className="absolute top-full right-0 mt-1 bg-gray-800 border border-gray-600 rounded shadow-lg z-50 min-w-[140px]">
          <div className="text-[10px] text-gray-500 px-2 py-1 border-b border-gray-700">Send to specific account</div>
          {visibleAccounts.map(a => (
            <button
              key={a.id}
              onClick={() => handleResend(a.id)}
              className="block w-full text-left text-xs px-2 py-1.5 text-gray-300 hover:bg-gray-700"
            >
              {a.displayName || a.id}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const AlertPanel = ({ socket, accounts }) => {
  const [alerts, setAlerts] = useState([]);

  // Load persisted alerts from initial_state
  useEffect(() => {
    if (!socket?.socket) return;
    const handleInitialState = (data) => {
      if (data.alerts?.length) {
        setAlerts(data.alerts);
      }
    };
    socket.socket.on('initial_state', handleInitialState);
    return () => socket.socket.off('initial_state', handleInitialState);
  }, [socket]);

  // Listen for new alerts
  const handleAlert = useCallback((data) => {
    setAlerts(prev => {
      // Use server-assigned id if present, otherwise generate one
      const alert = {
        ...data,
        id: data.id || `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        receivedAt: data.receivedAt || new Date().toISOString(),
      };
      const updated = [alert, ...prev];
      return updated.length > MAX_ALERTS ? updated.slice(0, MAX_ALERTS) : updated;
    });
  }, []);

  useEffect(() => {
    if (!socket?.socket) return;
    socket.socket.on('strategy_alert', handleAlert);
    return () => socket.socket.off('strategy_alert', handleAlert);
  }, [socket, handleAlert]);

  // Listen for clear broadcast from another client
  useEffect(() => {
    if (!socket?.socket) return;
    const handleCleared = () => setAlerts([]);
    socket.socket.on('alerts_cleared', handleCleared);
    return () => socket.socket.off('alerts_cleared', handleCleared);
  }, [socket]);

  const dismissAlert = (id) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  const clearAll = async () => {
    try {
      await api.deleteAlerts();
    } catch (err) {
      console.error('Failed to clear alerts:', err);
    }
    setAlerts([]);
  };

  const severityStyles = {
    info: 'border-blue-500/50 bg-blue-500/5',
    warning: 'border-amber-500/50 bg-amber-500/5',
    critical: 'border-red-500/50 bg-red-500/5',
    signal: 'border-green-500/50 bg-green-500/5',
    rejected: 'border-red-500/50 bg-red-500/5',
  };

  const severityBadge = {
    info: 'bg-blue-500/20 text-blue-400',
    warning: 'bg-amber-500/20 text-amber-400',
    critical: 'bg-red-500/20 text-red-400',
    signal: 'bg-green-500/20 text-green-400',
    rejected: 'bg-red-500/20 text-red-400',
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  };

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-200">Alerts</h3>
          {alerts.length > 0 && (
            <span className="text-xs bg-gray-600 text-gray-300 px-1.5 py-0.5 rounded-full">
              {alerts.length}
            </span>
          )}
        </div>
        {alerts.length > 0 && (
          <button
            onClick={clearAll}
            className="text-xs text-gray-500 hover:text-gray-300"
          >
            Clear
          </button>
        )}
      </div>

      {/* Alert list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {alerts.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-600 text-xs">
            No strategy alerts
          </div>
        ) : (
          <div className="p-1.5 space-y-1">
            {alerts.map(alert => {
              const sig = alert.signal;
              const isSignal = alert.severity === 'signal' || alert.severity === 'rejected';
              const sideOrAction = sig?.side || sig?.action;
              const direction = sideOrAction === 'buy' || sideOrAction === 'long' || sideOrAction === 'Buy' ? 'LONG' : sideOrAction === 'sell' || sideOrAction === 'short' || sideOrAction === 'Sell' ? 'SHORT' : null;
              const dirColor = direction === 'LONG' ? 'text-green-400' : 'text-red-400';

              return (
                <div
                  key={alert.id}
                  className={`border-l-2 rounded px-2 py-1.5 ${severityStyles[alert.severity] || severityStyles.info}`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`text-[10px] font-medium px-1 py-0.5 rounded ${severityBadge[alert.severity] || severityBadge.info}`}>
                        {(alert.severity || 'info').toUpperCase()}
                      </span>
                      <span className="text-[11px] text-gray-400">{formatTime(alert.receivedAt || alert.timestamp)}</span>
                    </div>
                    <button
                      onClick={() => dismissAlert(alert.id)}
                      className="text-gray-600 hover:text-gray-400 text-xs leading-none flex-shrink-0"
                    >
                      x
                    </button>
                  </div>
                  {isSignal && sig ? (
                    <div className="mt-1 text-sm font-medium leading-snug">
                      <span className="text-blue-300">{sig.strategy}</span>
                      {sig.ruleId && (
                        <span
                          className="ml-1 px-1 rounded bg-purple-900/40 text-purple-300 text-[10px] font-mono"
                          title={sig.ruleDescription || sig.ruleId}
                        >
                          {sig.ruleId}
                        </span>
                      )}
                      {direction && <span className={`ml-2 ${dirColor}`}>{direction}</span>}
                      {sig.price != null && <span className="ml-2 text-white">@ {sig.price}</span>}
                      {sig.take_profit != null && (
                        <span className="ml-2 text-green-400">
                          TP {sig.take_profit}{sig.targetPoints != null ? ` (+${sig.targetPoints}pt)` : ''}
                        </span>
                      )}
                      {sig.stop_loss != null && (
                        <span className="ml-2 text-red-400">
                          SL {sig.stop_loss}{sig.stopPoints != null ? ` (-${sig.stopPoints}pt)` : ''}
                        </span>
                      )}
                      <ResendButton signal={sig} accounts={accounts} />
                      {alert.severity === 'rejected' && <div className="text-xs text-red-400 mt-0.5">{alert.message}</div>}
                      {expiryLabel(sig) && (
                        <div className="mt-0.5 text-[10px] font-mono text-gray-400">{expiryLabel(sig)}</div>
                      )}
                      {(() => {
                        const sm = stopManagementInfo(sig, direction);
                        if (!sm) return null;
                        return (
                          <div className="mt-0.5 text-[10px] font-mono text-amber-300/80 leading-snug">
                            {sm.be && (
                              <div>
                                BE @ {sm.be.engage} (+{sm.be.trigger}pt) → SL {sm.be.newStop} ({sm.be.lock})
                              </div>
                            )}
                            {sm.trail && (
                              <div>
                                Trail @ {sm.trail.engage} (+{sm.trail.trigger}pt), {sm.trail.offset}pt behind
                              </div>
                            )}
                            {sm.lsBe && (
                              <div className="text-cyan-300/80">
                                LS-flip BE → SL {sm.lsBe.newStop} ({sm.lsBe.lock})
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-200 mt-1 leading-snug">{alert.message}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AlertPanel;
