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

function parseEtCutoff(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return {
    hour: parseInt(m[1], 10),
    minute: parseInt(m[2], 10),
    label: `${String(parseInt(m[1], 10)).padStart(2,'0')}:${String(parseInt(m[2], 10)).padStart(2,'0')}`,
  };
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

// Color thresholds for distance-from-level (points)
const NEAR_TOUCH_PTS = 5;
const WATCHING_PTS = 20;

const GexLevelFadePanel = ({ socket, quotes }) => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [etNow, setEtNow] = useState(getEtNow());
  const [cooldownData, setCooldownData] = useState(null);
  const [showTouchLog, setShowTouchLog] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setEtNow(getEtNow()), 30_000);
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
      const s = await api.getGexLevelFadeStatus();
      setStatus(s || { success: false, message: 'signal-generator may not be running' });
      if (s?.cooldown) setCooldownData(s.cooldown);
    } catch (err) {
      setError('Failed to fetch GEX-LEVEL-FADE status');
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
        <h3 className="text-[15px] font-bold text-white mb-2">GEX-LEVEL-FADE</h3>
        <div className="text-gray-400 text-[15px]">Loading...</div>
      </div>
    );
  }
  if (status?.success === false) {
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg p-2">
        <h3 className="text-[15px] font-bold text-white mb-2">GEX-LEVEL-FADE</h3>
        <div className="text-yellow-400 text-[15px] mb-1">Service not running</div>
        <div className="text-gray-500 text-[15px]">{status.message}</div>
      </div>
    );
  }

  const internals = status?.internals || {};
  const params = internals.params || {};
  const position = status?.position;

  const startH = params.entryWindowStartHour ?? 9;
  const startM = params.entryWindowStartMinute ?? 0;
  const endH = params.entryWindowEndHour ?? 10;
  const endM = params.entryWindowEndMinute ?? 30;
  const blockedHours = new Set(params.blockedHoursEt || []);
  const nowMins = etNow.hour * 60 + etNow.minute;
  const winStart = startH * 60 + startM;
  const winEnd = endH * 60 + endM;
  const inEntryWindow = etNow.weekday !== 'Sat' && etNow.weekday !== 'Sun'
    && (params.disableEntryWindow || (nowMins >= winStart && nowMins < winEnd))
    && !blockedHours.has(etNow.hour);

  const eodCutoff = parseEtCutoff(params.eodCutoffEt ?? '16:40');
  const pastEodCutoff = eodCutoff
    && etNow.weekday !== 'Sat' && etNow.weekday !== 'Sun'
    && (etNow.hour > eodCutoff.hour || (etNow.hour === eodCutoff.hour && etNow.minute >= eodCutoff.minute));

  const nqPrice = internals.lastPrice ?? quotes?.NQ?.last ?? quotes?.MNQ?.last ?? quotes?.NQ?.close;
  const inCooldown = cooldownData?.in_cooldown && cooldownData?.seconds_remaining > 0;
  const regime = internals.lastRegime || 'unknown';
  const regimeAllowed = internals.regimeAllowed !== false;

  const activeLevels = internals.activeLevels || [];
  const readyLevels = activeLevels.filter(l => l.readyToFire);
  const nearLevels = activeLevels.filter(l => l.distancePts != null && l.distancePts <= NEAR_TOUCH_PTS);

  const blockers = [];
  if (!inEntryWindow) {
    if (blockedHours.has(etNow.hour)) blockers.push(`Blocked hour ${etNow.hour}:00 ET`);
    else blockers.push(`Outside entry window (${String(startH).padStart(2,'0')}:${String(startM).padStart(2,'0')}–${String(endH).padStart(2,'0')}:${String(endM).padStart(2,'0')} ET)`);
  }
  if (pastEodCutoff) blockers.push(`Past EOD force-flat (${eodCutoff.label} ET)`);
  if (inCooldown) blockers.push(`Cooldown ${Math.floor(cooldownData.seconds_remaining/60)}:${String(cooldownData.seconds_remaining%60).padStart(2,'0')}`);
  if (!regimeAllowed) blockers.push(`Regime blocked: ${regime}`);
  if (activeLevels.length === 0) blockers.push('No active levels (waiting for GEX/session data)');

  const getBadge = () => {
    if (position?.side) return { color: position.side === 'long' ? 'bg-green-600' : 'bg-red-600', text: position.side.toUpperCase() };
    // EOD-FLAT only fires during the wind-down (cutoff → CME daily close 17:00 ET).
    // After 17:00 ET the market is closed and the next session is overnight, so
    // OUT-OF-WINDOW is the correct label for strategies that don't trade outside RTH.
    if (pastEodCutoff && etNow.hour < 17) return { color: 'bg-orange-700', text: 'EOD-FLAT' };
    if (blockedHours.has(etNow.hour) && nowMins >= winStart && nowMins < winEnd) return { color: 'bg-gray-600', text: 'BLOCKED-HOUR' };
    if (!inEntryWindow) return { color: 'bg-gray-600', text: 'OUT-OF-WINDOW' };
    if (!regimeAllowed) return { color: 'bg-gray-600', text: 'REGIME-BLOCKED' };
    if (inCooldown) return { color: 'bg-yellow-700', text: 'COOLDOWN' };
    if (nearLevels.some(l => l.readyToFire)) return { color: 'bg-yellow-500', text: `${nearLevels.filter(l => l.readyToFire).length} ARMED` };
    if (nearLevels.length > 0) return { color: 'bg-yellow-700', text: `${nearLevels.length} NEAR` };
    if (readyLevels.length > 0) return { color: 'bg-blue-700', text: `${readyLevels.length} READY` };
    return { color: 'bg-gray-700', text: 'WATCHING' };
  };
  const badge = getBadge();

  const touchLog = internals.touchLog || [];

  // Color helper for distance
  const distColor = (d) => {
    if (d == null) return 'text-gray-500';
    if (d <= NEAR_TOUCH_PTS) return 'text-yellow-400';
    if (d <= WATCHING_PTS) return 'text-cyan-400';
    return 'text-gray-400';
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg p-2">
      <div className="flex justify-between items-center mb-1.5 flex-shrink-0 gap-2">
        <h3 className="text-[15px] font-bold text-white">GEX-LEVEL-FADE</h3>
        <div className={`px-1.5 py-0.5 rounded text-[15px] font-medium text-white ${badge.color}`}>{badge.text}</div>
      </div>

      <PositionBanner productPosition={status?.product_position} />

      <div className="flex flex-col flex-1 justify-between min-h-0 overflow-y-auto">
        {/* Window + EOD + regime + price */}
        <div className="bg-gray-700 rounded p-1.5 mb-1.5">
          <div className="flex justify-between text-[15px]">
            <span className="text-gray-300">Entry window</span>
            <span className={`font-mono ${inEntryWindow ? 'text-green-400' : 'text-gray-500'}`}>
              {String(startH).padStart(2,'0')}:{String(startM).padStart(2,'0')}–{String(endH).padStart(2,'0')}:{String(endM).padStart(2,'0')} ET
              {params.blockedHoursEt?.length > 0 && ` (skip ${params.blockedHoursEt.join(',')})`}
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
            <span className="text-gray-300">Regime</span>
            <span className={`font-mono ${regimeAllowed ? 'text-green-400' : 'text-red-400'}`}>
              {regime} {regimeAllowed ? '(allowed)' : '(BLOCKED)'}
            </span>
          </div>
          <div className="flex justify-between text-[15px]">
            <span className="text-gray-300">Target/Stop</span>
            <span className="font-mono text-white text-[13px]">
              tp {params.targetPts ?? '—'}pt / sl {params.stopPts ?? '—'}pt
              {' • '}mh {params.maxHoldBars ?? '—'}m
              {' • '}minEp {params.minEpisodeNum ?? '—'}
            </span>
          </div>
          <div className="flex justify-between text-[15px]">
            <span className="text-gray-300">NQ price</span>
            <span className="text-white font-mono">{nqPrice != null ? Number(nqPrice).toFixed(2) : '--'}</span>
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

        {/* Active levels: ready-to-fire first, then by distance */}
        <div className="bg-gray-700 rounded p-1.5 mb-1.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-gray-400 text-[13px]">
              Active levels ({activeLevels.length}){' • '}
              {readyLevels.length > 0
                ? <span className="text-yellow-400">{readyLevels.length} armed</span>
                : <span className="text-gray-500">none armed</span>}
              {nearLevels.length > 0 && (
                <span className="text-yellow-400"> • {nearLevels.length} near touch</span>
              )}
            </span>
            <span className="text-[11px] text-gray-500">ep#=episodes today · ✓ armed</span>
          </div>
          {activeLevels.length === 0 && (
            <div className="text-gray-500 text-[13px]">No active levels.</div>
          )}
          <div className="space-y-0.5">
            {activeLevels.slice(0, 14).map((lvl, i) => {
              const sideColor = lvl.side === 'long' ? 'text-green-400' : 'text-red-400';
              const sideBg = lvl.side === 'long' ? 'bg-green-900/10' : 'bg-red-900/10';
              const armedBg = lvl.readyToFire
                ? (lvl.distancePts != null && lvl.distancePts <= NEAR_TOUCH_PTS
                    ? 'bg-yellow-900/40 border border-yellow-600/60'
                    : 'bg-blue-900/20 border border-blue-700/40')
                : sideBg;
              const lastEpStr = lvl.lastEpMaxPen != null
                ? `pen${lvl.lastEpMaxPen.toFixed(0)}/${lvl.lastEpBars}b`
                : '—';
              return (
                <div
                  key={`${lvl.type}-${i}`}
                  className={`flex items-center gap-1 rounded px-1 py-0.5 ${armedBg}`}
                  title={`${lvl.type} @${lvl.price?.toFixed(2)} → ${lvl.side?.toUpperCase()} on touch · ` +
                    `episodes=${lvl.episodes} ${lvl.inEpisode ? '(IN)' : ''} · ` +
                    `lastEp: pen=${lvl.lastEpMaxPen?.toFixed(1) ?? '—'} bars=${lvl.lastEpBars ?? '—'} rej5m=${lvl.lastEpRej5m ?? '—'} rej15m=${lvl.lastEpRej15m ?? '—'} bursts=${lvl.lastEpVolBursts ?? '—'}`}
                >
                  <span className="font-mono text-[11px] text-gray-300 w-[68px] flex-shrink-0 truncate">{lvl.type}</span>
                  <span className={`font-mono font-bold text-[12px] w-[68px] flex-shrink-0 text-right ${sideColor}`}>
                    {lvl.price?.toFixed(2)}
                  </span>
                  <span className={`font-mono text-[12px] w-[46px] flex-shrink-0 text-right ${distColor(lvl.distancePts)}`}>
                    {lvl.distancePts != null ? `${lvl.distancePts.toFixed(1)}pt` : '—'}
                  </span>
                  <span className={`font-mono text-[11px] w-[26px] flex-shrink-0 text-center ${
                    lvl.inEpisode ? 'text-cyan-400' : (lvl.episodes >= (params.minEpisodeNum ?? 2) - 1 ? 'text-white' : 'text-gray-500')
                  }`}>
                    ep{lvl.episodes}{lvl.inEpisode ? '!' : ''}
                  </span>
                  <span className="font-mono text-[10px] text-gray-500 flex-1 truncate">
                    {lastEpStr}
                  </span>
                  <span className={`font-mono text-[11px] font-bold flex-shrink-0 ${lvl.readyToFire ? 'text-yellow-300' : 'text-gray-600'}`}>
                    {lvl.readyToFire ? '✓' : '·'}
                  </span>
                </div>
              );
            })}
            {activeLevels.length > 14 && (
              <div className="text-gray-500 text-[11px] text-center pt-0.5">… +{activeLevels.length - 14} more</div>
            )}
          </div>
        </div>

        {/* Recent touch / signal log */}
        {touchLog.length > 0 && (
          <div className="mb-1.5">
            <button
              onClick={() => setShowTouchLog(!showTouchLog)}
              className="text-[13px] text-gray-400 hover:text-white transition-colors flex items-center gap-1"
            >
              <span>{showTouchLog ? '▼' : '▶'}</span>
              <span>Recent touches ({touchLog.length})</span>
            </button>
            {showTouchLog && (
              <div className="mt-1 bg-gray-700 rounded p-1.5 space-y-0.5 text-[12px] font-mono max-h-40 overflow-y-auto">
                {[...touchLog].reverse().map((e, i) => {
                  const summary = e.fired
                    ? `${e.signalLevel} ${e.signalSide?.toUpperCase()} FIRED (ep${e.signalEpisode})`
                    : (e.blockedReason || (e.touched.map(t => t.type).join(',')));
                  const cls = e.fired
                    ? 'text-green-400 font-bold'
                    : (e.touched.length > 0 ? 'text-gray-400' : 'text-gray-500');
                  return (
                    <div key={i} className={`flex gap-2 ${cls}`}>
                      <span className="text-gray-500 flex-shrink-0 w-12">{e.et}</span>
                      <span className="flex-shrink-0 w-16">{e.price?.toFixed(1)}</span>
                      <span className="truncate">{summary}</span>
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

export default GexLevelFadePanel;
