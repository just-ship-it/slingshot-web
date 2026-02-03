import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

const TradierGexLevelsPanel = () => {
  const [tradierData, setTradierData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch Tradier GEX levels
  const fetchTradierLevels = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getTradierGexLevels();

      if (data && (data.nqSpot || data.gammaFlip)) {
        setTradierData(data);
        setLastRefresh(new Date());
      } else if (data) {
        // Handle case where data exists but no levels
        setError('No Tradier GEX levels available');
      }
    } catch (err) {
      setError('Failed to fetch Tradier GEX levels');
      console.error('Error fetching Tradier GEX levels:', err);
    } finally {
      setLoading(false);
    }
  };

  // Force recalculation of Tradier GEX levels
  const handleRefreshTradierLevels = async () => {
    try {
      setRefreshing(true);
      setError(null);
      const data = await api.refreshTradierGexLevels();

      if (data && (data.nqSpot || data.gammaFlip)) {
        setTradierData(data);
        setLastRefresh(new Date());
      }
    } catch (err) {
      setError('Failed to refresh Tradier GEX levels');
      console.error('Error refreshing Tradier GEX levels:', err);
    } finally {
      setRefreshing(false);
    }
  };

  // Initial fetch and periodic refresh
  useEffect(() => {
    fetchTradierLevels();

    // Refresh every 3 minutes (Tradier updates more frequently)
    const interval = setInterval(fetchTradierLevels, 3 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  // Format levels for TradingView
  const formatForTradingView = () => {
    if (!tradierData) return '';

    // Extract values in the required order for Tradier data
    const values = [
      tradierData.gammaFlip || 0,  // zero_gamma/gamma_flip
      tradierData.callWall || 0,
      tradierData.putWall || 0,
      tradierData.resistance?.[0] || 0,  // r1
      tradierData.resistance?.[1] || 0,  // r2
      tradierData.resistance?.[2] || 0,  // r3
      tradierData.resistance?.[3] || 0,  // r4
      tradierData.resistance?.[4] || 0,  // r5
      tradierData.support?.[0] || 0,     // s1
      tradierData.support?.[1] || 0,     // s2
      tradierData.support?.[2] || 0,     // s3
      tradierData.support?.[3] || 0,     // s4
      tradierData.support?.[4] || 0      // s5
    ];

    return values.join(',');
  };

  // Copy to clipboard
  const handleCopyToClipboard = async () => {
    const text = formatForTradingView();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Format timestamp
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Unknown';

    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hours ago`;

    return date.toLocaleString();
  };

  // Format level value
  const formatLevelValue = (value) => {
    if (value === null || value === undefined) return '—';
    return Number(value).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  };

  // Format GEX value in billions
  const formatGexValue = (value) => {
    if (value === null || value === undefined) return '—';
    const billions = Number(value);
    return billions.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + 'B';
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

  if (loading && !tradierData) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-3">Tradier GEX Levels</h3>
        <div className="text-gray-400 text-sm">Loading Tradier GEX levels...</div>
      </div>
    );
  }

  if (error && !tradierData) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-3">Tradier GEX Levels</h3>
        <div className="text-red-400 text-sm">{error}</div>
        <button
          onClick={fetchTradierLevels}
          className="mt-2 px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-semibold text-white">Tradier GEX Levels</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">
            {tradierData?.timestamp ? formatTimestamp(tradierData.timestamp) : 'No timestamp'}
          </span>
          <button
            onClick={fetchTradierLevels}
            className="p-1 text-gray-400 hover:text-white transition-colors"
            title="Quick refresh (cached)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={handleRefreshTradierLevels}
            disabled={refreshing}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              refreshing
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
            title="Recalculate Tradier GEX levels (fresh data)"
          >
            {refreshing ? 'Refreshing...' : 'Recalculate'}
          </button>
        </div>
      </div>

      {tradierData ? (
        <>
          {/* Spot Prices and Total GEX */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-gray-700 rounded p-2">
              <div className="text-xs text-gray-400 mb-1">NQ Spot</div>
              <div className="text-sm font-mono text-blue-400">
                {formatLevelValue(tradierData.nqSpot)}
              </div>
            </div>
            <div className="bg-gray-700 rounded p-2">
              <div className="text-xs text-gray-400 mb-1">Total GEX</div>
              <div className={`text-sm font-mono ${getRegimeColor(tradierData.regime)}`}>
                {formatGexValue(tradierData.totalGex)}
              </div>
            </div>
          </div>

          {/* Main levels */}
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="bg-gray-700 rounded p-2">
              <div className="text-xs text-gray-400 mb-1">Gamma Flip</div>
              <div className="text-sm font-mono text-yellow-400">
                {formatLevelValue(tradierData.gammaFlip)}
              </div>
            </div>
            <div className="bg-gray-700 rounded p-2">
              <div className="text-xs text-gray-400 mb-1">Call Wall</div>
              <div className="text-sm font-mono text-green-400">
                {formatLevelValue(tradierData.callWall)}
              </div>
            </div>
            <div className="bg-gray-700 rounded p-2">
              <div className="text-xs text-gray-400 mb-1">Put Wall</div>
              <div className="text-sm font-mono text-red-400">
                {formatLevelValue(tradierData.putWall)}
              </div>
            </div>
          </div>

          {/* Resistance and Support levels */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-gray-700 rounded p-2">
              <div className="text-xs text-gray-400 mb-1">Resistance</div>
              <div className="space-y-1">
                {[0, 1, 2, 3, 4].map(i => (
                  <div key={`r${i+1}`} className="flex justify-between text-xs">
                    <span className="text-gray-500">R{i+1}:</span>
                    <span className="font-mono text-orange-400">
                      {formatLevelValue(tradierData.resistance?.[i])}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-gray-700 rounded p-2">
              <div className="text-xs text-gray-400 mb-1">Support</div>
              <div className="space-y-1">
                {[0, 1, 2, 3, 4].map(i => (
                  <div key={`s${i+1}`} className="flex justify-between text-xs">
                    <span className="text-gray-500">S{i+1}:</span>
                    <span className="font-mono text-cyan-400">
                      {formatLevelValue(tradierData.support?.[i])}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Copy to clipboard button */}
          <button
            onClick={handleCopyToClipboard}
            className={`w-full py-2 px-3 rounded text-sm font-medium transition-colors ${
              copied
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
            }`}
          >
            {copied ? (
              <>
                <svg className="inline-block w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Copied to Clipboard!
              </>
            ) : (
              <>
                <svg className="inline-block w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy for TradingView
              </>
            )}
          </button>

          {/* Data source info and regime */}
          <div className="mt-2 text-xs text-gray-500 text-center">
            Source: Tradier • 0-30 DTE Options • QQQ/NQ Conversion
            {tradierData.regime && (
              <span> • Regime: <span className={getRegimeColor(tradierData.regime)}>
                {tradierData.regime.toUpperCase()}
              </span></span>
            )}
            <br />
            <span className="text-gray-600">
              {tradierData.dataSource === 'tradier' ? '⚡ Fast Updates (3min)' : '📊 Comprehensive Data'}
              {tradierData.usedLivePrices && ' • Live Prices'}
            </span>
          </div>
        </>
      ) : (
        <div className="text-gray-400 text-sm">No Tradier data available</div>
      )}
    </div>
  );
};

export default TradierGexLevelsPanel;