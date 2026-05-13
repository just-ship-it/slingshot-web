import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import PositionBanner from './PositionBanner';

// Rule conditions (display-only metadata). Effective stops/targets come from
// the backend's getInternalState().activeRules, which reflects any per-rule or
// global overrides (e.g. the 2026-05-12 tight-stop refit: 60/200 globals).
const RULES = [
  { id: 'L1', side: 'LONG',  priority: 100, conditionIds: ['putWallNear', 'ivLow', 'skewPos'] },
  { id: 'L4', side: 'LONG',  priority: 90,  conditionIds: ['regimeNeutral', 'aboveFlip', 'ivLow'] },
  { id: 'L3', side: 'LONG',  priority: 80,  conditionIds: ['regimeStrongNeg', 'aboveFlip'] },
  { id: 'S3', side: 'SHORT', priority: 100, conditionIds: ['callWallNear', 'belowFlip'] },
  { id: 'S1', side: 'SHORT', priority: 90,  conditionIds: ['callWallNear', 'ivHigh', 'skewPos'] },
  { id: 'S2', side: 'SHORT', priority: 80,  conditionIds: ['callWallNear', 'ivHigh'] },
];

function getEtNow() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const o = {};
  for (const p of parts) o[p.type] = p.value;
  return { weekday: o.weekday, hour: parseInt(o.hour, 10), minute: parseInt(o.minute, 10) };
}

// Seconds until the next 5-minute clock boundary (00, 05, 10, ...).
// Boundaries are absolute clock minutes regardless of timezone, so we use
// the local clock — matches when the data service emits 5m candle closes.
function secondsTo5mBoundary() {
  const now = new Date();
  const sec = now.getSeconds();
  const min = now.getMinutes();
  const intoPeriod = (min % 5) * 60 + sec;
  return 300 - intoPeriod;
}

// Parse "HH:MM" -> { hour, minute, label }. Empty/invalid returns null.
function parseEtCutoff(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute, label: `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}` };
}

const GexFlipIvpctPanel = ({ socket, quotes }) => {
  const [status, setStatus] = useState(null);
  const [ivData, setIvData] = useState(null);
  const [gexLevels, setGexLevels] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [etNow, setEtNow] = useState(getEtNow());
  const [cooldownData, setCooldownData] = useState(null);
  const [showEvalLog, setShowEvalLog] = useState(false);
  const [evalCountdown, setEvalCountdown] = useState(secondsTo5mBoundary());

  useEffect(() => {
    const t = setInterval(() => setEtNow(getEtNow()), 30_000);
    return () => clearInterval(t);
  }, []);

  // 5m candle countdown — strategy only evaluates on 5m bar close, so this
  // tells the user when the next evaluation will actually happen.
  useEffect(() => {
    setEvalCountdown(secondsTo5mBoundary());
    const t = setInterval(() => setEvalCountdown(secondsTo5mBoundary()), 1000);
    return () => clearInterval(t);
  }, []);

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

  const fetchAll = async () => {
    try {
      setError(null);
      const [s, iv, gex] = await Promise.all([
        api.getGexFlipIvpctStatus(),
        api.getIVSkew().catch(() => null),
        api.getTradierGexLevels().catch(() => null),
      ]);
      setStatus(s || { success: false, message: 'signal-generator may not be running' });
      setIvData(iv);
      setGexLevels(gex);
      if (s?.cooldown) setCooldownData(s.cooldown);
    } catch (err) {
      setError('Failed to fetch GEX-FLIP-IVPCT status');
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
        <h3 className="text-[15px] font-bold text-white mb-2">GEX-FLIP-IVPCT</h3>
        <div className="text-gray-400 text-[15px]">Loading...</div>
      </div>
    );
  }
  if (status?.success === false) {
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg p-2">
        <h3 className="text-[15px] font-bold text-white mb-2">GEX-FLIP-IVPCT</h3>
        <div className="text-yellow-400 text-[15px] mb-1">Service not running</div>
        <div className="text-gray-500 text-[15px]">{status.message}</div>
      </div>
    );
  }

  const internals = status?.internals || {};
  const position = status?.position;
  const readiness = status?.evaluation_readiness;

  const startH = internals.entryWindowStartHour ?? 4;
  const endH = internals.entryWindowEndHour ?? 13;
  const blockedHours = Array.isArray(internals.blockedHoursEt) ? internals.blockedHoursEt : [];
  const inEntryWindow =
    etNow.weekday !== 'Sat' && etNow.weekday !== 'Sun'
    && etNow.hour >= startH && etNow.hour < endH
    && !blockedHours.includes(etNow.hour);

  // EOD cutoff comes from EOD_CUTOFF_ET (mirrored from trade-orchestrator).
  // Empty string means orchestrator-side EOD flat is disabled.
  const eodCutoff = parseEtCutoff(internals.eodCutoffEt ?? '16:40');
  const pastEodCutoff = eodCutoff
    && etNow.weekday !== 'Sat' && etNow.weekday !== 'Sun'
    && (etNow.hour > eodCutoff.hour || (etNow.hour === eodCutoff.hour && etNow.minute >= eodCutoff.minute));

  const nqPrice = quotes?.NQ?.last || quotes?.MNQ?.last || quotes?.NQ?.close;
  const skew = ivData?.skew ?? null;
  const ivVal = ivData?.iv ?? null;
  const ivPctile = internals.ivPercentile ?? null;
  const regime = gexLevels?.regime ?? null;
  const callWall = gexLevels?.call_wall ?? gexLevels?.callWall ?? null;
  const putWall = gexLevels?.put_wall ?? gexLevels?.putWall ?? null;
  const gammaFlip = gexLevels?.gamma_flip ?? gexLevels?.gammaFlip ?? null;

  // Strategy thresholds (from internals with defaults matching strategy code)
  const wallProx = internals.wallProximity ?? 50;
  const ivLowMax = internals.ivPctileLowMax ?? 0.20;
  const ivHighMin = internals.ivPctileHighMin ?? 0.80;
  const skewMin = internals.skewPositiveMin ?? 0.015;
  const neutralRegimeId = internals.neutralRegime ?? 'neutral';
  const strongNegRegimeId = internals.strongNegativeRegime ?? 'strong_negative';

  // Distances (signed where useful)
  const distFromPutWall = (nqPrice != null && putWall != null) ? (nqPrice - putWall) : null;
  const distFromCallWall = (nqPrice != null && callWall != null) ? (nqPrice - callWall) : null;
  const distFromFlip = (nqPrice != null && gammaFlip != null) ? (nqPrice - gammaFlip) : null;

  // Per-condition status. label = chip text, met = bool (or null = unknown).
  const conditions = {
    putWallNear: {
      label: distFromPutWall != null
        ? `putWall Δ${Math.abs(distFromPutWall).toFixed(0)}≤${wallProx}`
        : `putWall ≤${wallProx}`,
      met: distFromPutWall != null && Math.abs(distFromPutWall) <= wallProx,
    },
    callWallNear: {
      label: distFromCallWall != null
        ? `callWall Δ${Math.abs(distFromCallWall).toFixed(0)}≤${wallProx}`
        : `callWall ≤${wallProx}`,
      met: distFromCallWall != null && Math.abs(distFromCallWall) <= wallProx,
    },
    aboveFlip: {
      label: distFromFlip != null
        ? `above flip (${distFromFlip >= 0 ? '+' : ''}${distFromFlip.toFixed(0)})`
        : 'above flip',
      met: distFromFlip != null && distFromFlip > 0,
    },
    belowFlip: {
      label: distFromFlip != null
        ? `below flip (${distFromFlip >= 0 ? '+' : ''}${distFromFlip.toFixed(0)})`
        : 'below flip',
      met: distFromFlip != null && distFromFlip < 0,
    },
    ivLow: {
      label: ivPctile != null
        ? `IV %ile ${(ivPctile*100).toFixed(0)}≤${(ivLowMax*100).toFixed(0)}`
        : `IV %ile ≤${(ivLowMax*100).toFixed(0)}`,
      met: ivPctile != null && ivPctile <= ivLowMax,
    },
    ivHigh: {
      label: ivPctile != null
        ? `IV %ile ${(ivPctile*100).toFixed(0)}≥${(ivHighMin*100).toFixed(0)}`
        : `IV %ile ≥${(ivHighMin*100).toFixed(0)}`,
      met: ivPctile != null && ivPctile >= ivHighMin,
    },
    skewPos: {
      label: skew != null
        ? `skew ${(skew*100).toFixed(2)}%>+${(skewMin*100).toFixed(1)}%`
        : `skew>+${(skewMin*100).toFixed(1)}%`,
      met: skew != null && skew > skewMin,
    },
    regimeNeutral: {
      label: regime && regime !== neutralRegimeId
        ? `regime=${neutralRegimeId} (got: ${regime})`
        : `regime=${neutralRegimeId}`,
      met: regime === neutralRegimeId,
    },
    regimeStrongNeg: {
      label: regime && regime !== strongNegRegimeId
        ? `regime=${strongNegRegimeId} (got: ${regime})`
        : `regime=${strongNegRegimeId}`,
      met: regime === strongNegRegimeId,
    },
  };

  const ruleStatus = (rule) => {
    const items = rule.conditionIds.map(id => conditions[id]);
    const metCount = items.filter(c => c.met).length;
    return { items, metCount, total: items.length, fires: metCount === items.length };
  };

  // Highest-priority firing rule (matches strategy's findFiringRule logic)
  const firingRule = [...RULES]
    .sort((a, b) => b.priority - a.priority)
    .find(r => ruleStatus(r).fires);

  // Closest-to-firing rule when none fire (most conditions met, ties broken by priority)
  const closestRule = !firingRule
    ? [...RULES]
        .map(r => ({ rule: r, ...ruleStatus(r) }))
        .sort((a, b) => (b.metCount - a.metCount) || (b.rule.priority - a.rule.priority))[0]
    : null;

  const inCooldown = cooldownData?.in_cooldown && cooldownData?.seconds_remaining > 0;

  // Blockers — things preventing any signal regardless of rule status
  const blockers = [];
  if (!inEntryWindow) blockers.push(`Outside entry window (${String(startH).padStart(2,'0')}:00–${String(endH).padStart(2,'0')}:00 ET)`);
  if (pastEodCutoff) blockers.push(`Past EOD force-flat (${eodCutoff.label} ET)`);
  if (inCooldown) blockers.push(`Cooldown ${Math.floor(cooldownData.seconds_remaining/60)}:${String(cooldownData.seconds_remaining%60).padStart(2,'0')}`);
  if (!ivData) blockers.push('No IV data');
  if (!gexLevels) blockers.push('No GEX levels');
  if (ivPctile == null && ivData) blockers.push(`IV %ile warming up (${internals.liveIVSamples ?? 0} samples)`);

  const getBadge = () => {
    if (position?.side) return { color: position.side === 'long' ? 'bg-green-600' : 'bg-red-600', text: position.side.toUpperCase() };
    if (pastEodCutoff) return { color: 'bg-orange-700', text: 'EOD-FLAT' };
    if (!inEntryWindow) return { color: 'bg-gray-600', text: 'OUT-OF-WINDOW' };
    if (inCooldown) return { color: 'bg-yellow-700', text: 'COOLDOWN' };
    if (firingRule) return { color: firingRule.side === 'LONG' ? 'bg-green-700' : 'bg-red-700', text: `${firingRule.id} ARMED` };
    if (closestRule) return { color: 'bg-blue-700', text: `${closestRule.rule.id} ${closestRule.metCount}/${closestRule.total}` };
    return { color: 'bg-blue-700', text: 'WATCHING' };
  };
  const badge = getBadge();

  const evalLog = internals.evaluationLog || [];

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg p-2">
      <div className="flex justify-between items-center mb-1.5 flex-shrink-0 gap-2">
        <h3 className="text-[15px] font-bold text-white">GEX-FLIP-IVPCT</h3>
        <div className="flex items-center gap-2">
          <span
            className={`text-[13px] font-mono ${evalCountdown <= 10 ? 'text-yellow-400 animate-pulse' : 'text-cyan-400'}`}
            title="Seconds until next 5m evaluation"
          >
            next eval {Math.floor(evalCountdown / 60)}:{String(evalCountdown % 60).padStart(2,'0')}
          </span>
          <div className={`px-1.5 py-0.5 rounded text-[15px] font-medium text-white ${badge.color}`}>{badge.text}</div>
        </div>
      </div>

      <PositionBanner productPosition={status?.product_position} />

      <div className="flex flex-col flex-1 justify-between min-h-0 overflow-y-auto">
        {/* Window + EOD status */}
        <div className="bg-gray-700 rounded p-1.5 mb-1.5">
          <div className="flex justify-between text-[15px]">
            <span className="text-gray-300">Entry window</span>
            <span className={`font-mono ${inEntryWindow ? 'text-green-400' : 'text-gray-500'}`}>
              {String(startH).padStart(2,'0')}:00–{String(endH).padStart(2,'0')}:00 ET ({inEntryWindow ? 'OPEN' : 'CLOSED'})
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
            <span className="text-gray-300">IV history</span>
            <span className="font-mono">
              <span className={`${(internals.liveIVSamples ?? 0) >= 200 ? 'text-green-400' : (internals.liveIVSamples ?? 0) > 0 ? 'text-yellow-400' : 'text-gray-500'}`}>
                {internals.liveIVSamples ?? 0} samples
              </span>
              <span
                className={`ml-2 px-1 rounded text-[12px] ${internals.redisAttached ? 'bg-green-900/40 text-green-300' : 'bg-yellow-900/40 text-yellow-300'}`}
                title={internals.redisAttached
                  ? `Persisted to Redis key: ${internals.redisKey || '(default)'}`
                  : 'Redis NOT attached — buffer will reset on restart'}
              >
                {internals.redisAttached ? 'redis' : 'in-mem'}
              </span>
              {internals.ivHistoryOldest && internals.ivHistoryNewest && (
                <span className="text-gray-500 text-[12px] ml-2">
                  span {Math.round((internals.ivHistoryNewest - internals.ivHistoryOldest) / (60 * 60 * 1000))}h
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Feature snapshot */}
        <div className="bg-gray-700 rounded p-1.5 mb-1.5">
          <div className="grid grid-cols-2 gap-x-2 text-[15px]">
            <div className="flex justify-between">
              <span className="text-gray-300">IV</span>
              <span className="text-white font-mono">{ivVal != null ? `${(ivVal*100).toFixed(1)}%` : '--'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-300">Skew</span>
              <span className={`font-mono ${conditions.skewPos.met ? 'text-yellow-300' : 'text-white'}`}>{skew != null ? `${(skew*100).toFixed(2)}%` : '--'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-300">IV %ile</span>
              <span className={`font-mono ${conditions.ivLow.met ? 'text-green-400' : conditions.ivHigh.met ? 'text-red-400' : 'text-white'}`}>{ivPctile != null ? `${(ivPctile*100).toFixed(0)}%` : '--'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-300">Regime</span>
              <span className="text-white font-mono text-[13px]">{regime || '--'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-300">PutWall</span>
              <span className={`font-mono ${conditions.putWallNear.met ? 'text-green-400' : 'text-white'}`}>
                {putWall != null ? putWall.toFixed(0) : '--'}
                {distFromPutWall != null && <span className="text-gray-400 text-[13px] ml-1">(Δ{Math.abs(distFromPutWall).toFixed(0)})</span>}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-300">CallWall</span>
              <span className={`font-mono ${conditions.callWallNear.met ? 'text-red-400' : 'text-white'}`}>
                {callWall != null ? callWall.toFixed(0) : '--'}
                {distFromCallWall != null && <span className="text-gray-400 text-[13px] ml-1">(Δ{Math.abs(distFromCallWall).toFixed(0)})</span>}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-300">GammaFlip</span>
              <span className="text-white font-mono">
                {gammaFlip != null ? gammaFlip.toFixed(0) : '--'}
                {distFromFlip != null && <span className={`text-[13px] ml-1 ${distFromFlip > 0 ? 'text-green-400' : 'text-red-400'}`}>({distFromFlip >= 0 ? '+' : ''}{distFromFlip.toFixed(0)})</span>}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-300">NQ</span>
              <span className="text-white font-mono">{nqPrice != null ? nqPrice.toFixed(2) : '--'}</span>
            </div>
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

        {/* Risk management (tight-stop refit 2026-05-12) */}
        <div className="bg-gray-700 rounded p-1.5 mb-1.5">
          <div className="text-gray-400 text-[13px] mb-1">Risk management</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[13px] font-mono">
            <div className="text-gray-400">Stop / Target</div>
            <div className="text-gray-200">
              {internals.globalStopPts != null && internals.globalTargetPts != null
                ? <>SL <span className="text-red-300">{internals.globalStopPts}pt</span> / TP <span className="text-green-300">{internals.globalTargetPts}pt</span></>
                : <span className="text-gray-500">per-rule (no global override)</span>}
            </div>
            <div className="text-gray-400">Breakeven</div>
            <div className="text-gray-200">
              {internals.breakevenStop
                ? <>arms @ +<span className="text-blue-300">{internals.breakevenTrigger}pt</span> MFE → stop = entry+<span className="text-blue-300">{internals.breakevenOffset}pt</span></>
                : <span className="text-gray-500">off</span>}
            </div>
            <div className="text-gray-400">Trailing</div>
            <div className="text-gray-200">
              {internals.trailingTrigger != null && internals.trailingOffset != null
                ? <>arms @ +{internals.trailingTrigger}pt → trail {internals.trailingOffset}pt</>
                : <span className="text-gray-500">off</span>}
            </div>
            <div className="text-gray-400">Blocked hours (ET)</div>
            <div className="text-gray-200">
              {Array.isArray(internals.blockedHoursEt) && internals.blockedHoursEt.length > 0
                ? internals.blockedHoursEt.map(h => String(h).padStart(2, '0')).join(', ')
                : <span className="text-gray-500">none</span>}
            </div>
          </div>
        </div>

        {/* Per-rule condition breakdown */}
        <div className="bg-gray-700 rounded p-1.5 mb-1.5">
          <div className="text-gray-400 text-[13px] mb-1">Rule conditions</div>
          <div className="space-y-1">
            {RULES.map(r => {
              const { items, metCount, total, fires } = ruleStatus(r);
              const rowBg = fires
                ? (r.side === 'LONG' ? 'bg-green-900/40 border border-green-600/50' : 'bg-red-900/40 border border-red-600/50')
                : 'bg-gray-800/40 border border-gray-700';
              const sideColor = r.side === 'LONG' ? 'text-green-400' : 'text-red-400';
              const apiRule = (internals.activeRules || []).find(a => a.id === r.id);
              const effStop = apiRule?.stopPts ?? internals.globalStopPts ?? null;
              const effTgt  = apiRule?.targetPts ?? internals.globalTargetPts ?? null;
              const isDisabled = (internals.disabledRules || []).includes(r.id);
              return (
                <div key={r.id} className={`rounded px-1.5 py-1 ${rowBg} ${isDisabled ? 'opacity-50' : ''}`}>
                  <div className="flex items-center gap-2 text-[14px] mb-0.5">
                    <span className={`font-mono font-bold w-7 ${fires ? 'text-white' : 'text-gray-200'}`}>{r.id}</span>
                    <span className={`font-mono text-[12px] w-12 ${sideColor}`}>{r.side}</span>
                    <span className={`font-mono text-[12px] flex-shrink-0 ${fires ? 'text-white font-bold' : 'text-gray-400'}`}>
                      {metCount}/{total}
                    </span>
                    <span className="flex-1" />
                    {isDisabled
                      ? <span className="text-gray-500 font-mono text-[12px] italic">disabled</span>
                      : <span className="text-gray-400 font-mono text-[12px]">SL {effStop ?? '?'} / TP {effTgt ?? '?'}</span>}
                    {fires && !isDisabled && <span className={`font-bold animate-pulse ${sideColor}`}>READY</span>}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {items.map((c, i) => (
                      <span
                        key={i}
                        className={`px-1.5 py-0.5 rounded text-[12px] font-mono ${
                          c.met
                            ? 'bg-green-900/50 text-green-300 border border-green-700/50'
                            : 'bg-gray-800 text-gray-400 border border-gray-700'
                        }`}
                      >
                        {c.met ? '✓' : '○'} {c.label}
                      </span>
                    ))}
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
              <span>Eval log ({evalLog.length})</span>
            </button>
            {showEvalLog && (
              <div className="mt-1 bg-gray-700 rounded p-1.5 space-y-0.5 text-[12px] font-mono max-h-40 overflow-y-auto">
                {[...evalLog].reverse().map((e, i) => (
                  <div key={i} className={`flex gap-2 ${e.fired ? 'text-green-400 font-bold' : 'text-gray-400'}`}>
                    <span className="text-gray-500 flex-shrink-0">{e.time}</span>
                    <span className="flex-shrink-0">{e.price?.toFixed(1)}</span>
                    <span className="truncate">{e.result}</span>
                  </div>
                ))}
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

export default GexFlipIvpctPanel;
