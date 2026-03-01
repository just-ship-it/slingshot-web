import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

const TYPE_LABELS = {
  rn100: 'RN100',
  rn50: 'RN50',
  'rn12.5': 'RN12',
  pdh: 'PDH',
  pdl: 'PDL',
  pdc: 'PDC',
  pdm: 'PDM',
  orbH: 'ORB-H',
  orbL: 'ORB-L',
  ibH: 'IB-H',
  ibL: 'IB-L',
  vwap: 'VWAP',
  onH: 'ON-H',
  onL: 'ON-L',
  dsh: 'DSH',
  dsl: 'DSL'
};

const MnqScalperPanel = ({ socket, quotes }) => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStatus = async () => {
    try {
      setError(null);
      const response = await api.getMnqScalperStatus();
      if (response) {
        setStatus(response);
      } else {
        setStatus({ success: false, error: 'No response', message: 'signal-generator may not be running' });
      }
    } catch (err) {
      setError('Failed to fetch MNQ scalper status');
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
        <h3 className="text-[15px] font-bold text-white mb-2">MNQ Scalper</h3>
        <div className="text-gray-400 text-[15px]">Loading...</div>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg p-2">
        <h3 className="text-[15px] font-bold text-white mb-2">MNQ Scalper</h3>
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
        <h3 className="text-[15px] font-bold text-white mb-2">MNQ Scalper</h3>
        <div className="text-yellow-400 text-[15px] mb-1">Service not running</div>
        <div className="text-gray-500 text-[15px]">{status.message}</div>
      </div>
    );
  }

  const internals = status?.internals;
  const position = status?.position;
  const readiness = status?.evaluation_readiness;
  const strategy = status?.strategy;

  const metrics = internals?.tradingMetrics || {};
  const weekly = internals?.weeklyMetrics || {};
  const session = internals?.session || {};
  const params = internals?.params || {};
  const levels = internals?.levels || [];
  const lastPrice = internals?.lastPrice;
  const levelBroken = internals?.levelBroken || {};
  const priorDay = internals?.priorDay || {};
  const overnight = internals?.overnight || {};
  const orb = internals?.orb || {};
  const ib = internals?.ib || {};

  // Current price from internals or quotes
  const price = lastPrice || quotes?.NQ?.close || quotes?.MNQ?.close || null;

  // Status badge
  const getStatusBadge = () => {
    if (!session.seeded) return { color: 'bg-yellow-600', text: 'SEEDING' };
    if (weekly.weeklyHalted) return { color: 'bg-red-700', text: 'WEEK HALT' };
    if (metrics.tradingHalted) return { color: 'bg-red-600', text: 'HALTED' };
    if (metrics.dayTargetHit) return { color: 'bg-green-600', text: 'TARGET HIT' };
    return { color: 'bg-green-700', text: 'ACTIVE' };
  };
  const badge = getStatusBadge();

  // P&L color
  const pnlColor = metrics.dayPnL > 0 ? 'text-green-400' : metrics.dayPnL < 0 ? 'text-red-400' : 'text-gray-400';

  // Sort levels by distance from price
  const sortedLevels = price
    ? [...levels].sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price))
    : levels;

  // Broken level count
  const brokenCount = Object.keys(levelBroken).length;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg p-2">
      {/* Header */}
      <div className="flex justify-between items-center mb-1.5 flex-shrink-0">
        <h3 className="text-[15px] font-bold text-white">MNQ Scalper</h3>
        {status?.timestamp && (
          <span className="text-[15px] text-gray-300">{new Date(status.timestamp).toLocaleTimeString()}</span>
        )}
        <div className={`px-1.5 py-0.5 rounded text-[15px] font-medium text-white ${badge.color}`}>
          {badge.text}
        </div>
      </div>

      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Trading Metrics Bar */}
        <div className="bg-gray-700 rounded p-1.5 mb-1.5 flex-shrink-0">
          <div className="flex items-center justify-between text-[15px]">
            <span className={`font-mono font-bold ${pnlColor}`}>
              {metrics.dayPnL > 0 ? '+' : ''}{metrics.dayPnL?.toFixed(1) || '0.0'} pts
            </span>
            <span className="text-gray-300">{metrics.dayTradeCount || 0} trades</span>
            <span className="text-gray-300 font-mono text-[13px]">
              Lim {metrics.dailyLossLimit}/{metrics.dailyTarget}
            </span>
          </div>
          {weekly.losingDays > 0 && (
            <div className="text-[13px] text-yellow-400 mt-0.5">
              Week: {weekly.losingDays}/{weekly.maxLosingDays + 1} losing days
            </div>
          )}
        </div>

        {/* Session Ranges */}
        <div className="bg-gray-700 rounded p-1.5 mb-1.5 flex-shrink-0">
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[13px]">
            <RangeRow label="PDH/PDL" high={priorDay.high} low={priorDay.low} price={price} />
            <RangeRow label="ON" high={overnight.high} low={overnight.low} price={price} />
            <RangeRow
              label={orb.complete ? 'ORB' : `ORB (${orb.candlesProcessed || 0}/15)`}
              high={orb.high}
              low={orb.low}
              price={price}
              forming={!orb.complete}
            />
            <RangeRow
              label={ib.complete ? 'IB' : `IB (${ib.candlesProcessed || 0}/30)`}
              high={ib.high}
              low={ib.low}
              price={price}
              forming={!ib.complete}
            />
            {internals?.vwap && (
              <div className="col-span-2 flex items-center gap-1">
                <span className="text-gray-400 w-14">VWAP</span>
                <span className="text-purple-400 font-mono">{internals.vwap.toFixed(2)}</span>
                {price && <span className="text-gray-500 ml-1">({(price - internals.vwap).toFixed(1)})</span>}
              </div>
            )}
            {internals?.rthOpen && (
              <div className="col-span-2 flex items-center gap-1">
                <span className="text-gray-400 w-14">Open</span>
                <span className="text-white font-mono">{internals.rthOpen.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Structural Levels Table */}
        <div className="bg-gray-700 rounded p-1.5 mb-1.5 flex-1 min-h-0 overflow-hidden flex flex-col">
          <div className="flex justify-between items-center mb-0.5 flex-shrink-0">
            <span className="text-[13px] text-gray-300">
              Levels ({levels.length})
              {brokenCount > 0 && <span className="text-red-400 ml-1">({brokenCount} broken)</span>}
            </span>
            <span className="text-[13px] text-gray-300">
              Prox: {params.proximity}pt
            </span>
          </div>
          <div className="overflow-y-auto flex-1 min-h-0">
            {sortedLevels.length > 0 ? (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-gray-400 text-left">
                    <th className="pr-1 font-normal">Type</th>
                    <th className="pr-1 font-normal text-right">Price</th>
                    <th className="pr-1 font-normal text-right">Dist</th>
                    <th className="font-normal text-center">Side</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedLevels.map((lvl, i) => {
                    const dist = price ? Math.abs(lvl.price - price) : null;
                    const withinProx = dist !== null && dist <= params.proximity;
                    return (
                      <LevelRow key={i} lvl={lvl} dist={dist} withinProx={withinProx} />
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="text-gray-500 text-[13px] text-center py-1">
                {!session.seeded ? 'Waiting for data...' : 'No levels (outside RTH?)'}
              </div>
            )}
          </div>
        </div>

        {/* Readiness / Blockers */}
        {readiness && (
          <div className="bg-gray-700 rounded p-1.5 mb-1.5 flex-shrink-0">
            <div className="flex justify-between items-center mb-0.5">
              <span className="text-[13px] text-gray-300">Readiness</span>
              {strategy?.cooldown?.in_cooldown && (
                <span className="text-[13px] text-yellow-400">
                  CD {strategy.cooldown.seconds_remaining}s
                </span>
              )}
            </div>
            <div className="space-y-0.5 text-[13px]">
              {readiness.conditions_met?.map((c, i) => (
                <div key={i} className="text-green-400">✓ {c}</div>
              ))}
              {readiness.blockers?.map((b, i) => (
                <div key={i} className="text-red-400">✗ {b}</div>
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
        {params.targetPoints && (
          <div className="flex gap-2 text-[13px] px-1 flex-shrink-0">
            <span><span className="text-gray-400">Tgt</span> <span className="text-green-400 font-mono">{params.targetPoints}pt</span></span>
            <span><span className="text-gray-400">Stp</span> <span className="text-red-400 font-mono">{params.stopPoints}pt</span></span>
            <span><span className="text-gray-400">Trail</span> <span className="text-cyan-400 font-mono">{params.trailingTrigger}/{params.trailingOffset}pt</span></span>
          </div>
        )}
      </div>
    </div>
  );
};

// === Sub-components ===

const RangeRow = ({ label, high, low, price, forming }) => {
  if (high == null || low == null) {
    return (
      <div className="flex items-center gap-1">
        <span className={`text-gray-400 w-14 ${forming ? 'text-yellow-500' : ''}`}>{label}</span>
        <span className="text-gray-600">---</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <span className={`w-14 ${forming ? 'text-yellow-500' : 'text-gray-400'}`}>{label}</span>
      <span className="text-cyan-400 font-mono">{low.toFixed(0)}</span>
      <span className="text-gray-500">-</span>
      <span className="text-orange-400 font-mono">{high.toFixed(0)}</span>
      {price && (high - low) > 0 && (
        <span className="text-gray-500 ml-auto">{(high - low).toFixed(0)}pt</span>
      )}
    </div>
  );
};

const LevelRow = ({ lvl, dist, withinProx }) => {
  const isBroken = lvl.broken;
  const sideColor = lvl.side === 'buy' ? 'text-green-400' : 'text-red-400';

  let rowClass = '';
  let statusIndicator = '';
  if (isBroken) {
    rowClass = 'bg-red-900/20 line-through opacity-60';
    statusIndicator = 'text-red-500';
  } else if (withinProx) {
    rowClass = 'bg-green-900/20';
    statusIndicator = 'text-green-400 animate-pulse';
  }

  return (
    <tr className={rowClass}>
      <td className="pr-1">
        <span className={isBroken ? 'text-red-400' : 'text-white'}>
          {TYPE_LABELS[lvl.type] || lvl.type}
        </span>
        {withinProx && !isBroken && <span className="ml-0.5 text-green-400">●</span>}
        {isBroken && <span className="ml-0.5 text-red-400">✗</span>}
      </td>
      <td className={`pr-1 font-mono text-right ${isBroken ? 'text-red-400' : 'text-white'}`}>
        {lvl.price.toFixed(2)}
      </td>
      <td className={`pr-1 font-mono text-right ${withinProx && !isBroken ? 'text-green-400 font-bold' : 'text-gray-400'}`}>
        {dist !== null ? dist.toFixed(1) : '---'}
      </td>
      <td className={`text-center ${sideColor}`}>
        {lvl.side === 'buy' ? 'B' : 'S'}
      </td>
    </tr>
  );
};

export default MnqScalperPanel;
