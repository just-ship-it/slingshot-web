import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

const PnLPanel = () => {
  const [summary, setSummary] = useState(null);
  const [daily, setDaily] = useState([]);
  const [trades, setTrades] = useState([]);
  const [syncedAt, setSyncedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // overview | trades

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
      await api.triggerPnLSync();
      // Wait a moment for sync to complete, then reload
      setTimeout(() => { loadData(); setSyncing(false); }, 5000);
    } catch (err) {
      setSyncing(false);
      setError(`Sync failed: ${err.message}`);
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

  // Find max absolute daily P&L for bar chart scaling
  const maxDailyPnl = daily.length > 0 ? Math.max(...daily.map(d => Math.abs(d.netPnl)), 1) : 1;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="px-4 py-3 space-y-4">
      {/* Header row: tabs + sync */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {['overview', 'trades'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                activeTab === tab ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {tab === 'overview' ? 'Overview' : `Trades (${trades.length})`}
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

          {/* Cumulative P&L chart (bar chart by day) */}
          {daily.length > 0 && (
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-3">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Daily P&L</h3>
              <div className="space-y-1.5">
                {daily.map(day => (
                  <div key={day.date} className="flex items-center gap-2 text-xs">
                    <span className="text-gray-400 w-20 flex-shrink-0 font-mono">{day.date.slice(5)}</span>
                    <div className="flex-1 flex items-center h-5">
                      {/* Center-anchored bar */}
                      <div className="relative w-full h-full flex items-center">
                        <div className="absolute left-1/2 w-px h-full bg-gray-600" />
                        {day.netPnl >= 0 ? (
                          <div
                            className="absolute left-1/2 h-3 rounded-r bg-green-500/70"
                            style={{ width: `${(day.netPnl / maxDailyPnl) * 50}%` }}
                          />
                        ) : (
                          <div
                            className="absolute h-3 rounded-l bg-red-500/70"
                            style={{
                              width: `${(Math.abs(day.netPnl) / maxDailyPnl) * 50}%`,
                              right: '50%',
                            }}
                          />
                        )}
                      </div>
                    </div>
                    <span className={`w-20 text-right font-mono flex-shrink-0 ${pnlColor(day.netPnl)}`}>
                      {fmtPnL(day.netPnl)}
                    </span>
                    <span className="text-gray-500 w-16 text-right flex-shrink-0">
                      {day.trades}t {day.winRate}%
                    </span>
                  </div>
                ))}
              </div>
              {/* Cumulative line */}
              {daily.length > 1 && daily[daily.length - 1].cumulativeNetPnl != null && (
                <div className="mt-3 pt-2 border-t border-gray-700 flex justify-between text-xs">
                  <span className="text-gray-400">Cumulative Net P&L</span>
                  <span className={`font-semibold ${pnlColor(daily[daily.length - 1].cumulativeNetPnl)}`}>
                    {fmtPnL(daily[daily.length - 1].cumulativeNetPnl)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Win/Loss distribution */}
          {summary.totalTrades > 0 && (
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-3">
              <h3 className="text-sm font-semibold text-gray-300 mb-2">Win / Loss Distribution</h3>
              <div className="flex items-center gap-2 h-6 rounded overflow-hidden">
                {summary.wins > 0 && (
                  <div
                    className="bg-green-500/70 h-full rounded-l flex items-center justify-center text-xs font-semibold text-white"
                    style={{ width: `${(summary.wins / summary.totalTrades) * 100}%`, minWidth: summary.wins > 0 ? '30px' : 0 }}
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
                    style={{ width: `${(summary.losses / summary.totalTrades) * 100}%`, minWidth: summary.losses > 0 ? '30px' : 0 }}
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
