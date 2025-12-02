import React, { useState, useEffect } from 'react';
import AccountInfo from './AccountInfo';
import TradesList from './TradesList';
import QuotesPanel from './QuotesPanel';
import EnhancedTradingStatus from './EnhancedTradingStatus';
import { api } from '../services/api';

const Dashboard = ({ account, socket, onRefresh, onAccountsLoaded }) => {
  const [accountSummary, setAccountSummary] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [tradovateStatus, setTradovateStatus] = useState('disabled');
  const [tradovateError, setTradovateError] = useState('Tradovate connection temporarily disabled');
  const [isTradovateChecking, setIsTradovateChecking] = useState(false);
  const [criticalStatus, setCriticalStatus] = useState(null);
  const [criticalStatusError, setCriticalStatusError] = useState(null);
  const [quotes, setQuotes] = useState({});

  // Webhook relay state
  const [relayStatus, setRelayStatus] = useState({
    isRunning: false,
    connectionUrl: null,
    lastError: null,
    uptime: 0
  });
  const [relayLogs, setRelayLogs] = useState([]);
  const [isRelayLoading, setIsRelayLoading] = useState(false);
  const [activityFilter, setActivityFilter] = useState('all');
  const [tradingEnabled, setTradingEnabled] = useState(false);
  const [isKillSwitchLoading, setIsKillSwitchLoading] = useState(false);
  const [positionSizingSettings, setPositionSizingSettings] = useState({
    method: 'fixed',
    fixedQuantity: 1,
    riskPercentage: 10,
    maxContracts: 10,
    contractType: 'auto'
  });
  const [showPositionSizingModal, setShowPositionSizingModal] = useState(false);
  const [positionSizingLoading, setPositionSizingLoading] = useState(false);
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [selectedJsonData, setSelectedJsonData] = useState(null);
  const [marginSettings, setMarginSettings] = useState({});
  const [showMarginModal, setShowMarginModal] = useState(false);
  const [marginLoading, setMarginLoading] = useState(false);
  const [showActivitySidebar, setShowActivitySidebar] = useState(false);

  // Microservice health state
  const [microserviceHealth, setMicroserviceHealth] = useState({});

  // Live polling state
  const [pollingEnabled, setPollingEnabled] = useState(true);
  const [pollingInterval, setPollingInterval] = useState(null);
  const [lastPollingUpdate, setLastPollingUpdate] = useState(null);
  const [criticalStatusInterval, setCriticalStatusInterval] = useState(null);
  const [isReSyncing, setIsReSyncing] = useState(false);

  // Check microservice health via monitoring service API
  const checkMicroserviceHealth = async () => {
    try {
      const services = await api.getServices();
      const healthState = {};

      services.forEach(service => {
        healthState[service.name] = {
          serviceName: service.name,
          status: service.status === 'running' ? 'healthy' : 'unhealthy',
          lastChecked: service.lastChecked ? new Date(service.lastChecked) : new Date(),
          error: service.error || null,
          port: service.port,
          details: service
        };
      });

      setMicroserviceHealth(healthState);
    } catch (error) {
      console.error('Failed to check microservice health:', error);
      // Set all services as unknown on error
      setMicroserviceHealth({
        'monitoring-service': {
          serviceName: 'monitoring-service',
          status: 'unhealthy',
          lastChecked: new Date(),
          error: error.message
        }
      });
    }
  };

  // Load dashboard immediately, check connections in background
  useEffect(() => {
    // Set loading to false immediately for instant UI
    setIsLoading(false);

    // Load all necessary data in parallel in background
    Promise.all([
      checkRelayStatus(),
      loadKillSwitchStatus(),
      loadPositionSizingSettings(),
      loadMarginSettings(),
      loadAccountsIfNeeded(),
      loadCriticalStatus(),
      checkMicroserviceHealth()
    ]).catch(error => {
      console.error('Background loading error:', error);
    });

    // Check Tradovate connection but don't block UI
    checkTradovateConnection().catch(error => {
      console.error('Tradovate connection check error:', error);
    });

    // Set up periodic health checking for microservices (less frequent)
    const healthCheckInterval = setInterval(checkMicroserviceHealth, 60000); // Every minute

    return () => {
      if (criticalStatusInterval) {
        clearInterval(criticalStatusInterval);
      }
      clearInterval(healthCheckInterval);
    };
  }, []);

  // Kill switch functions
  const loadKillSwitchStatus = async () => {
    try {
      const response = await api.getKillSwitchStatus();
      setTradingEnabled(response.tradingEnabled);
    } catch (error) {
      console.error('Failed to load kill switch status:', error);
    }
  };

  const handleKillSwitchToggle = async () => {
    const newState = !tradingEnabled;

    // Confirmation for enabling trading
    if (newState) {
      if (!window.confirm('⚠️ Are you sure you want to ENABLE live trading?\n\nThis will allow the system to execute real trades.')) {
        return;
      }
    }

    setIsKillSwitchLoading(true);
    try {
      const response = await api.setKillSwitch(newState);
      setTradingEnabled(response.tradingEnabled);

      // Add to activity log
      setRelayLogs(prev => [...prev, {
        timestamp: new Date().toISOString(),
        type: 'kill_switch',
        data: newState
          ? '🟢 Trading ENABLED'
          : '🔴 Trading DISABLED (Kill Switch Active)'
      }].slice(0, 100));
    } catch (error) {
      console.error('Failed to toggle kill switch:', error);
      alert(`Failed to ${newState ? 'enable' : 'disable'} trading: ${error.message}`);
    } finally {
      setIsKillSwitchLoading(false);
    }
  };

  // Position sizing functions
  const loadPositionSizingSettings = async () => {
    try {
      const response = await api.getPositionSizingSettings();
      setPositionSizingSettings(response.settings || response);
    } catch (error) {
      console.error('Failed to load position sizing settings:', error);
      // Set default values when loading fails
      setPositionSizingSettings({
        method: 'fixed',
        fixedQuantity: 1,
        riskPercentage: 10,
        maxContracts: 10,
        contractType: 'auto',
        enabled: false
      });
    }
  };

  const handlePositionSizingUpdate = async (newSettings) => {
    setPositionSizingLoading(true);
    try {
      const response = await api.setPositionSizingSettings(newSettings);
      setPositionSizingSettings(response.settings);

      // Add to activity log
      setRelayLogs(prev => [...prev, {
        timestamp: new Date().toISOString(),
        type: 'position_sizing',
        data: `⚙️ Position sizing updated: ${newSettings.method} method`
      }].slice(0, 100));

      setShowPositionSizingModal(false);
    } catch (error) {
      console.error('Failed to update position sizing settings:', error);
      alert(`Failed to update position sizing: ${error.message}`);
    } finally {
      setPositionSizingLoading(false);
    }
  };

  const handleSavePositionSizing = async () => {
    await handlePositionSizingUpdate(positionSizingSettings);
  };

  const handleShowJsonData = (log) => {
    setSelectedJsonData(log);
    setShowJsonModal(true);
  };

  // Margin settings functions
  const loadMarginSettings = async () => {
    try {
      const response = await api.getMarginSettings();
      setMarginSettings(response.marginSettings || response || {});
    } catch (error) {
      console.error('Failed to load margin settings:', error);
      // Set default values when loading fails
      setMarginSettings({
        enabled: false
      });
    }
  };

  const handleMarginUpdate = async (newMarginSettings) => {
    setMarginLoading(true);
    try {
      const response = await api.setMarginSettings(newMarginSettings);
      setMarginSettings(response.marginSettings);

      // Add to activity log
      setRelayLogs(prev => [{
        timestamp: new Date().toISOString(),
        type: 'margin_settings',
        data: '💰 Margin requirements updated'
      }].slice(0, 100));

      setShowMarginModal(false);
    } catch (error) {
      console.error('Failed to update margin settings:', error);
      alert(`Failed to update margin settings: ${error.message}`);
    } finally {
      setMarginLoading(false);
    }
  };

  const handleSaveMarginSettings = async () => {
    await handleMarginUpdate(marginSettings);
  };

  // Handle socket connection state changes - refresh data on reconnection
  useEffect(() => {
    if (socket?.isConnected) {
      console.log('🔌 Socket connected - refreshing dashboard data');

      // Refresh quotes, health data, and account data when socket reconnects
      Promise.all([
        loadQuotes(),
        checkMicroserviceHealth(),
        onRefresh() // Reload account data
      ]).then(() => {
        console.log('✅ Data refreshed after socket reconnection');
      }).catch(error => {
        console.error('❌ Failed to refresh data after reconnection:', error);
      });
    } else if (socket?.isConnected === false) {
      console.log('❌ Socket disconnected - microservice health may be stale');
    }
  }, [socket?.isConnected]);

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

        // Check if contract conversion occurred
        const contractSelection = data.result?.contractSelection;
        const isBlocked = data.result?.blocked || data.result?.killSwitchActive;

        let displayText = `📨 ${data.action.toUpperCase()} ${data.quantity} ${data.symbol} ${data.price ? `@ $${data.price}` : ''} (${data.source})`;

        if (contractSelection) {
          if (contractSelection.converted) {
            displayText = `🔄 ${data.action.toUpperCase()} ${contractSelection.finalQuantity} ${contractSelection.finalSymbol} ${data.price ? `@ $${data.price}` : ''} (CONVERTED from ${contractSelection.originalSymbol} - Margin Optimized)`;
          } else {
            displayText = `✅ ${data.action.toUpperCase()} ${contractSelection.finalQuantity} ${contractSelection.finalSymbol} ${data.price ? `@ $${data.price}` : ''} (Sufficient Margin - $${contractSelection.marginUsed} used)`;
          }

          // Add blocked indicator if kill switch is active
          if (isBlocked) {
            displayText += ' [BLOCKED BY KILL SWITCH]';
          }
        } else if (isBlocked) {
          displayText = `🚫 BLOCKED: ${data.action.toUpperCase()} ${data.quantity} ${data.symbol} ${data.price ? `@ $${data.price}` : ''} (Kill Switch Active)`;
        }

        // Add webhook activity to logs
        const logEntry = {
          timestamp: data.timestamp,
          type: 'webhook',
          data: displayText,
          rawData: data.rawData,
          result: data.result,
          contractSelection: contractSelection,
          blocked: isBlocked
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

      // Subscribe to market data updates
      const handleMarketData = (data) => {
        console.log('📊 Market data received:', data);
        setQuotes(prev => {
          const newQuote = {
            symbol: data.symbol,
            baseSymbol: data.baseSymbol,
            open: data.open,
            high: data.high,
            low: data.low,
            close: data.close,
            previousClose: data.previousClose,
            volume: data.volume,
            timestamp: data.timestamp
          };

          const updates = {
            ...prev,
            // Store by full symbol
            [data.symbol]: newQuote
          };

          // Also store by base symbol for QuotesPanel compatibility
          if (data.baseSymbol) {
            updates[data.baseSymbol] = newQuote;
          }

          console.log('📊 Updated quotes state:', Object.keys(updates), 'MNQ value:', updates.MNQ?.close, 'MES value:', updates.MES?.close);
          return updates;
        });
      };

      socket.socket.on('market_data', handleMarketData);

      // Subscribe to critical status updates
      const handleCriticalStatusUpdate = (data) => {
        console.log('🎯 Critical status update received via WebSocket');
        // Only update if data has actually changed
        setCriticalStatus(prev => {
          const newData = JSON.stringify(data);
          const prevData = JSON.stringify(prev);
          if (newData !== prevData) {
            return data;
          }
          return prev;
        });
      };
      socket.socket.on('critical_status_update', handleCriticalStatusUpdate);

      // Handle initial activity from database
      const handleInitialActivity = (activities) => {
        const formattedLogs = activities.map(activity => ({
          timestamp: activity.timestamp,
          type: activity.type,
          data: activity.message || activity.data
        }));
        setRelayLogs(prev => [...formattedLogs, ...prev].slice(0, 100));
      };

      const handleFilteredActivity = (activities) => {
        const formattedLogs = activities.map(activity => ({
          timestamp: activity.timestamp,
          type: activity.type,
          data: activity.message || activity.data
        }));
        setRelayLogs(formattedLogs.slice(0, 100));
      };

      socket.socket.on('initial_activity', handleInitialActivity);
      socket.socket.on('filtered_activity', handleFilteredActivity);

      // Handle initial state when service reconnects
      const handleInitialState = (data) => {
        console.log('🔄 Initial state received:', data);

        // Update microservice health from services data
        if (data.services && Array.isArray(data.services)) {
          const healthState = {};
          data.services.forEach(service => {
            healthState[service.name] = {
              serviceName: service.name,
              status: service.status === 'running' ? 'healthy' : 'unhealthy',
              lastChecked: new Date(),
              error: service.error || null,
              port: service.port,
              details: service
            };
          });
          setMicroserviceHealth(healthState);
          console.log('✅ Restored microservice health from initial state');
        }

        // Update activity logs from initial state
        if (data.activity && Array.isArray(data.activity)) {
          const formattedLogs = data.activity.map(activity => ({
            timestamp: activity.timestamp,
            type: activity.type,
            data: activity.message || activity.data
          }));
          setRelayLogs(formattedLogs.slice(-100));
          console.log('✅ Restored activity logs from initial state');
        }

        // Restore quotes from initial state if available
        if (data.quotes && Object.keys(data.quotes).length > 0) {
          setQuotes(data.quotes);
          console.log('✅ Restored quotes from initial state:', Object.keys(data.quotes));
        } else {
          // Fallback to loading quotes if not in initial state
          loadQuotes();
          console.log('🔄 Loading quotes since not in initial state');
        }
      };

      socket.socket.on('initial_state', handleInitialState);

      // Handle kill switch changes
      const handleKillSwitchChanged = (data) => {
        setTradingEnabled(data.enabled);
        setRelayLogs(prev => [...prev, {
          timestamp: data.timestamp,
          type: 'kill_switch',
          data: data.enabled
            ? '🟢 Trading ENABLED'
            : '🔴 Trading DISABLED (Kill Switch Active)'
        }].slice(0, 100));
      };

      const handleWebhookBlocked = (data) => {
        setRelayLogs(prev => [...prev, {
          timestamp: data.timestamp,
          type: 'webhook',
          data: `🚫 BLOCKED: ${data.signal.action} ${data.signal.quantity} ${data.signal.symbol} (${data.reason})`,
          rawData: data.rawData,
          result: { blocked: true, reason: data.reason }
        }].slice(0, 100));
      };

      socket.socket.on('kill_switch_changed', handleKillSwitchChanged);
      socket.socket.on('webhook_blocked', handleWebhookBlocked);

      // Data collector real-time updates
      const handleDataCollectorInitialized = (data) => {
        console.log('Data collector initialized:', data);
        setRelayLogs(prev => [...prev, {
          timestamp: data.timestamp,
          type: 'system',
          data: `📊 Data collector started with ${data.accountsCount} accounts`
        }].slice(0, 100));
      };

      const handleAccountDataUpdated = (data) => {
        console.log('Account data updated:', data);

        // Update the appropriate state based on data type
        if (data.dataType === 'balance' && data.accountId === account?.id) {
          setAccountSummary(prev => prev ? { ...prev, ...data.data, cached: true, dataAge: 0 } : null);
        } else if (data.dataType === 'positions' && data.accountId === account?.id) {
          setPositions(data.data || []);
        } else if (data.dataType === 'orders' && data.accountId === account?.id) {
          console.log('🔍 Orders WebSocket update received:', data.data);
          if (data.data && data.data.length > 0) {
            console.log('🔍 First order in update:', JSON.stringify(data.data[0], null, 2));
          }
          console.log('✅ Setting orders state with enriched WebSocket data');
          setOrders(data.data || []);
        }

        setLastUpdate(new Date());
      };

      const handlePollingModeChanged = (data) => {
        console.log('Polling mode changed:', data);
        setRelayLogs(prev => [...prev, {
          timestamp: data.timestamp,
          type: 'system',
          data: `🔄 Polling mode changed for account ${data.accountId}: ${data.oldMode || data.mode} → ${data.newMode || data.mode} (${data.reason})`
        }].slice(0, 100));
      };

      const handleRateLimitWarning = (data) => {
        console.log('Rate limit warning:', data);
        setRelayLogs(prev => [...prev, {
          timestamp: data.timestamp,
          type: 'system',
          data: `⚠️ Rate limit protection activated for account ${data.accountId}`
        }].slice(0, 100));
      };

      // Subscribe to data collector events
      socket.socket.on('data_collector_initialized', handleDataCollectorInitialized);
      socket.socket.on('account_data_updated', handleAccountDataUpdated);
      socket.socket.on('polling_mode_changed', handlePollingModeChanged);
      socket.socket.on('rate_limit_warning', handleRateLimitWarning);

      return () => {
        socket.socket.off('relay_status_change', handleRelayStatusChange);
        socket.socket.off('relay_started', handleRelayStarted);
        socket.socket.off('relay_exited', handleRelayExited);
        socket.socket.off('relay_error', handleRelayError);
        socket.socket.off('relay_url_detected', handleRelayUrlDetected);
        socket.socket.off('relay_output', handleRelayOutput);
        socket.socket.off('webhook_received', handleWebhookReceived);
        socket.socket.off('webhook_error', handleWebhookError);
        socket.socket.off('market_data', handleMarketData);
        socket.socket.off('critical_status_update', handleCriticalStatusUpdate);
        socket.socket.off('initial_activity', handleInitialActivity);
        socket.socket.off('filtered_activity', handleFilteredActivity);
        socket.socket.off('initial_state', handleInitialState);
        socket.socket.off('kill_switch_changed', handleKillSwitchChanged);
        socket.socket.off('webhook_blocked', handleWebhookBlocked);
        socket.socket.off('data_collector_initialized', handleDataCollectorInitialized);
        socket.socket.off('account_data_updated', handleAccountDataUpdated);
        socket.socket.off('polling_mode_changed', handlePollingModeChanged);
        socket.socket.off('rate_limit_warning', handleRateLimitWarning);
      };
    }
  }, [socket]);

  // Load dashboard data immediately when account is available
  useEffect(() => {
    if (account?.id) {
      // Try to load data immediately - our cached API endpoints will return quickly
      loadDashboardData();
    }
  }, [account]);

  // Polling for live updates (disabled when using cached data)
  useEffect(() => {
    // Don't poll if we have cached data - let background data collector handle updates
    const hasRecentCachedData = accountSummary?.cached && accountSummary?.dataAge && accountSummary.dataAge < 5 * 60 * 1000;

    if (pollingEnabled && account?.id && tradovateStatus === 'connected' && !hasRecentCachedData) {
      console.log('Setting up polling for dashboard data...');
      const intervalId = setInterval(() => {
        console.log('Polling for dashboard data...');
        loadDashboardData();
        setLastPollingUpdate(new Date());
      }, 120000); // Poll every 2 minutes (less frequent to avoid timeouts)

      setPollingInterval(intervalId);
      return () => clearInterval(intervalId);
    } else if (pollingInterval) {
      console.log('Disabling polling - using cached data from background collector');
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
  }, [account, tradovateStatus, pollingEnabled, accountSummary]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  // Effect to manage intelligent polling based on active orders/positions
  useEffect(() => {
    if (!criticalStatus) return;

    const hasActiveItems = criticalStatus.openOrders?.length > 0 || criticalStatus.openPositions?.length > 0;

    if (hasActiveItems && !criticalStatusInterval) {
      // Start polling if we have active items but no interval
      console.log('🎯 Starting polling - active orders/positions detected');
      const interval = setInterval(() => {
        loadCriticalStatus();
        checkMicroserviceHealth();
      }, 15000); // More frequent when active
      setCriticalStatusInterval(interval);
    } else if (!hasActiveItems && criticalStatusInterval) {
      // Stop polling if no active items
      console.log('🎯 Stopping polling - no active orders/positions');
      clearInterval(criticalStatusInterval);
      setCriticalStatusInterval(null);
    }
  }, [criticalStatus?.openOrders?.length, criticalStatus?.openPositions?.length]);

  // Try to load accounts even when Tradovate is not connected
  const loadAccountsIfNeeded = async () => {
    if (!account && onAccountsLoaded) {
      try {
        const accountsResponse = await api.getAccounts();
        const accounts = Array.isArray(accountsResponse) ? accountsResponse : accountsResponse.accounts || [];
        if (accounts.length > 0) {
          onAccountsLoaded(accounts);
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

  const loadCriticalStatus = async () => {
    try {
      console.log('🎯 Loading critical status...');
      const response = await api.getCriticalStatus();
      console.log('🎯 Critical status response:', response);

      // Always update the first time or if data changed
      setCriticalStatus(prev => {
        if (!prev) {
          console.log('🎯 Setting initial critical status');
          return response;
        }

        const newData = JSON.stringify(response);
        const prevData = JSON.stringify(prev);
        if (newData !== prevData) {
          console.log('🎯 Critical status updated');
          return response;
        }
        return prev;
      });
    } catch (error) {
      console.error('❌ Failed to load critical status:', error);
      console.error('❌ Error details:', error.response?.data || error.message);
      setCriticalStatusError(error.message || 'Failed to load trading status');
    }
  };

  const loadQuotes = async () => {
    try {
      const quotesData = await api.getQuotes?.() || {};
      setQuotes(quotesData);
      console.log('📊 Loaded quotes:', Object.keys(quotesData));
    } catch (error) {
      console.error('Failed to load quotes:', error.message);
      // Don't fail the dashboard if quotes fail
    }
  };

  const loadDashboardData = async () => {
    // Prevent concurrent loading
    if (isLoading) {
      console.log('Dashboard data already loading, skipping...');
      return;
    }

    try {
      setIsLoading(true);

      // Load critical status first (most important)
      await loadCriticalStatus();

      // Load account summary
      await loadAccountSummary();

      // Load initial quotes
      await loadQuotes();

      // Load positions/orders together (they're related)
      await loadOrdersAndPositions();

      // Load P&L data (depends on account summary)

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

      // If it's a 503 (service unavailable), it means cache is warming up
      if (error.response?.status === 503) {
        console.log('Cache warming up, will retry soon...');
        // Set a placeholder summary to show the UI isn't broken
        setAccountSummary({
          accountId: account.id,
          balance: 0,
          equity: 0,
          margin: 0,
          availableFunds: 0,
          dayPnL: 0,
          dayPnLPercent: 0,
          totalPositions: 0,
          longPositions: 0,
          shortPositions: 0,
          workingOrders: 0,
          tradesExecutedToday: 0,
          cached: false,
          empty: true,
          loading: true
        });
      }
      // Don't throw - let other loads continue
    }
  };

  const loadOrdersAndPositions = async () => {
    try {
      const [positionsResponse, ordersResponse] = await Promise.allSettled([
        api.getAccountPositions(account.id),
        api.getAccountOrders(account.id)
      ]);

      if (positionsResponse.status === 'fulfilled') {
        setPositions(positionsResponse.value.positions || []);
      } else {
        console.error('Failed to load positions:', positionsResponse.reason);
      }

      if (ordersResponse.status === 'fulfilled') {
        const apiOrders = ordersResponse.value.orders || [];

        // Preserve enriched data from WebSocket if available
        setOrders(prevOrders => {
          // If we have previous orders with enriched data (limitPrice, orderType), preserve them
          if (prevOrders.length > 0 && prevOrders.some(o => o.limitPrice && o.orderType)) {
            console.log('🔒 Preserving enriched order data from WebSocket, ignoring API refresh');
            return prevOrders;
          }
          // Otherwise use API data (for initial load)
          console.log('📋 Loading orders from API (initial load)');
          return apiOrders;
        });
      } else {
        console.error('Failed to load orders:', ordersResponse.reason);
      }
    } catch (error) {
      console.error('Failed to load positions/orders:', error);
      // Don't throw - let other loads continue
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

  const handleReSync = async () => {
    setIsReSyncing(true);
    try {
      const response = await api.reSync();
      if (response.success) {
        // Add success message to activity log
        setRelayLogs(prev => [...prev, {
          timestamp: new Date().toISOString(),
          type: 'system',
          data: '🔄 Re-sync completed - fresh data loaded from Tradovate'
        }].slice(0, 100));

        // Refresh the dashboard with fresh data
        setTimeout(() => {
          loadCriticalStatus();
          if (tradovateStatus === 'connected') {
            loadDashboardData();
          }
        }, 1000); // Small delay to let the backend process the fresh data
      }
    } catch (error) {
      console.error('Re-sync failed:', error);
      setRelayLogs(prev => [...prev, {
        timestamp: new Date().toISOString(),
        type: 'stderr',
        data: `❌ Re-sync failed: ${error.message}`
      }].slice(0, 100));
    } finally {
      setIsReSyncing(false);
    }
  };

  const handleRefresh = () => {
    checkTradovateConnection();
    checkRelayStatus();
    loadCriticalStatus(); // Always refresh critical status
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
      case 'disabled': return 'text-gray-500';
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
      case 'disabled': return '🔒';
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
      case 'disabled': return 'Temporarily Disabled';
      default: return 'Unknown Status';
    }
  };


  // Only show loading spinner if we have no account and we're actually loading
  if (isLoading && !account && !accountSummary) {
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
    <>
    <div className="flex flex-col lg:flex-row h-full overflow-hidden relative">
      {/* Main Content Area - 2/3 width on desktop, full width on mobile */}
      <div className="flex-[2] overflow-y-auto">
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">


          {/* Enhanced Trading Status Panel */}
          <EnhancedTradingStatus />


          {/* Account Overview and Live Quotes side by side */}
          {account && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <AccountInfo
                  account={account}
                  summary={accountSummary}
                  isLoading={isLoading && !accountSummary}
                />
                <QuotesPanel
                  quotes={quotes}
                  isLoading={false}
                />
              </div>

              {/* Platform Status - Full Width */}
              <div>
                {/* Platform Status */}
                <div className="bg-gray-800 rounded-lg p-6">
                  <div className="mb-4">
                    {/* First line: Platform Status title and trading toggle */}
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-lg font-semibold text-white">📡 Platform Status</h3>
                      <div className="flex items-center space-x-2 flex-shrink-0">
                        <span className="text-sm text-gray-300">Trading:</span>
                        <button
                          onClick={handleKillSwitchToggle}
                          disabled={isKillSwitchLoading}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
                            tradingEnabled ? 'bg-green-600' : 'bg-red-600'
                          }`}
                          role="switch"
                          aria-checked={tradingEnabled}
                          aria-label={`Trading is currently ${tradingEnabled ? 'enabled' : 'disabled'}`}
                        >
                          <span className="sr-only">Toggle trading</span>
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out ${
                              tradingEnabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                        <span className={`text-xs font-medium ${
                          tradingEnabled ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {isKillSwitchLoading ? (
                            <span className="animate-spin">⏳</span>
                          ) : tradingEnabled ? (
                            'ON'
                          ) : (
                            'OFF'
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Second line: Margins and Position Sizing buttons aligned right */}
                    <div className="flex justify-end">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowMarginModal(true)}
                          className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 text-sm rounded transition-colors flex-shrink-0"
                        >
                          💰 Margins
                        </button>
                        <button
                          onClick={() => setShowPositionSizingModal(true)}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 text-sm rounded transition-colors flex-shrink-0"
                        >
                          ⚙️ Position Sizing
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="bg-gray-700 p-4 rounded">
                      <h4 className="font-semibold text-white mb-2">Trading Status</h4>
                      <p className={`text-sm font-bold ${tradingEnabled ? 'text-green-400' : 'text-red-400'}`}>
                        {tradingEnabled ? '🟢 ENABLED' : '🔴 DISABLED'}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {tradingEnabled ? 'Live trades active' : 'Kill switch active'}
                      </p>
                    </div>
                    <div className="bg-gray-700 p-4 rounded">
                      <h4 className="font-semibold text-white mb-2">Position Sizing</h4>
                      <p className="text-sm text-blue-400 font-semibold">
                        {positionSizingSettings?.method === 'fixed'
                          ? `📌 ${positionSizingSettings?.fixedQuantity || 1} ${
                              positionSizingSettings?.contractType === 'full' ? 'Full' :
                              positionSizingSettings?.contractType === 'micro' ? 'Micro' : ''
                            } Contracts`
                          : `💰 ${positionSizingSettings?.riskPercentage || 10}% Risk`
                        }
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {positionSizingSettings?.method === 'fixed'
                          ? `Fixed quantity${positionSizingSettings?.contractType !== 'auto' ? ` (${positionSizingSettings?.contractType} override)` : ''}`
                          : 'Risk-based sizing'
                        }
                      </p>
                    </div>
                    <div className="bg-gray-700 p-4 rounded">
                      <h4 className="font-semibold text-white mb-2">WebSocket</h4>
                      <p className={`text-sm ${socket?.isConnected ? 'text-green-400' : 'text-red-400'}`}>
                        {socket?.isConnected ? '✅ Connected' : '❌ Disconnected'}
                      </p>
                    </div>

                    {/* Microservices Health Grid */}
                    {Object.entries(microserviceHealth).map(([serviceName, health]) => (
                      <div key={serviceName} className="bg-gray-700 p-4 rounded">
                        <h4 className="font-semibold text-white mb-2 capitalize">
                          {serviceName.replace('-', ' ')}
                        </h4>
                        <p className={`text-sm font-bold ${
                          health.status === 'healthy' ? 'text-green-400' :
                          health.status === 'unhealthy' ? 'text-red-400' :
                          'text-yellow-400'
                        }`}>
                          {health.status === 'healthy' ? '🟢 Healthy' :
                           health.status === 'unhealthy' ? '🔴 Down' :
                           '🟡 Unknown'}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {health.lastChecked ?
                            `Last check: ${health.lastChecked.toLocaleTimeString()}` :
                            'Not checked'}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Microservice Health Controls */}
                  <div className="mt-4 flex space-x-2">
                    <button
                      onClick={checkMicroserviceHealth}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 text-sm rounded transition-colors"
                    >
                      🔄 Refresh Health
                    </button>
                </div>
              </div>
            </div>
            </>
          )}

          {/* Recent Orders History */}
          <TradesList
            title="Recent Orders History (Last 10)"
            data={orders.slice(0, 10)}
            type="orders"
            onRefresh={loadOrdersAndPositions}
            showAll={false}
          />

        </div>
      </div>
    </div>
    
    {/* Position Sizing Modal */}
      {showPositionSizingModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">Position Sizing Settings</h3>
              <button
                onClick={() => setShowPositionSizingModal(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Method Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Position Sizing Method
                </label>
                <select
                  value={positionSizingSettings.method}
                  onChange={(e) => setPositionSizingSettings(prev => ({
                    ...prev,
                    method: e.target.value
                  }))}
                  className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2"
                >
                  <option value="fixed">Fixed Contracts</option>
                  <option value="risk_based">Risk-Based Sizing</option>
                </select>
              </div>

              {/* Fixed Quantity */}
              {positionSizingSettings.method === 'fixed' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Fixed Quantity (contracts)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={positionSizingSettings.fixedQuantity}
                      onChange={(e) => setPositionSizingSettings(prev => ({
                        ...prev,
                        fixedQuantity: parseInt(e.target.value) || 1
                      }))}
                      className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2"
                    />
                  </div>

                  {/* Contract Type Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Contract Type Override
                    </label>
                    <select
                      value={positionSizingSettings.contractType}
                      onChange={(e) => setPositionSizingSettings(prev => ({
                        ...prev,
                        contractType: e.target.value
                      }))}
                      className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2"
                    >
                      <option value="auto">Auto (Use Signal)</option>
                      <option value="full">Force Full Size (NQ, ES)</option>
                      <option value="micro">Force Micro (MNQ, MES)</option>
                    </select>
                    <p className="text-xs text-gray-400 mt-1">
                      Override signal's contract type when using fixed sizing
                    </p>
                  </div>
                </>
              )}

              {/* Risk Percentage */}
              {positionSizingSettings.method === 'risk_based' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Risk Percentage (%)
                  </label>
                  <input
                    type="number"
                    min="0.1"
                    max="100"
                    step="0.1"
                    value={positionSizingSettings.riskPercentage}
                    onChange={(e) => setPositionSizingSettings(prev => ({
                      ...prev,
                      riskPercentage: parseFloat(e.target.value) || 10
                    }))}
                    className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Percentage of account balance at risk per trade
                  </p>
                </div>
              )}

              {/* Max Contracts */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Maximum Contracts
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={positionSizingSettings.maxContracts}
                  onChange={(e) => setPositionSizingSettings(prev => ({
                    ...prev,
                    maxContracts: parseInt(e.target.value) || 10
                  }))}
                  className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Safety limit on position size
                </p>
              </div>

              {/* Risk-Based Preview */}
              {positionSizingSettings.method === 'risk_based' && (
                <div className="bg-gray-700 p-3 rounded">
                  <h4 className="text-sm font-medium text-gray-300 mb-2">Risk Preview (MNQ)</h4>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-400">$1,000 account:</span>
                      <span className="text-white">
                        {Math.min(
                          Math.floor((1000 * positionSizingSettings.riskPercentage) / 100 / 104),
                          positionSizingSettings.maxContracts
                        )} contracts
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">$5,000 account:</span>
                      <span className="text-white">
                        {Math.min(
                          Math.floor((5000 * positionSizingSettings.riskPercentage) / 100 / 104),
                          positionSizingSettings.maxContracts
                        )} contracts
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">$25,000 account:</span>
                      <span className="text-white">
                        {Math.min(
                          Math.floor((25000 * positionSizingSettings.riskPercentage) / 100 / 104),
                          positionSizingSettings.maxContracts
                        )} contracts
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-gray-400">
                    Max loss per contract: $104 (52 points × $2/point)
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3 mt-6">
              <button
                onClick={() => setShowPositionSizingModal(false)}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-3 sm:py-2 px-4 rounded transition-colors text-base"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePositionSizing}
                disabled={positionSizingLoading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white py-3 sm:py-2 px-4 rounded transition-colors text-base"
              >
                {positionSizingLoading ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Margin Settings Modal */}
      {showMarginModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-4 sm:p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">💰 Day Margin Requirements</h3>
              <button
                onClick={() => setShowMarginModal(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="text-sm text-gray-300 mb-4">
                Configure day trading margin requirements for each contract type. These values determine contract selection in intelligent sizing mode.
              </div>

              {Object.keys(marginSettings).length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(marginSettings).map(([symbol, settings]) => (
                    <div key={symbol} className="bg-gray-700 p-4 rounded">
                      <h4 className="font-semibold text-white mb-2">
                        {symbol} {settings.contractType === 'micro' ? '(Micro)' : '(Full)'}
                      </h4>
                      <p className="text-xs text-gray-300 mb-3">{settings.description}</p>

                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-400 mb-1">
                            Day Margin Requirement
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">$</span>
                            <input
                              type="number"
                              value={settings.dayMargin}
                              onChange={(e) => setMarginSettings(prev => ({
                                ...prev,
                                [symbol]: {
                                  ...prev[symbol],
                                  dayMargin: parseInt(e.target.value) || 0
                                }
                              }))}
                              className="w-full bg-gray-600 border border-gray-500 text-white pl-8 pr-3 py-2 rounded focus:ring-2 focus:ring-green-500 focus:border-transparent"
                              placeholder="Enter margin amount"
                            />
                          </div>
                        </div>

                        <div className="text-xs text-gray-400 space-y-1">
                          <div className="flex justify-between">
                            <span>Point Value:</span>
                            <span className="text-white">${settings.pointValue}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Max Loss (52 pts):</span>
                            <span className="text-white">${(52 * settings.pointValue).toFixed(0)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-400 py-8">
                  <div className="text-4xl mb-2">⏳</div>
                  <div>Loading margin settings...</div>
                </div>
              )}

              <div className="bg-gray-700 p-4 rounded">
                <h4 className="font-semibold text-white mb-2">💡 How It Works</h4>
                <div className="text-sm text-gray-300 space-y-2">
                  <p>• When intelligent contract selection is enabled, the system uses these margin requirements to determine if your account can afford the requested contract</p>
                  <p>• If you request NQ but only have $1,000 in available capital, it will automatically convert to MNQ</p>
                  <p>• Available capital = Account Balance × Margin Utilization (default 50%)</p>
                  <p>• These values should match your broker's day trading margin requirements</p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowMarginModal(false)}
                className="bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveMarginSettings}
                disabled={marginLoading}
                className="bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white py-2 px-4 rounded transition-colors"
              >
                {marginLoading ? 'Saving...' : 'Save Margin Settings'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* JSON Data Modal */}
      {showJsonModal && selectedJsonData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">Webhook Raw Data</h3>
              <button
                onClick={() => {
                  setShowJsonModal(false);
                  setSelectedJsonData(null);
                }}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-hidden">
              <div className="bg-gray-900 rounded p-4 h-full overflow-auto">
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-300 mb-2">Event Details</h4>
                  <div className="text-xs text-gray-400 space-y-1">
                    <div><strong>Timestamp:</strong> {new Date(selectedJsonData.timestamp).toLocaleString()}</div>
                    <div><strong>Type:</strong> {selectedJsonData.type}</div>
                    <div><strong>Summary:</strong> {selectedJsonData.data}</div>
                  </div>
                </div>

                {selectedJsonData.rawData && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-300 mb-2">Raw Webhook Payload</h4>
                    <pre className="text-xs text-green-300 font-mono whitespace-pre-wrap break-words">
                      {JSON.stringify(selectedJsonData.rawData, null, 2)}
                    </pre>
                  </div>
                )}

                {selectedJsonData.result && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-gray-300 mb-2">Processing Result</h4>
                    <pre className="text-xs text-blue-300 font-mono whitespace-pre-wrap break-words">
                      {JSON.stringify(selectedJsonData.result, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Show full log data if no specific fields available */}
                {!selectedJsonData.rawData && !selectedJsonData.result && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-300 mb-2">Log Data</h4>
                    <pre className="text-xs text-yellow-300 font-mono whitespace-pre-wrap break-words">
                      {JSON.stringify(selectedJsonData, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end mt-4">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(selectedJsonData.rawData || selectedJsonData, null, 2));
                  alert('JSON copied to clipboard!');
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded mr-3 transition-colors"
              >
                📋 Copy JSON
              </button>
              <button
                onClick={() => {
                  setShowJsonModal(false);
                  setSelectedJsonData(null);
                }}
                className="bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Dashboard;