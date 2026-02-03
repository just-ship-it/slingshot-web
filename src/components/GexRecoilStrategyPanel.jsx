import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

const GexRecoilStrategyPanel = ({ socket }) => {
  const [strategyStatus, setStrategyStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch initial strategy status
  const fetchStrategyStatus = async () => {
    try {
      setError(null);
      const response = await api.getStrategyStatus();
      if (response && response.success) {
        setStrategyStatus(response);
        setLoading(false);
      }
    } catch (err) {
      setError('Failed to fetch strategy status');
      console.error('Error fetching strategy status:', err);
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchStrategyStatus();

    // Refresh every 30 seconds as backup
    const interval = setInterval(fetchStrategyStatus, 30000);

    return () => clearInterval(interval);
  }, []);

  // WebSocket updates
  useEffect(() => {
    if (!socket?.socket) return;

    const handleStrategyStatus = (status) => {
      setStrategyStatus({ success: true, ...status });
      setLoading(false);
      setError(null);
    };

    socket.socket.on('strategyStatus', handleStrategyStatus);

    return () => {
      socket.socket.off('strategyStatus', handleStrategyStatus);
    };
  }, [socket]);

  // Calculate proximity color
  const getProximityColor = (proximity) => {
    if (!proximity) return 'text-gray-400';
    if (proximity.critical) return 'text-red-500 animate-pulse';
    if (proximity.approaching) return 'text-yellow-400';
    if (proximity.above) return 'text-green-400';
    return 'text-cyan-400';
  };

  // Format time
  const formatTime = (seconds) => {
    if (!seconds && seconds !== 0) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Format price
  const formatPrice = (price) => {
    if (price === null || price === undefined) return '—';
    return price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  // Format distance
  const formatDistance = (points, percent) => {
    if (points === null || points === undefined) return '—';
    const sign = points > 0 ? '+' : '';
    return `${sign}${points.toFixed(1)} pts (${sign}${percent.toFixed(2)}%)`;
  };

  if (loading && !strategyStatus) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-3">GEX Recoil Strategy Status</h3>
        <div className="text-gray-400 text-sm">Loading strategy status...</div>
      </div>
    );
  }

  if (error && !strategyStatus) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-3">GEX Recoil Strategy Status</h3>
        <div className="text-red-400 text-sm">{error}</div>
        <button
          onClick={fetchStrategyStatus}
          className="mt-2 px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const { strategy, candle, gex_levels, proximity, lt_levels, evaluation_readiness } = strategyStatus || {};

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-white">GEX Recoil Strategy</h3>
        <div className="flex items-center gap-3">
          {/* Strategy enabled status */}
          <div className={`px-2 py-1 rounded text-xs font-medium ${
            strategy?.enabled ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'
          }`}>
            {strategy?.enabled ? 'ENABLED' : 'DISABLED'}
          </div>

          {/* Session status */}
          <div className={`px-2 py-1 rounded text-xs font-medium ${
            strategy?.session?.in_session ? 'bg-blue-600 text-white' : 'bg-gray-600 text-gray-300'
          }`}>
            {strategy?.session?.in_session ? 'IN SESSION' : 'OUT OF SESSION'}
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Candle Status */}
        <div className="bg-gray-700 rounded p-3">
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-sm font-semibold text-gray-300">15M Candle</h4>
            {candle?.time_to_close && (
              <div className="text-lg font-mono text-yellow-400">
                {formatTime(candle.time_to_close.seconds_remaining)}
              </div>
            )}
          </div>

          {candle && (
            <>
              {/* OHLC Display */}
              <div className="grid grid-cols-4 gap-2 text-xs mb-2">
                <div>
                  <span className="text-gray-500">O:</span>
                  <span className="text-gray-300 ml-1 font-mono">{formatPrice(candle.open)}</span>
                </div>
                <div>
                  <span className="text-gray-500">H:</span>
                  <span className="text-green-400 ml-1 font-mono">{formatPrice(candle.high)}</span>
                </div>
                <div>
                  <span className="text-gray-500">L:</span>
                  <span className="text-red-400 ml-1 font-mono">{formatPrice(candle.low)}</span>
                </div>
                <div>
                  <span className="text-gray-500">C:</span>
                  <span className="text-cyan-400 ml-1 font-mono">{formatPrice(candle.close)}</span>
                </div>
              </div>

              {/* Progress bar */}
              {candle.time_to_close && (
                <div className="w-full bg-gray-600 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-1000"
                    style={{ width: `${candle.time_to_close.percentage_complete}%` }}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Cooldown & Readiness */}
        <div className="bg-gray-700 rounded p-3">
          <h4 className="text-sm font-semibold text-gray-300 mb-2">Strategy Readiness</h4>

          {/* Cooldown Status */}
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-gray-400">Signal Cooldown:</span>
            <span className={`text-xs font-mono ${
              strategy?.cooldown?.in_cooldown ? 'text-yellow-400' : 'text-green-400'
            }`}>
              {strategy?.cooldown?.formatted || 'Ready'}
            </span>
          </div>

          {/* Evaluation readiness */}
          {evaluation_readiness && (
            <div className="mt-2">
              <div className={`text-xs font-medium mb-1 ${
                evaluation_readiness.ready ? 'text-green-400' : 'text-yellow-400'
              }`}>
                {evaluation_readiness.ready ? '✓ Ready to evaluate' : '⚠ Not ready'}
              </div>

              {evaluation_readiness.blockers?.length > 0 && (
                <div className="text-xs text-red-400">
                  {evaluation_readiness.blockers.map((blocker, i) => (
                    <div key={i}>• {blocker}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* GEX Levels Proximity */}
      {proximity && (
        <div className="mt-4">
          <h4 className="text-sm font-semibold text-gray-300 mb-2">GEX Level Proximity</h4>
          <div className="space-y-2">
            {Object.entries(proximity).map(([level, data]) => (
              <div key={level} className="bg-gray-700 rounded p-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 capitalize">
                      {level.replace('_', ' ')}:
                    </span>
                    <span className="text-sm font-mono text-white">
                      {formatPrice(data.level)}
                    </span>
                    {data.critical && (
                      <span className="text-xs bg-red-600 text-white px-1 rounded animate-pulse">
                        CRITICAL
                      </span>
                    )}
                    {data.approaching && !data.critical && (
                      <span className="text-xs bg-yellow-600 text-white px-1 rounded">
                        NEAR
                      </span>
                    )}
                  </div>
                  <span className={`text-xs font-mono ${getProximityColor(data)}`}>
                    {formatDistance(data.distance_points, data.distance_percent)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* LT Levels Info */}
      {lt_levels && (
        <div className="mt-4 bg-gray-700 rounded p-3">
          <h4 className="text-sm font-semibold text-gray-300 mb-2">Liquidity Triggers</h4>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <span className="text-gray-500">Total:</span>
              <span className="text-gray-300 ml-1 font-mono">{lt_levels.total}</span>
            </div>
            <div>
              <span className="text-gray-500">Below:</span>
              <span className="text-cyan-400 ml-1 font-mono">{lt_levels.below_price}</span>
            </div>
            <div>
              <span className="text-gray-500">Above:</span>
              <span className="text-orange-400 ml-1 font-mono">{lt_levels.above_price}</span>
            </div>
          </div>
        </div>
      )}

      {/* Additional GEX Levels Display */}
      {gex_levels && (
        <div className="mt-4 bg-gray-700 rounded p-3">
          <h4 className="text-sm font-semibold text-gray-300 mb-2">Monitored GEX Levels</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-gray-500 mb-1">Put Wall</div>
              <div className="text-sm font-mono text-red-400">
                {formatPrice(gex_levels.put_wall)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Call Wall</div>
              <div className="text-sm font-mono text-green-400">
                {formatPrice(gex_levels.call_wall)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-3">
            <div>
              <div className="text-xs text-gray-500">Support Levels:</div>
              {gex_levels.support?.map((level, i) => (
                <div key={i} className="text-xs font-mono text-cyan-400">
                  S{i+1}: {formatPrice(level)}
                </div>
              ))}
            </div>
            <div>
              <div className="text-xs text-gray-500">Resistance Levels:</div>
              {gex_levels.resistance?.map((level, i) => (
                <div key={i} className="text-xs font-mono text-orange-400">
                  R{i+1}: {formatPrice(level)}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Last Update */}
      {strategyStatus?.timestamp && (
        <div className="mt-2 text-xs text-gray-500 text-center">
          Last update: {new Date(strategyStatus.timestamp).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
};

export default GexRecoilStrategyPanel;