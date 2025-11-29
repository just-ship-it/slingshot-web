import axios from 'axios';
import { authUtils } from '../utils/auth.js';

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
    const token = authUtils.getToken();
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
      console.log('🚫 Received 401 - handling unauthorized access');
      authUtils.handleUnauthorized();
      return Promise.reject(new Error('Authentication required'));
    }

    // Create user-friendly error messages
    const userError = new Error(errorMessage);
    userError.status = error.response?.status;
    userError.originalError = error;

    return Promise.reject(userError);
  }
);

export default apiClient;