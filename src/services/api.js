import axios from 'axios';

// Create axios instance with base configuration
const baseURL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
console.log('🌐 API Base URL:', baseURL);

const apiClient = axios.create({
  baseURL: baseURL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for logging
apiClient.interceptors.request.use(
  (config) => {
    const fullUrl = config.baseURL + config.url;
    console.log(`🌐 API Request: ${config.method?.toUpperCase()} ${fullUrl}`);
    console.log('🔍 Full config:', {
      baseURL: config.baseURL,
      url: config.url,
      method: config.method
    });
    return config;
  },
  (error) => {
    console.error('🚨 API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => {
    console.log(`✅ API Response: ${response.status} ${response.config.url}`);
    return response.data;
  },
  (error) => {
    const errorMessage = error.response?.data?.error || error.message || 'Network error';
    console.error(`❌ API Error: ${error.response?.status || 'Unknown'} - ${errorMessage}`);

    // Create user-friendly error messages
    const userError = new Error(errorMessage);
    userError.status = error.response?.status;
    userError.originalError = error;

    return Promise.reject(userError);
  }
);

/**
 * API service for communicating with the Slingshot backend
 */
export const api = {
  // Health check
  async getHealth() {
    return await apiClient.get('/health');
  },

  // Account endpoints
  async getAccounts() {
    return await apiClient.get('/api/account/list');
  },

  async getAccount(accountId) {
    return await apiClient.get(`/api/account/${accountId}`);
  },

  async getAccountBalance(accountId) {
    return await apiClient.get(`/api/account/${accountId}/balance`);
  },

  async getAccountSummary(accountId) {
    return await apiClient.get(`/api/account/${accountId}/summary`);
  },

  async getAllAccountsOverview() {
    return await apiClient.get('/api/account/overview/all');
  },

  // Trading endpoints
  async getAllPositions() {
    return await apiClient.get('/api/trading/positions');
  },

  async getAllOrders() {
    return await apiClient.get('/api/trading/orders');
  },

  async getDailyPnL() {
    return await apiClient.get('/api/trading/pnl');
  },

  async getTradingStats() {
    return await apiClient.get('/api/trading/stats');
  },

  async getCriticalStatus() {
    return await apiClient.get('/api/trading/critical-status');
  },

  async getTradingHealth() {
    try {
      console.log('🏥 Calling getTradingHealth...');
      const result = await apiClient.get('/api/trading/health');
      console.log('✅ getTradingHealth success:', result);
      return result;
    } catch (error) {
      console.error('❌ getTradingHealth failed:', error);
      console.error('❌ Error details:', {
        message: error.message,
        config: error.config,
        request: error.request,
        response: error.response
      });
      throw error;
    }
  },

  async reSync() {
    try {
      console.log('🔄 Calling reSync...');
      const result = await apiClient.post('/api/trading/re-sync');
      console.log('✅ reSync success:', result);
      return result.data;
    } catch (error) {
      console.error('❌ reSync failed:', error);
      throw error;
    }
  },

  // Order management
  async placeOrder(orderData) {
    return await apiClient.post('/api/trading/order', orderData);
  },

  async cancelOrder(orderId) {
    return await apiClient.delete(`/api/trading/order/${orderId}`);
  },

  async subscribeToQuote(symbol) {
    return await apiClient.get(`/api/trading/quote/${symbol}`);
  },

  // Webhook endpoints
  async getWebhookStats() {
    return await apiClient.get('/webhook/stats');
  },

  async testWebhook(testData = {}) {
    return await apiClient.post('/webhook/test', {
      action: 'BUY',
      symbol: 'ES',
      qty: 1,
      account: 'test',
      ...testData
    });
  },

  // Account-specific endpoints
  async getAccountPositions(accountId) {
    return await apiClient.get(`/api/account/${accountId}/positions`);
  },

  async getAccountOrders(accountId) {
    return await apiClient.get(`/api/account/${accountId}/orders`);
  },

  // System endpoints
  async getSystemHealth() {
    return await apiClient.get('/api/system/health');
  },

  // Webhook Relay endpoints
  async getRelayStatus() {
    return await apiClient.get('/api/system/relay/status');
  },

  async startRelay() {
    return await apiClient.post('/api/system/relay/start');
  },

  async stopRelay(force = false) {
    return await apiClient.post('/api/system/relay/stop', { force });
  },

  async restartRelay() {
    return await apiClient.post('/api/system/relay/restart');
  },

  async getRelayLogs(lines = 50) {
    return await apiClient.get(`/api/system/relay/logs?lines=${lines}`);
  },

  async updateRelayConfig(config) {
    return await apiClient.post('/api/system/relay/config', config);
  },

  async testRelayCommand() {
    return await apiClient.get('/api/system/relay/test');
  },

  // Kill switch endpoints
  async getKillSwitchStatus() {
    return await apiClient.get('/api/trading/kill-switch');
  },

  async setKillSwitch(enabled, reason = null) {
    return await apiClient.post('/api/trading/kill-switch', { enabled, reason });
  },

  // Position sizing endpoints
  async getPositionSizingSettings() {
    return await apiClient.get('/api/position-sizing/settings');
  },

  async setPositionSizingSettings(settings) {
    return await apiClient.post('/api/position-sizing/settings', settings);
  },

  async calculatePositionSize(symbol, accountBalance = null) {
    return await apiClient.post('/api/position-sizing/calculate', { symbol, accountBalance });
  },

  async getContractSpecs() {
    return await apiClient.get('/api/position-sizing/contracts');
  },

  async testPositionSizing(symbol = 'MNQ') {
    return await apiClient.post('/api/position-sizing/test', { symbol });
  },

  // Margin management endpoints
  async getMarginSettings() {
    return await apiClient.get('/api/position-sizing/margins');
  },

  async setMarginSettings(marginSettings) {
    return await apiClient.post('/api/position-sizing/margins', { marginSettings });
  },

  async getOptimalContract(symbol, accountBalance = null) {
    return await apiClient.post('/api/position-sizing/optimal', { symbol, accountBalance });
  }
};

/**
 * Utility functions for API data processing
 */
export const apiUtils = {
  /**
   * Format currency values
   */
  formatCurrency(value, currency = 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value || 0);
  },

  /**
   * Format percentage values
   */
  formatPercentage(value) {
    return new Intl.NumberFormat('en-US', {
      style: 'percent',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format((value || 0) / 100);
  },

  /**
   * Format numbers with commas
   */
  formatNumber(value) {
    return new Intl.NumberFormat('en-US').format(value || 0);
  },

  /**
   * Format timestamp
   */
  formatTimestamp(timestamp) {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  },

  /**
   * Get position status color
   */
  getPositionStatusColor(quantity) {
    if (quantity > 0) return 'text-green-400';
    if (quantity < 0) return 'text-red-400';
    return 'text-gray-400';
  },

  /**
   * Get P&L color
   */
  getPnLColor(pnl) {
    if (pnl > 0) return 'text-green-400';
    if (pnl < 0) return 'text-red-400';
    return 'text-gray-400';
  },

  /**
   * Get order status color
   */
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

  /**
   * Check if trading session is active
   */
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

  /**
   * Validate order data
   */
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