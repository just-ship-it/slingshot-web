import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';

/**
 * Book Readiness — "book at a glance" panel for the greenfield NQ book
 * (pre-close continuation · Monday strength · gap-up fade).
 *
 * Unlike the one-panel-per-strategy convention, this shows all three together so
 * they can be watched as a book. For each it surfaces the two dimensions of
 * distance-to-signal: the live countdown to the decision moment, and the
 * firing condition vs its threshold (day-move for pre-close, opening gap for
 * gap-fade, unconditional for Monday).
 *
 * Data: GET /api/book/readiness → proxies signal-generator all-status, each
 * strategy carrying its getInternalState() `internals`. Fetches every 3s; a
 * local 1s ticker keeps the countdowns moving between fetches.
 */

const STATE = {
  armed:        { text: 'text-green-400',  lamp: 'bg-green-400',  stripe: 'bg-green-500',  badge: 'bg-green-900/60 text-green-300 border-green-600/50', label: 'ARMED' },
  watching:     { text: 'text-yellow-400', lamp: 'bg-yellow-400', stripe: 'bg-yellow-500', badge: 'bg-yellow-900/50 text-yellow-300 border-yellow-600/50', label: 'WATCHING' },
  fired:        { text: 'text-green-400',  lamp: 'bg-green-400',  stripe: 'bg-green-400',  badge: 'bg-green-800/70 text-green-200 border-green-500/60', label: 'FIRED' },
  'stood-down': { text: 'text-gray-400',   lamp: 'bg-gray-500',   stripe: 'bg-gray-600',   badge: 'bg-gray-700/70 text-gray-300 border-gray-600/50', label: 'STOOD DOWN' },
  dormant:      { text: 'text-gray-500',   lamp: 'bg-gray-600',   stripe: 'bg-gray-700',   badge: 'bg-gray-700/50 text-gray-400 border-gray-700/50', label: 'DORMANT' },
};

const fmtCountdown = (s) => {
  if (s == null) return '—';
  if (s <= 0) return '00:00:00';
  if (s >= 86400) {
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return `${d}d ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
  }
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

const DAY_MS = 86400000;
const parseKey = (k) => { const [y, m, d] = String(k).split('-').map(Number); return new Date(y, m - 1, d); };
const fmtRefDate = (k) => parseKey(k).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const daysOldET = (k) => {
  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  return Math.round((parseKey(todayET) - parseKey(k)) / DAY_MS);
};

const minsAgo = (ms) => {
  if (!ms) return '';
  const d = Math.floor((Date.now() - ms) / 60000);
  if (d < 1) return 'just now';
  if (d < 60) return `${d}m ago`;
  const h = Math.floor(d / 60), m = d % 60;
  if (h < 24) return `${h}h ${m}m ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// Threshold gauge: value/threshold in ATR units, threshold tick fixed at mid.
const Gauge = ({ value, threshold, met }) => {
  const hasVal = value != null && threshold;
  const fillPct = hasVal ? Math.max(0, Math.min(100, (Math.abs(value) / (2 * threshold)) * 100)) : 0;
  const fillColor = met ? 'bg-green-500' : hasVal ? 'bg-gray-500' : 'bg-gray-600';
  return (
    <div className="relative h-1.5 rounded bg-gray-700 mt-1">
      <div className={`absolute left-0 top-0 bottom-0 rounded ${fillColor} transition-all duration-500`} style={{ width: `${fillPct}%` }} />
      <div className="absolute -top-0.5 -bottom-0.5 w-px bg-gray-300/70" style={{ left: '50%' }} />
    </div>
  );
};

const DirChip = ({ dir }) => {
  if (!dir) return null;
  const long = dir === 'LONG';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border ${long ? 'text-green-400 border-green-600/50 bg-green-900/30' : 'text-rose-400 border-rose-600/50 bg-rose-900/30'}`}>
      {long ? '▲' : '▼'} {dir}
    </span>
  );
};

/**
 * PCC breadth/stress conditioner strip (sizingMode != 'off').
 * Shows the two live inputs (TRIN ≤14:30 ET, COR1M Δ5d) and the tier the
 * ladder would assign if the strategy fired in the CURRENT day-move direction
 * — the verification surface for the live fetch (values appear ~14:40 ET).
 */
const ConditionerStrip = ({ cond, direction }) => {
  if (!cond) return null;
  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const fresh = cond.date === todayET && (cond.trin != null || cond.cor != null);
  const trinBull = cond.trin != null ? cond.trin < 1.0 : null;
  const stress = cond.cor != null ? cond.cor > 2.27 : null;
  const trinAligned = trinBull != null && direction ? (trinBull === (direction === 'LONG')) : null;
  const tier = fresh && direction ? (trinAligned ? 1 : 0) + (stress ? 1 : 0) : null;
  const tierCopy = tier == null ? null : tier === 0 ? 'no trade' : `${tier} lot${tier > 1 ? 's' : ''}`;
  const tierColor = tier == null ? 'text-gray-500' : tier === 2 ? 'text-green-300' : tier === 1 ? 'text-gray-200' : 'text-rose-300';
  return (
    <div className="flex items-center gap-2 flex-wrap text-[10px] text-gray-500">
      <span className="uppercase tracking-wide text-gray-500">Conditioner</span>
      <span className="text-[9px] font-mono text-gray-400 bg-gray-700/60 border border-gray-600/50 px-1 rounded">{cond.mode}</span>
      {fresh ? (
        <>
          <span>TRIN <span className={`font-mono ${trinBull ? 'text-green-400' : 'text-rose-400'}`}>{cond.trin != null ? cond.trin.toFixed(2) : '—'}</span>{trinBull != null ? <span className="text-gray-600"> {trinBull ? 'bull' : 'bear'}</span> : null}</span>
          <span>CORΔ5d <span className={`font-mono ${stress ? 'text-amber-300' : 'text-gray-400'}`}>{cond.cor != null ? (cond.cor > 0 ? '+' : '') + cond.cor.toFixed(2) : '—'}</span>{stress != null ? <span className="text-gray-600"> {stress ? 'stress' : 'calm'}</span> : null}</span>
          {tierCopy ? <span>→ <span className={`font-semibold ${tierColor}`}>tier {tier} · {tierCopy}</span> <span className="text-gray-600">if fired {direction}</span></span> : null}
        </>
      ) : (
        <span className="text-gray-600">awaiting 14:40 ET fetch{cond.date && cond.date !== todayET ? ` (last: ${cond.date})` : ''} · fails open to 1 lot</span>
      )}
    </div>
  );
};

/**
 * Prior-session reference strip (gap-up fade).
 *
 * The opening gap is measured ENTIRELY against this one number, so a stale
 * reference does not degrade the signal — it manufactures a phantom gap out of
 * several sessions of drift. On 2026-08-28 a reference frozen 4 sessions back
 * turned a −64pt gap DOWN into a +529pt "gap up" and fired a live short, and
 * nothing on this panel showed it: the card read "need >= 206 pts above 29099"
 * with no hint that 29099 was Monday's close. So: always show the reference's
 * DATE and age next to its price, and whether the strategy re-verified it
 * against data-service this morning.
 *
 * `urgent` = the decision is close enough that "not verified yet" is a problem
 * rather than the normal overnight state (the strategy re-verifies from 08:00 ET).
 */
const RefStrip = ({ cond, urgent }) => {
  if (!cond || (cond.refPrice == null && !cond.refDate)) return null;
  const age = cond.refDate ? daysOldET(cond.refDate) : null;
  const verified = cond.refVerified;          // null when the strategy doesn't report it
  const stale = age != null && (age > 4 || age < 1);   // > a long weekend, or not a prior session
  const bad = stale || (verified === false && urgent);
  return (
    <div className={`flex items-center gap-2 flex-wrap text-[10px] rounded px-2 py-1 border ${bad
      ? 'bg-amber-900/30 border-amber-600/50' : 'bg-gray-800/40 border-gray-700/50'}`}>
      <span className="text-gray-500 uppercase tracking-wide">Prior close</span>
      <span className="font-mono font-semibold text-gray-200">{cond.refPrice ?? '—'}</span>
      {cond.refDate ? (
        <span className={bad ? 'text-amber-300' : 'text-gray-400'}>
          {fmtRefDate(cond.refDate)}
          {age != null ? <span className={bad ? 'text-amber-300/80' : 'text-gray-500'}> · {age}d ago</span> : null}
        </span>
      ) : <span className="text-amber-300">undated</span>}
      {verified === true ? <span className="text-green-500/80">✓ re-verified today</span> : null}
      {verified === false ? (
        urgent
          ? <span className="px-1.5 rounded border font-bold tracking-wide bg-amber-900/60 text-amber-200 border-amber-500/60">UNVERIFIED · WILL STAND DOWN</span>
          : <span className="text-gray-500">verifies from 08:00 ET</span>
      ) : null}
      {cond.refError ? <span className="text-amber-300/90 truncate max-w-[40ch]" title={cond.refError}>{cond.refError}</span> : null}
    </div>
  );
};

const GexDeadbandStrip = ({ gex }) => {
  if (!gex) return null;
  // gex-calculator publishes total_gex ALREADY in billions (gex-calculator.js:340
  // `totalGex: totalGex / 1e9`), while the backtest JSONs carry raw values. Auto-scale
  // so the panel is correct against either.
  const b = (v) => {
    if (v == null || !Number.isFinite(v)) return '—';
    const bn = Math.abs(v) > 1e6 ? v / 1e9 : v;
    return `${bn.toFixed(2)}B`;
  };
  const inDb = gex.inDeadband === true;
  const known = gex.totalGex != null;
  return (
    <div className="flex items-center gap-2 flex-wrap text-[10px] bg-gray-800/40 border border-gray-700/50 rounded px-2 py-1">
      <span className="text-gray-500 uppercase tracking-wide">Gamma</span>
      {known ? (
        <span className={`font-mono font-semibold ${gex.totalGex > 0 ? 'text-sky-300' : 'text-orange-300'}`}>
          {gex.totalGex > 0 ? '+' : ''}{b(gex.totalGex)}
        </span>
      ) : <span className="text-gray-500 font-mono">pending 15:30</span>}
      {known ? (
        <span className="text-gray-400">{gex.regime}</span>
      ) : null}
      <span className="text-gray-600">·</span>
      <span className="text-gray-500">deadband <span className="font-mono text-gray-400">{b(gex.deadband)}</span></span>
      {known ? (
        <span className={`px-1.5 rounded border font-bold tracking-wide ${inDb
          ? 'bg-gray-700/70 text-gray-300 border-gray-600/50'
          : 'bg-green-900/50 text-green-300 border-green-600/50'}`}>
          {inDb ? 'IN DEADBAND · SKIP' : 'CLEAR'}
        </span>
      ) : null}
      <span className="ml-auto flex items-center gap-1.5">
        {gex.poolOpen === false && (gex.sessions ?? 0) < (gex.needed ?? 20) ? (
          <span className="text-gray-500">pool opens {gex.poolOpensAt || '13:00 ET'}</span>
        ) : null}
        <span className={(gex.sessions ?? 0) >= (gex.needed ?? 20) ? 'text-green-500/80' : 'text-yellow-500/90'}>
          {gex.sessions ?? 0}/{gex.needed ?? 20} samples
        </span>
      </span>
    </div>
  );
};

const StrategyRow = ({ s, liveSecs }) => {
  const it = s.internals || {};
  const st = STATE[it.state] || STATE.dormant;
  const cond = it.condition;
  const blockers = s.evaluation_readiness?.blockers || [];

  // Condition line copy
  let condBody;
  if (it.state === 'fired' && it.lastSignal) {
    condBody = (
      <>
        <div className="text-gray-500 text-[10px] uppercase tracking-wide">Signal</div>
        <div className="text-[14px] font-mono font-semibold text-green-300">
          {it.lastSignal.side === 'buy' ? 'LONG' : 'SHORT'} @ {it.lastSignal.price}
        </div>
        <div className="text-[11px] text-gray-400">{it.lastSignal.note}</div>
      </>
    );
  } else if (cond?.kind === 'unconditional') {
    condBody = (
      <>
        <div className="text-gray-500 text-[10px] uppercase tracking-wide">Condition</div>
        <div className="text-[13px] text-gray-300"><span className="font-semibold text-white">Unconditional</span> — fires at the Monday open</div>
      </>
    );
  } else if (cond?.blocked) {
    // Decision ran but refused the reference (see RefStrip) — say so instead of
    // leaving the pre-open "known at 09:30 ET" copy up.
    condBody = (
      <>
        <div className="text-gray-500 text-[10px] uppercase tracking-wide">{cond.label}</div>
        <div className="text-[12px] text-rose-300 leading-tight">Stood down — {cond.blocked}</div>
      </>
    );
  } else if (cond) {
    const known = cond.value != null;
    condBody = (
      <>
        <div className="text-gray-500 text-[10px] uppercase tracking-wide">{cond.label}</div>
        <div className="text-[13px] leading-tight">
          {known ? (
            <>
              <span className="font-mono font-semibold text-white">{cond.valuePts > 0 ? '+' : ''}{cond.valuePts} pts</span>
              <span className="text-gray-400 font-mono text-[12px]"> ({cond.value > 0 ? '+' : ''}{cond.value} {cond.unit || 'ATR'})</span>
              <span className="text-gray-500 text-[11px]"> · need {cond.threshold} {cond.unit || 'ATR'}</span>
            </>
          ) : (
            <span className="text-gray-400 text-[12px]">
              known at {it.decision?.label} · need ≥ {cond.thresholdPts ?? '—'} pts{cond.refPrice ? <> above <span className="font-mono text-gray-300">{cond.refPrice}</span></> : null}{cond.refDate ? <span className="text-gray-500"> ({fmtRefDate(cond.refDate)})</span> : null}
            </span>
          )}
        </div>
        <Gauge value={cond.value} threshold={cond.threshold} met={cond.met} />
      </>
    );
  } else {
    condBody = <div className="text-[12px] text-gray-500">{blockers[0] || 'Waiting'}</div>;
  }

  const secs = liveSecs != null ? liveSecs : it.decision?.secondsTo;
  const multi = secs != null && secs >= 86400;

  return (
    <div className="relative overflow-hidden bg-gray-900/40 border border-gray-700/70 rounded-lg">
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${st.stripe}`} />
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.85fr)_minmax(0,1.3fr)] gap-3 items-center px-3 py-2.5 pl-4">
        {/* identity + state + direction */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-bold text-white truncate">{s.name}</span>
            <span className="text-[10px] font-mono text-gray-400 bg-gray-700/60 border border-gray-600/50 px-1.5 rounded shrink-0">{s.trading_symbol || 'NQ'}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-bold tracking-wider ${st.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${st.lamp} ${it.state === 'armed' ? 'animate-pulse' : ''}`} />
              {st.label}
            </span>
            <DirChip dir={it.direction} />
          </div>
        </div>

        {/* decision countdown */}
        <div className="min-w-0">
          <div className="text-gray-500 text-[10px] uppercase tracking-wide">Decision</div>
          <div className="text-[11px] font-mono text-gray-400">{it.decision?.label || '—'}</div>
          <div className={`font-mono tabular-nums font-semibold ${st.text} ${multi ? 'text-[15px]' : 'text-[19px]'} leading-tight`}>
            {it.state === 'fired' ? '✓ sent' : fmtCountdown(secs)}
          </div>
        </div>

        {/* condition */}
        <div className="min-w-0">{condBody}</div>
      </div>

      {/* PCC breadth/stress conditioner (verification surface for live fetch) */}
      {it.conditioner ? (
        <div className="px-3 pl-4 pb-1">
          <ConditionerStrip cond={it.conditioner} direction={it.direction} />
        </div>
      ) : null}

      {/* Prior-session reference the gap is measured against (gap-up fade) */}
      {cond?.refPrice != null || cond?.refDate ? (
        <div className="px-3 pl-4 pb-1">
          <RefStrip cond={cond} urgent={it.decision?.secondsTo != null && it.decision.secondsTo <= 5400} />
        </div>
      ) : null}

      {/* LETF gamma deadband — the gate that makes the sleeve source-independent */}
      {it.gex ? (
        <div className="px-3 pl-4 pb-1">
          <GexDeadbandStrip gex={it.gex} />
        </div>
      ) : null}

      {/* meta footer */}
      <div className="px-3 pl-4 pb-1.5 -mt-0.5 text-[10px] text-gray-500 flex gap-3 flex-wrap">
        <span className={it.seeded ? 'text-green-500/80' : 'text-yellow-500'}>
          {it.seeded ? '✓ seeded' : (it.warmup?.blocked ? `○ warming up — ${it.warmup.blocked}` : '○ warming up')}
        </span>
        {it.atr14 ? <span>ATR14 <span className="font-mono text-gray-400">{it.atr14}</span></span> : null}
        {it.lastSignal && it.state !== 'fired' ? <span>last {it.lastSignal.side === 'buy' ? 'LONG' : 'SHORT'} @ <span className="font-mono text-gray-400">{it.lastSignal.price}</span> · {minsAgo(it.lastSignal.ts)}</span> : null}
        {!s.enabled ? <span className="text-gray-600">disabled in config</span> : null}
      </div>
    </div>
  );
};

const BookReadinessPanel = ({ socket, quotes }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [, forceTick] = useState(0);
  const liveSecs = useRef({});

  const fetchData = async () => {
    try {
      setError(null);
      const resp = await api.getBookReadiness();
      if (resp && Array.isArray(resp.strategies)) {
        setData(resp);
        resp.strategies.forEach((s) => {
          if (s.internals?.decision) liveSecs.current[s.name] = s.internals.decision.secondsTo;
        });
      } else {
        setData({ strategies: [], error: 'No response' });
      }
    } catch (err) {
      setError('Failed to fetch book readiness');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const f = setInterval(fetchData, 3000);
    const t = setInterval(() => {
      Object.keys(liveSecs.current).forEach((k) => { if (liveSecs.current[k] > 0) liveSecs.current[k] -= 1; });
      forceTick((x) => x + 1);
    }, 1000);
    return () => { clearInterval(f); clearInterval(t); };
  }, []);

  const strategies = data?.strategies || [];
  const armed = strategies.filter((s) => ['armed', 'fired'].includes(s.internals?.state)).length;
  const watching = strategies.filter((s) => s.internals?.state === 'watching').length;
  const idle = strategies.length - armed - watching;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg p-2">
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="text-[15px] font-bold text-white">Book Readiness</h3>
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="inline-flex items-center gap-1 text-gray-400"><span className="w-1.5 h-1.5 rounded-full bg-green-400" /><span className="font-mono text-gray-300">{armed}</span> armed</span>
          <span className="inline-flex items-center gap-1 text-gray-400"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400" /><span className="font-mono text-gray-300">{watching}</span> watching</span>
          <span className="inline-flex items-center gap-1 text-gray-400"><span className="w-1.5 h-1.5 rounded-full bg-gray-500" /><span className="font-mono text-gray-300">{idle}</span> idle</span>
        </div>
      </div>

      {loading && !data ? (
        <div className="text-gray-400 text-[13px]">Loading…</div>
      ) : error && !strategies.length ? (
        <div className="text-red-400 text-[13px]">{error} <button onClick={fetchData} className="ml-1 px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700">Retry</button></div>
      ) : !strategies.length ? (
        <div className="text-yellow-400 text-[13px]">No book strategies reporting {data?.error ? `· ${data.error}` : ''}</div>
      ) : (
        <div className="flex flex-col gap-2 overflow-y-auto min-h-0">
          {strategies.map((s) => (
            <StrategyRow key={s.name} s={s} liveSecs={liveSecs.current[s.name]} />
          ))}
        </div>
      )}
    </div>
  );
};

export default BookReadinessPanel;
