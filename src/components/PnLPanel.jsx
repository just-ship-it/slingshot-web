import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../services/api';

const PnLPanel = () => {
  const [summary, setSummary] = useState(null);
  const [daily, setDaily] = useState([]);
  const [trades, setTrades] = useState([]);
  const [syncedAt, setSyncedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // overview | calendar | equity | trades

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [summaryRes, dailyRes, tradesRes] = await Promise.all([
        api.getPnLSummary().catch(() => null),
        api.getPnLDaily().catch(() => null),
        api.getPnLTrades().catch(() => null),
      ]);
      if (summaryRes?.summary) setSummary(summaryRes.summary);
      if (dailyRes?.daily) setDaily(dailyRes.daily);
      if (tradesRes?.trades) setTrades(tradesRes.trades);
      setSyncedAt(summaryRes?.syncedAt || dailyRes?.syncedAt || null);
      if (!summaryRes?.summary && !tradesRes?.trades) {
        setError('No P&L data. Run sync first.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSync = async () => {
    try {
      setSyncing(true);
      setError(null);
      await api.triggerPnLSync();
      await loadData();
    } catch (err) {
      setError(`Sync failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const fmt = (v, decimals = 2) => v != null ? v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : '--';
  const fmtDollar = (v) => v != null ? `$${fmt(Math.abs(v))}` : '--';
  const fmtPnL = (v) => {
    if (v == null) return '--';
    const sign = v >= 0 ? '+' : '-';
    return `${sign}$${fmt(Math.abs(v))}`;
  };
  const pnlColor = (v) => v > 0 ? 'text-green-400' : v < 0 ? 'text-red-400' : 'text-gray-400';

  // Build a map of date -> daily summary for calendar/equity
  const dailyMap = useMemo(() => {
    const m = {};
    daily.forEach(d => { m[d.date] = d; });
    return m;
  }, [daily]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'equity', label: 'Equity Curve' },
    { id: 'trades', label: `Trades (${trades.length})` },
  ];

  return (
    <div className="px-4 py-3 space-y-4">
      {/* Header row: tabs + sync */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {syncedAt && (
            <span className="text-xs text-gray-500">
              Synced {new Date(syncedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="text-xs px-2.5 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors disabled:opacity-50"
          >
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      {error && !summary && (
        <div className="text-center py-8 text-gray-400">
          <p>{error}</p>
          <button onClick={handleSync} className="mt-3 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm">
            Run Sync
          </button>
        </div>
      )}

      {activeTab === 'overview' && summary && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard label="Net P&L" value={fmtPnL(summary.netPnl)} color={pnlColor(summary.netPnl)} large />
            <SummaryCard label="Total Trades" value={summary.totalTrades} sub={`${summary.totalContracts} contracts`} />
            <SummaryCard label="Win Rate" value={`${fmt(summary.winRate, 1)}%`}
              color={summary.winRate >= 50 ? 'text-green-400' : 'text-red-400'}
              sub={`${summary.wins}W / ${summary.losses}L`} />
            <SummaryCard label="Profit Factor" value={summary.profitFactor === Infinity ? '∞' : fmt(summary.profitFactor)}
              color={summary.profitFactor >= 1.5 ? 'text-green-400' : summary.profitFactor >= 1 ? 'text-yellow-400' : 'text-red-400'} />
          </div>

          {/* Second row of stats */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            <StatBox label="Avg Win" value={fmtDollar(summary.avgWin)} color="text-green-400" />
            <StatBox label="Avg Loss" value={fmtDollar(Math.abs(summary.avgLoss))} color="text-red-400" />
            <StatBox label="Max Win" value={fmtDollar(summary.maxWin)} color="text-green-400" />
            <StatBox label="Max Loss" value={fmtDollar(Math.abs(summary.maxLoss))} color="text-red-400" />
            <StatBox label="Avg Trade" value={fmtPnL(summary.avgTrade)} color={pnlColor(summary.avgTrade)} />
            <StatBox label="Avg Duration" value={`${summary.avgDurationMinutes}m`} />
          </div>

          {/* Streaks + fees row */}
          <div className="grid grid-cols-3 gap-3">
            <StatBox label="Win Streak" value={summary.maxWinStreak} color="text-green-400" />
            <StatBox label="Loss Streak" value={summary.maxLossStreak} color="text-red-400" />
            <StatBox label="Total Fees" value={fmtDollar(summary.totalFees)} color="text-gray-400" />
          </div>

          {/* Win/Loss distribution */}
          {summary.totalTrades > 0 && (
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-3">
              <h3 className="text-sm font-semibold text-gray-300 mb-2">Win / Loss Distribution</h3>
              <div className="flex items-center gap-2 h-6 rounded overflow-hidden">
                {summary.wins > 0 && (
                  <div
                    className="bg-green-500/70 h-full rounded-l flex items-center justify-center text-xs font-semibold text-white"
                    style={{ width: `${(summary.wins / summary.totalTrades) * 100}%`, minWidth: '30px' }}
                  >
                    {summary.wins}W
                  </div>
                )}
                {summary.breakeven > 0 && (
                  <div
                    className="bg-gray-500/70 h-full flex items-center justify-center text-xs font-semibold text-white"
                    style={{ width: `${(summary.breakeven / summary.totalTrades) * 100}%`, minWidth: '20px' }}
                  >
                    {summary.breakeven}
                  </div>
                )}
                {summary.losses > 0 && (
                  <div
                    className="bg-red-500/70 h-full rounded-r flex items-center justify-center text-xs font-semibold text-white"
                    style={{ width: `${(summary.losses / summary.totalTrades) * 100}%`, minWidth: '30px' }}
                  >
                    {summary.losses}L
                  </div>
                )}
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Gross Profit: <span className="text-green-400">{fmtDollar(summary.grossPnl > 0 ? summary.avgWin * summary.wins : 0)}</span></span>
                <span>Gross Loss: <span className="text-red-400">{fmtDollar(summary.losses > 0 ? Math.abs(summary.avgLoss) * summary.losses : 0)}</span></span>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'calendar' && (
        <PnLCalendar dailyMap={dailyMap} daily={daily} fmtPnL={fmtPnL} pnlColor={pnlColor} />
      )}

      {activeTab === 'equity' && (
        <EquityCurve daily={daily} fmtPnL={fmtPnL} pnlColor={pnlColor} />
      )}

      {activeTab === 'trades' && trades.length > 0 && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="text-left px-3 py-2 font-medium">Symbol</th>
                  <th className="text-left px-3 py-2 font-medium">Side</th>
                  <th className="text-right px-3 py-2 font-medium">Qty</th>
                  <th className="text-right px-3 py-2 font-medium">Entry</th>
                  <th className="text-right px-3 py-2 font-medium">Exit</th>
                  <th className="text-left px-3 py-2 font-medium">Entry Time</th>
                  <th className="text-left px-3 py-2 font-medium">Exit Time</th>
                  <th className="text-right px-3 py-2 font-medium">Duration</th>
                  <th className="text-right px-3 py-2 font-medium">Points</th>
                  <th className="text-right px-3 py-2 font-medium">P&L</th>
                  <th className="text-right px-3 py-2 font-medium">Fees</th>
                  <th className="text-right px-3 py-2 font-medium">Net</th>
                </tr>
              </thead>
              <tbody>
                {[...trades].reverse().map((trade) => (
                  <tr key={trade.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="px-3 py-1.5 font-mono text-white">{trade.symbol}</td>
                    <td className={`px-3 py-1.5 ${trade.side === 'Long' ? 'text-green-400' : 'text-red-400'}`}>{trade.side}</td>
                    <td className="px-3 py-1.5 text-right text-gray-300">{trade.qty}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-gray-300">{fmt(trade.entryPrice)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-gray-300">{fmt(trade.exitPrice)}</td>
                    <td className="px-3 py-1.5 text-gray-400">{formatTime(trade.entryTime)}</td>
                    <td className="px-3 py-1.5 text-gray-400">{formatTime(trade.exitTime)}</td>
                    <td className="px-3 py-1.5 text-right text-gray-400">{trade.durationMinutes}m</td>
                    <td className={`px-3 py-1.5 text-right font-mono ${pnlColor(trade.pnlPoints)}`}>{trade.pnlPoints >= 0 ? '+' : ''}{fmt(trade.pnlPoints)}</td>
                    <td className={`px-3 py-1.5 text-right font-mono ${pnlColor(trade.pnlDollars)}`}>{fmtPnL(trade.pnlDollars)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-gray-500">{fmtDollar(trade.fees)}</td>
                    <td className={`px-3 py-1.5 text-right font-mono font-semibold ${pnlColor(trade.netPnl)}`}>{fmtPnL(trade.netPnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'trades' && trades.length === 0 && (
        <div className="text-center py-8 text-gray-500">No trade data available</div>
      )}
    </div>
  );
};

// ─── Calendar View ──────────────────────────────────────────────────────────
// Desktop: month grid calendar. Mobile: scrollable daily list.

const PnLCalendar = ({ dailyMap, daily, fmtPnL, pnlColor }) => {
  const [mode, setMode] = useState('recent'); // 'recent' or 'month'
  const [viewDate, setViewDate] = useState(() => new Date());

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthName = viewDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const prevMonth = () => { setMode('month'); setViewDate(new Date(year, month - 1, 1)); };
  const nextMonth = () => { setMode('month'); setViewDate(new Date(year, month + 1, 1)); };

  // --- Determine which days to display based on mode ---
  // Recent: last 20 trading days. Month: all days in selected month.
  const recentDays = useMemo(() => {
    return [...daily].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20).reverse();
  }, [daily]);

  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthDailyData = useMemo(() => {
    return daily.filter(d => d.date.startsWith(monthStr)).sort((a, b) => a.date.localeCompare(b.date));
  }, [daily, monthStr]);

  const activeDays = mode === 'recent' ? recentDays : monthDailyData;

  // Stats for active days
  const totalPnl = activeDays.reduce((s, d) => s + d.netPnl, 0);
  const totalTrades = activeDays.reduce((s, d) => s + d.trades, 0);
  const totalWins = activeDays.reduce((s, d) => s + d.wins, 0);
  const totalLosses = activeDays.reduce((s, d) => s + d.losses, 0);
  const greenDays = activeDays.filter(d => d.netPnl > 0).length;
  const redDays = activeDays.filter(d => d.netPnl < 0).length;

  // Cumulative for the active window
  let cum = 0;
  const cumByDate = {};
  for (const d of activeDays) { cum += d.netPnl; cumByDate[d.date] = cum; }

  // Calendar grid cells for month mode
  const monthCells = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const c = [];
    for (let i = 0; i < firstDay; i++) c.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      c.push({ day: d, date: dateStr, data: dailyMap[dateStr] || null });
    }
    return c;
  }, [year, month, dailyMap]);

  // Calendar grid cells for recent mode (rolling ~3 week window ending today)
  const recentCells = useMemo(() => {
    const today = new Date();
    // Go back 20 days, then back to the previous Sunday to start the grid
    const start = new Date(today);
    start.setDate(start.getDate() - 20);
    start.setDate(start.getDate() - start.getDay()); // back to Sunday

    const c = [];
    const d = new Date(start);
    while (d <= today) {
      const dateStr = d.toLocaleDateString('en-CA'); // YYYY-MM-DD
      c.push({ day: d.getDate(), date: dateStr, data: dailyMap[dateStr] || null, month: d.getMonth() });
      d.setDate(d.getDate() + 1);
    }
    return c;
  }, [dailyMap]);

  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const summaryBar = activeDays.length > 0 && (
    <div className="mt-3 pt-2 border-t border-gray-700 flex flex-wrap items-center justify-between gap-2 text-xs">
      <span className={`font-semibold font-mono ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
        {fmtPnL(Math.round(totalPnl * 100) / 100)}
      </span>
      <span className="text-gray-500">
        {totalTrades} trades | {totalWins}W / {totalLosses}L | {greenDays} green / {redDays} red days
      </span>
    </div>
  );

  // Mobile list data (reverse chronological)
  const listDays = [...activeDays].reverse();
  const maxPnl = activeDays.length > 0 ? Math.max(...activeDays.map(d => Math.abs(d.netPnl)), 1) : 1;

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-3">
      {/* Nav bar */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-700 transition-colors text-lg">
          &#8249;
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode('recent')}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              mode === 'recent' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            Recent
          </button>
          <button
            onClick={() => setMode('month')}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              mode === 'month' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            {monthName}
          </button>
        </div>
        <button onClick={nextMonth} className="text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-700 transition-colors text-lg">
          &#8250;
        </button>
      </div>

      {/* Desktop view: always calendar grid */}
      <div className="hidden md:block">
        <div className="grid grid-cols-7 gap-1.5 mb-1">
          {weekdays.map(d => (
            <div key={d} className="text-center text-xs text-gray-500 font-medium py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {(mode === 'month' ? monthCells : recentCells).map((cell, i) => {
            if (!cell) return <div key={`empty-${i}`} className="min-h-[56px]" />;
            const { day, data } = cell;
            const hasTrades = data && data.trades > 0;
            const todayStr = new Date().toLocaleDateString('en-CA');
            const isToday = cell.date === todayStr;
            // In recent mode, dim days from a different month than today
            const isCurrentMonth = mode !== 'recent' || cell.month === new Date().getMonth();
            let bg = 'bg-gray-800/40';
            if (hasTrades) {
              bg = data.netPnl > 0 ? 'bg-green-900/40 border-green-700/50' :
                   data.netPnl < 0 ? 'bg-red-900/40 border-red-700/50' :
                   'bg-gray-700/40 border-gray-600/50';
            }
            return (
              <div key={cell.date} className={`min-h-[56px] rounded-md border ${bg} ${isToday ? 'ring-1 ring-blue-500' : 'border-gray-700/30'} flex flex-col items-center justify-center py-1.5 px-1`}>
                <span className={`text-xs ${hasTrades ? 'text-gray-300' : isCurrentMonth ? 'text-gray-600' : 'text-gray-700'}`}>
                  {mode === 'recent' && day === 1 ? `${cell.date.slice(5, 7)}/${day}` : day}
                </span>
                {hasTrades && (
                  <>
                    <span className={`text-base font-mono font-bold leading-snug ${data.netPnl > 0 ? 'text-green-400' : data.netPnl < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                      {data.netPnl >= 0 ? '+' : '-'}${Math.abs(data.netPnl).toFixed(2)}
                    </span>
                    <span className="text-xs text-gray-500 leading-snug">{data.trades} trades</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
        {summaryBar}
      </div>

      {/* Mobile view: always list */}
      <div className="md:hidden">
        {listDays.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-6">No trading days</div>
        ) : (
          <DailyList days={listDays} maxPnl={maxPnl} cumByDate={cumByDate} />
        )}
        {summaryBar}
      </div>
    </div>
  );
};

// Shared daily list component used by both mobile and desktop "Recent" view
const DailyList = ({ days, maxPnl, cumByDate }) => (
  <div className="space-y-1.5">
    {days.map(day => {
      const dateObj = new Date(day.date + 'T12:00:00');
      const weekday = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
      const monthDay = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const isPos = day.netPnl >= 0;
      const cumVal = cumByDate[day.date] || 0;
      const barWidth = Math.min((Math.abs(day.netPnl) / maxPnl) * 100, 100);

      return (
        <div
          key={day.date}
          className={`rounded-md border px-3 py-2 ${
            isPos ? 'bg-green-900/30 border-green-700/40' : 'bg-red-900/30 border-red-700/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400 w-20">{weekday} {monthDay.split(' ')[1]}</span>
              <span className={`text-base font-mono font-bold ${isPos ? 'text-green-400' : 'text-red-400'}`}>
                {day.netPnl >= 0 ? '+' : '-'}${Math.abs(day.netPnl).toFixed(2)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs text-gray-400">{day.trades}t {day.wins}W/{day.losses}L</span>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 bg-gray-700/50 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${isPos ? 'bg-green-500/60' : 'bg-red-500/60'}`}
                style={{ width: `${barWidth}%` }}
              />
            </div>
            <span className={`text-[10px] font-mono ${cumVal >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
              cum {cumVal >= 0 ? '+' : '-'}${Math.abs(Math.round(cumVal * 100) / 100).toFixed(0)}
            </span>
          </div>
        </div>
      );
    })}
  </div>
);

// ─── Equity Curve ───────────────────────────────────────────────────────────

const TIMEFRAMES = [
  { id: 'all', label: 'All' },
  { id: '1w', label: '1W', days: 7 },
  { id: '1m', label: '1M', days: 30 },
  { id: '3m', label: '3M', days: 90 },
  { id: '6m', label: '6M', days: 180 },
  { id: '1y', label: '1Y', days: 365 },
];

const EquityCurve = ({ daily, fmtPnL, pnlColor }) => {
  const [timeframe, setTimeframe] = useState('all');

  // Filter daily data by timeframe
  const filtered = useMemo(() => {
    if (!daily.length) return [];
    const tf = TIMEFRAMES.find(t => t.id === timeframe);
    if (!tf?.days) return daily; // 'all'
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - tf.days);
    const cutoffStr = cutoff.toLocaleDateString('en-CA');
    return daily.filter(d => d.date >= cutoffStr);
  }, [daily, timeframe]);

  // Compute cumulative series from filtered data
  const series = useMemo(() => {
    let cum = 0;
    return filtered.map(d => {
      cum += d.netPnl;
      return { date: d.date, cumPnl: Math.round(cum * 100) / 100, dayPnl: d.netPnl };
    });
  }, [filtered]);

  if (series.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-3 text-center text-gray-500 py-8">
        No data for selected timeframe
      </div>
    );
  }

  const minPnl = Math.min(0, ...series.map(s => s.cumPnl));
  const maxPnl = Math.max(0, ...series.map(s => s.cumPnl));
  const range = maxPnl - minPnl || 1;
  const finalPnl = series[series.length - 1].cumPnl;

  // SVG dimensions
  const svgW = 500;
  const svgH = 200;
  const padL = 55;
  const padR = 10;
  const padT = 15;
  const padB = 25;
  const chartW = svgW - padL - padR;
  const chartH = svgH - padT - padB;

  const toX = (i) => padL + (i / Math.max(series.length - 1, 1)) * chartW;
  const toY = (v) => padT + (1 - (v - minPnl) / range) * chartH;

  const zeroY = toY(0);
  const linePath = series.map((s, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(s.cumPnl)}`).join(' ');
  // Fill area under the line to zero
  const fillPath = linePath + ` L ${toX(series.length - 1)} ${zeroY} L ${toX(0)} ${zeroY} Z`;

  // Y-axis grid lines (5 levels)
  const yTicks = [];
  const step = range / 4;
  for (let i = 0; i <= 4; i++) {
    const val = minPnl + step * i;
    yTicks.push({ val: Math.round(val), y: toY(val) });
  }

  // X-axis labels (show ~5 dates)
  const xLabels = [];
  const labelStep = Math.max(1, Math.floor(series.length / 5));
  for (let i = 0; i < series.length; i += labelStep) {
    xLabels.push({ date: series[i].date, x: toX(i) });
  }
  // Always include the last date
  if (xLabels.length === 0 || xLabels[xLabels.length - 1].date !== series[series.length - 1].date) {
    xLabels.push({ date: series[series.length - 1].date, x: toX(series.length - 1) });
  }

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-3">
      {/* Header: title + timeframe buttons */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-300">Equity Curve</h3>
          <span className={`text-sm font-semibold font-mono ${pnlColor(finalPnl)}`}>{fmtPnL(finalPnl)}</span>
        </div>
        <div className="flex gap-1">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf.id}
              onClick={() => setTimeframe(tf.id)}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                timeframe === tf.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" style={{ minHeight: 180 }}>
        {/* Y-axis grid + labels */}
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line x1={padL} y1={tick.y} x2={svgW - padR} y2={tick.y} stroke="#374151" strokeWidth="0.5" />
            <text x={padL - 5} y={tick.y + 3} textAnchor="end" fontSize="9" fill="#6b7280" fontFamily="monospace">
              {tick.val >= 0 ? '+' : ''}{tick.val.toLocaleString()}
            </text>
          </g>
        ))}

        {/* Zero line (emphasized) */}
        <line x1={padL} y1={zeroY} x2={svgW - padR} y2={zeroY} stroke="#6b7280" strokeWidth="0.8" strokeDasharray="4,3" />

        {/* Fill under curve */}
        <path d={fillPath} fill={finalPnl >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'} />

        {/* Equity line */}
        <path d={linePath} fill="none" stroke={finalPnl >= 0 ? '#22c55e' : '#ef4444'} strokeWidth="2" strokeLinejoin="round" />

        {/* Endpoint dot */}
        <circle
          cx={toX(series.length - 1)} cy={toY(finalPnl)}
          r="3" fill={finalPnl >= 0 ? '#22c55e' : '#ef4444'}
        />

        {/* X-axis labels */}
        {xLabels.map((lbl, i) => (
          <text key={i} x={lbl.x} y={svgH - 5} textAnchor="middle" fontSize="9" fill="#6b7280">
            {lbl.date.slice(5)}
          </text>
        ))}
      </svg>
    </div>
  );
};

// ─── Shared small components ────────────────────────────────────────────────

const SummaryCard = ({ label, value, sub, color = 'text-white', large }) => (
  <div className="bg-gray-800 rounded-lg border border-gray-700 px-3 py-2">
    <div className="text-xs text-gray-400 mb-0.5">{label}</div>
    <div className={`${large ? 'text-xl' : 'text-lg'} font-bold font-mono ${color}`}>{value}</div>
    {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
  </div>
);

const StatBox = ({ label, value, color = 'text-white' }) => (
  <div className="bg-gray-800/60 rounded border border-gray-700/50 px-2.5 py-1.5">
    <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
    <div className={`text-sm font-semibold font-mono ${color}`}>{value}</div>
  </div>
);

function formatTime(iso) {
  if (!iso) return '--';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
}

export default PnLPanel;
