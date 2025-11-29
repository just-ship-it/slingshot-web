// Authentication utilities for the Slingshot Dashboard

export const authUtils = {
  // Token storage keys
  TOKEN_KEY: 'dashboardToken',

  // Get the stored token
  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  // Set the token
  setToken(token) {
    if (token) {
      localStorage.setItem(this.TOKEN_KEY, token);
    } else {
      this.clearToken();
    }
  },

  // Clear the token
  clearToken() {
    localStorage.removeItem(this.TOKEN_KEY);
  },

  // Check if user is authenticated
  isAuthenticated() {
    return !!this.getToken();
  },

  // Get auth headers for API calls
  getAuthHeaders() {
    const token = this.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },

  // Test if a token is valid by making an API call
  async validateToken(token = null) {
    const testToken = token || this.getToken();

    if (!testToken) {
      return false;
    }

    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3014'}/health`, {
        headers: {
          'Authorization': `Bearer ${testToken}`
        }
      });

      return response.ok;
    } catch (error) {
      console.error('Token validation failed:', error);
      return false;
    }
  },

  // Login with token
  async login(token) {
    try {
      // Test the token first
      const isValid = await this.validateToken(token);

      if (isValid) {
        this.setToken(token);
        return { success: true };
      } else {
        return {
          success: false,
          error: 'Invalid token. Please check and try again.'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: 'Connection error. Please check if the services are running.'
      };
    }
  },

  // Logout
  logout() {
    this.clearToken();
    // Optionally redirect to login
    window.location.reload();
  },

  // Handle 401 responses
  handleUnauthorized() {
    console.log('🚫 Unauthorized - clearing token and redirecting to login');
    this.clearToken();
    // Force a page reload to show login screen
    window.location.reload();
  }
};

export default authUtils;