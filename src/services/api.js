import axios from 'axios';

// Create axios instance with base configuration
const baseURL = process.env.REACT_APP_API_URL || 'http://localhost:3014';
console.log('🌐 API Base URL:', baseURL);

const apiClient = axios.create({
  baseURL: baseURL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for logging and authentication
apiClient.interceptors.request.use(
  (config) => {
    // Add authentication token from localStorage
    const token = localStorage.getItem('dashboardToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    const fullUrl = config.baseURL + config.url;
    console.log(`🌐 API Request: ${config.method?.toUpperCase()} ${fullUrl}`);
    console.log('🔍 Full config:', {
      baseURL: config.baseURL,
      url: config.url,
      method: config.method,
      hasAuth: !!token
    });
    return config;
  },
  (error) => {
    console.error('🚨 API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling and auto-logout on 401
apiClient.interceptors.response.use(
  (response) => {
    console.log(`✅ API Response: ${response.status} ${response.config.url}`);
    return response.data;
  },
  (error) => {
    const errorMessage = error.response?.data?.error || error.message || 'Network error';
    console.error(`❌ API Error: ${error.response?.status || 'Unknown'} - ${errorMessage}`);

    // Handle 401 unauthorized responses
    if (error.response?.status === 401) {
      console.log('🚫 Received 401 - clearing token');
      localStorage.removeItem('dashboardToken');
      // Don't reload the page — React state handles showing the login screen.
      // window.location.reload() here causes an infinite loop when
      // useTradingData fires before authentication.
      return Promise.reject(new Error('Authentication required'));
    }

    // Create user-friendly error messages
    const userError = new Error(errorMessage);
    userError.status = error.response?.status;
    userError.originalError = error;

    return Promise.reject(userError);
  }
);

/**
 * API service for communicating with the Slingshot monitoring service
 */
export const api = {
  // Health check
  async getHealth() {
    return await apiClient.get('/health');
  },

  // Dashboard endpoint - comprehensive data
  async getDashboard() {
    return await apiClient.get('/api/dashboard');
  },

  // Account endpoints
  async getAccounts() {
    const accounts = await apiClient.get('/api/accounts');
    // Return in format expected by components: {accounts: [...]}
    return { accounts: Array.isArray(accounts) ? accounts : [] };
  },

  async getAccount(accountId) {
    return await apiClient.get(`/api/accounts/${accountId}`);
  },

  async getAccountBalance(accountId) {
    return await apiClient.get(`/api/accounts/${accountId}/balance`);
  },

  async getPendingOrders() {
    return await apiClient.get('/api/pending');
  },

  async resendSignal(signal, targetAccountId = null) {
    return await apiClient.post('/api/signals/resend', { signal, targetAccountId });
  },

  async getAccountSummary(accountId) {
    return await apiClient.get(`/api/accounts/${accountId}`);
  },

  async getAllAccountsOverview() {
    return await apiClient.get('/api/accounts');
  },

  // Trading endpoints
  async getAllPositions() {
    return await apiClient.get('/api/positions');
  },

  async getAllOrders() {
    const dashboard = await apiClient.get('/api/dashboard');
    return dashboard.orders || [];
  },

  async getDailyPnL() {
    const accounts = await apiClient.get('/api/accounts');
    return accounts.reduce((total, account) => {
      return total + (account.realizedPnL || 0) + (account.unrealizedPnL || 0);
    }, 0);
  },

  async getTradingStats() {
    const dashboard = await apiClient.get('/api/dashboard');
    const accounts = dashboard.accounts || [];
    const positions = dashboard.positions || [];

    return {
      totalAccounts: accounts.length,
      totalPositions: positions.length,
      totalPnL: accounts.reduce((sum, acc) => sum + (acc.realizedPnL || 0) + (acc.unrealizedPnL || 0), 0),
      totalBalance: accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0)
    };
  },

  async getCriticalStatus() {
    try {
      // Get clean trading data from trade-orchestrator via monitoring service proxy
      const tradingStatus = await this.getActiveTradingStatus();
      const services = await apiClient.get('/api/services');

      const downServices = services.filter(s => s.status !== 'running');

      // Use trade-orchestrator's clean, filtered data
      const openPositions = tradingStatus.positions || [];
      const openOrders = [
        ...(tradingStatus.pendingEntryOrders || []),
        ...(tradingStatus.stopOrders || []),
        ...(tradingStatus.targetOrders || [])
      ];

      return {
        status: downServices.length === 0 ? 'healthy' : 'critical',
        issues: downServices.map(s => `${s.name} is ${s.status}`),
        openPositions: openPositions,
        openOrders: openOrders,
        lastUpdate: tradingStatus.lastUpdate || new Date().toISOString(),
        services: services,
        tradingEnabled: tradingStatus.tradingEnabled,
        stats: tradingStatus.stats
      };
    } catch (error) {
      console.error('Failed to get critical status:', error);
      return {
        status: 'error',
        issues: ['Failed to load trading data'],
        openPositions: [],
        openOrders: [],
        lastUpdate: new Date().toISOString()
      };
    }
  },

  // Get active trading status via monitoring service proxy
  async getActiveTradingStatus() {
    try {
      console.log('📊 Getting trading status via monitoring service...');
      const response = await apiClient.get('/api/trading/active-status');
      console.log('✅ Trading status response:', response);
      return response;
    } catch (error) {
      console.error('❌ Failed to get active trading status:', error);
      throw error;
    }
  },

  // Get enhanced trading status with signal context and market data
  async getEnhancedTradingStatus() {
    try {
      console.log('🎯 Getting enhanced trading status...');
      const response = await apiClient.get('/api/trading/enhanced-status');
      console.log('✅ Enhanced trading status response:', response);
      return response;
    } catch (error) {
      console.error('❌ Failed to get enhanced trading status:', error);
      throw error;
    }
  },

  async getTradingHealth() {
    try {
      console.log('🏥 Calling getTradingHealth...');
      const services = await apiClient.get('/api/services');
      console.log('✅ getTradingHealth success:', services);

      // Find the tradovate service
      const tradovateService = services.find(s => s.name === 'tradovate-service');

      if (tradovateService) {
        return {
          authenticated: tradovateService.status === 'running',
          authenticationStatus: tradovateService.status === 'running' ? 'connected' : 'failed',
          authenticationError: tradovateService.status !== 'running' ? 'Service not running' : null,
          service: tradovateService
        };
      } else {
        return {
          authenticated: false,
          authenticationStatus: 'failed',
          authenticationError: 'Tradovate service not found'
        };
      }
    } catch (error) {
      console.error('❌ getTradingHealth failed:', error);
      return {
        authenticated: false,
        authenticationStatus: 'failed',
        authenticationError: error.message
      };
    }
  },

  // Activity log
  async getActivity(limit = 100) {
    return await apiClient.get(`/api/activity?limit=${limit}`);
  },

  async getSignals(limit = 50) {
    return await apiClient.get(`/api/signals?limit=${limit}`);
  },

  // Strategy alerts
  async getAlerts() {
    return await apiClient.get('/api/alerts');
  },

  async deleteAlerts() {
    return await apiClient.delete('/api/alerts');
  },

  // Service monitoring
  async getServices() {
    return await apiClient.get('/api/services');
  },

  async restartService(serviceName) {
    return await apiClient.post(`/api/services/${serviceName}/restart`);
  },

  // Market data / quotes
  async getQuotes() {
    try {
      return await apiClient.get('/api/quotes');
    } catch (error) {
      console.log('Quotes not available:', error.message);
      return {};
    }
  },

  // Candle history from siggen-nq-ivskew (for chart initialization)
  async getCandles(count = 60) {
    try {
      return await apiClient.get(`/api/candles?count=${count}`);
    } catch (error) {
      console.log('Candle history not available:', error.message);
      return null;
    }
  },

  // GEX levels from siggen-nq-ivskew
  async getGexLevels() {
    try {
      return await apiClient.get('/api/gex/levels');
    } catch (error) {
      console.log('GEX levels not available:', error.message);
      return null;
    }
  },

  // Refresh GEX levels - force recalculation
  async refreshGexLevels() {
    try {
      return await apiClient.post('/api/gex/refresh');
    } catch (error) {
      console.error('Failed to refresh GEX levels:', error.message);
      throw error;
    }
  },

  // ES GEX levels from siggen-es-cross
  async getEsGexLevels() {
    try {
      return await apiClient.get('/api/es/gex/levels');
    } catch (error) {
      console.log('ES GEX levels not available:', error.message);
      return null;
    }
  },

  // Refresh ES GEX levels - force recalculation
  async refreshEsGexLevels() {
    try {
      return await apiClient.post('/api/es/gex/refresh');
    } catch (error) {
      console.error('Failed to refresh ES GEX levels:', error.message);
      throw error;
    }
  },

  // ES Tradier GEX levels from siggen-es-cross
  async getEsTradierGexLevels() {
    try {
      return await apiClient.get('/api/es/tradier/gex/levels');
    } catch (error) {
      console.log('ES Tradier GEX levels not available:', error.message);
      return null;
    }
  },

  // Refresh ES Tradier GEX levels - force recalculation
  async refreshEsTradierGexLevels() {
    try {
      return await apiClient.post('/api/es/tradier/gex/refresh');
    } catch (error) {
      console.error('Failed to refresh ES Tradier GEX levels:', error.message);
      throw error;
    }
  },

  // ES candle history from siggen-es-cross (for chart initialization)
  async getEsCandles(count = 60) {
    try {
      return await apiClient.get(`/api/es/candles?count=${count}`);
    } catch (error) {
      console.log('ES candle history not available:', error.message);
      return null;
    }
  },

  // Tradier GEX levels from siggen-nq-ivskew
  async getTradierGexLevels() {
    try {
      return await apiClient.get('/api/tradier/gex/levels');
    } catch (error) {
      console.log('Tradier GEX levels not available:', error.message);
      return null;
    }
  },

  // Refresh Tradier GEX levels - force recalculation (triggers WebSocket broadcast)
  async refreshTradierGexLevels() {
    try {
      return await apiClient.post('/api/tradier/gex/refresh');
    } catch (error) {
      console.error('Failed to refresh Tradier GEX levels:', error.message);
      throw error;
    }
  },

  // Get Tradier service status
  async getTradierStatus() {
    try {
      return await apiClient.get('/api/tradier/status');
    } catch (error) {
      console.log('Tradier status not available:', error.message);
      return null;
    }
  },

  // Get siggen-nq-ivskew detailed connection status
  async getSignalGeneratorStatus() {
    try {
      return await apiClient.get('/api/signal-generator/status');
    } catch (error) {
      console.log('Signal generator status not available:', error.message);
      return null;
    }
  },

  async setTradingViewToken(token) {
    return await apiClient.post('/api/tradingview/token', { token });
  },

  async setSchwabToken(redirectUrl) {
    return await apiClient.post('/api/schwab/token', { redirectUrl });
  },

  // Get siggen-es-cross detailed connection status
  async getESSignalGeneratorStatus() {
    try {
      return await apiClient.get('/api/es-signal-generator/status');
    } catch (error) {
      console.log('ES signal generator status not available:', error.message);
      return null;
    }
  },

  // Strategy status from siggen-nq-ivskew
  async getStrategyStatus() {
    try {
      return await apiClient.get('/api/strategy/gex-scalp/status');
    } catch (error) {
      console.log('Strategy status not available:', error.message);
      return null;
    }
  },

  // ES Cross-Signal strategy status from siggen-es-cross
  async getESCrossSignalStatus() {
    try {
      return await apiClient.get('/api/strategy/es-cross-signal/status');
    } catch (error) {
      console.log('ES cross-signal status not available:', error.message);
      return null;
    }
  },

  // IV Skew GEX strategy status from multi-strategy engine
  async getIVSkewGexStatus() {
    try {
      return await apiClient.get('/api/strategy/iv-skew-gex/status');
    } catch (error) {
      console.log('IV skew GEX status not available:', error.message);
      return null;
    }
  },

  // Impulse FVG strategy status from multi-strategy engine
  async getImpulseFvgStatus() {
    try {
      return await apiClient.get('/api/strategy/impulse-fvg/status');
    } catch (error) {
      console.log('Impulse FVG status not available:', error.message);
      return null;
    }
  },

  // Short-DTE IV strategy status from multi-strategy engine
  async getShortDTEIVStatus() {
    try {
      return await apiClient.get('/api/strategy/short-dte-iv/status');
    } catch (error) {
      console.log('Short-DTE IV status not available:', error.message);
      return null;
    }
  },

  // LT Candle Regime strategy status from multi-strategy engine
  async getLTCandleRegimeStatus() {
    try {
      return await apiClient.get('/api/strategy/lt-candle-regime/status');
    } catch (error) {
      console.log('LT Candle Regime status not available:', error.message);
      return null;
    }
  },

  // GEX-FLIP-IVPCT strategy status from multi-strategy engine
  async getGexFlipIvpctStatus() {
    try {
      return await apiClient.get('/api/strategy/gex-flip-ivpct/status');
    } catch (error) {
      console.log('GEX-FLIP-IVPCT status not available:', error.message);
      return null;
    }
  },

  // GEX-LT-3M-Crossover strategy status from multi-strategy engine
  async getGexLt3mCrossoverStatus() {
    try {
      return await apiClient.get('/api/strategy/gex-lt-3m-crossover/status');
    } catch (error) {
      console.log('GEX-LT-3M-Crossover status not available:', error.message);
      return null;
    }
  },

  // List all strategies from multi-strategy engine
  async getStrategiesList() {
    try {
      return await apiClient.get('/api/strategies');
    } catch (error) {
      console.log('Strategies list not available:', error.message);
      return null;
    }
  },

  // Enable a specific strategy (or all if no name provided)
  async enableStrategy(strategyName) {
    return await apiClient.post('/api/strategy/enable', { strategy: strategyName });
  },

  // Disable a specific strategy (or all if no name provided)
  async disableStrategy(strategyName) {
    return await apiClient.post('/api/strategy/disable', { strategy: strategyName });
  },

  // AI Trader status from siggen-nq-aitrader
  async getAITraderStatus() {
    try {
      return await apiClient.get('/api/strategy/ai-trader/status');
    } catch (error) {
      console.log('AI trader status not available:', error.message);
      return null;
    }
  },

  // AI Trader bias reassessment - trigger on-demand reassessment
  async triggerBiasReassessment() {
    return await apiClient.post('/api/strategy/ai-trader/reassess-bias');
  },

  // AI Trader observation mode toggle
  async setAITraderObservationMode(enabled) {
    return await apiClient.post('/api/strategy/ai-trader/observation-mode', { enabled });
  },

  // IV Skew data from siggen-nq-ivskew
  async getIVSkew() {
    try {
      return await apiClient.get('/api/iv/skew');
    } catch (error) {
      console.log('IV skew not available:', error.message);
      return null;
    }
  },

  // IV Skew history from siggen-nq-ivskew
  async getIVHistory() {
    try {
      return await apiClient.get('/api/iv/history');
    } catch (error) {
      console.log('IV history not available:', error.message);
      return null;
    }
  },

  // P&L History endpoints (from sync-pnl.js → Redis)
  async getPnLTrades(params = {}) {
    const query = new URLSearchParams(params).toString();
    return await apiClient.get(`/api/pnl/trades${query ? '?' + query : ''}`);
  },

  async getPnLDaily(params = {}) {
    const query = new URLSearchParams(params).toString();
    return await apiClient.get(`/api/pnl/daily${query ? '?' + query : ''}`);
  },

  async getPnLSummary() {
    return await apiClient.get('/api/pnl/summary');
  },

  async triggerPnLSync() {
    return await apiClient.post('/api/pnl/sync');
  },

  // Macro Briefing endpoints
  async getLatestBriefing() {
    return await apiClient.get('/api/briefing/latest');
  },

  async getBriefingStatus() {
    return await apiClient.get('/api/briefing/status');
  },

  async generateBriefing() {
    return await apiClient.post('/api/briefing/generate');
  },

  async reSync() {
    try {
      console.log('🔄 Calling reSync...');
      // Monitoring service doesn't have re-sync, but we can get fresh data
      const result = await apiClient.get('/api/dashboard');
      console.log('✅ reSync success:', result);
      return result;
    } catch (error) {
      console.error('❌ reSync failed:', error);
      throw error;
    }
  },

  async fullSync(options = {}) {
    try {
      console.log('🔄 Triggering full Tradovate sync...', options);
      // Call the tradovate-service sync endpoint via monitoring service proxy
      const response = await apiClient.post('/api/proxy/tradovate/sync/full', {
        dryRun: options.dryRun || false,
        reason: options.reason || 'manual_dashboard_request'
      });
      console.log('✅ Full sync response:', response);
      return response;
    } catch (error) {
      console.error('❌ Full sync failed:', error);
      throw error;
    }
  },

  // Account-specific endpoints
  async getAccountPositions(accountId) {
    return await apiClient.get(`/api/positions?accountId=${accountId}`);
  },

  async getAccountOrders(accountId) {
    const dashboard = await apiClient.get('/api/dashboard');
    const orders = dashboard.orders || [];
    return orders.filter(order => order.accountId === accountId);
  },

  // System endpoints
  async getSystemHealth() {
    return await apiClient.get('/api/services');
  },

  // Legacy endpoints - using monitoring service equivalents
  async getRelayStatus() {
    // Since we removed webhook-gateway, just return monitoring service status
    const services = await apiClient.get('/api/services');
    const monitoringService = services.find(s => s.name === 'monitoring-service');
    return monitoringService ? { status: monitoringService.status } : { status: 'unknown' };
  },

  async startRelay() {
    throw new Error('Relay control not needed - webhooks handled by monitoring service');
  },

  async stopRelay(force = false) {
    throw new Error('Relay control not needed - webhooks handled by monitoring service');
  },

  async restartRelay() {
    throw new Error('Relay control not needed - webhooks handled by monitoring service');
  },

  async getRelayLogs(lines = 50) {
    // Get recent webhook activity instead
    const activity = await apiClient.get(`/api/activity?limit=${lines}`);
    return activity.filter(a => a.type === 'webhook').map(a => a.message);
  },

  async updateRelayConfig(config) {
    throw new Error('Relay configuration not needed - webhooks handled by monitoring service');
  },

  async testRelayCommand() {
    throw new Error('Relay testing not needed - webhooks handled by monitoring service');
  },

  // Trading control endpoints
  async getKillSwitchStatus() {
    try {
      const response = await apiClient.get('/api/trading/status');
      const enabled = response.tradingEnabled ?? response.enabled ?? false;
      return {
        tradingEnabled: enabled,
        status: enabled ? 'enabled' : 'disabled',
        details: response
      };
    } catch (error) {
      console.error('Failed to get trading status:', error);
      return {
        tradingEnabled: false,
        status: 'unknown',
        error: error.message
      };
    }
  },

  async setKillSwitch(enabled, reason = null) {
    try {
      const endpoint = enabled ? '/api/trading/enable' : '/api/trading/disable';
      const response = await apiClient.post(endpoint, { reason });
      return {
        tradingEnabled: enabled,
        status: response.status,
        message: response.status
      };
    } catch (error) {
      console.error('Failed to set trading status:', error);
      throw new Error(`Failed to ${enabled ? 'enable' : 'disable'} trading: ${error.message}`);
    }
  },

  // Order routing management endpoints
  async getRoutingConfig() {
    try {
      return await apiClient.get('/api/routing/config');
    } catch (error) {
      console.error('Failed to get routing config:', error);
      return { routes: {}, availableDestinations: [], defaultDestinations: [] };
    }
  },

  async setStrategyDestination(strategyName, destination, enabled) {
    const action = enabled ? 'enable' : 'disable';
    return await apiClient.post(`/api/routing/strategy/${strategyName}/destination/${destination}/${action}`);
  },

  // Position sizing endpoints
  async getPositionSizingSettings() {
    return await apiClient.get('/api/position-sizing/settings');
  },

  async setPositionSizingSettings(settings) {
    return await apiClient.post('/api/position-sizing/settings', settings);
  },

  async calculatePositionSize(symbol, accountBalance = null) {
    return {
      quantity: 1,
      riskAmount: 0,
      stopLoss: 0
    };
  },

  async getContractSpecs() {
    return {};
  },

  async testPositionSizing(symbol = 'MNQ') {
    return {
      symbol,
      quantity: 1,
      success: false,
      message: 'Position sizing not available in monitoring mode'
    };
  },

  // Order management - these would need to be sent to tradovate-service via Redis
  async placeOrder(orderData) {
    // For now, just log - actual implementation would publish to Redis
    console.log('📋 Order placement request:', orderData);
    throw new Error('Order placement not yet implemented in monitoring service');
  },

  async cancelOrder(orderId) {
    // For now, just log - actual implementation would publish to Redis
    console.log('🚫 Order cancellation request:', orderId);
    throw new Error('Order cancellation not yet implemented in monitoring service');
  },

  async subscribeToQuote(symbol) {
    // Monitoring service provides price data in dashboard
    const dashboard = await apiClient.get('/api/dashboard');
    return dashboard.prices[symbol] || null;
  },

  // Webhook endpoints - these would be handled by monitoring service
  async getWebhookStats() {
    // Get activity related to webhooks
    const activity = await apiClient.get('/api/activity?limit=50');
    const webhookActivity = activity.filter(a => a.type === 'webhook');
    return {
      totalReceived: webhookActivity.length,
      recentActivity: webhookActivity.slice(-10)
    };
  },

  async testWebhook(testData = {}) {
    console.log('🧪 Webhook test request:', testData);
    throw new Error('Webhook testing not yet implemented in monitoring service');
  },

  // Margin management endpoints - not applicable to monitoring service
  async getMarginSettings() {
    return {
      enabled: false,
      marginSettings: {}
    };
  },

  async setMarginSettings(marginSettings) {
    console.log('Margin settings update not available in monitoring mode');
    return marginSettings;
  },

  async getOptimalContract(symbol, accountBalance = null) {
    return {
      symbol,
      quantity: 1,
      optimal: false,
      message: 'Contract optimization not available in monitoring mode'
    };
  },

  // Accounts CRUD (new account-store endpoints)
  createAccount: (data) => apiClient.post('/api/accounts', data),
  updateAccount: (id, data) => apiClient.put(`/api/accounts/${id}`, data),
  deleteAccount: (id) => apiClient.delete(`/api/accounts/${id}`),
  testAccount: (id) => apiClient.post(`/api/accounts/${id}/test`),

  // Connector schemas (drives dynamic forms)
  getConnectorSchemas: () => apiClient.get('/api/connectors/schemas'),

  // Routes CRUD
  getRoutes: () => apiClient.get('/api/routes'),
  setStrategyRoute: (strategy, accountIds) => apiClient.put(`/api/routes/${strategy}`, { accountIds }),
  setDefaultRoute: (accountIds) => apiClient.put('/api/routes/defaults', { accountIds }),
  deleteStrategyRoute: (strategy) => apiClient.delete(`/api/routes/${strategy}`),
  exportRoutes: () => apiClient.get('/api/routes/export'),
};

/**
 * Utility functions for API data processing
 */
export const apiUtils = {
  formatCurrency(value, currency = 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value || 0);
  },

  formatPercentage(value) {
    return new Intl.NumberFormat('en-US', {
      style: 'percent',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format((value || 0) / 100);
  },

  formatNumber(value) {
    return new Intl.NumberFormat('en-US').format(value || 0);
  },

  formatTimestamp(timestamp) {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  },

  getPositionStatusColor(quantity) {
    if (quantity > 0) return 'text-green-400';
    if (quantity < 0) return 'text-red-400';
    return 'text-gray-400';
  },

  getPnLColor(pnl) {
    if (pnl > 0) return 'text-green-400';
    if (pnl < 0) return 'text-red-400';
    return 'text-gray-400';
  },

  getOrderStatusColor(status) {
    switch (status?.toLowerCase()) {
      case 'working':
        return 'text-yellow-400';
      case 'filled':
        return 'text-green-400';
      case 'cancelled':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  },

  isTradingSessionActive() {
    const now = new Date();
    const day = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const hour = now.getHours();

    // Basic trading hours check (can be made more sophisticated)
    // Futures markets are generally open Sunday 6 PM - Friday 5 PM ET
    if (day === 0 && hour < 18) return false; // Sunday before 6 PM
    if (day === 6) return false; // Saturday
    if (day === 5 && hour >= 17) return false; // Friday after 5 PM

    return true;
  },

  validateOrderData(orderData) {
    const errors = [];

    if (!orderData.accountId) {
      errors.push('Account ID is required');
    }

    if (!orderData.symbol) {
      errors.push('Symbol is required');
    }

    if (!orderData.action) {
      errors.push('Action is required');
    }

    if (!orderData.quantity || orderData.quantity <= 0) {
      errors.push('Quantity must be greater than 0');
    }

    return errors;
  }
};

export default api;