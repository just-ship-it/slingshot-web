import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import PositionBanner from './PositionBanner';

function getEtNow() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const o = {};
  for (const p of parts) o[p.type] = p.value;
  return { weekday: o.weekday, hour: parseInt(o.hour, 10), minute: parseInt(o.minute, 10) };
}

// Seconds until the next 3-minute clock boundary (00, 03, 06, ...).
function secondsTo3mBoundary() {
  const now = new Date();
  const sec = now.getSeconds();
  const min = now.getMinutes();
  const intoPeriod = (min % 3) * 60 + sec;
  return 180 - intoPeriod;
}

function parseEtCutoff(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute, label: `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}` };
}

function formatTimeSince(ms, nowMs) {
  if (!ms) return '—';
  const elapsedMin = Math.floor((nowMs - ms) / 60000);
  if (elapsedMin < 1) return '<1m';
  if (elapsedMin < 60) return `${elapsedMin}m`;
  const h = Math.floor(elapsedMin / 60);
  const m = elapsedMin % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

const NEAR_FLIP_THRESHOLD = 5; // points

const GexLt3mCrossoverPanel = ({ socket, quotes }) => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [etNow, setEtNow] = useState(getEtNow());
  const [cooldownData, setCooldownData] = useState(null);
  const [showEvalLog, setShowEvalLog] = useState(false);
  const [evalCountdown, setEvalCountdown] = useState(secondsTo3mBoundary());

  useEffect(() => {
    const t = setInterval(() => setEtNow(getEtNow()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setEvalCountdown(secondsTo3mBoundary());
    const t = setInterval(() => setEvalCountdown(secondsTo3mBoundary()), 1000);
    return () => clearInterval(t);
  }, []);

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

  const fetchAll = async () => {
    try {
      setError(null);
      const s = await api.getGexLt3mCrossoverStatus();
      setStatus(s || { success: false, message: 'signal-generator may not be running' });
      if (s?.cooldown) setCooldownData(s.cooldown);
    } catch (err) {
      setError('Failed to fetch GEX-LT-3M-Crossover status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 10_000);
    return () => clearInterval(t);
  }, []);

  if (loading && !status) {
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg p-2">
        <h3 className="text-[15px] font-bold text-white mb-2">GEX-LT-3M-Crossover</h3>
        <div className="text-gray-400 text-[15px]">Loading...</div>
      </div>
    );
  }
  if (status?.success === false) {
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg p-2">
        <h3 className="text-[15px] font-bold text-white mb-2">GEX-LT-3M-Crossover</h3>
        <div className="text-yellow-400 text-[15px] mb-1">Service not running</div>
        <div className="text-gray-500 text-[15px]">{status.message}</div>
      </div>
    );
  }

  const internals = status?.internals || {};
  const position = status?.position;

  const startH = internals.entryWindowStartHour ?? 7;
  const endH = internals.entryWindowEndHour ?? 16;
  const blockedHours = new Set(internals.blockedHoursEt || [13]);
  const inEntryWindow = etNow.weekday !== 'Sat' && etNow.weekday !== 'Sun'
    && etNow.hour >= startH && etNow.hour < endH
    && !blockedHours.has(etNow.hour);

  const eodCutoff = parseEtCutoff(internals.eodCutoffEt ?? '16:40');
  const pastEodCutoff = eodCutoff
    && etNow.weekday !== 'Sat' && etNow.weekday !== 'Sun'
    && (etNow.hour > eodCutoff.hour || (etNow.hour === eodCutoff.hour && etNow.minute >= eodCutoff.minute));

  const nqPrice = quotes?.NQ?.last || quotes?.MNQ?.last || quotes?.NQ?.close;
  const inCooldown = cooldownData?.in_cooldown && cooldownData?.seconds_remaining > 0;

  const activeRules = internals.activeRules || [];
  const pairGrid = internals.pairGrid || [];
  const nowMs = Date.now();

  // Detect any pair within NEAR_FLIP_THRESHOLD of flipping (small absolute diff)
  let nearFlipCount = 0;
  for (const row of pairGrid) {
    for (const c of row.cells) {
      if (c.diff != null && Math.abs(c.diff) <= NEAR_FLIP_THRESHOLD && c.sign !== 0) nearFlipCount++;
    }
  }

  const blockers = [];
  if (!inEntryWindow) {
    if (blockedHours.has(etNow.hour)) blockers.push(`Blocked hour ${etNow.hour}:00 ET`);
    else blockers.push(`Outside entry window (${String(startH).padStart(2,'0')}:00–${String(endH).padStart(2,'0')}:00 ET)`);
  }
  if (pastEodCutoff) blockers.push(`Past EOD force-flat (${eodCutoff.label} ET)`);
  if (inCooldown) blockers.push(`Cooldown ${Math.floor(cooldownData.seconds_remaining/60)}:${String(cooldownData.seconds_remaining%60).padStart(2,'0')}`);
  if (!internals.gexLevelsSnapshot) blockers.push('No GEX levels');
  if (!internals.lt1mSnapshot) blockers.push('No 1m LT levels');

  const getBadge = () => {
    if (position?.side) return { color: position.side === 'long' ? 'bg-green-600' : 'bg-red-600', text: position.side.toUpperCase() };
    if (pastEodCutoff) return { color: 'bg-orange-700', text: 'EOD-FLAT' };
    if (!inEntryWindow) return { color: 'bg-gray-600', text: 'OUT-OF-WINDOW' };
    if (inCooldown) return { color: 'bg-yellow-700', text: 'COOLDOWN' };
    if (nearFlipCount > 0) return { color: 'bg-yellow-600', text: `${nearFlipCount} NEAR FLIP` };
    return { color: 'bg-blue-700', text: 'WATCHING' };
  };
  const badge = getBadge();

  const evalLog = internals.evaluationLog || [];

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg p-2">
      <div className="flex justify-between items-center mb-1.5 flex-shrink-0 gap-2">
        <h3 className="text-[15px] font-bold text-white">GEX-LT-3M-Crossover</h3>
        <div className="flex items-center gap-2">
          <span
            className={`text-[13px] font-mono ${evalCountdown <= 10 ? 'text-yellow-400 animate-pulse' : 'text-cyan-400'}`}
            title="Seconds until next 3m boundary (when crossovers are detected)"
          >
            next eval {Math.floor(evalCountdown / 60)}:{String(evalCountdown % 60).padStart(2,'0')}
          </span>
          <div className={`px-1.5 py-0.5 rounded text-[15px] font-medium text-white ${badge.color}`}>{badge.text}</div>
        </div>
      </div>

      <PositionBanner productPosition={status?.product_position} />

      <div className="flex flex-col flex-1 justify-between min-h-0 overflow-y-auto">
        {/* Window + EOD + filter mode */}
        <div className="bg-gray-700 rounded p-1.5 mb-1.5">
          <div className="flex justify-between text-[15px]">
            <span className="text-gray-300">Entry window</span>
            <span className={`font-mono ${inEntryWindow ? 'text-green-400' : 'text-gray-500'}`}>
              {String(startH).padStart(2,'0')}:00–{String(endH).padStart(2,'0')}:00 ET
              {internals.blockedHoursEt?.length > 0 && ` (skip ${internals.blockedHoursEt.join(',')})`}
              {' '}({inEntryWindow ? 'OPEN' : 'CLOSED'})
            </span>
          </div>
          <div className="flex justify-between text-[15px]">
            <span className="text-gray-300">ET now</span>
            <span className="text-white font-mono">{etNow.weekday} {String(etNow.hour).padStart(2,'0')}:{String(etNow.minute).padStart(2,'0')}</span>
          </div>
          <div className="flex justify-between text-[15px]">
            <span className="text-gray-300">EOD force-flat</span>
            <span className={`font-mono ${pastEodCutoff ? 'text-orange-400' : eodCutoff ? 'text-gray-400' : 'text-gray-500'}`}>
              {eodCutoff ? `${eodCutoff.label} ET` : 'disabled'}
              {pastEodCutoff ? ' (triggered)' : ''}
            </span>
          </div>
          <div className="flex justify-between text-[15px]">
            <span className="text-gray-300">Filter / cooldown</span>
            <span className="font-mono text-white text-[13px]">
              {internals.forceFilterAny ? 'force-any' : 'solo/confirmed'}
              {' • '}
              {internals.signalCooldownMs > 0
                ? `cd ${Math.round(internals.signalCooldownMs / 60000)}m`
                : 'no cd'}
              {' • '}
              limit {internals.limitTimeoutCandles}m
            </span>
          </div>
          <div className="flex justify-between text-[15px]">
            <span className="text-gray-300">NQ price</span>
            <span className="text-white font-mono">{nqPrice != null ? nqPrice.toFixed(2) : '--'}</span>
          </div>
        </div>

        {/* Blockers */}
        {blockers.length > 0 && (
          <div className="bg-gray-700 rounded p-1.5 mb-1.5">
            <div className="text-gray-400 text-[13px] mb-0.5">Blocked:</div>
            <div className="space-y-0.5 text-[13px]">
              {blockers.map((b, i) => (
                <div key={i} className="text-yellow-400">• {b}</div>
              ))}
            </div>
          </div>
        )}

        {/* Per-rule pair-sign grid — compact: rule meta inline, single-line cells */}
        <div className="bg-gray-700 rounded p-1.5 mb-1.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-gray-400 text-[13px]">
              Active rules ({activeRules.length}) · {nearFlipCount > 0 ? <span className="text-yellow-400">{nearFlipCount} near flip</span> : 'sign vs 1m LT'}
            </span>
            <span className="text-[11px] text-gray-500">↑=above ↓=below · hover for diff/last flip</span>
          </div>
          {activeRules.length === 0 && (
            <div className="text-gray-500 text-[13px]">No active rules.</div>
          )}
          <div className="space-y-0.5">
            {activeRules.map(rule => {
              const grid = pairGrid.find(g => g.ruleId === rule.id);
              const sideColor = rule.side === 'long' ? 'text-green-400' : 'text-red-400';
              const sideBg = rule.side === 'long' ? 'bg-green-900/10' : 'bg-red-900/10';
              return (
                <div
                  key={rule.id}
                  className={`flex items-center gap-1 rounded px-1 py-0.5 ${sideBg}`}
                >
                  <span className={`font-mono font-bold text-[12px] w-[72px] flex-shrink-0 ${sideColor}`}>{rule.id}</span>
                  <span
                    className="font-mono text-[11px] text-gray-400 w-[80px] flex-shrink-0 truncate"
                    title={`${rule.gexType} · TP${rule.targetPts} SL${rule.stopPts} mh${rule.maxHoldBars}`}
                  >
                    {rule.gexType}
                  </span>
                  <div className="grid grid-cols-5 gap-0.5 flex-1">
                    {(grid?.cells || []).map((c, i) => {
                      const ltLabel = `L${c.ltIdx + 1}`;
                      const arrow = c.sign > 0 ? '↑' : c.sign < 0 ? '↓' : '·';
                      const arrowColor = c.sign > 0 ? 'text-green-400' : c.sign < 0 ? 'text-red-400' : 'text-gray-500';
                      const nearFlip = c.diff != null && Math.abs(c.diff) <= NEAR_FLIP_THRESHOLD && c.sign !== 0;
                      const matchesRuleDir =
                        (rule.direction === 'gex_above_lt' && c.sign > 0) ||
                        (rule.direction === 'gex_below_lt' && c.sign < 0);
                      const bg = nearFlip
                        ? 'bg-yellow-900/50 border border-yellow-600/60'
                        : matchesRuleDir
                          ? 'bg-gray-900/40 border border-gray-700/60'
                          : 'bg-gray-900/20 border border-gray-800/40';
                      const diffStr = c.diff != null
                        ? (c.diff >= 0 ? `+${Math.round(c.diff)}` : `${Math.round(c.diff)}`)
                        : '—';
                      return (
                        <div
                          key={i}
                          className={`rounded px-1 leading-tight ${bg}`}
                          title={
                            c.diff != null
                              ? `${ltLabel}: ${rule.gexType}=${c.gexPrice?.toFixed(1)} LT=${c.ltPrice?.toFixed(1)} Δ=${diffStr} · last flip ${formatTimeSince(c.lastFlipTs, nowMs)}`
                              : `${ltLabel}: no data`
                          }
                        >
                          <div className="flex items-center justify-between gap-0.5">
                            <span className="text-[10px] text-gray-500 font-mono">{ltLabel}</span>
                            <span className={`text-[12px] font-mono font-bold ${arrowColor} ${nearFlip ? 'animate-pulse' : ''}`}>{arrow}</span>
                            <span className={`text-[10px] font-mono ${matchesRuleDir ? 'text-white' : 'text-gray-500'}`}>
                              {diffStr}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent eval log (expandable) */}
        {evalLog.length > 0 && (
          <div className="mb-1.5">
            <button
              onClick={() => setShowEvalLog(!showEvalLog)}
              className="text-[13px] text-gray-400 hover:text-white transition-colors flex items-center gap-1"
            >
              <span>{showEvalLog ? '▼' : '▶'}</span>
              <span>3m boundary log ({evalLog.length})</span>
            </button>
            {showEvalLog && (
              <div className="mt-1 bg-gray-700 rounded p-1.5 space-y-0.5 text-[12px] font-mono max-h-40 overflow-y-auto">
                {[...evalLog].reverse().map((e, i) => {
                  const result = e.fired
                    ? `${e.ruleId} ${e.side?.toUpperCase()} FIRED`
                    : e.blockedReason || 'no_flip';
                  return (
                    <div key={i} className={`flex gap-2 ${e.fired ? 'text-green-400 font-bold' : 'text-gray-400'}`}>
                      <span className="text-gray-500 flex-shrink-0 w-12">{e.time}</span>
                      <span className="flex-shrink-0 w-16">{e.price?.toFixed(1)}</span>
                      <span className="flex-shrink-0 w-10 text-cyan-400">{e.flipCount}f</span>
                      <span className="truncate">{result}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Position details */}
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
                  (position.side === 'long' ? nqPrice - position.entryPrice : position.entryPrice - nqPrice) >= 0
                    ? 'text-green-400' : 'text-red-400'
                }`}>
                  {((position.side === 'long' ? nqPrice - position.entryPrice : position.entryPrice - nqPrice)).toFixed(2)} pts
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default GexLt3mCrossoverPanel;
