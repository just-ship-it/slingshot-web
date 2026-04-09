import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

const PlatformStatus = ({ socket, tradovateStatus }) => {
  // Kill switch
  const [tradingEnabled, setTradingEnabled] = useState(false);
  const [isKillSwitchLoading, setIsKillSwitchLoading] = useState(false);

  // Connectors (e.g., PickMyTrade)
  const [connectors, setConnectors] = useState({});
  const [connectorLoading, setConnectorLoading] = useState(null);

  // Position sizing
  const [positionSizingSettings, setPositionSizingSettings] = useState({
    method: 'fixed', fixedQuantity: 1, riskPercentage: 10, maxContracts: 10, contractType: 'auto'
  });
  const [showPositionSizingModal, setShowPositionSizingModal] = useState(false);
  const [positionSizingLoading, setPositionSizingLoading] = useState(false);

  // Margin settings
  const [marginSettings, setMarginSettings] = useState({});
  const [showMarginModal, setShowMarginModal] = useState(false);
  const [marginLoading, setMarginLoading] = useState(false);

  // JSON data modal
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [selectedJsonData, setSelectedJsonData] = useState(null);

  // Microservice health
  const [microserviceHealth, setMicroserviceHealth] = useState({});
  const [signalGeneratorConnections, setSignalGeneratorConnections] = useState(null);
  const [sgConnectionsExpanded, setSgConnectionsExpanded] = useState(false);
  const [macroBriefingHealth, setMacroBriefingHealth] = useState(null);
  const [isBriefingGenerating, setIsBriefingGenerating] = useState(false);

  // Strategies
  const [strategies, setStrategies] = useState([]);
  const [strategiesExpanded, setStrategiesExpanded] = useState(true);
  const [strategyToggleLoading, setStrategyToggleLoading] = useState(null);

  // Relay (values maintained via WebSocket handlers for internal tracking)
  const [, setRelayStatus] = useState({ isRunning: false, connectionUrl: null, lastError: null, uptime: 0 });
  const [, setRelayLogs] = useState([]);

  // TradingView token
  const [showTokenForm, setShowTokenForm] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [tokenSubmitting, setTokenSubmitting] = useState(false);
  const [tokenMessage, setTokenMessage] = useState(null);

  // Schwab token
  const [showSchwabTokenForm, setShowSchwabTokenForm] = useState(false);
  const [schwabTokenInput, setSchwabTokenInput] = useState('');
  const [schwabTokenSubmitting, setSchwabTokenSubmitting] = useState(false);
  const [schwabTokenMessage, setSchwabTokenMessage] = useState(null);

  // Sync
  const [isFullSyncing, setIsFullSyncing] = useState(false);

  // --- Load functions ---
  const loadKillSwitchStatus = async () => {
    try {
      const response = await api.getKillSwitchStatus();
      setTradingEnabled(response.tradingEnabled);
    } catch (error) {
      console.error('Failed to load kill switch status:', error);
    }
  };

  const loadConnectorStatus = async () => {
    try {
      const response = await api.getConnectorStatus();
      setConnectors(response.connectors || {});
    } catch (error) {
      console.error('Failed to load connector status:', error);
    }
  };

  const loadPositionSizingSettings = async () => {
    try {
      const response = await api.getPositionSizingSettings();
      setPositionSizingSettings(response.settings || response);
    } catch (error) {
      console.error('Failed to load position sizing settings:', error);
      setPositionSizingSettings({ method: 'fixed', fixedQuantity: 1, riskPercentage: 10, maxContracts: 10, contractType: 'auto', enabled: false });
    }
  };

  const loadMarginSettings = async () => {
    try {
      const response = await api.getMarginSettings();
      setMarginSettings(response.marginSettings || response || {});
    } catch (error) {
      console.error('Failed to load margin settings:', error);
      setMarginSettings({ enabled: false });
    }
  };

  const checkMicroserviceHealth = async () => {
    try {
      const services = await api.getServices();
      const healthState = {};
      services.forEach(service => {
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
    } catch (error) {
      console.error('Failed to check microservice health:', error);
      setMicroserviceHealth({
        'monitoring-service': { serviceName: 'monitoring-service', status: 'unhealthy', lastChecked: new Date(), error: error.message }
      });
    }
  };

  const fetchSignalGeneratorConnections = async () => {
    try {
      const data = await api.getSignalGeneratorStatus();
      if (data) setSignalGeneratorConnections(data);
    } catch (err) {
      console.log('Signal generator status not available:', err.message);
    }
  };

  const fetchMacroBriefingHealth = async () => {
    try {
      const services = await api.getServices();
      const macro = services.find(s => s.name === 'macro-briefing');
      if (macro?.health) {
        setMacroBriefingHealth(macro.health);
      } else if (macro) {
        setMacroBriefingHealth({ status: macro.status === 'running' ? 'healthy' : 'down' });
      }
    } catch (err) {
      console.log('Macro briefing health not available:', err.message);
    }
  };

  const fetchStrategies = async () => {
    try {
      const data = await api.getStrategiesList();
      if (data?.strategies) setStrategies(data.strategies);
    } catch (err) {
      console.log('Strategies not available:', err.message);
    }
  };

  const handleStrategyToggle = async (strategyConstant, currentEnabled) => {
    setStrategyToggleLoading(strategyConstant);
    try {
      if (currentEnabled) {
        await api.disableStrategy(strategyConstant);
      } else {
        await api.enableStrategy(strategyConstant);
      }
      await fetchStrategies();
    } catch (err) {
      console.error('Failed to toggle strategy:', err.message);
    } finally {
      setStrategyToggleLoading(null);
    }
  };

  const handleGenerateBriefing = async () => {
    setIsBriefingGenerating(true);
    try {
      await api.generateBriefing();
    } catch (err) {
      console.error('Failed to generate briefing:', err.message);
      alert(`Failed to generate briefing: ${err.message}`);
    } finally {
      setTimeout(() => {
        setIsBriefingGenerating(false);
        fetchMacroBriefingHealth();
      }, 3000);
    }
  };

  const checkRelayStatus = async () => {
    try {
      const response = await api.getRelayStatus();
      if (response.success) setRelayStatus(response.status);
    } catch (error) {
      console.error('Failed to check relay status:', error);
      setRelayStatus(prev => ({ ...prev, lastError: error.message }));
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

  const formatTTL = (seconds) => {
    if (seconds === null || seconds === undefined) return 'N/A';
    if (seconds < 0) return `Expired ${Math.floor(-seconds / 60)}m ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  const handleTokenSubmit = async (e) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    setTokenSubmitting(true);
    setTokenMessage(null);
    try {
      const result = await api.setTradingViewToken(tokenInput.trim());
      setTokenMessage({ type: 'success', text: `Token set (TTL: ${formatTTL(result.tokenTTL)})` });
      setTokenInput('');
      setShowTokenForm(false);
      setTimeout(fetchSignalGeneratorConnections, 2000);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to set token';
      setTokenMessage({ type: 'error', text: msg });
    } finally {
      setTokenSubmitting(false);
    }
  };

  const handleSchwabTokenSubmit = async (e) => {
    e.preventDefault();
    if (!schwabTokenInput.trim()) return;
    setSchwabTokenSubmitting(true);
    setSchwabTokenMessage(null);
    try {
      const result = await api.setSchwabToken(schwabTokenInput.trim());
      setSchwabTokenMessage({ type: 'success', text: result.message || 'Token updated' });
      setSchwabTokenInput('');
      setShowSchwabTokenForm(false);
      setTimeout(fetchSignalGeneratorConnections, 3000);
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || err.message || 'Failed to set token';
      setSchwabTokenMessage({ type: 'error', text: msg });
    } finally {
      setSchwabTokenSubmitting(false);
    }
  };

  // --- On mount ---
  useEffect(() => {
    Promise.all([
      loadKillSwitchStatus(),
      loadConnectorStatus(),
      loadPositionSizingSettings(),
      loadMarginSettings(),
      checkMicroserviceHealth(),
      fetchSignalGeneratorConnections(),
      fetchMacroBriefingHealth(),
      fetchStrategies(),
      checkRelayStatus()
    ]).catch(error => console.error('Background loading error:', error));

    const healthCheckInterval = setInterval(() => {
      checkMicroserviceHealth();
      fetchSignalGeneratorConnections();
      fetchMacroBriefingHealth();
      fetchStrategies();
    }, 60000);

    return () => clearInterval(healthCheckInterval);
  }, []);

  // --- WebSocket listeners ---
  useEffect(() => {
    if (!socket?.socket) return;

    const handleRelayStatusChange = () => checkRelayStatus();
    const handleRelayStarted = () => setRelayStatus(prev => ({ ...prev, isRunning: true, lastError: null }));
    const handleRelayExited = () => setRelayStatus(prev => ({ ...prev, isRunning: false }));
    const handleRelayError = (data) => setRelayStatus(prev => ({ ...prev, lastError: data.error }));
    const handleRelayUrlDetected = (data) => setRelayStatus(prev => ({ ...prev, connectionUrl: data.url }));
    const handleRelayOutput = (data) => {
      setRelayLogs(prev => [...prev.slice(-49), { timestamp: data.timestamp, type: data.type, data: data.data }]);
    };

    const handleWebhookReceived = (data) => {
      const contractSelection = data.result?.contractSelection;
      const isBlocked = data.result?.blocked || data.result?.killSwitchActive;
      let displayText = `${data.action.toUpperCase()} ${data.quantity} ${data.symbol} ${data.price ? `@ $${data.price}` : ''} (${data.source})`;
      if (contractSelection) {
        if (contractSelection.converted) {
          displayText = `${data.action.toUpperCase()} ${contractSelection.finalQuantity} ${contractSelection.finalSymbol} ${data.price ? `@ $${data.price}` : ''} (CONVERTED from ${contractSelection.originalSymbol})`;
        } else {
          displayText = `${data.action.toUpperCase()} ${contractSelection.finalQuantity} ${contractSelection.finalSymbol} ${data.price ? `@ $${data.price}` : ''} (Margin OK - $${contractSelection.marginUsed})`;
        }
        if (isBlocked) displayText += ' [BLOCKED]';
      } else if (isBlocked) {
        displayText = `BLOCKED: ${data.action.toUpperCase()} ${data.quantity} ${data.symbol} ${data.price ? `@ $${data.price}` : ''}`;
      }
      setRelayLogs(prev => [...prev.slice(-49), { timestamp: data.timestamp, type: 'webhook', data: displayText, rawData: data.rawData, result: data.result }]);
    };

    const handleWebhookError = (data) => {
      setRelayLogs(prev => [...prev.slice(-49), { timestamp: data.timestamp, type: 'stderr', data: `Webhook Error: ${data.error}` }]);
    };

    const handleKillSwitchChanged = (data) => {
      setTradingEnabled(data.enabled);
      setRelayLogs(prev => [...prev, { timestamp: data.timestamp, type: 'kill_switch', data: data.enabled ? 'Trading ENABLED' : 'Trading DISABLED (Kill Switch Active)' }].slice(0, 100));
    };

    const handleConnectorStatusChanged = (data) => {
      setConnectors(prev => ({
        ...prev,
        [data.connector]: { ...prev[data.connector], enabled: data.enabled }
      }));
      setRelayLogs(prev => [...prev, { timestamp: data.timestamp, type: 'connector', data: `${data.connector} ${data.enabled ? 'ENABLED' : 'DISABLED'}` }].slice(0, 100));
    };

    const handleWebhookBlocked = (data) => {
      setRelayLogs(prev => [...prev, { timestamp: data.timestamp, type: 'webhook', data: `BLOCKED: ${data.signal.action} ${data.signal.quantity} ${data.signal.symbol} (${data.reason})`, rawData: data.rawData, result: { blocked: true, reason: data.reason } }].slice(0, 100));
    };

    const handleServiceRestartInitiated = (data) => {
      setMicroserviceHealth(prev => ({ ...prev, [data.service]: { ...prev[data.service], status: 'restarting' } }));
    };
    const handleServiceRestartSuccess = (data) => {
      setRelayLogs(prev => [...prev, { timestamp: data.timestamp, type: 'system', data: `${data.service.replace('-', ' ')} restart initiated successfully` }].slice(0, 100));
    };
    const handleServiceRestartFailed = (data) => {
      setMicroserviceHealth(prev => ({ ...prev, [data.service]: { ...prev[data.service], status: 'unhealthy' } }));
      setRelayLogs(prev => [...prev, { timestamp: data.timestamp, type: 'stderr', data: `Failed to restart ${data.service.replace('-', ' ')}: ${data.error}` }].slice(0, 100));
    };

    const handleSignalGeneratorHealth = (data) => {
      setSignalGeneratorConnections(prev => ({ ...prev, ...data }));
    };

    const handleInitialActivity = (activities) => {
      const formatted = activities.map(a => ({ timestamp: a.timestamp, type: a.type, data: a.message || a.data }));
      setRelayLogs(prev => [...formatted, ...prev].slice(0, 100));
    };

    const handleFilteredActivity = (activities) => {
      const formatted = activities.map(a => ({ timestamp: a.timestamp, type: a.type, data: a.message || a.data }));
      setRelayLogs(formatted.slice(0, 100));
    };

    const handleStrategyStatusUpdate = () => {
      fetchStrategies();
    };

    const handleInitialState = (data) => {
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
      }
      if (data.activity && Array.isArray(data.activity)) {
        const formatted = data.activity.map(a => ({ timestamp: a.timestamp, type: a.type, data: a.message || a.data }));
        setRelayLogs(formatted.slice(-100));
      }
    };

    socket.socket.on('relay_status_change', handleRelayStatusChange);
    socket.socket.on('relay_started', handleRelayStarted);
    socket.socket.on('relay_exited', handleRelayExited);
    socket.socket.on('relay_error', handleRelayError);
    socket.socket.on('relay_url_detected', handleRelayUrlDetected);
    socket.socket.on('relay_output', handleRelayOutput);
    socket.socket.on('webhook_received', handleWebhookReceived);
    socket.socket.on('webhook_error', handleWebhookError);
    socket.socket.on('kill_switch_changed', handleKillSwitchChanged);
    socket.socket.on('connector_status_changed', handleConnectorStatusChanged);
    socket.socket.on('webhook_blocked', handleWebhookBlocked);
    socket.socket.on('service_restart_initiated', handleServiceRestartInitiated);
    socket.socket.on('service_restart_success', handleServiceRestartSuccess);
    socket.socket.on('service_restart_failed', handleServiceRestartFailed);
    socket.socket.on('signal_generator_health', handleSignalGeneratorHealth);
    socket.socket.on('initial_activity', handleInitialActivity);
    socket.socket.on('filtered_activity', handleFilteredActivity);
    socket.socket.on('initial_state', handleInitialState);
    socket.socket.on('strategyStatus', handleStrategyStatusUpdate);

    return () => {
      socket.socket.off('relay_status_change', handleRelayStatusChange);
      socket.socket.off('relay_started', handleRelayStarted);
      socket.socket.off('relay_exited', handleRelayExited);
      socket.socket.off('relay_error', handleRelayError);
      socket.socket.off('relay_url_detected', handleRelayUrlDetected);
      socket.socket.off('relay_output', handleRelayOutput);
      socket.socket.off('webhook_received', handleWebhookReceived);
      socket.socket.off('webhook_error', handleWebhookError);
      socket.socket.off('kill_switch_changed', handleKillSwitchChanged);
      socket.socket.off('connector_status_changed', handleConnectorStatusChanged);
      socket.socket.off('webhook_blocked', handleWebhookBlocked);
      socket.socket.off('service_restart_initiated', handleServiceRestartInitiated);
      socket.socket.off('service_restart_success', handleServiceRestartSuccess);
      socket.socket.off('service_restart_failed', handleServiceRestartFailed);
      socket.socket.off('signal_generator_health', handleSignalGeneratorHealth);
      socket.socket.off('initial_activity', handleInitialActivity);
      socket.socket.off('filtered_activity', handleFilteredActivity);
      socket.socket.off('initial_state', handleInitialState);
      socket.socket.off('strategyStatus', handleStrategyStatusUpdate);
    };
  }, [socket]);

  // --- Handlers ---
  const handleKillSwitchToggle = async () => {
    const newState = !tradingEnabled;
    if (newState) {
      if (!window.confirm('Are you sure you want to ENABLE live trading?\n\nThis will allow the system to execute real trades.')) return;
    }
    setIsKillSwitchLoading(true);
    try {
      const response = await api.setKillSwitch(newState);
      setTradingEnabled(response.tradingEnabled);
      setRelayLogs(prev => [...prev, { timestamp: new Date().toISOString(), type: 'kill_switch', data: newState ? 'Trading ENABLED' : 'Trading DISABLED (Kill Switch Active)' }].slice(0, 100));
    } catch (error) {
      console.error('Failed to toggle kill switch:', error);
      alert(`Failed to ${newState ? 'enable' : 'disable'} trading: ${error.message}`);
    } finally {
      setIsKillSwitchLoading(false);
    }
  };

  const handleConnectorToggle = async (name) => {
    const current = connectors[name];
    if (!current) return;
    const newState = !current.enabled;
    setConnectorLoading(name);
    try {
      await api.setConnectorEnabled(name, newState);
      setConnectors(prev => ({ ...prev, [name]: { ...prev[name], enabled: newState } }));
    } catch (error) {
      console.error(`Failed to toggle connector ${name}:`, error);
      alert(`Failed to ${newState ? 'enable' : 'disable'} ${name}: ${error.message}`);
    } finally {
      setConnectorLoading(null);
    }
  };

  const handlePositionSizingUpdate = async (newSettings) => {
    setPositionSizingLoading(true);
    try {
      const response = await api.setPositionSizingSettings(newSettings);
      setPositionSizingSettings(response.settings || response);
      setRelayLogs(prev => [...prev, { timestamp: new Date().toISOString(), type: 'position_sizing', data: `Position sizing updated: ${newSettings.method} method` }].slice(0, 100));
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

  const handleMarginUpdate = async (newMarginSettings) => {
    setMarginLoading(true);
    try {
      const response = await api.setMarginSettings(newMarginSettings);
      setMarginSettings(response.marginSettings);
      setRelayLogs(prev => [{ timestamp: new Date().toISOString(), type: 'margin_settings', data: 'Margin requirements updated' }].slice(0, 100));
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

  const handleFullSync = async (dryRun = false) => {
    setIsFullSyncing(true);
    try {
      const response = await api.fullSync({ dryRun });
      if (response.success) {
        const { stats } = response;
        setRelayLogs(prev => [...prev, { timestamp: new Date().toISOString(), type: 'system', data: `Full Tradovate sync ${dryRun ? '(DRY RUN) ' : ''}completed - ${stats.ordersReconciled} orders, ${stats.positionsReconciled} positions reconciled, ${stats.signalMappingsRemoved} stale mappings cleaned` }].slice(0, 100));
      }
    } catch (error) {
      console.error('Full sync failed:', error);
      setRelayLogs(prev => [...prev, { timestamp: new Date().toISOString(), type: 'stderr', data: `Full Tradovate sync failed: ${error.message}` }].slice(0, 100));
    } finally {
      setIsFullSyncing(false);
    }
  };

  const handleServiceRestart = async (serviceName) => {
    const displayName = serviceName.replace('-', ' ');
    if (!window.confirm(`Are you sure you want to restart the ${displayName}?\n\nThis will cause temporary service interruption.`)) return;

    try {
      setMicroserviceHealth(prev => ({ ...prev, [serviceName]: { ...prev[serviceName], status: 'restarting' } }));
      setRelayLogs(prev => [...prev, { timestamp: new Date().toISOString(), type: 'system', data: `Restarting ${displayName} (requested by dashboard)` }].slice(0, 100));
      const response = await api.restartService(serviceName);
      if (response.success) {
        setRelayLogs(prev => [...prev, { timestamp: new Date().toISOString(), type: 'system', data: `${displayName} restart initiated successfully` }].slice(0, 100));
        if (serviceName === 'monitoring-service') {
          setRelayLogs(prev => [...prev, { timestamp: new Date().toISOString(), type: 'system', data: 'Monitoring service restarting - dashboard will reconnect automatically' }].slice(0, 100));
        }
        setTimeout(() => checkMicroserviceHealth(), 5000);
        setTimeout(() => checkMicroserviceHealth(), 15000);
      }
    } catch (error) {
      console.error(`Failed to restart ${serviceName}:`, error);
      setMicroserviceHealth(prev => ({ ...prev, [serviceName]: { ...prev[serviceName], status: 'unhealthy' } }));
      setRelayLogs(prev => [...prev, { timestamp: new Date().toISOString(), type: 'stderr', data: `Failed to restart ${displayName}: ${error.message}` }].slice(0, 100));
      alert(`Failed to restart ${displayName}: ${error.message}`);
    }
  };

  // --- Render ---
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="mb-4">
          {/* Trading toggle, position sizing, and action buttons */}
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center space-x-4 flex-shrink-0">
              <div className="flex items-center space-x-2">
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
                <span className={`text-xs font-medium ${tradingEnabled ? 'text-green-400' : 'text-red-400'}`}>
                  {isKillSwitchLoading ? '...' : tradingEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              {Object.entries(connectors).map(([name, conn]) => (
                <React.Fragment key={name}>
                  <span className="text-gray-600">|</span>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-300">{name === 'pickmytrade' ? 'PMT' : name}:</span>
                    <button
                      onClick={() => handleConnectorToggle(name)}
                      disabled={connectorLoading === name}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
                        conn.enabled ? 'bg-green-600' : 'bg-gray-600'
                      }`}
                      role="switch"
                      aria-checked={conn.enabled}
                      aria-label={`${name} connector is ${conn.enabled ? 'enabled' : 'disabled'}`}
                    >
                      <span className="sr-only">Toggle {name}</span>
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out ${
                          conn.enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <span className={`text-xs font-medium ${conn.enabled ? 'text-green-400' : 'text-gray-400'}`}>
                      {connectorLoading === name ? '...' : conn.enabled ? 'On' : 'Off'}
                    </span>
                  </div>
                </React.Fragment>
              ))}
              <span className="text-gray-600">|</span>
              <span className="text-sm text-blue-400 font-medium">
                {positionSizingSettings?.method === 'fixed'
                  ? `${positionSizingSettings?.fixedQuantity || 1} ${
                      positionSizingSettings?.contractType === 'full' ? 'Full' :
                      positionSizingSettings?.contractType === 'micro' ? 'Micro' : ''
                    } Contracts`
                  : `${positionSizingSettings?.riskPercentage || 10}% Risk`
                }
              </span>
              <span className="text-gray-600">|</span>
              <svg className={`w-4 h-4 ${socket?.isConnected ? 'text-green-400' : 'text-red-400'}`} fill="currentColor" viewBox="0 0 24 24" title={socket?.isConnected ? 'WebSocket connected' : 'WebSocket disconnected'}>
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowMarginModal(true)} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 text-sm rounded transition-colors flex-shrink-0">
                Margins
              </button>
              <button onClick={() => setShowPositionSizingModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 text-sm rounded transition-colors flex-shrink-0">
                Position Sizing
              </button>
              <button
                onClick={() => handleFullSync(false)}
                disabled={isFullSyncing || tradovateStatus !== 'connected'}
                className={`px-3 py-1 text-sm rounded transition-colors flex-shrink-0 ${
                  isFullSyncing || tradovateStatus !== 'connected'
                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    : 'bg-purple-600 hover:bg-purple-700 text-white'
                }`}
                title={tradovateStatus !== 'connected' ? 'Tradovate must be connected' : 'Reconcile orders/positions with Tradovate'}
              >
                {isFullSyncing ? 'Syncing...' : 'Full Sync'}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Microservices Health Grid */}
          {Object.entries(microserviceHealth)
            .filter(([serviceName]) => serviceName !== 'data-service' && serviceName !== 'macro-briefing' && serviceName !== 'signal-generator')
            .map(([serviceName, health]) => (
            <div key={serviceName} className="bg-gray-700 p-4 rounded relative">
              <h4 className="font-semibold text-white mb-2 capitalize">
                {serviceName.replace('-', ' ')}
              </h4>
              <p className={`text-sm font-bold ${
                health.status === 'healthy' ? 'text-green-400' :
                health.status === 'unhealthy' ? 'text-red-400' :
                health.status === 'restarting' ? 'text-yellow-400' : 'text-yellow-400'
              }`}>
                {health.status === 'healthy' ? 'Healthy' :
                 health.status === 'unhealthy' ? 'Down' :
                 health.status === 'restarting' ? 'Restarting' : 'Unknown'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {health.lastChecked ? `Last check: ${health.lastChecked.toLocaleTimeString()}` : 'Not checked'}
              </p>
              {process.env.REACT_APP_ENVIRONMENT === 'production' && (
                <button
                  onClick={() => handleServiceRestart(serviceName)}
                  disabled={health.status === 'restarting'}
                  className={`absolute top-2 right-2 px-2 py-1 text-xs rounded transition-colors ${
                    health.status === 'restarting'
                      ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                  title={health.status === 'restarting' ? 'Restart in progress...' : `Restart ${serviceName}`}
                >
                  {health.status === 'restarting' ? '...' : 'Restart'}
                </button>
              )}
            </div>
          ))}

          {/* Macro Briefing - Enhanced Card */}
          {microserviceHealth['macro-briefing'] && (
            <div className="bg-gray-700 p-4 rounded relative">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-semibold text-white mb-2">Macro Briefing</h4>
                  <p className={`text-sm font-bold ${
                    microserviceHealth['macro-briefing'].status === 'healthy' ? 'text-green-400' :
                    microserviceHealth['macro-briefing'].status === 'unhealthy' ? 'text-red-400' : 'text-yellow-400'
                  }`}>
                    {microserviceHealth['macro-briefing'].status === 'healthy' ? 'Healthy' :
                     microserviceHealth['macro-briefing'].status === 'unhealthy' ? 'Down' : 'Unknown'}
                  </p>
                </div>
                <button
                  onClick={handleGenerateBriefing}
                  disabled={isBriefingGenerating || macroBriefingHealth?.generating || microserviceHealth['macro-briefing'].status !== 'healthy'}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    isBriefingGenerating || macroBriefingHealth?.generating || microserviceHealth['macro-briefing'].status !== 'healthy'
                      ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      : 'bg-purple-600 hover:bg-purple-700 text-white'
                  }`}
                  title="Generate a new macro briefing now"
                >
                  {isBriefingGenerating || macroBriefingHealth?.generating ? 'Generating...' : 'Generate Now'}
                </button>
              </div>
              <div className="mt-2 space-y-1 text-xs">
                {macroBriefingHealth?.lastGeneration && (
                  <div><span className="text-gray-400">Last Generated:</span> <span className="text-white">{formatAge(macroBriefingHealth.lastGeneration)}</span></div>
                )}
                {!macroBriefingHealth?.lastGeneration && (
                  <div><span className="text-gray-400">Last Generated:</span> <span className="text-gray-500">Never</span></div>
                )}
                {macroBriefingHealth?.schedule && (
                  <div><span className="text-gray-400">Schedule:</span> <span className="text-white">{macroBriefingHealth.schedule}</span></div>
                )}
              </div>
            </div>
          )}

          {/* Data Service - Enhanced Card with Connection Status */}
          {microserviceHealth['data-service'] && (
            <div className={`bg-gray-700 p-4 rounded relative ${sgConnectionsExpanded ? 'col-span-full' : ''}`}>
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-semibold text-white mb-2">Data Service</h4>
                  <p className={`text-sm font-bold ${
                    microserviceHealth['data-service'].status === 'healthy' ? 'text-green-400' :
                    microserviceHealth['data-service'].status === 'unhealthy' ? 'text-red-400' :
                    microserviceHealth['data-service'].status === 'restarting' ? 'text-yellow-400' : 'text-yellow-400'
                  }`}>
                    {microserviceHealth['data-service'].status === 'healthy' ? 'Healthy' :
                     microserviceHealth['data-service'].status === 'unhealthy' ? 'Down' :
                     microserviceHealth['data-service'].status === 'restarting' ? 'Restarting' : 'Unknown'}
                    {signalGeneratorConnections?.overall && (
                      <span className={`ml-2 ${
                        signalGeneratorConnections.overall === 'healthy' ? 'text-green-400' :
                        signalGeneratorConnections.overall === 'degraded' ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        ({signalGeneratorConnections.overall === 'healthy' ? 'All Connected' :
                          signalGeneratorConnections.overall === 'degraded' ? 'Degraded' : 'Issues'})
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex gap-1">
                  {signalGeneratorConnections && (
                    <button
                      onClick={() => setSgConnectionsExpanded(!sgConnectionsExpanded)}
                      className="text-gray-400 hover:text-white transition-colors p-1"
                      title={sgConnectionsExpanded ? 'Collapse' : 'Expand connections'}
                    >
                      <svg className={`w-4 h-4 transition-transform ${sgConnectionsExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  )}
                  {process.env.REACT_APP_ENVIRONMENT === 'production' && (
                    <button
                      onClick={() => handleServiceRestart('data-service')}
                      disabled={microserviceHealth['data-service'].status === 'restarting'}
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        microserviceHealth['data-service'].status === 'restarting'
                          ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      {microserviceHealth['data-service'].status === 'restarting' ? '...' : 'Restart'}
                    </button>
                  )}
                </div>
              </div>

              {/* Connection Badges */}
              {signalGeneratorConnections?.connections && (
                <div className="flex flex-wrap gap-1 mt-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    signalGeneratorConnections.connections.tradingview?.connected
                      ? 'bg-green-900/50 text-green-300 border border-green-700/50'
                      : 'bg-red-900/50 text-red-300 border border-red-700/50'
                  }`}>
                    {signalGeneratorConnections.connections.tradingview?.connected ? '✓' : '✗'} TV
                  </span>
                  {!signalGeneratorConnections.connections.ltMonitor?.notRequired && (
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      signalGeneratorConnections.connections.ltMonitor?.connected
                        ? 'bg-green-900/50 text-green-300 border border-green-700/50'
                        : 'bg-red-900/50 text-red-300 border border-red-700/50'
                    }`}>
                      {signalGeneratorConnections.connections.ltMonitor?.connected ? '✓' : '✗'} LT
                    </span>
                  )}
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    signalGeneratorConnections.connections.tradier?.websocketStatus === 'connected'
                      ? 'bg-green-900/50 text-green-300 border border-green-700/50'
                      : signalGeneratorConnections.connections.tradier?.websocketStatus === 'market_closed'
                      ? 'bg-yellow-900/50 text-yellow-300 border border-yellow-700/50'
                      : 'bg-red-900/50 text-red-300 border border-red-700/50'
                  }`}>
                    {signalGeneratorConnections.connections.tradier?.websocketStatus === 'connected' ? '✓' :
                     signalGeneratorConnections.connections.tradier?.websocketStatus === 'market_closed' ? '⏸' : '✗'} Schwab
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    signalGeneratorConnections.connections.cboe?.hasData
                      ? 'bg-green-900/50 text-green-300 border border-green-700/50'
                      : 'bg-red-900/50 text-red-300 border border-red-700/50'
                  }`}>
                    {signalGeneratorConnections.connections.cboe?.hasData ? '✓' : '✗'} CBOE
                  </span>
                </div>
              )}

              {/* Expanded Connection Details */}
              {sgConnectionsExpanded && signalGeneratorConnections?.connections && (
                <div className="mt-3 pt-3 border-t border-gray-600 space-y-2">
                  {/* TradingView */}
                  <div className="bg-gray-800/50 rounded p-2">
                    <div className="flex justify-between items-center">
                      <span className="text-white text-sm font-medium">TradingView WebSocket</span>
                      <span className={`text-xs ${signalGeneratorConnections.connections.tradingview?.connected ? 'text-green-400' : 'text-red-400'}`}>
                        {signalGeneratorConnections.connections.tradingview?.connected ? 'Connected' : 'Disconnected'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1 text-xs">
                      <div><span className="text-gray-400">Auth State:</span> <span className={
                        signalGeneratorConnections.connections.tradingview?.authState === 'authenticated' ? 'text-green-400' :
                        signalGeneratorConnections.connections.tradingview?.authState === 'delayed' ? 'text-red-400' : 'text-yellow-400'
                      }>{(signalGeneratorConnections.connections.tradingview?.authState || 'unknown').charAt(0).toUpperCase() + (signalGeneratorConnections.connections.tradingview?.authState || 'unknown').slice(1)}</span></div>
                      <div><span className="text-gray-400">Token TTL:</span> <span className={
                        signalGeneratorConnections.connections.tradingview?.tokenTTL != null && signalGeneratorConnections.connections.tradingview.tokenTTL < 0 ? 'text-red-400' :
                        signalGeneratorConnections.connections.tradingview?.tokenTTL != null && signalGeneratorConnections.connections.tradingview.tokenTTL < 3600 ? 'text-yellow-400' : 'text-white'
                      }>{formatTTL(signalGeneratorConnections.connections.tradingview?.tokenTTL)}</span></div>
                      <div><span className="text-gray-400">Last Quote:</span> <span className="text-white">{formatAge(signalGeneratorConnections.connections.tradingview?.lastQuoteReceived)}</span></div>
                      <div><span className="text-gray-400">Reconnects:</span> <span className="text-white">{signalGeneratorConnections.connections.tradingview?.reconnectAttempts || 0}</span></div>
                    </div>
                    {/* Set Token */}
                    <div className="mt-2">
                      {!showTokenForm ? (
                        <button
                          onClick={() => { setShowTokenForm(true); setTokenMessage(null); }}
                          className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                        >
                          Set Token
                        </button>
                      ) : (
                        <form onSubmit={handleTokenSubmit} className="space-y-2">
                          <textarea
                            value={tokenInput}
                            onChange={(e) => setTokenInput(e.target.value)}
                            placeholder="Paste JWT token (eyJ...)"
                            className="w-full bg-gray-900 text-white text-xs font-mono p-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none resize-none"
                            rows={3}
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button
                              type="submit"
                              disabled={tokenSubmitting || !tokenInput.trim()}
                              className="text-xs px-3 py-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded transition-colors"
                            >
                              {tokenSubmitting ? 'Setting...' : 'Submit'}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setShowTokenForm(false); setTokenInput(''); setTokenMessage(null); }}
                              className="text-xs px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      )}
                      {tokenMessage && (
                        <div className={`mt-1 text-xs ${tokenMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                          {tokenMessage.text}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* LT Monitor */}
                  {!signalGeneratorConnections.connections.ltMonitor?.notRequired && (
                    <div className="bg-gray-800/50 rounded p-2">
                      <div className="flex justify-between items-center">
                        <span className="text-white text-sm font-medium">LT Monitor WebSocket</span>
                        <span className={`text-xs ${signalGeneratorConnections.connections.ltMonitor?.connected ? 'text-green-400' : 'text-red-400'}`}>
                          {signalGeneratorConnections.connections.ltMonitor?.connected ? 'Connected' : 'Disconnected'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-1 text-xs">
                        <div><span className="text-gray-400">Has Levels:</span> <span className="text-white">{signalGeneratorConnections.connections.ltMonitor?.hasLevels ? 'Yes' : 'No'}</span></div>
                        <div><span className="text-gray-400">Heartbeat:</span> <span className="text-white">{formatAge(signalGeneratorConnections.connections.ltMonitor?.lastHeartbeat)}</span></div>
                      </div>
                    </div>
                  )}

                  {/* Schwab */}
                  <div className="bg-gray-800/50 rounded p-2">
                    <div className="flex justify-between items-center">
                      <span className="text-white text-sm font-medium">Schwab Options</span>
                      <span className={`text-xs ${
                        signalGeneratorConnections.connections.tradier?.websocketStatus === 'connected' ? 'text-green-400' :
                        signalGeneratorConnections.connections.tradier?.websocketStatus === 'market_closed' ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {signalGeneratorConnections.connections.tradier?.displayStatus || 'Unknown'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1 text-xs">
                      <div><span className="text-gray-400">Available:</span> <span className="text-white">{signalGeneratorConnections.connections.tradier?.available ? 'Yes' : 'No'}</span></div>
                      <div><span className="text-gray-400">Running:</span> <span className="text-white">{signalGeneratorConnections.connections.tradier?.running ? 'Yes' : 'No'}</span></div>
                      <div><span className="text-gray-400">Has Token:</span> <span className="text-white">{signalGeneratorConnections.connections.tradier?.hasToken ? 'Yes' : 'No'}</span></div>
                      <div><span className="text-gray-400">Last Calc:</span> <span className="text-white">{formatAge(signalGeneratorConnections.connections.tradier?.lastCalculation)}</span></div>
                    </div>
                    {/* Schwab OAuth */}
                    <div className="mt-2">
                      {!showSchwabTokenForm ? (
                        <button
                          onClick={() => { setShowSchwabTokenForm(true); setSchwabTokenMessage(null); }}
                          className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                        >
                          Re-authenticate
                        </button>
                      ) : (
                        <form onSubmit={handleSchwabTokenSubmit} className="space-y-2">
                          <div className="text-xs text-gray-400">
                            1. <a
                              href="https://api.schwabapi.com/v1/oauth/authorize?client_id=buA1SLS7GCPwg67M9ZjsKyRvbIUZpyBLcTOWYFhJBluwq4tk&redirect_uri=https://127.0.0.1:8182"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300 underline"
                            >Open Schwab login</a> and authorize
                            <br />2. Copy the redirect URL from the address bar
                            <br />3. Paste it below
                          </div>
                          <textarea
                            value={schwabTokenInput}
                            onChange={(e) => setSchwabTokenInput(e.target.value)}
                            placeholder="Paste redirect URL (https://127.0.0.1:8182?code=...)"
                            className="w-full bg-gray-900 text-white text-xs font-mono p-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none resize-none"
                            rows={3}
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button
                              type="submit"
                              disabled={schwabTokenSubmitting || !schwabTokenInput.trim()}
                              className="text-xs px-3 py-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded transition-colors"
                            >
                              {schwabTokenSubmitting ? 'Authenticating...' : 'Submit'}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setShowSchwabTokenForm(false); setSchwabTokenInput(''); setSchwabTokenMessage(null); }}
                              className="text-xs px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      )}
                      {schwabTokenMessage && (
                        <div className={`mt-1 text-xs ${schwabTokenMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                          {schwabTokenMessage.text}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* CBOE */}
                  <div className="bg-gray-800/50 rounded p-2">
                    <div className="flex justify-between items-center">
                      <span className="text-white text-sm font-medium">CBOE API</span>
                      <span className={`text-xs ${signalGeneratorConnections.connections.cboe?.hasData ? 'text-green-400' : 'text-red-400'}`}>
                        {signalGeneratorConnections.connections.cboe?.hasData ? 'Has Data' : 'No Data'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1 text-xs">
                      <div><span className="text-gray-400">Enabled:</span> <span className="text-white">{signalGeneratorConnections.connections.cboe?.enabled ? 'Yes' : 'No'}</span></div>
                      <div><span className="text-gray-400">Data Age:</span> <span className="text-white">{signalGeneratorConnections.connections.cboe?.ageMinutes != null ? `${signalGeneratorConnections.connections.cboe.ageMinutes} min` : 'N/A'}</span></div>
                      <div><span className="text-gray-400">Last Fetch:</span> <span className="text-white">{formatAge(signalGeneratorConnections.connections.cboe?.lastFetch)}</span></div>
                    </div>
                  </div>

                  {/* Hybrid GEX */}
                  {signalGeneratorConnections.connections.hybridGex && (
                    <div className="bg-gray-800/50 rounded p-2">
                      <div className="flex justify-between items-center">
                        <span className="text-white text-sm font-medium">Hybrid GEX</span>
                        <span className={`text-xs ${signalGeneratorConnections.connections.hybridGex?.enabled ? 'text-green-400' : 'text-gray-400'}`}>
                          {signalGeneratorConnections.connections.hybridGex?.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1 text-xs">
                        <div><span className="text-gray-400">Primary:</span> <span className="text-white">{signalGeneratorConnections.connections.hybridGex?.primarySource || 'N/A'}</span></div>
                        <div><span className="text-gray-400">RTH Cache:</span> <span className="text-white">{signalGeneratorConnections.connections.hybridGex?.usingRTHCache ? 'Yes' : 'No'}</span></div>
                        <div><span className="text-gray-400">Schwab Fresh:</span> <span className="text-white">{signalGeneratorConnections.connections.hybridGex?.tradierFresh ? 'Yes' : 'No'}</span></div>
                      </div>
                    </div>
                  )}

                  <div className="text-xs text-gray-500 text-right">
                    Updated: {signalGeneratorConnections.timestamp ? formatAge(signalGeneratorConnections.timestamp) : 'Never'}
                  </div>
                </div>
              )}

              {!sgConnectionsExpanded && (
                <p className="text-xs text-gray-400 mt-1">
                  {microserviceHealth['data-service'].lastChecked
                    ? `Last check: ${microserviceHealth['data-service'].lastChecked.toLocaleTimeString()}`
                    : 'Not checked'}
                </p>
              )}
            </div>
          )}

          {/* Signal Generator - Enhanced Card with Strategy Controls */}
          {microserviceHealth['signal-generator'] && (
            <div className={`bg-gray-700 p-4 rounded relative ${strategiesExpanded ? 'col-span-full' : ''}`}>
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-semibold text-white mb-2">Signal Generator</h4>
                  <p className={`text-sm font-bold ${
                    microserviceHealth['signal-generator'].status === 'healthy' ? 'text-green-400' :
                    microserviceHealth['signal-generator'].status === 'unhealthy' ? 'text-red-400' :
                    'text-yellow-400'
                  }`}>
                    {microserviceHealth['signal-generator'].status === 'healthy' ? 'Healthy' :
                     microserviceHealth['signal-generator'].status === 'unhealthy' ? 'Down' : 'Unknown'}
                    {strategies.length > 0 && (
                      <span className="ml-2 text-gray-400 font-normal">
                        ({strategies.filter(s => s.enabled).length}/{strategies.length} active)
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex gap-1">
                  {strategies.length > 0 && (
                    <button
                      onClick={() => setStrategiesExpanded(!strategiesExpanded)}
                      className="text-gray-400 hover:text-white transition-colors p-1"
                      title={strategiesExpanded ? 'Collapse' : 'Expand strategies'}
                    >
                      <svg className={`w-4 h-4 transition-transform ${strategiesExpanded ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  )}
                  {process.env.REACT_APP_ENVIRONMENT === 'production' && (
                    <button onClick={() => handleServiceRestart('signal-generator')}
                      disabled={microserviceHealth['signal-generator'].status === 'restarting'}
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        microserviceHealth['signal-generator'].status === 'restarting'
                          ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}>
                      {microserviceHealth['signal-generator'].status === 'restarting' ? '...' : 'Restart'}
                    </button>
                  )}
                </div>
              </div>

              {/* Strategy Badges (collapsed view) */}
              {strategies.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {strategies.map(s => (
                    <span key={`${s.product}-${s.name}`} className={`px-2 py-0.5 rounded text-xs ${
                      s.enabled && s.data_ready && s.evaluation_readiness?.ready
                        ? 'bg-green-900/50 text-green-300 border border-green-700/50'
                        : s.enabled && s.data_ready
                        ? 'bg-yellow-900/50 text-yellow-300 border border-yellow-700/50'
                        : s.enabled
                        ? 'bg-blue-900/50 text-blue-300 border border-blue-700/50'
                        : 'bg-gray-800/50 text-gray-400 border border-gray-600/50'
                    }`}>
                      {s.enabled ? (s.evaluation_readiness?.ready ? '\u2713' : '\u23F3') : '\u2717'} {s.name}
                      {s.product !== 'NQ' ? ` (${s.product})` : ''}
                    </span>
                  ))}
                </div>
              )}

              {/* Expanded Strategy Details */}
              {strategiesExpanded && strategies.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-600 space-y-2">
                  {strategies.map(s => (
                    <div key={`${s.product}-${s.name}`} className="bg-gray-800/50 rounded p-2">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="text-white text-sm font-medium">{s.name}</span>
                          <span className="text-xs text-gray-400">{s.product}</span>
                          {s.position?.in_position && (
                            <span className="px-1.5 py-0.5 rounded text-xs bg-purple-900/50 text-purple-300 border border-purple-700/50">
                              IN POSITION
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs ${s.data_ready ? 'text-green-400' : 'text-yellow-400'}`}>
                            {s.data_ready ? 'Data Ready' : 'Waiting...'}
                          </span>
                          <button
                            onClick={() => handleStrategyToggle(s.constant, s.enabled)}
                            disabled={strategyToggleLoading === s.constant}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                              strategyToggleLoading === s.constant ? 'opacity-50 cursor-not-allowed' :
                              s.enabled ? 'bg-green-600' : 'bg-gray-600'
                            }`}
                          >
                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                              s.enabled ? 'translate-x-4' : 'translate-x-0.5'
                            }`} />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1 text-xs">
                        <div><span className="text-gray-400">Session:</span> <span className={
                          s.session?.in_session ? 'text-green-400' : 'text-gray-400'
                        }>{s.session?.in_session ? 'Active' : 'Inactive'}</span></div>
                        <div><span className="text-gray-400">Cooldown:</span> <span className={
                          s.cooldown?.in_cooldown ? 'text-yellow-400' : 'text-green-400'
                        }>{s.cooldown?.formatted}</span></div>
                        <div><span className="text-gray-400">Timeframe:</span> <span className="text-white">{s.eval_timeframe}</span></div>
                        <div><span className="text-gray-400">Symbol:</span> <span className="text-white">{s.trading_symbol}</span></div>
                      </div>
                      {s.evaluation_readiness?.blockers?.length > 0 && (
                        <div className="mt-1 text-xs text-red-400">
                          Blockers: {s.evaluation_readiness.blockers.join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {!strategiesExpanded && (
                <p className="text-xs text-gray-400 mt-1">
                  {microserviceHealth['signal-generator'].lastChecked
                    ? `Last check: ${microserviceHealth['signal-generator'].lastChecked.toLocaleTimeString()}`
                    : 'Not checked'}
                </p>
              )}
            </div>
          )}

        </div>

        {/* Health Controls */}
        <div className="mt-4 flex space-x-2">
          <button
            onClick={() => { checkMicroserviceHealth(); fetchSignalGeneratorConnections(); fetchMacroBriefingHealth(); fetchStrategies(); }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 text-sm rounded transition-colors"
          >
            Refresh Health
          </button>
        </div>
      </div>

      {/* Position Sizing Modal */}
      {showPositionSizingModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">Position Sizing Settings</h3>
              <button onClick={() => setShowPositionSizingModal(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Position Sizing Method</label>
                <select
                  value={positionSizingSettings.method}
                  onChange={(e) => setPositionSizingSettings(prev => ({ ...prev, method: e.target.value }))}
                  className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2"
                >
                  <option value="fixed">Fixed Contracts</option>
                  <option value="risk_based">Risk-Based Sizing</option>
                </select>
              </div>
              {positionSizingSettings.method === 'fixed' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Fixed Quantity (contracts)</label>
                    <input
                      type="number" min="1" max="100"
                      value={positionSizingSettings.fixedQuantity}
                      onChange={(e) => setPositionSizingSettings(prev => ({ ...prev, fixedQuantity: parseInt(e.target.value) || 1 }))}
                      className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Contract Type Override</label>
                    <select
                      value={positionSizingSettings.contractType}
                      onChange={(e) => setPositionSizingSettings(prev => ({ ...prev, contractType: e.target.value }))}
                      className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2"
                    >
                      <option value="auto">Auto (Use Signal)</option>
                      <option value="full">Force Full Size (NQ, ES)</option>
                      <option value="micro">Force Micro (MNQ, MES)</option>
                    </select>
                    <p className="text-xs text-gray-400 mt-1">Override signal's contract type when using fixed sizing</p>
                  </div>
                </>
              )}
              {positionSizingSettings.method === 'risk_based' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Risk Percentage (%)</label>
                  <input
                    type="number" min="0.1" max="100" step="0.1"
                    value={positionSizingSettings.riskPercentage}
                    onChange={(e) => setPositionSizingSettings(prev => ({ ...prev, riskPercentage: parseFloat(e.target.value) || 10 }))}
                    className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2"
                  />
                  <p className="text-xs text-gray-400 mt-1">Percentage of account balance at risk per trade</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Maximum Contracts</label>
                <input
                  type="number" min="1" max="100"
                  value={positionSizingSettings.maxContracts}
                  onChange={(e) => setPositionSizingSettings(prev => ({ ...prev, maxContracts: parseInt(e.target.value) || 10 }))}
                  className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-2"
                />
                <p className="text-xs text-gray-400 mt-1">Safety limit on position size</p>
              </div>
              {positionSizingSettings.method === 'risk_based' && (
                <div className="bg-gray-700 p-3 rounded">
                  <h4 className="text-sm font-medium text-gray-300 mb-2">Risk Preview (MNQ)</h4>
                  <div className="space-y-1 text-xs">
                    {[1000, 5000, 25000].map(amount => (
                      <div key={amount} className="flex justify-between">
                        <span className="text-gray-400">${amount.toLocaleString()} account:</span>
                        <span className="text-white">
                          {Math.min(Math.floor((amount * positionSizingSettings.riskPercentage) / 100 / 104), positionSizingSettings.maxContracts)} contracts
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 text-xs text-gray-400">Max loss per contract: $104 (52 points x $2/point)</div>
                </div>
              )}
            </div>
            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3 mt-6">
              <button onClick={() => setShowPositionSizingModal(false)} className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-3 sm:py-2 px-4 rounded transition-colors text-base">Cancel</button>
              <button onClick={handleSavePositionSizing} disabled={positionSizingLoading} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white py-3 sm:py-2 px-4 rounded transition-colors text-base">
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
              <h3 className="text-lg font-semibold text-white">Day Margin Requirements</h3>
              <button onClick={() => setShowMarginModal(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="space-y-4">
              <div className="text-sm text-gray-300 mb-4">
                Configure day trading margin requirements for each contract type.
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
                          <label className="block text-xs font-medium text-gray-400 mb-1">Day Margin Requirement</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">$</span>
                            <input
                              type="number"
                              value={settings.dayMargin}
                              onChange={(e) => setMarginSettings(prev => ({ ...prev, [symbol]: { ...prev[symbol], dayMargin: parseInt(e.target.value) || 0 } }))}
                              className="w-full bg-gray-600 border border-gray-500 text-white pl-8 pr-3 py-2 rounded focus:ring-2 focus:ring-green-500 focus:border-transparent"
                            />
                          </div>
                        </div>
                        <div className="text-xs text-gray-400 space-y-1">
                          <div className="flex justify-between"><span>Point Value:</span><span className="text-white">${settings.pointValue}</span></div>
                          <div className="flex justify-between"><span>Max Loss (52 pts):</span><span className="text-white">${(52 * settings.pointValue).toFixed(0)}</span></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-400 py-8">
                  <div className="text-4xl mb-2">Loading...</div>
                </div>
              )}
              <div className="bg-gray-700 p-4 rounded">
                <h4 className="font-semibold text-white mb-2">How It Works</h4>
                <div className="text-sm text-gray-300 space-y-2">
                  <p>When intelligent contract selection is enabled, the system uses these margin requirements to determine if your account can afford the requested contract.</p>
                  <p>If you request NQ but only have $1,000 available, it will convert to MNQ.</p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowMarginModal(false)} className="bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded transition-colors">Cancel</button>
              <button onClick={handleSaveMarginSettings} disabled={marginLoading} className="bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white py-2 px-4 rounded transition-colors">
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
              <button onClick={() => { setShowJsonModal(false); setSelectedJsonData(null); }} className="text-gray-400 hover:text-white">✕</button>
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
                Copy JSON
              </button>
              <button onClick={() => { setShowJsonModal(false); setSelectedJsonData(null); }} className="bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlatformStatus;
