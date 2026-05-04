import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import PositionBanner from './PositionBanner';

const RULES = [
  { id: 'L1', side: 'LONG',  desc: 'putWall<=50 + iv.low + skew>+0.015',  stop: 113, tgt: 198 },
  { id: 'L4', side: 'LONG',  desc: 'gex.neutral + above flip + iv.low',    stop: 106, tgt: 187 },
  { id: 'L3', side: 'LONG',  desc: 'gex.strong_neg + above flip',          stop: 184, tgt: 278 },
  { id: 'S3', side: 'SHORT', desc: 'callWall<=50 + below flip',            stop: 114, tgt: 196 },
  { id: 'S1', side: 'SHORT', desc: 'callWall<=50 + iv.high + skew>+0.015', stop: 131, tgt: 211 },
  { id: 'S2', side: 'SHORT', desc: 'callWall<=50 + iv.high',               stop: 129, tgt: 211 },
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

const GexFlipIvpctPanel = ({ socket, quotes }) => {
  const [status, setStatus] = useState(null);
  const [ivData, setIvData] = useState(null);
  const [gexLevels, setGexLevels] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [etNow, setEtNow] = useState(getEtNow());

  useEffect(() => {
    const t = setInterval(() => setEtNow(getEtNow()), 30_000);
    return () => clearInterval(t);
  }, []);

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
  const inEntryWindow = etNow.weekday !== 'Sat' && etNow.weekday !== 'Sun' && etNow.hour >= startH && etNow.hour < endH;
  const pastEodCutoff = etNow.weekday !== 'Sat' && etNow.weekday !== 'Sun' && (etNow.hour > 16 || (etNow.hour === 16 && etNow.minute >= 40));

  const nqPrice = quotes?.NQ?.last || quotes?.MNQ?.last || quotes?.NQ?.close;
  const skew = ivData?.skew ?? null;
  const ivVal = ivData?.iv ?? null;
  const ivPctile = internals.ivPercentile ?? null;
  const regime = gexLevels?.regime ?? null;
  const callWall = gexLevels?.call_wall ?? gexLevels?.callWall ?? null;
  const putWall = gexLevels?.put_wall ?? gexLevels?.putWall ?? null;
  const gammaFlip = gexLevels?.gamma_flip ?? gexLevels?.gammaFlip ?? null;

  // Per-rule fire check (mirrors strategy logic for visibility)
  const ruleFires = (id) => {
    if (!nqPrice) return false;
    const wallProx = internals.wallProximity ?? 50;
    const ivLow = (internals.ivPctileLowMax ?? 0.20);
    const ivHigh = (internals.ivPctileHighMin ?? 0.80);
    const skewMin = (internals.skewPositiveMin ?? 0.015);
    switch (id) {
      case 'L1': return putWall != null && Math.abs(nqPrice - putWall) <= wallProx && ivPctile != null && ivPctile <= ivLow && skew != null && skew > skewMin;
      case 'L4': return regime === 'neutral' && gammaFlip != null && (nqPrice - gammaFlip) > 0 && ivPctile != null && ivPctile <= ivLow;
      case 'L3': return regime === 'strong_negative' && gammaFlip != null && (nqPrice - gammaFlip) > 0;
      case 'S3': return callWall != null && Math.abs(nqPrice - callWall) <= wallProx && gammaFlip != null && (nqPrice - gammaFlip) < 0;
      case 'S1': return callWall != null && Math.abs(nqPrice - callWall) <= wallProx && ivPctile != null && ivPctile >= ivHigh && skew != null && skew > skewMin;
      case 'S2': return callWall != null && Math.abs(nqPrice - callWall) <= wallProx && ivPctile != null && ivPctile >= ivHigh;
      default: return false;
    }
  };

  const firingRule = RULES.find(r => ruleFires(r.id));

  const getBadge = () => {
    if (position?.side) return { color: position.side === 'long' ? 'bg-green-600' : 'bg-red-600', text: position.side.toUpperCase() };
    if (pastEodCutoff) return { color: 'bg-orange-700', text: 'EOD-FLAT' };
    if (!inEntryWindow) return { color: 'bg-gray-600', text: 'OUT-OF-WINDOW' };
    if (firingRule) return { color: firingRule.side === 'LONG' ? 'bg-green-700' : 'bg-red-700', text: `${firingRule.id} ARMED` };
    return { color: 'bg-blue-700', text: 'WATCHING' };
  };
  const badge = getBadge();

  const evalLog = internals.evaluationLog || [];

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg p-2">
      <div className="flex justify-between items-center mb-1.5 flex-shrink-0">
        <h3 className="text-[15px] font-bold text-white">GEX-FLIP-IVPCT</h3>
        <div className={`px-1.5 py-0.5 rounded text-[15px] font-medium text-white ${badge.color}`}>{badge.text}</div>
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
            <span className={`font-mono ${pastEodCutoff ? 'text-orange-400' : 'text-gray-400'}`}>
              16:40 ET {pastEodCutoff ? '(triggered)' : ''}
            </span>
          </div>
        </div>

        {/* Feature snapshot */}
        <div className="bg-gray-700 rounded p-1.5 mb-1.5">
          <div className="grid grid-cols-2 gap-x-2 text-[15px]">
            <div className="flex justify-between"><span className="text-gray-300">IV</span><span className="text-white font-mono">{ivVal != null ? `${(ivVal*100).toFixed(1)}%` : '--'}</span></div>
            <div className="flex justify-between"><span className="text-gray-300">Skew</span><span className={`font-mono ${skew != null && skew > 0.015 ? 'text-yellow-300' : 'text-white'}`}>{skew != null ? `${(skew*100).toFixed(2)}%` : '--'}</span></div>
            <div className="flex justify-between"><span className="text-gray-300">IV %ile</span><span className={`font-mono ${ivPctile != null && ivPctile <= 0.20 ? 'text-green-400' : ivPctile != null && ivPctile >= 0.80 ? 'text-red-400' : 'text-white'}`}>{ivPctile != null ? `${(ivPctile*100).toFixed(0)}%` : '--'}</span></div>
            <div className="flex justify-between"><span className="text-gray-300">Regime</span><span className="text-white font-mono text-[13px]">{regime || '--'}</span></div>
            <div className="flex justify-between"><span className="text-gray-300">PutWall</span><span className="text-white font-mono">{putWall != null ? putWall.toFixed(0) : '--'}</span></div>
            <div className="flex justify-between"><span className="text-gray-300">CallWall</span><span className="text-white font-mono">{callWall != null ? callWall.toFixed(0) : '--'}</span></div>
            <div className="flex justify-between"><span className="text-gray-300">GammaFlip</span><span className="text-white font-mono">{gammaFlip != null ? gammaFlip.toFixed(0) : '--'}</span></div>
            <div className="flex justify-between"><span className="text-gray-300">NQ</span><span className="text-white font-mono">{nqPrice != null ? nqPrice.toFixed(2) : '--'}</span></div>
          </div>
        </div>

        {/* Rules table */}
        <div className="bg-gray-700 rounded p-1.5 mb-1.5">
          <div className="grid grid-cols-[auto_auto_1fr_auto] gap-x-2 text-[15px] mb-0.5">
            <span className="text-gray-400 font-medium">Rule</span>
            <span className="text-gray-400 font-medium">Side</span>
            <span className="text-gray-400 font-medium">Conditions</span>
            <span className="text-gray-400 font-medium text-right">Stop / Tgt</span>
          </div>
          {RULES.map(r => {
            const fires = ruleFires(r.id);
            const rowBg = fires
              ? r.side === 'LONG' ? 'bg-green-900/40 border-green-600/50' : 'bg-red-900/40 border-red-600/50'
              : 'border-gray-600';
            return (
              <div key={r.id} className={`grid grid-cols-[auto_auto_1fr_auto] gap-x-2 text-[15px] py-0.5 border-t ${rowBg} ${fires ? 'rounded px-1 -mx-1' : ''}`}>
                <span className={`font-mono font-bold ${fires ? 'text-white' : 'text-gray-300'}`}>{r.id}</span>
                <span className={`font-mono ${r.side === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>{r.side}</span>
                <span className={`text-[13px] ${fires ? 'text-white' : 'text-gray-400'}`}>{r.desc}</span>
                <span className="text-gray-300 font-mono text-right">{r.stop} / {r.tgt}</span>
              </div>
            );
          })}
        </div>

        {/* Recent eval log */}
        {evalLog.length > 0 && (
          <div className="bg-gray-700 rounded p-1.5 mb-1.5">
            <div className="text-gray-400 text-[15px] mb-1">Recent evaluations</div>
            {evalLog.slice(-5).map((e, i) => (
              <div key={i} className="grid grid-cols-[auto_auto_1fr] gap-x-2 text-[13px] py-0.5">
                <span className="text-gray-500 font-mono">{e.time}</span>
                <span className="text-gray-300 font-mono">{e.price?.toFixed(2)}</span>
                <span className={`${e.fired ? 'text-green-400 font-bold' : 'text-gray-400'}`}>{e.result}</span>
              </div>
            ))}
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
