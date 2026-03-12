import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

const GexLevelsPanel = () => {
  const [gexData, setGexData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch GEX levels
  const fetchGexLevels = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getGexLevels();

      if (data && data.levels) {
        setGexData(data);
        setLastRefresh(new Date());
      } else if (data) {
        // Handle case where data exists but no levels
        setError('No GEX levels available');
      }
    } catch (err) {
      setError('Failed to fetch GEX levels');
      console.error('Error fetching GEX levels:', err);
    } finally {
      setLoading(false);
    }
  };

  // Force recalculation of GEX levels
  const handleRefreshGexLevels = async () => {
    try {
      setRefreshing(true);
      setError(null);
      const data = await api.refreshGexLevels();

      if (data && data.levels) {
        setGexData({ levels: data.levels, timestamp: data.timestamp });
        setLastRefresh(new Date());
      }
    } catch (err) {
      setError('Failed to refresh GEX levels');
      console.error('Error refreshing GEX levels:', err);
    } finally {
      setRefreshing(false);
    }
  };

  // Initial fetch and periodic refresh
  useEffect(() => {
    fetchGexLevels();

    // Refresh every 5 minutes
    const interval = setInterval(fetchGexLevels, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  // Format levels for TradingView (legacy single source)
  const formatForTradingView = () => {
    if (!gexData || !gexData.levels) return '';

    const levels = gexData.levels;

    // Extract values in the required order
    // Backend returns resistance and support as arrays
    const values = [
      levels.gamma_flip || levels.zero_gamma || 0,  // zero_gamma/gamma_flip
      levels.call_wall || 0,
      levels.put_wall || 0,
      levels.resistance?.[0] || 0,  // r1
      levels.resistance?.[1] || 0,  // r2
      levels.resistance?.[2] || 0,  // r3
      levels.resistance?.[3] || 0,  // r4
      levels.resistance?.[4] || 0,  // r5
      levels.support?.[0] || 0,     // s1
      levels.support?.[1] || 0,     // s2
      levels.support?.[2] || 0,     // s3
      levels.support?.[3] || 0,     // s4
      levels.support?.[4] || 0      // s5
    ];

    return values.join(',');
  };

  // Format combined CBOE and Schwab data for TradingView (new dual source format)
  const formatCombinedForTradingView = async () => {
    try {
      // Fetch both CBOE and Schwab data
      const [cboeData, tradierData] = await Promise.all([
        api.getGexLevels(),
        api.getTradierGexLevels()
      ]);

      // Extract CBOE levels
      const cboe = cboeData?.levels || {};
      const cboeValues = [
        cboe.gamma_flip || cboe.zero_gamma || 0,
        cboe.call_wall || 0,
        cboe.put_wall || 0,
        cboe.resistance?.[0] || 0,
        cboe.resistance?.[1] || 0,
        cboe.resistance?.[2] || 0,
        cboe.resistance?.[3] || 0,
        cboe.resistance?.[4] || 0,
        cboe.support?.[0] || 0,
        cboe.support?.[1] || 0,
        cboe.support?.[2] || 0,
        cboe.support?.[3] || 0,
        cboe.support?.[4] || 0
      ];

      // Extract Schwab levels (using consistent naming)
      const tradierValues = [
        tradierData?.gammaFlip || 0,
        tradierData?.callWall || 0,
        tradierData?.putWall || 0,
        tradierData?.resistance?.[0] || 0,
        tradierData?.resistance?.[1] || 0,
        tradierData?.resistance?.[2] || 0,
        tradierData?.resistance?.[3] || 0,
        tradierData?.resistance?.[4] || 0,
        tradierData?.support?.[0] || 0,
        tradierData?.support?.[1] || 0,
        tradierData?.support?.[2] || 0,
        tradierData?.support?.[3] || 0,
        tradierData?.support?.[4] || 0
      ];

      // Combine: CBOE first (0-12), then Schwab (13-25)
      return [...cboeValues, ...tradierValues].join(',');
    } catch (error) {
      console.error('Failed to fetch combined GEX data:', error);
      // Fallback to CBOE only
      return formatForTradingView();
    }
  };

  // Copy to clipboard (legacy format)
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

  // Copy combined format to clipboard
  const handleCopyCombinedToClipboard = async () => {
    try {
      const text = await formatCombinedForTradingView();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy combined format:', err);
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

  if (loading && !gexData) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-3">GEX Levels</h3>
        <div className="text-gray-400 text-sm">Loading GEX levels...</div>
      </div>
    );
  }

  if (error && !gexData) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-3">GEX Levels</h3>
        <div className="text-red-400 text-sm">{error}</div>
        <button
          onClick={fetchGexLevels}
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
        <h3 className="text-lg font-semibold text-white">GEX Levels</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">
            {gexData?.timestamp ? formatTimestamp(gexData.timestamp) : 'No timestamp'}
          </span>
          <button
            onClick={fetchGexLevels}
            className="p-1 text-gray-400 hover:text-white transition-colors"
            title="Quick refresh (cached)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={handleRefreshGexLevels}
            disabled={refreshing}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              refreshing
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
            title="Recalculate GEX levels (fresh data)"
          >
            {refreshing ? 'Refreshing...' : 'Recalculate'}
          </button>
        </div>
      </div>

      {gexData && gexData.levels ? (
        <>
          {/* Main levels */}
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="bg-gray-700 rounded p-2">
              <div className="text-xs text-gray-400 mb-1">Zero Gamma</div>
              <div className="text-sm font-mono text-yellow-400">
                {formatLevelValue(gexData.levels.gamma_flip || gexData.levels.zero_gamma)}
              </div>
            </div>
            <div className="bg-gray-700 rounded p-2">
              <div className="text-xs text-gray-400 mb-1">Call Wall</div>
              <div className="text-sm font-mono text-green-400">
                {formatLevelValue(gexData.levels.call_wall)}
              </div>
            </div>
            <div className="bg-gray-700 rounded p-2">
              <div className="text-xs text-gray-400 mb-1">Put Wall</div>
              <div className="text-sm font-mono text-red-400">
                {formatLevelValue(gexData.levels.put_wall)}
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
                      {formatLevelValue(gexData.levels.resistance?.[i])}
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
                      {formatLevelValue(gexData.levels.support?.[i])}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Copy to clipboard buttons */}
          <div className="grid grid-cols-1 gap-2">
            {/* Combined format (CBOE + Schwab) */}
            <button
              onClick={handleCopyCombinedToClipboard}
              className={`w-full py-2 px-3 rounded text-sm font-medium transition-colors ${
                copied
                  ? 'bg-green-600 text-white'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
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
                  Combined (CBOE + Schwab)
                </>
              )}
            </button>

            {/* CBOE only format */}
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
                  📋 CBOE Only (Legacy)
                </>
              )}
            </button>
          </div>

          {/* Data source info */}
          <div className="mt-2 text-xs text-gray-500 text-center">
            Source: CBOE • Symbol: {gexData.levels.qqq_spot ? 'QQQ/NQ' : 'SPX'}
            {gexData.levels.regime && (
              <span> • Regime: <span className={
                gexData.levels.regime === 'positive' || gexData.levels.regime === 'strong_positive' ? 'text-green-400' :
                gexData.levels.regime === 'negative' || gexData.levels.regime === 'strong_negative' ? 'text-red-400' :
                'text-yellow-400'
              }>
                {gexData.levels.regime.toUpperCase()}
              </span></span>
            )}
          </div>
        </>
      ) : (
        <div className="text-gray-400 text-sm">No GEX data available</div>
      )}
    </div>
  );
};

export default GexLevelsPanel;