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
      console.log('🚫 Received 401 - clearing token and reloading');
      localStorage.removeItem('dashboardToken');
      window.location.reload(); // Force reload to show login screen
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
    // Get account data which includes balance info
    const account = await apiClient.get(`/api/accounts/${accountId}`);
    return {
      balance: account.balance,
      realizedPnL: account.realizedPnL,
      unrealizedPnL: account.unrealizedPnL,
      marginUsed: account.marginUsed,
      marginAvailable: account.marginAvailable
    };
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
      return {
        tradingEnabled: response.enabled,
        status: response.enabled ? 'enabled' : 'disabled',
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
  }
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