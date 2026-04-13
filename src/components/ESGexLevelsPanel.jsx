import React, { useState } from 'react';
import { api } from '../services/api';

const ESGexLevelsPanel = ({ gexData, onRefresh }) => {
  const [copied, setCopied] = useState(null); // 'combined', 'cboe', 'tradier'
  const [refreshing, setRefreshing] = useState(false);

  // Extract data from props
  const cboeData = gexData?.cboe;
  const tradierData = gexData?.tradier;
  const loading = !gexData?.cboe && !gexData?.tradier;

  // Force recalculation
  const handleRecalculate = async () => {
    try {
      setRefreshing(true);
      await Promise.all([
        api.refreshEsGexLevels().catch(() => null),
        api.refreshEsTradierGexLevels().catch(() => null)
      ]);
      // Trigger parent refresh to update shared state
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Error recalculating ES GEX levels:', err);
    } finally {
      setRefreshing(false);
    }
  };

  // Format level value
  const formatLevel = (value) => {
    if (value === null || value === undefined) return '\u2014';
    return Number(value).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  };

  // Format GEX value in billions
  const formatGex = (value) => {
    if (value === null || value === undefined) return '\u2014';
    const billions = Number(value) / 1_000_000_000;
    return billions.toFixed(2) + 'B';
  };

  // Get regime color
  const getRegimeColor = (regime) => {
    switch (regime?.toLowerCase()) {
      case 'positive':
      case 'strong_positive':
        return 'text-green-400';
      case 'negative':
      case 'strong_negative':
        return 'text-red-400';
      default:
        return 'text-yellow-400';
    }
  };

  // Copy functions
  const formatCboeValues = () => {
    const levels = cboeData?.levels || {};
    return [
      levels.gamma_flip || levels.zero_gamma || 0,
      levels.call_wall || 0,
      levels.put_wall || 0,
      ...(levels.resistance || [0, 0, 0, 0, 0]).slice(0, 5),
      ...(levels.support || [0, 0, 0, 0, 0]).slice(0, 5)
    ].map(v => v || 0).join(',');
  };

  const formatTradierValues = () => {
    return [
      tradierData?.gammaFlip || 0,
      tradierData?.callWall || 0,
      tradierData?.putWall || 0,
      ...(tradierData?.resistance || [0, 0, 0, 0, 0]).slice(0, 5),
      ...(tradierData?.support || [0, 0, 0, 0, 0]).slice(0, 5)
    ].map(v => v || 0).join(',');
  };

  const handleCopy = async (type) => {
    let text;
    if (type === 'combined') {
      text = formatCboeValues() + ',' + formatTradierValues();
    } else if (type === 'cboe') {
      text = formatCboeValues();
    } else {
      text = formatTradierValues();
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Get values for comparison
  const getCboeValue = (key) => {
    const levels = cboeData?.levels;
    if (!levels) return null;
    if (key === 'zeroGamma') return levels.gamma_flip || levels.zero_gamma;
    if (key === 'callWall') return levels.call_wall;
    if (key === 'putWall') return levels.put_wall;
    if (key.startsWith('r')) return levels.resistance?.[parseInt(key.slice(1)) - 1];
    if (key.startsWith('s')) return levels.support?.[parseInt(key.slice(1)) - 1];
    return null;
  };

  const getTradierValue = (key) => {
    if (!tradierData) return null;
    if (key === 'zeroGamma') return tradierData.gammaFlip;
    if (key === 'callWall') return tradierData.callWall;
    if (key === 'putWall') return tradierData.putWall;
    if (key.startsWith('r')) return tradierData.resistance?.[parseInt(key.slice(1)) - 1];
    if (key.startsWith('s')) return tradierData.support?.[parseInt(key.slice(1)) - 1];
    return null;
  };

  // Main levels
  const mainLevels = [
    { key: 'callWall', label: 'Call Wall', color: 'text-red-400' },
    { key: 'zeroGamma', label: 'Zero Gamma', color: 'text-yellow-400' },
    { key: 'putWall', label: 'Put Wall', color: 'text-green-400' },
  ];


  if (loading && !cboeData && !tradierData) {
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-b-lg p-2">
        <h3 className="text-xs font-bold text-white mb-2">ES GEX Levels</h3>
        <div className="text-gray-300 text-[13px]">Loading ES GEX levels...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-800 rounded-b-lg p-2">
      {/* Header */}
      <div className="flex justify-between items-center mb-1.5 flex-shrink-0">
        <h3 className="text-xs font-bold text-white">ES GEX Levels</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="p-0.5 text-gray-300 hover:text-white transition-colors"
            title="Quick refresh"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={handleRecalculate}
            disabled={refreshing}
            className={`px-1.5 py-0.5 text-xs rounded transition-colors ${
              refreshing
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {refreshing ? '...' : 'Recalculate'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-gray-300 text-[13px]">Loading ES GEX levels...</div>
      ) : (
        <>
          {/* Status Row */}
          <div className="flex items-center justify-between text-[13px] mb-1.5 px-1">
            <span className="text-gray-300">
              GEX: <span className={`font-mono font-semibold ${getRegimeColor(tradierData?.regime)}`}>{formatGex(tradierData?.totalGex)}</span>
            </span>
            {tradierData?.regime && (
              <span className={`font-semibold ${getRegimeColor(tradierData.regime)}`}>
                {tradierData.regime.toUpperCase()}
              </span>
            )}
          </div>

          {/* Compact Levels */}
          <div className="space-y-1 text-[12px]">
            {/* Key levels: CW / ZG / PW */}
            <div className="grid grid-cols-3 gap-1">
              {mainLevels.map(row => (
                <div key={row.key} className="bg-gray-700 rounded px-1.5 py-0.5 text-center">
                  <div className="text-gray-400 text-[10px]">{row.label}</div>
                  <div className={`font-mono font-semibold ${row.color}`}>{formatLevel(getTradierValue(row.key) || getCboeValue(row.key))}</div>
                </div>
              ))}
            </div>
            {/* Resistance levels - inline */}
            <div className="bg-gray-700/50 rounded px-1.5 py-0.5">
              <span className="text-orange-400 font-medium">R: </span>
              <span className="font-mono text-orange-400">
                {[1, 2, 3, 4, 5].map(n => formatLevel(getTradierValue(`r${n}`) || getCboeValue(`r${n}`))).filter(v => v !== '\u2014').join(' · ')}
              </span>
            </div>
            {/* Support levels - inline */}
            <div className="bg-gray-700/50 rounded px-1.5 py-0.5">
              <span className="text-cyan-400 font-medium">S: </span>
              <span className="font-mono text-cyan-400">
                {[1, 2, 3, 4, 5].map(n => formatLevel(getTradierValue(`s${n}`) || getCboeValue(`s${n}`))).filter(v => v !== '\u2014').join(' · ')}
              </span>
            </div>
          </div>

          {/* Copy Button */}
          <div className="mt-1.5">
            <button
              onClick={() => handleCopy('tradier')}
              className={`w-full py-1 px-1.5 text-xs rounded transition-colors ${
                copied === 'tradier'
                  ? 'bg-green-600 text-white'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {copied === 'tradier' ? 'Copied!' : 'Copy Levels'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default ESGexLevelsPanel;
