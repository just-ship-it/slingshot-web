import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

const SignalGeneratorStatus = ({ socket, refreshInterval = 30000 }) => {
  const [status, setStatus] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStatus = async () => {
    try {
      const data = await api.getSignalGeneratorStatus();
      if (data) {
        setStatus(data);
        setError(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  // WebSocket real-time updates
  useEffect(() => {
    if (socket?.socket) {
      const handleSignalGeneratorHealth = (data) => {
        setStatus(prev => ({ ...prev, ...data }));
      };

      socket.socket.on('signal_generator_health', handleSignalGeneratorHealth);
      return () => socket.socket.off('signal_generator_health', handleSignalGeneratorHealth);
    }
  }, [socket]);

  const getOverallStatusColor = (overall) => {
    switch (overall) {
      case 'healthy': return 'text-green-400';
      case 'degraded': return 'text-yellow-400';
      case 'unhealthy': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getOverallStatusIcon = (overall) => {
    switch (overall) {
      case 'healthy': return 'All Connected';
      case 'degraded': return 'Degraded';
      case 'unhealthy': return 'Issues Detected';
      default: return 'Unavailable';
    }
  };

  const formatAge = (timestamp) => {
    if (!timestamp) return 'Never';
    const age = (Date.now() - new Date(timestamp).getTime()) / 1000;
    if (age < 0) return 'Just now';
    if (age < 60) return `${Math.floor(age)}s ago`;
    if (age < 3600) return `${Math.floor(age / 60)}m ago`;
    return `${Math.floor(age / 3600)}h ago`;
  };

  if (isLoading && !status) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <div className="animate-pulse h-4 bg-gray-700 rounded w-48"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      {/* Header - Always visible */}
      <div
        className="flex justify-between items-center cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          Signal Generator
          <span className={`text-sm font-normal ${getOverallStatusColor(status?.overall)}`}>
            {status?.overall === 'healthy' ? ' - ' : ' - '}
            {getOverallStatusIcon(status?.overall)}
          </span>
        </h3>
        <button className="text-gray-400 hover:text-white transition-colors">
          {isExpanded ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
        </button>
      </div>

      {/* Connection Summary - Always visible */}
      <div className="flex flex-wrap gap-2 mt-3">
        <ConnectionBadge
          label="TradingView"
          connected={status?.connections?.tradingview?.connected}
          detail={formatAge(status?.connections?.tradingview?.lastQuoteReceived)}
        />
        <ConnectionBadge
          label="LT Monitor"
          connected={status?.connections?.ltMonitor?.connected}
          detail={status?.connections?.ltMonitor?.hasLevels ? 'Has Levels' : 'No Levels'}
        />
        <ConnectionBadge
          label="Tradier"
          connected={status?.connections?.tradier?.websocketStatus === 'connected'}
          marketClosed={status?.connections?.tradier?.websocketStatus === 'market_closed'}
          detail={status?.connections?.tradier?.displayStatus || 'Unknown'}
        />
        <ConnectionBadge
          label="CBOE"
          connected={status?.connections?.cboe?.hasData}
          detail={status?.connections?.cboe?.ageMinutes != null ? `${status.connections.cboe.ageMinutes}m old` : 'N/A'}
        />
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="mt-4 space-y-3 border-t border-gray-700 pt-4">
          {/* TradingView Details */}
          <ConnectionDetailRow
            icon="TV"
            label="TradingView WebSocket"
            status={status?.connections?.tradingview?.connected}
            details={[
              { label: 'Last Quote', value: formatAge(status?.connections?.tradingview?.lastQuoteReceived) },
              { label: 'Last Heartbeat', value: formatAge(status?.connections?.tradingview?.lastHeartbeat) },
              { label: 'Reconnects', value: status?.connections?.tradingview?.reconnectAttempts || '0' },
              { label: 'Symbols', value: (status?.connections?.tradingview?.symbols?.length || 0).toString() }
            ]}
          />

          {/* LT Monitor Details */}
          <ConnectionDetailRow
            icon="LT"
            label="LT Monitor WebSocket"
            status={status?.connections?.ltMonitor?.connected}
            details={[
              { label: 'Has Levels', value: status?.connections?.ltMonitor?.hasLevels ? 'Yes' : 'No' },
              { label: 'Last Heartbeat', value: formatAge(status?.connections?.ltMonitor?.lastHeartbeat) }
            ]}
          />

          {/* Tradier Details */}
          <ConnectionDetailRow
            icon="TR"
            label="Tradier Options"
            status={status?.connections?.tradier?.websocketStatus === 'connected'}
            statusLabel={status?.connections?.tradier?.displayStatus}
            marketClosed={status?.connections?.tradier?.websocketStatus === 'market_closed'}
            details={[
              { label: 'Available', value: status?.connections?.tradier?.available ? 'Yes' : 'No' },
              { label: 'Running', value: status?.connections?.tradier?.running ? 'Yes' : 'No' },
              { label: 'Has Token', value: status?.connections?.tradier?.hasToken ? 'Yes' : 'No' },
              { label: 'Last Calc', value: formatAge(status?.connections?.tradier?.lastCalculation) }
            ]}
          />

          {/* CBOE Details */}
          <ConnectionDetailRow
            icon="CB"
            label="CBOE API"
            status={status?.connections?.cboe?.hasData}
            details={[
              { label: 'Enabled', value: status?.connections?.cboe?.enabled ? 'Yes' : 'No' },
              { label: 'Has Data', value: status?.connections?.cboe?.hasData ? 'Yes' : 'No' },
              { label: 'Data Age', value: status?.connections?.cboe?.ageMinutes != null ? `${status.connections.cboe.ageMinutes} min` : 'N/A' },
              { label: 'Last Fetch', value: formatAge(status?.connections?.cboe?.lastFetch) }
            ]}
          />

          {/* Hybrid GEX Details */}
          <ConnectionDetailRow
            icon="HY"
            label="Hybrid GEX Calculator"
            status={status?.connections?.hybridGex?.enabled}
            details={[
              { label: 'Enabled', value: status?.connections?.hybridGex?.enabled ? 'Yes' : 'No' },
              { label: 'Primary Source', value: status?.connections?.hybridGex?.primarySource || 'N/A' },
              { label: 'RTH Cache', value: status?.connections?.hybridGex?.usingRTHCache ? 'Yes' : 'No' },
              { label: 'Tradier Fresh', value: status?.connections?.hybridGex?.tradierFresh ? 'Yes' : 'No' }
            ]}
          />
        </div>
      )}

      {error && (
        <div className="mt-2 text-red-400 text-sm">
          Error: {error}
        </div>
      )}

      {/* Last updated timestamp */}
      <div className="mt-2 text-xs text-gray-500 text-right">
        Updated: {status?.timestamp ? formatAge(status.timestamp) : 'Never'}
      </div>
    </div>
  );
};

// Connection badge component for summary view
const ConnectionBadge = ({ label, connected, marketClosed, detail }) => {
  // Determine display state: connected (green), market closed (yellow), disconnected (red)
  const isMarketClosed = marketClosed === true;
  const isConnected = connected === true;

  const bgClass = isConnected ? 'bg-green-900/50 text-green-300 border border-green-700/50' :
                  isMarketClosed ? 'bg-yellow-900/50 text-yellow-300 border border-yellow-700/50' :
                  'bg-red-900/50 text-red-300 border border-red-700/50';

  const iconClass = isConnected ? 'text-green-400' :
                    isMarketClosed ? 'text-yellow-400' :
                    'text-red-400';

  const icon = isConnected ? '\u2713' : isMarketClosed ? '\u23F8' : '\u2717'; // checkmark, pause, X

  return (
    <div className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${bgClass}`}>
      <span className={iconClass}>{icon}</span>
      <span className="font-medium">{label}</span>
      {detail && <span className="text-gray-400 ml-1">({detail})</span>}
    </div>
  );
};

// Connection detail row for expanded view
const ConnectionDetailRow = ({ icon, label, status, statusLabel, marketClosed, details }) => {
  // Determine status display
  const isMarketClosed = marketClosed === true;
  const isConnected = status === true;

  const statusColorClass = isConnected ? 'text-green-400' :
                           isMarketClosed ? 'text-yellow-400' :
                           'text-red-400';

  const defaultStatusLabel = isConnected ? 'Connected' :
                             isMarketClosed ? 'Market Closed' :
                             'Disconnected';

  return (
    <div className="bg-gray-700/50 rounded p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-white font-medium flex items-center gap-2">
          <span className="bg-gray-600 px-1.5 py-0.5 rounded text-xs font-mono">{icon}</span>
          {label}
        </span>
        <span className={`text-sm ${statusColorClass}`}>
          {statusLabel || defaultStatusLabel}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        {details.map((detail, idx) => (
          <div key={idx} className="flex flex-col">
            <span className="text-gray-400">{detail.label}</span>
            <span className="text-white font-mono">{detail.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SignalGeneratorStatus;
