import React, { useState } from 'react';
import { Shield, Key, AlertCircle, CheckCircle } from 'lucide-react';

const Login = ({ onLogin }) => {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (!token.trim()) {
      setError('Please enter your access token');
      setIsLoading(false);
      return;
    }

    try {
      // Store the token in localStorage
      localStorage.setItem('dashboardToken', token);

      // Test the token by making a simple API call
      const testResponse = await fetch('http://localhost:3014/api/dashboard', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (testResponse.ok) {
        // Token is valid
        onLogin(token);
      } else if (testResponse.status === 401) {
        setError('Invalid access token. Please check and try again.');
        localStorage.removeItem('dashboardToken');
      } else {
        setError('Unable to connect to the server. Please try again.');
      }
    } catch (err) {
      setError('Connection error. Please check if the services are running.');
      console.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-gray-800 rounded-lg shadow-xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="mx-auto w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mb-4">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white">Slingshot Dashboard</h2>
            <p className="text-gray-400 mt-2">Enter your access token to continue</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="token" className="block text-sm font-medium text-gray-300 mb-2">
                Access Token
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Key className="h-5 w-5 text-gray-500" />
                </div>
                <input
                  id="token"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-gray-700 rounded-md bg-gray-900 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter your dashboard secret"
                  disabled={isLoading}
                  autoFocus
                />
              </div>
              <p className="mt-2 text-xs text-gray-500">
                This is the DASHBOARD_SECRET from your .env file
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="rounded-md bg-red-900/50 border border-red-800 p-4">
                <div className="flex">
                  <AlertCircle className="h-5 w-5 text-red-400 mr-2 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-red-300">{error}</div>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Authenticating...
                </span>
              ) : (
                'Access Dashboard'
              )}
            </button>
          </form>

          {/* Info Section */}
          <div className="mt-8 p-4 bg-gray-900 rounded-md">
            <h3 className="text-sm font-medium text-gray-300 mb-2">Security Note</h3>
            <ul className="text-xs text-gray-500 space-y-1">
              <li className="flex items-start">
                <CheckCircle className="w-3 h-3 text-green-500 mr-1 mt-0.5 flex-shrink-0" />
                <span>Token is stored locally in your browser</span>
              </li>
              <li className="flex items-start">
                <CheckCircle className="w-3 h-3 text-green-500 mr-1 mt-0.5 flex-shrink-0" />
                <span>Never shared with third parties</span>
              </li>
              <li className="flex items-start">
                <CheckCircle className="w-3 h-3 text-green-500 mr-1 mt-0.5 flex-shrink-0" />
                <span>Cleared on logout or browser close</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;