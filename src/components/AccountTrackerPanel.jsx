import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createChart, LineSeries, AreaSeries } from 'lightweight-charts';
import { RefreshCw, AlertTriangle, CheckCircle, Activity, Loader2 } from 'lucide-react';
import { api } from '../services/api';

const LS_KEY_START_DATE    = 'accountTracker.startDate';
const LS_KEY_START_BALANCE = 'accountTracker.startBalance';
const LS_KEY_ACCOUNT_ID    = 'accountTracker.accountId';
const DEFAULT_START_BALANCE = 2000;  // matches precompute's default — no rebootstrap needed at this value

const fmtUsd = (n) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
};

const fmtUsdExact = (n) =>
  n == null || !Number.isFinite(n) ? '—' :
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function PercentileBadge({ pct }) {
  if (pct == null) return null;
  let bg = 'bg-gray-600/40 text-gray-300 border-gray-600';
  let label = `${pct}th percentile`;
  if (pct < 17) { bg = 'bg-red-700/40 text-red-300 border-red-700'; label += ' (below p25)'; }
  else if (pct < 37) { bg = 'bg-amber-700/40 text-amber-300 border-amber-700'; label += ' (below median)'; }
  else if (pct < 62) { bg = 'bg-emerald-700/40 text-emerald-300 border-emerald-700'; label += ' (near median)'; }
  else { bg = 'bg-blue-700/40 text-blue-300 border-blue-700'; label += ' (above median)'; }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs border ${bg}`}>
      <Activity className="w-3 h-3" /> {label}
    </span>
  );
}

export default function AccountTrackerPanel() {
  const [startDate, setStartDate] = useState(() => localStorage.getItem(LS_KEY_START_DATE) || new Date().toISOString().slice(0, 10));
  const [startBalance, setStartBalance] = useState(() => parseFloat(localStorage.getItem(LS_KEY_START_BALANCE) || '2000'));
  const [accountId, setAccountId] = useState(() => localStorage.getItem(LS_KEY_ACCOUNT_ID) || '');
  const [accounts, setAccounts] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const chartRef = useRef(null);
  const containerRef = useRef(null);
  const seriesRefs = useRef({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await api.getAccountTracker(startDate, startBalance, accountId || null);
      setData(resp);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [startDate, startBalance, accountId]);

  useEffect(() => {
    localStorage.setItem(LS_KEY_START_DATE, startDate);
    localStorage.setItem(LS_KEY_START_BALANCE, String(startBalance));
    localStorage.setItem(LS_KEY_ACCOUNT_ID, accountId);
  }, [startDate, startBalance, accountId]);

  // Load the configured accounts list once (for the dropdown).
  useEffect(() => {
    let cancelled = false;
    api.getAccounts().then(r => {
      if (!cancelled) setAccounts(Array.isArray(r?.accounts) ? r.accounts : []);
    }).catch(() => { /* dropdown stays empty; user can still use "All accounts" */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 5 * 60_000);  // refresh every 5 min
    return () => clearInterval(t);
  }, [fetchData]);

  // ── Chart setup ──────────────────────────────────────────────────────
  // Chart height: scale with viewport so 4k monitors get a proper-size chart.
  // Floor at 360px (works in the smaller P&L-style modal); ceiling at 800px;
  // target ~55% of viewport height. The modal itself is max-h 92vh.
  const computeChartHeight = () => Math.max(360, Math.min(800, Math.floor(window.innerHeight * 0.55)));

  useEffect(() => {
    if (!containerRef.current || chartRef.current) return;
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: computeChartHeight(),
      layout: { background: { type: 'solid', color: '#1f2937' }, textColor: '#d1d5db' },
      grid: { vertLines: { color: '#374151' }, horzLines: { color: '#374151' } },
      timeScale: { timeVisible: false, borderColor: '#374151' },
      rightPriceScale: { borderColor: '#374151', autoScale: true, scaleMargins: { top: 0.1, bottom: 0.1 } },
      crosshair: { mode: 1 },
      localization: { priceFormatter: (p) => `$${Math.round(p).toLocaleString()}` },
    });
    chartRef.current = chart;

    seriesRefs.current.bandP90 = chart.addSeries(AreaSeries, { lineColor: 'rgba(59,130,246,0.05)', topColor: 'rgba(59,130,246,0.18)', bottomColor: 'rgba(59,130,246,0.02)', lineWidth: 1 });
    seriesRefs.current.bandP75 = chart.addSeries(AreaSeries, { lineColor: 'rgba(59,130,246,0.10)', topColor: 'rgba(59,130,246,0.30)', bottomColor: 'rgba(59,130,246,0.05)', lineWidth: 1 });
    seriesRefs.current.bandP25 = chart.addSeries(AreaSeries, { lineColor: 'rgba(59,130,246,0.10)', topColor: 'rgba(59,130,246,0.30)', bottomColor: 'rgba(59,130,246,0.05)', lineWidth: 1 });
    seriesRefs.current.bandP10 = chart.addSeries(AreaSeries, { lineColor: 'rgba(59,130,246,0.05)', topColor: 'rgba(59,130,246,0.18)', bottomColor: 'rgba(59,130,246,0.02)', lineWidth: 1 });
    seriesRefs.current.median  = chart.addSeries(LineSeries, { color: '#60a5fa', lineWidth: 2, lineStyle: 2 });
    // Actual = YOUR live account balance, day-over-day. Bright lime green,
    // thicker line, drawn last so it sits on top of the bands.
    seriesRefs.current.actual  = chart.addSeries(LineSeries, {
      color: '#84cc16', lineWidth: 4, priceLineVisible: true,
      lastValueVisible: true, crosshairMarkerRadius: 5,
    });
    seriesRefs.current.ladderLines = [];  // populated by ladder useEffect below

    const resize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: computeChartHeight(),
        });
      }
    };
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      try { chart.remove(); } catch {}
      chartRef.current = null;
    };
  }, []);

  // ── Update chart data ────────────────────────────────────────────────
  useEffect(() => {
    if (!data || !chartRef.current || !seriesRefs.current.median) return;
    const startTs = Math.floor(new Date(startDate).getTime() / 1000);
    const bands = data.projection?.weeklyBands || [];
    // Lightweight-charts wants strictly-increasing time. Use seconds-since-epoch.
    const toTime = (week) => startTs + Math.round(week * 7 * 86400);
    const medianData = bands.map(b => ({ time: toTime(b.week), value: b.p50 }));
    const p10Data    = bands.map(b => ({ time: toTime(b.week), value: b.p10 }));
    const p25Data    = bands.map(b => ({ time: toTime(b.week), value: b.p25 }));
    const p75Data    = bands.map(b => ({ time: toTime(b.week), value: b.p75 }));
    const p90Data    = bands.map(b => ({ time: toTime(b.week), value: b.p90 }));
    seriesRefs.current.bandP90.setData(p90Data);
    seriesRefs.current.bandP75.setData(p75Data);
    seriesRefs.current.bandP25.setData(p25Data);
    seriesRefs.current.bandP10.setData(p10Data);
    seriesRefs.current.median.setData(medianData);

    const actual = (data.actualTrajectory || []).map(d => ({
      time: Math.floor(new Date(d.date).getTime() / 1000),
      value: d.balance,
    }));
    // Prepend the start point so the line begins at start balance.
    if (actual.length === 0 || actual[0].time > startTs) {
      actual.unshift({ time: startTs, value: data.startBalance });
    }
    seriesRefs.current.actual.setData(actual);

    // Draw horizontal price lines at each ladder threshold so milestones
    // are visually obvious on the chart.
    const ladder = data.projection?.scalingLadder || [];
    // Remove old ladder lines
    for (const pl of seriesRefs.current.ladderLines) {
      try { seriesRefs.current.median.removePriceLine(pl); } catch {}
    }
    seriesRefs.current.ladderLines = [];
    for (const tier of ladder) {
      const desc = tier.n_mnq ? `${tier.n_mnq}×MNQ` : tier.n_nq ? `${tier.n_nq}×NQ` : '';
      const line = seriesRefs.current.median.createPriceLine({
        price: tier.min_balance,
        color: 'rgba(251,191,36,0.5)',
        lineWidth: 1,
        lineStyle: 1,  // dashed
        axisLabelVisible: true,
        title: `→ ${desc}`,
      });
      seriesRefs.current.ladderLines.push(line);
    }

    chartRef.current.timeScale().fitContent();
  }, [data, startDate]);

  // ── MAE comparison rows ──────────────────────────────────────────────
  const maeRows = data ? Object.entries(data.projection?.maeDistribution || {}).map(([key, dist]) => {
    const live = (data.liveMaeStats || {})[key] || { n: 0, exceeded_p95: 0, exceeded_p99: 0, max_observed: 0 };
    return { strategy: key, ...dist.all, live };
  }) : [];

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-white">Account Tracker</h2>
          <span className="text-xs text-gray-400">vs. backtest projection (10k bootstrap)</span>
        </div>
        <div className="flex items-center gap-2">
          <PercentileBadge pct={data?.percentileRank} />
          <button onClick={fetchData} disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-sm text-gray-200 disabled:opacity-50">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-end bg-gray-900/50 rounded p-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Account</label>
          <select value={accountId} onChange={e => setAccountId(e.target.value)}
            className="bg-gray-700 text-gray-100 text-sm rounded px-2 py-1 border border-gray-600 min-w-[12rem]">
            <option value="">All accounts (aggregated)</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.label || a.name || a.id}{a.broker ? ` — ${a.broker}` : ''}{a.enabled === false ? ' (disabled)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Start Date</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="bg-gray-700 text-gray-100 text-sm rounded px-2 py-1 border border-gray-600" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Start Balance ($)</label>
          <input type="number" value={startBalance} min={100} step={100}
            onChange={e => setStartBalance(parseFloat(e.target.value) || 2000)}
            className="bg-gray-700 text-gray-100 text-sm rounded px-2 py-1 border border-gray-600 w-32" />
        </div>
        {data && (
          <div className="ml-auto flex gap-6 text-sm">
            <div>
              <div className="text-xs text-gray-400">Current balance</div>
              <div className="text-xl font-semibold text-emerald-400">{fmtUsdExact(data.currentBalance)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Week</div>
              <div className="text-xl font-semibold text-blue-300">{data.currentWeek.toFixed(1)}</div>
            </div>
            {data.currentBands && (
              <div>
                <div className="text-xs text-gray-400">Expected (median)</div>
                <div className="text-xl font-semibold text-gray-200">{fmtUsdExact(data.currentBands.p50)}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-200 text-sm rounded p-2">
          <AlertTriangle className="inline w-4 h-4 mr-1" /> {error}
        </div>
      )}

      {loading && (
        <div className="bg-blue-900/30 border border-blue-700 text-blue-200 text-sm rounded p-3 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          {startBalance !== DEFAULT_START_BALANCE
            ? `Bootstrapping projection for $${startBalance.toLocaleString()} starting balance (10,000 simulations × 130 days)... this can take 5-30 seconds.`
            : 'Loading projection…'}
        </div>
      )}

      {/* Legend + chart */}
      <div className="bg-gray-900/50 rounded p-2">
        <div className="flex flex-wrap items-center gap-4 px-2 pb-2 text-xs">
          <span className="inline-flex items-center gap-1.5 text-lime-400">
            <span className="inline-block w-4 h-1 rounded bg-lime-500"></span>
            <strong>Your actual balance</strong> (day-over-day, from live trades)
          </span>
          <span className="inline-flex items-center gap-1.5 text-blue-300">
            <span className="inline-block w-4 h-0.5 rounded border-t-2 border-dashed border-blue-400"></span>
            Projected median (p50)
          </span>
          <span className="inline-flex items-center gap-1.5 text-blue-300/70">
            <span className="inline-block w-4 h-2 rounded bg-blue-500/30"></span>
            Projection bands (p10–p90)
          </span>
          <span className="inline-flex items-center gap-1.5 text-amber-300/80">
            <span className="inline-block w-4 h-0.5 rounded border-t border-dashed border-amber-400"></span>
            Scaling-ladder thresholds
          </span>
        </div>
        {data && (data.actualTrajectory?.length ?? 0) <= 1 && !loading && (
          <div className="mx-2 mb-2 bg-amber-900/20 border border-amber-700/50 text-amber-200 text-xs rounded p-2">
            Account is not actively trading yet. Once you fund the account and trades begin, your live balance will appear as a <strong className="text-lime-400">lime green line</strong> overlaid on the projection bands. Each closed trading day adds a new point.
          </div>
        )}
        <div ref={containerRef} />
      </div>

      {/* Scaling Ladder — current tier + next milestone */}
      {data && (() => {
        const ladder = data.projection?.scalingLadder || [];
        const balance = data.currentBalance || data.startBalance;
        let currentTierIdx = -1;
        for (let i = ladder.length - 1; i >= 0; i--) {
          if (balance >= ladder[i].min_balance) { currentTierIdx = i; break; }
        }
        const nextTier = currentTierIdx + 1 < ladder.length ? ladder[currentTierIdx + 1] : null;
        const tierDesc = (t) => t.n_mnq ? `${t.n_mnq}×MNQ` : t.n_nq ? `${t.n_nq}×NQ` : 'flat';
        return (
          <div className="bg-gray-900/50 rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-white">Scaling Ladder — when to bump contract size</h3>
              {nextTier && (
                <span className="text-xs text-amber-300">
                  Next tier: <strong>{tierDesc(nextTier)}</strong> at ${nextTier.min_balance.toLocaleString()}
                  <span className="text-gray-400 ml-2">(${(nextTier.min_balance - balance).toLocaleString()} away)</span>
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-1">
              {ladder.map((t, i) => {
                const isCurrent = i === currentTierIdx;
                const isPast = i < currentTierIdx;
                const isNext = i === currentTierIdx + 1;
                let cls = 'bg-gray-800 text-gray-500 border-gray-700';
                if (isCurrent) cls = 'bg-emerald-700/50 text-emerald-200 border-emerald-500 ring-2 ring-emerald-500';
                else if (isPast) cls = 'bg-gray-700/30 text-gray-400 border-gray-600';
                else if (isNext) cls = 'bg-amber-700/30 text-amber-200 border-amber-600';
                return (
                  <div key={i} className={`text-center p-1.5 rounded border text-xs ${cls}`}>
                    <div className="font-mono text-[10px] opacity-75">${t.min_balance >= 1000 ? `${(t.min_balance/1000).toFixed(t.min_balance >= 10000 ? 0 : 1)}k` : t.min_balance}</div>
                    <div className="font-semibold">{tierDesc(t)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* MAE table */}
      <div className="bg-gray-900/50 rounded p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-white">Per-Strategy MAE — live vs backtest distribution</h3>
          {data?.hasMaeAttribution
            ? <span className="text-xs text-emerald-400 inline-flex items-center gap-1"><CheckCircle className="w-3 h-3" /> live MAE data captured</span>
            : <span className="text-xs text-amber-400 inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> live MAE data missing</span>}
        </div>
        {!data?.hasMaeAttribution && (
          <p className="text-xs text-gray-400 mb-2">{data?.missingDataNote || 'pnl:trades records need strategy + maePoints fields to enable per-trade MAE comparison.'}</p>
        )}
        <table className="w-full text-xs">
          <thead className="text-gray-400 border-b border-gray-700">
            <tr>
              <th className="text-left py-1">Strategy</th>
              <th className="text-right">BT p50</th>
              <th className="text-right">BT p95</th>
              <th className="text-right">BT p99</th>
              <th className="text-right">BT max</th>
              <th className="text-right">Live n</th>
              <th className="text-right">Live max</th>
              <th className="text-right">&gt; p95</th>
              <th className="text-right">&gt; p99</th>
            </tr>
          </thead>
          <tbody className="text-gray-200">
            {maeRows.map(r => {
              const flag = r.live.exceeded_p99 > 0;
              const warn = r.live.exceeded_p95 > 0;
              return (
                <tr key={r.strategy} className="border-b border-gray-800 last:border-0">
                  <td className="py-1 font-mono">{r.strategy}</td>
                  <td className="text-right">{r.p50}pt</td>
                  <td className="text-right text-blue-300">{r.p95}pt</td>
                  <td className="text-right text-amber-300">{r.p99}pt</td>
                  <td className="text-right text-red-300">{r.max}pt</td>
                  <td className="text-right">{r.live.n}</td>
                  <td className={`text-right ${r.live.max_observed > r.p99 ? 'text-red-400 font-semibold' : r.live.max_observed > r.p95 ? 'text-amber-300' : ''}`}>
                    {r.live.max_observed ? `${r.live.max_observed.toFixed(1)}pt` : '—'}
                  </td>
                  <td className={`text-right ${warn ? 'text-amber-300' : 'text-gray-500'}`}>{r.live.exceeded_p95}</td>
                  <td className={`text-right ${flag ? 'text-red-400 font-semibold' : 'text-gray-500'}`}>{r.live.exceeded_p99}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Flagged trades */}
      {data?.flaggedTrades?.length > 0 && (
        <div className="bg-amber-900/20 border border-amber-700 rounded p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-amber-200">Recent trades exceeding backtest p95 MAE</h3>
          </div>
          <table className="w-full text-xs">
            <thead className="text-amber-300/70">
              <tr>
                <th className="text-left py-1">Time</th>
                <th className="text-left">Strategy</th>
                <th>Side</th>
                <th className="text-right">MAE</th>
                <th className="text-right">p95</th>
                <th className="text-right">p99</th>
                <th className="text-right">PnL</th>
              </tr>
            </thead>
            <tbody className="text-gray-200">
              {data.flaggedTrades.map(t => (
                <tr key={t.id} className="border-b border-amber-900/30 last:border-0">
                  <td className="py-1">{new Date(t.entryTime).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="font-mono">{t.strategy}</td>
                  <td>{t.side}</td>
                  <td className={`text-right ${t.mae > t.p99 ? 'text-red-400 font-semibold' : 'text-amber-300'}`}>{t.mae.toFixed(1)}pt</td>
                  <td className="text-right text-gray-400">{t.p95}pt</td>
                  <td className="text-right text-gray-400">{t.p99}pt</td>
                  <td className={`text-right ${t.netPnl > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtUsd(t.netPnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-[10px] text-gray-500 space-y-0.5">
        <div>
          Bands show 10k-iteration bootstrap of historical daily PnL through the scaling ladder ({data?.projection?.scalingLadder?.length || 0} tiers).
          Median + p25/p75/p10/p90 from start of {startDate}. Refreshes every 5 min.
        </div>
        <div>
          Data source: <span className="font-mono text-gray-400">{data?.dataSource || '—'}</span>
          {data?.accountId && <> · account: <span className="font-mono text-gray-400">{data.accountId}</span></>}
          · projection version: <span className="font-mono text-gray-400">{data?.projection?.version || '—'}</span>
        </div>
      </div>
    </div>
  );
}
