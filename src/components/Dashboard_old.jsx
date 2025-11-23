import React, { useState, useEffect } from 'react';
import AccountInfo from './AccountInfo';
import TradesList from './TradesList';
import PnLChart from './PnLChart';
import Statistics from './Statistics';
import { api } from '../services/api';

const Dashboard = ({ account, socket, onRefresh, onAccountsLoaded }) => {
  const [accountSummary, setAccountSummary] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [pnlData, setPnlData] = useState(null);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [tradovateStatus, setTradovateStatus] = useState('checking');
  const [tradovateError, setTradovateError] = useState(null);
  const [isTradovateChecking, setIsTradovateChecking] = useState(true);

  // Webhook relay state
  const [relayStatus, setRelayStatus] = useState({
    isRunning: false,
    connectionUrl: null,
    lastError: null,
    uptime: 0
  });
  const [relayLogs, setRelayLogs] = useState([]);
  const [isRelayLoading, setIsRelayLoading] = useState(false);

  // Check Tradovate connection status first and try to load accounts
  useEffect(() => {
    checkTradovateConnection();
    checkRelayStatus();
    // Also try to load accounts even if Tradovate is not connected
    loadAccountsIfNeeded();
    // Set interface as loaded immediately
    setIsLoading(false);
  }, []);

  // Setup WebSocket listeners for relay events
  useEffect(() => {
    console.log('🔌 Setting up WebSocket listeners, socket status:', socket?.isConnected);
    if (socket?.socket) {
      console.log('✅ WebSocket socket available, adding event listeners');
      const handleRelayStatusChange = (data) => {
        console.log('Relay status change:', data);
        checkRelayStatus(); // Refresh status
      };

      const handleRelayStarted = (data) => {
        console.log('Relay started:', data);
        setRelayStatus(prev => ({ ...prev, isRunning: true, lastError: null }));
      };

      const handleRelayExited = (data) => {
        console.log('Relay exited:', data);
        setRelayStatus(prev => ({ ...prev, isRunning: false }));
      };

      const handleRelayError = (data) => {
        console.log('Relay error:', data);
        setRelayStatus(prev => ({ ...prev, lastError: data.error }));
      };

      const handleRelayUrlDetected = (data) => {
        console.log('Relay URL detected:', data);
        setRelayStatus(prev => ({ ...prev, connectionUrl: data.url }));
      };

      const handleRelayOutput = (data) => {
        // Add relay output to logs
        setRelayLogs(prev => [...prev.slice(-49), {
          timestamp: data.timestamp,
          type: data.type,
          data: data.data
        }]);
      };

      const handleWebhookReceived = (data) => {
        console.log('🎯 Frontend received webhook event:', data);
        // Add webhook activity to logs
        const logEntry = {
          timestamp: data.timestamp,
          type: 'webhook',
          data: `📨 ${data.action.toUpperCase()} ${data.quantity} ${data.symbol} ${data.price ? `@ $${data.price}` : ''} (${data.source})`
        };
        console.log('🔄 Adding log entry:', logEntry);
        setRelayLogs(prev => [...prev.slice(-49), logEntry]);
      };

      const handleWebhookError = (data) => {
        console.log('Webhook error:', data);
        // Add webhook error to logs
        setRelayLogs(prev => [...prev.slice(-49), {
          timestamp: data.timestamp,
          type: 'stderr',
          data: `❌ Webhook Error: ${data.error}`
        }]);
      };

      // Subscribe to relay events
      socket.socket.on('relay_status_change', handleRelayStatusChange);
      socket.socket.on('relay_started', handleRelayStarted);
      socket.socket.on('relay_exited', handleRelayExited);
      socket.socket.on('relay_error', handleRelayError);
      socket.socket.on('relay_url_detected', handleRelayUrlDetected);
      socket.socket.on('relay_output', handleRelayOutput);

      // Subscribe to webhook events
      socket.socket.on('webhook_received', handleWebhookReceived);
      socket.socket.on('webhook_error', handleWebhookError);

      return () => {
        socket.socket.off('relay_status_change', handleRelayStatusChange);
        socket.socket.off('relay_started', handleRelayStarted);
        socket.socket.off('relay_exited', handleRelayExited);
        socket.socket.off('relay_error', handleRelayError);
        socket.socket.off('relay_url_detected', handleRelayUrlDetected);
        socket.socket.off('relay_output', handleRelayOutput);
        socket.socket.off('webhook_received', handleWebhookReceived);
        socket.socket.off('webhook_error', handleWebhookError);
      };
    }
  }, [socket]);

  // Load dashboard data
  useEffect(() => {
    if (account?.id && tradovateStatus === 'connected') {
      loadDashboardData();
    }
  }, [account, tradovateStatus]);

  // Try to load accounts even when Tradovate is not connected
  const loadAccountsIfNeeded = async () => {
    if (!account && onAccountsLoaded) {
      try {
        const accountsResponse = await api.getAccounts();
        if (accountsResponse.accounts && accountsResponse.accounts.length > 0) {
          onAccountsLoaded(accountsResponse.accounts);
        }
      } catch (error) {
        // Accounts failed to load, which is fine - Tradovate might not be connected
        console.log('Accounts not available:', error.message);
      }
    }
  };

  const checkTradovateConnection = async () => {
    try {
      setIsTradovateChecking(true);
      setTradovateStatus('checking');
      const healthResponse = await api.getTradingHealth();

      console.log('🏥 Health response:', healthResponse);

      if (healthResponse.authenticated) {
        setTradovateStatus('connected');
      } else {
        // Set status based on the specific authentication status
        if (healthResponse.authenticationStatus === 'failed') {
          setTradovateStatus('auth_failed');
        } else {
          setTradovateStatus('disconnected');
        }
      }

      // Store detailed error info for display
      setTradovateError(healthResponse.authenticationError || null);

    } catch (error) {
      console.error('Tradovate connection check failed:', error);
      setTradovateStatus('error');
      setTradovateError(error.message);
    } finally {
      setIsTradovateChecking(false);
    }
  };

  // Real-time updates via WebSocket
  useEffect(() => {
    if (socket?.isConnected && account?.id) {
      // Subscribe to account-specific updates using the hook's method
      socket.subscribeToAccount(account.id);
    }
  }, [socket, account]);

  const loadDashboardData = async () => {
    try {
      setIsLoading(true);
      await Promise.all([
        loadAccountSummary(),
        loadOrdersAndPositions(),
        loadPnLData(),
        loadStats()
      ]);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setIsLoading(false);
      setLastUpdate(new Date());
    }
  };

  const loadAccountSummary = async () => {
    try {
      const response = await api.getAccountSummary(account.id);
      setAccountSummary(response.summary);
    } catch (error) {
      console.error('Failed to load account summary:', error);
    }
  };

  const loadOrdersAndPositions = async () => {
    try {
      const [positionsResponse, ordersResponse] = await Promise.all([
        api.getAccountPositions(account.id),
        api.getAccountOrders(account.id)
      ]);

      setPositions(positionsResponse.positions || []);
      setOrders(ordersResponse.orders || []);
    } catch (error) {
      console.error('Failed to load positions/orders:', error);
    }
  };

  const loadPnLData = async () => {
    try {
      const response = await api.getDailyPnL();
      setPnlData(response);
    } catch (error) {
      console.error('Failed to load P&L data:', error);
    }
  };

  const loadStats = async () => {
    try {
      const response = await api.getTradingStats();
      setStats(response.stats);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  // Check relay status
  const checkRelayStatus = async () => {
    try {
      const response = await api.getRelayStatus();
      if (response.success) {
        setRelayStatus(response.status);
      }
    } catch (error) {
      console.error('Failed to check relay status:', error);
      setRelayStatus(prev => ({ ...prev, lastError: error.message }));
    }
  };

  // Relay control functions
  const handleStartRelay = async () => {
    setIsRelayLoading(true);
    try {
      const response = await api.startRelay();
      if (response.success) {
        setRelayStatus(response.status);
      } else {
        setRelayStatus(prev => ({ ...prev, lastError: response.message }));
      }
    } catch (error) {
      console.error('Failed to start relay:', error);
      setRelayStatus(prev => ({ ...prev, lastError: error.message }));
    } finally {
      setIsRelayLoading(false);
    }
  };

  const handleStopRelay = async () => {
    setIsRelayLoading(true);
    try {
      const response = await api.stopRelay();
      if (response.success) {
        setRelayStatus(response.status);
      } else {
        setRelayStatus(prev => ({ ...prev, lastError: response.message }));
      }
    } catch (error) {
      console.error('Failed to stop relay:', error);
      setRelayStatus(prev => ({ ...prev, lastError: error.message }));
    } finally {
      setIsRelayLoading(false);
    }
  };

  const handleRestartRelay = async () => {
    setIsRelayLoading(true);
    try {
      const response = await api.restartRelay();
      if (response.success) {
        setRelayStatus(response.status);
      } else {
        setRelayStatus(prev => ({ ...prev, lastError: response.message }));
      }
    } catch (error) {
      console.error('Failed to restart relay:', error);
      setRelayStatus(prev => ({ ...prev, lastError: error.message }));
    } finally {
      setIsRelayLoading(false);
    }
  };

  const handleRefresh = () => {
    checkTradovateConnection();
    checkRelayStatus();
    if (tradovateStatus === 'connected') {
      loadDashboardData();
    }
    onRefresh?.();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'connected': return 'text-green-400';
      case 'checking': return 'text-yellow-400';
      case 'disconnected': return 'text-orange-400';
      case 'auth_failed': return 'text-red-400';
      case 'error': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'connected': return '✅';
      case 'checking': return '🔄';
      case 'disconnected': return '⚠️';
      case 'auth_failed': return '🚫';
      case 'error': return '❌';
      default: return '❓';
    }
  };

  const getStatusMessage = (status) => {
    switch (status) {
      case 'connected': return 'Connected & Authenticated';
      case 'checking': return 'Checking Connection';
      case 'disconnected': return 'Not Connected';
      case 'auth_failed': return 'Authentication Failed';
      case 'error': return 'Connection Error';
      default: return 'Unknown Status';
    }
  };

  // Remove the blocking loading state for Tradovate checking

  // Tradovate Connection Status Component
  const TradovateStatusSection = () => {
    return (
      <div className="bg-gray-800 rounded-lg p-6 border-l-4 border-blue-500 min-h-[320px]">
        {isTradovateChecking ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-400">Checking Tradovate connection...</p>
            </div>
          </div>
        ) : tradovateStatus === 'connected' ? (
          <div className="h-full flex items-center">
            <div className="w-full">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white flex items-center">
                  {getStatusIcon(tradovateStatus)}
                  <span className="ml-2">Tradovate Connection</span>
                </h3>
                <button
                  onClick={handleRefresh}
                  disabled={isTradovateChecking}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  {isTradovateChecking ? 'Checking...' : 'Refresh'}
                </button>
              </div>
              <div className="text-green-400 text-center py-8">
                <div className="text-4xl mb-2">✅</div>
                <p className="text-lg font-semibold">Connected & Ready</p>
                <p className="text-sm text-gray-400 mt-2">Trading operations available</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center">
                {getStatusIcon(tradovateStatus)}
                <span className="ml-2">Tradovate Connection Status</span>
              </h3>
              <button
                onClick={handleRefresh}
                disabled={isTradovateChecking}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors"
              >
                {isTradovateChecking ? 'Checking...' : 'Retry Connection'}
              </button>
            </div>

            <div className="space-y-3 h-full">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Status:</span>
                <span className={`font-semibold ${getStatusColor(tradovateStatus)}`}>
                  {getStatusMessage(tradovateStatus)}
                </span>
              </div>

              {tradovateError && (
                <div className="flex justify-between items-start">
                  <span className="text-gray-400">Error:</span>
                  <span className="text-red-400 text-sm font-mono text-right max-w-xs">
                    {tradovateError}
                  </span>
                </div>
              )}

              <div className="text-sm text-gray-400 mt-4">
                {tradovateStatus === 'error' && (
                  <p>Unable to connect to backend. Check if backend server is running on port 3000.</p>
                )}
                {tradovateStatus === 'auth_failed' && (
                  <div>
                    <p className="mb-2">Tradovate authentication failed. Common causes:</p>
                    <ul className="list-disc list-inside ml-2 space-y-1">
                      <li>App not registered with Tradovate (need client_id)</li>
                      <li>Incorrect username or password</li>
                      <li>Account needs funding for API access</li>
                      <li>Using wrong environment (demo vs live)</li>
                    </ul>
                  </div>
                )}
                {tradovateStatus === 'disconnected' && (
                  <p>Connected to backend but not authenticated with Tradovate. Check your API credentials.</p>
                )}
              </div>

              <div className="text-xs text-gray-500 mt-auto p-3 bg-gray-700 rounded">
                <p><strong>Troubleshooting:</strong></p>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>Ensure backend is running on port 3000</li>
                  <li>Check Tradovate credentials in .env file</li>
                  <li>Verify app is registered with Tradovate</li>
                  <li>Check if using correct demo/live environment</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (isLoading && !accountSummary) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with refresh button */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Trading Dashboard</h2>
          <div className="flex items-center space-x-4">
            <p className="text-gray-400">
              Account: {account?.name || 'No account'} {account?.id ? `(${account.id})` : ''}
            </p>
            <div className="flex items-center space-x-2">
              <span className={getStatusColor(tradovateStatus)}>
                {getStatusIcon(tradovateStatus)}
              </span>
              <span className={`text-sm ${getStatusColor(tradovateStatus)}`}>
                Tradovate {tradovateStatus}
              </span>
            </div>
          </div>
          {lastUpdate && (
            <p className="text-sm text-gray-500">
              Last updated: {lastUpdate.toLocaleTimeString()}
            </p>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading || isTradovateChecking}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
        >
          <span className={isLoading || isTradovateChecking ? 'animate-spin' : ''}>🔄</span>
          <span>Refresh</span>
        </button>
      </div>

      {/* Tradovate Connection Status */}
      <TradovateStatusSection />

      {/* Account Overview - only show when Tradovate is connected */}
      {tradovateStatus === 'connected' && account && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <AccountInfo
              account={account}
              summary={accountSummary}
              isLoading={isLoading}
            />
          </div>
          <div className="lg:col-span-2">
            <PnLChart
              data={pnlData}
              accountId={account?.id}
            />
          </div>
        </div>
      )}

      {/* Trading Statistics - only show when Tradovate is connected */}
      {tradovateStatus === 'connected' && (
        <Statistics
          stats={stats}
          positions={positions}
          orders={orders}
        />
      )}

      {/* Positions and Orders - only show when Tradovate is connected */}
      {tradovateStatus === 'connected' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <TradesList
            title="Open Positions"
            data={positions.filter(pos => pos.qty !== 0)}
            type="positions"
            onRefresh={loadOrdersAndPositions}
          />
          <TradesList
            title="Active Orders"
            data={orders.filter(order => order.status === 'Working')}
            type="orders"
            onRefresh={loadOrdersAndPositions}
          />
        </div>
      )}

      {/* Recent Orders - only show when Tradovate is connected */}
      {tradovateStatus === 'connected' && (
        <TradesList
          title="Recent Orders"
          data={orders.slice(0, 10)}
          type="orders"
          onRefresh={loadOrdersAndPositions}
          showAll={false}
        />
      )}

      {/* Show platform features - always visible */}
      <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">📡 Platform Status</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gray-700 p-4 rounded">
                <h4 className="font-semibold text-white mb-2">WebSocket Connection</h4>
                <p className={`text-sm ${socket?.isConnected ? 'text-green-400' : 'text-red-400'}`}>
                  {socket?.isConnected ? '✅ Connected' : '❌ Disconnected'}
                </p>
              </div>
              <div className="bg-gray-700 p-4 rounded">
                <h4 className="font-semibold text-white mb-2">Backend Server</h4>
                <p className="text-sm text-green-400">🟢 Running</p>
                <p className="text-xs text-gray-400 mt-1">Port 3000</p>
              </div>
              <div className="bg-gray-700 p-4 rounded">
                <h4 className="font-semibold text-white mb-2">Webhook Relay</h4>
                <p className={`text-sm ${relayStatus.isRunning ? 'text-green-400' : 'text-gray-400'}`}>
                  {relayStatus.isRunning ? '✅ Running' : '⏸️ Stopped'}
                </p>
                {relayStatus.connectionUrl && (
                  <p className="text-xs text-blue-400 mt-1 truncate" title={relayStatus.connectionUrl}>
                    {relayStatus.connectionUrl}
                  </p>
                )}
                {relayStatus.lastError && (
                  <p className="text-xs text-red-400 mt-1" title={relayStatus.lastError}>
                    Error: {relayStatus.lastError.substring(0, 30)}...
                  </p>
                )}
              </div>
              <div className="bg-gray-700 p-4 rounded">
                <h4 className="font-semibold text-white mb-2">Webhook Endpoint</h4>
                <p className="text-sm text-green-400">🟢 Active</p>
                <p className="text-xs text-gray-400 mt-1">/webhook/autotrader</p>
              </div>
            </div>

            {/* Webhook Relay Controls */}
            <div className="mt-4 flex space-x-2">
              <button
                onClick={handleStartRelay}
                disabled={relayStatus.isRunning || isRelayLoading}
                className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-3 py-1 text-sm rounded transition-colors"
              >
                {isRelayLoading ? 'Loading...' : 'Start Relay'}
              </button>
              <button
                onClick={handleStopRelay}
                disabled={!relayStatus.isRunning || isRelayLoading}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-3 py-1 text-sm rounded transition-colors"
              >
                {isRelayLoading ? 'Loading...' : 'Stop Relay'}
              </button>
              <button
                onClick={handleRestartRelay}
                disabled={isRelayLoading}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1 text-sm rounded transition-colors"
              >
                {isRelayLoading ? 'Loading...' : 'Restart Relay'}
              </button>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">📨 Recent Activity</h3>

            {relayLogs.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {relayLogs.slice(-10).map((log, index) => (
                  <div key={index} className={`text-sm p-2 rounded ${
                    log.type === 'stderr' ? 'bg-red-900/20 text-red-300' :
                    log.type === 'webhook' ? 'bg-blue-900/20 text-blue-300 border border-blue-500/30' :
                    'bg-gray-700 text-gray-300'
                  }`}>
                    <span className="text-xs text-gray-500 mr-2">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="font-mono text-xs">{log.data.trim()}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-400 text-center py-8">
                <p>No recent activity</p>
                <div className="text-sm mt-4 space-y-1">
                  <p>Webhook endpoints:</p>
                  <code className="bg-gray-700 px-2 py-1 rounded text-xs block">POST /autotrader</code>
                  <code className="bg-gray-700 px-2 py-1 rounded text-xs block">POST /webhook/autotrader</code>
                  <code className="bg-gray-700 px-2 py-1 rounded text-xs block">POST /webhook/tradingview</code>
                </div>
              </div>
            )}

            {relayStatus.connectionUrl && (
              <div className="mt-4 p-3 bg-blue-900/20 rounded border border-blue-500/30">
                <h4 className="text-sm font-semibold text-blue-300 mb-2">🌐 External Webhook URL</h4>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={relayStatus.connectionUrl}
                      readOnly
                      className="bg-gray-700 text-gray-300 px-2 py-1 rounded text-xs flex-1 font-mono"
                    />
                    <button
                      onClick={() => navigator.clipboard.writeText(relayStatus.connectionUrl)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 text-xs rounded transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="text-xs text-blue-300 mt-2">Use this URL in TradingView webhooks</p>
              </div>
            )}
          </div>
    </div>
  );
};

export default Dashboard;