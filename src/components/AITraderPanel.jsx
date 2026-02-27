import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

const BIAS_COLORS = {
  BULLISH: 'text-green-400',
  BEARISH: 'text-red-400',
  NEUTRAL: 'text-yellow-400',
};

const BIAS_BG = {
  BULLISH: 'bg-green-900/40',
  BEARISH: 'bg-red-900/40',
  NEUTRAL: 'bg-yellow-900/40',
};

const BIAS_DOT_COLORS = {
  BULLISH: 'bg-green-400',
  BEARISH: 'bg-red-400',
  NEUTRAL: 'bg-yellow-400',
};

const ACTION_COLORS = {
  buy: 'text-green-400',
  sell: 'text-red-400',
  watch: 'text-yellow-400',
};

const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';

const ConvictionDots = ({ conviction, direction, max = 5 }) => {
  const activeColor = BIAS_DOT_COLORS[direction?.toUpperCase()] || 'bg-gray-400';
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <div
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${i < conviction ? activeColor : 'bg-gray-600'}`}
        />
      ))}
    </div>
  );
};

const AITraderPanel = () => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reassessing, setReassessing] = useState(false);

  const fetchStatus = async () => {
    try {
      const response = await api.getAITraderStatus();
      if (response) setStatus(response);
    } catch (err) {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const handleReassessBias = async () => {
    setReassessing(true);
    try {
      await api.triggerBiasReassessment();
      await fetchStatus();
    } catch (err) {
      console.error('Bias reassessment failed:', err);
    } finally {
      setReassessing(false);
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
        <h3 className="text-[15px] font-bold text-white mb-2">AI Trader</h3>
        <div className="text-gray-400 text-[15px]">Loading...</div>
      </div>
    );
  }

  // Service not running
  if (!status || status.success === false) {
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg p-2">
        <h3 className="text-[15px] font-bold text-white mb-2">AI Trader</h3>
        <div className="text-yellow-400 text-[15px] mb-1">Service not running</div>
        <div className="text-gray-500 text-[15px]">{status?.message || 'siggen-nq-aitrader may not be running'}</div>
      </div>
    );
  }

  const { strategy, data_readiness, trading_day, position, cost, trading_window } = status;
  const bias = trading_day?.bias;
  const lastEval = trading_day?.lastEntryEvaluation;
  const biasHistory = trading_day?.biasHistory || [];
  const latestBiasEntry = biasHistory[biasHistory.length - 1];
  const windowBlockers = trading_window?.blockers || [];

  // Data not ready yet
  if (!data_readiness?.all_ready) {
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg p-2">
        <div className="flex justify-between items-center mb-1.5 flex-shrink-0">
          <h3 className="text-[15px] font-bold text-white">AI Trader</h3>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-gray-500">{strategy?.model}</span>
            {strategy?.dryRun && <span className="text-[10px] bg-yellow-700 text-yellow-200 px-1 rounded">DRY</span>}
          </div>
        </div>
        <div className="text-yellow-400 text-[15px] mb-1">Awaiting data</div>
        <div className="space-y-0.5 text-[15px]">
          <div className={data_readiness?.history_1m ? 'text-green-400' : 'text-gray-500'}>
            {data_readiness?.history_1m ? '\u2713' : '\u2717'} 1m history
          </div>
          <div className={data_readiness?.history_1h ? 'text-green-400' : 'text-gray-500'}>
            {data_readiness?.history_1h ? '\u2713' : '\u2717'} 1h history
          </div>
          <div className={data_readiness?.gex ? 'text-green-400' : 'text-gray-500'}>
            {data_readiness?.gex ? '\u2713' : '\u2717'} GEX levels
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-lg p-2">
      {/* Header */}
      <div className="flex justify-between items-center mb-1.5 flex-shrink-0">
        <h3 className="text-[15px] font-bold text-white">AI Trader</h3>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-gray-500">{strategy?.model}</span>
          {strategy?.dryRun && <span className="text-[10px] bg-yellow-700 text-yellow-200 px-1 rounded">DRY</span>}
          {strategy?.enabled
            ? <span className="text-[10px] bg-green-800 text-green-300 px-1 rounded">ON</span>
            : <span className="text-[10px] bg-red-800 text-red-300 px-1 rounded">OFF</span>
          }
        </div>
      </div>

      <div className="flex flex-col flex-1 justify-between min-h-0">
        {/* Bias Section */}
        {bias ? (
          <div className={`rounded p-1.5 mb-1.5 ${BIAS_BG[bias.direction] || 'bg-gray-700'}`}>
            <div className="flex justify-between items-center mb-0.5">
              <div className="flex items-center gap-1.5">
                <span className={`text-[15px] font-bold ${BIAS_COLORS[bias.direction] || 'text-gray-400'}`}>
                  {capitalize(bias.direction)}
                </span>
                <ConvictionDots conviction={bias.conviction} direction={bias.direction} />
              </div>
              <div className="flex items-center gap-1.5">
                {latestBiasEntry && (
                  <span className="text-[11px] text-gray-400">{latestBiasEntry.time} · {capitalize(latestBiasEntry.source?.replace('-', ' '))}</span>
                )}
                <button
                  onClick={handleReassessBias}
                  disabled={reassessing}
                  className="text-[10px] bg-gray-600 hover:bg-gray-500 text-gray-300 px-1.5 py-0.5 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {reassessing ? 'Reassessing...' : 'Reassess'}
                </button>
              </div>
            </div>
            {bias.reasoning && (
              <div className="text-[12px] text-gray-300 leading-tight max-h-[60px] overflow-y-auto scrollbar-thin">
                {bias.reasoning}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-gray-700 rounded p-1.5 mb-1.5">
            <div className="flex justify-between items-center">
              <div className="text-[15px] text-gray-400">Awaiting bias formation</div>
              <button
                onClick={handleReassessBias}
                disabled={reassessing}
                className="text-[10px] bg-gray-600 hover:bg-gray-500 text-gray-300 px-1.5 py-0.5 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {reassessing ? 'Forming...' : 'Form Bias'}
              </button>
            </div>
            <div className="text-[12px] text-gray-500">Bias forms at 9:25 AM ET</div>
          </div>
        )}

        {/* Key Levels to Watch */}
        {bias?.key_levels_to_watch?.length > 0 && (
          <div className="bg-gray-700 rounded p-1.5 mb-1.5">
            <div className="text-[11px] text-gray-400 mb-0.5">KEY LEVELS</div>
            <div className="space-y-0.5">
              {bias.key_levels_to_watch.map((kl, i) => {
                const action = kl.action?.toLowerCase() || '';
                const actionColor = ACTION_COLORS[action] || 'text-gray-300';
                return (
                  <div key={i} className="flex justify-between text-[12px]">
                    <span className="text-white font-mono">{kl.price?.toFixed?.(1) || kl.price}</span>
                    <span className="text-gray-400">{kl.type}</span>
                    <span className={`font-medium ${actionColor}`}>{capitalize(action)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Latest Entry Evaluation */}
        {lastEval && (
          <div className="bg-gray-700 rounded p-1.5 mb-1.5">
            <div className="flex justify-between items-center mb-0.5">
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-gray-400">LATEST EVAL</span>
                {lastEval.action === 'enter' ? (
                  <span className="text-[10px] bg-green-700 text-green-200 px-1 rounded font-medium">
                    ENTER {lastEval.side?.toUpperCase()}
                  </span>
                ) : (
                  <span className="text-[10px] bg-gray-600 text-gray-300 px-1 rounded">PASS</span>
                )}
              </div>
              <span className="text-[11px] text-gray-500">{lastEval.time}</span>
            </div>
            {lastEval.action === 'enter' && lastEval.entry_price && (
              <div className="flex gap-2 text-[12px] font-mono mb-0.5">
                <span className="text-white">Entry: {lastEval.entry_price?.toFixed(2)}</span>
                <span className="text-red-400">Stop: {lastEval.stop_loss?.toFixed(2)}</span>
                <span className="text-green-400">Target: {lastEval.take_profit?.toFixed(2)}</span>
              </div>
            )}
            {lastEval.reasoning && (
              <div className="text-[12px] text-gray-300 leading-tight max-h-[45px] overflow-y-auto scrollbar-thin mb-0.5">
                {lastEval.reasoning}
              </div>
            )}
            <div className="flex gap-2 text-[11px] text-gray-400 flex-wrap">
              {lastEval.nearestLevel && (
                <span>Near: {lastEval.nearestLevel.label} @ {lastEval.nearestLevel.price?.toFixed?.(1)}</span>
              )}
              {lastEval.confidence && <span>Conf: {lastEval.confidence}/5</span>}
              {lastEval.riskRewardRatio && <span>R:R {lastEval.riskRewardRatio}:1</span>}
            </div>
          </div>
        )}

        {/* Position State */}
        {position?.in_position && position.current && (
          <div className="bg-yellow-900/30 border border-yellow-600 rounded px-1.5 py-1 mb-1.5 text-[15px]">
            <span className="text-yellow-400 font-semibold">IN POSITION</span>
            <span className="text-gray-300 ml-2">
              {position.current.side?.toUpperCase()} {position.current.symbol} @ {position.current.entry_price?.toFixed(2)}
            </span>
          </div>
        )}

        {/* Trading Restrictions */}
        {windowBlockers.length > 0 && (
          <div className="bg-gray-700 rounded p-1.5 mb-1.5">
            <div className="space-y-0.5 text-[12px]">
              {windowBlockers.map((b, i) => (
                <div key={i} className="text-yellow-400">{b}</div>
              ))}
            </div>
          </div>
        )}

        {/* Stats Footer */}
        <div className="flex gap-2 text-[11px] text-gray-500 mt-auto pt-1">
          <span>E:{trading_day?.entries || 0}</span>
          <span>L:{trading_day?.losses || 0}</span>
          <span>LLM:{trading_day?.llmCalls || 0}</span>
          {cost?.estimatedCostUSD && <span>${cost.estimatedCostUSD}</span>}
        </div>
      </div>
    </div>
  );
};

export default AITraderPanel;
