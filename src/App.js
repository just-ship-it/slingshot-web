import React, { useState, useEffect, useCallback } from 'react';
import Dashboard from './components/Dashboard';
import TestTrading from './components/TestTrading';
import Login from './components/Login';
import { useWebSocket } from './hooks/useWebSocket';
import { api } from './services/api';
import { authUtils } from './utils/auth';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard' or 'test-trading'

  // Check authentication status on app start
  useEffect(() => {
    const checkAuth = async () => {
      const authenticated = authUtils.isAuthenticated();
      console.log('🔐 Auth check:', authenticated ? 'authenticated' : 'not authenticated');

      if (authenticated) {
        // Validate the stored token
        const isValid = await authUtils.validateToken();
        if (isValid) {
          setIsAuthenticated(true);
        } else {
          console.log('🚫 Stored token is invalid, clearing');
          authUtils.clearToken();
          setIsAuthenticated(false);
        }
      } else {
        setIsAuthenticated(false);
      }

      setIsCheckingAuth(false);
    };

    checkAuth();
  }, []);

  // Handle successful login
  const handleLogin = async (token) => {
    console.log('✅ Login successful');
    setIsAuthenticated(true);
    // The token is already stored by the Login component
  };

  // Handle logout
  const handleLogout = () => {
    console.log('🚪 Logging out');
    authUtils.logout();
    setIsAuthenticated(false);
    setAccounts([]);
    setSelectedAccount(null);
    // Clear saved account selection
    localStorage.removeItem('slingshot_selected_account');
    console.log('🗑️ Cleared saved account selection from localStorage');
  };

  // Memoized WebSocket callbacks to prevent connection loops
  const handleConnect = useCallback(() => {
    console.log('✅ Connected to Slingshot backend');
    setConnectionStatus('connected');
  }, []);

  const handleDisconnect = useCallback(() => {
    console.log('❌ Disconnected from backend');
    setConnectionStatus('disconnected');
  }, []);

  const handleWebhookReceived = useCallback((data) => {
    console.log('📨 Webhook received:', data);
    // Don't auto-refresh accounts on webhook - just log it
  }, []);

  const handleOrderPlaced = useCallback((data) => {
    console.log('📋 Order placed:', data);
    // Don't auto-refresh accounts on order - just log it
  }, []);

  const handleMarketData = useCallback((data) => {
    console.log('📊 Market data:', data);
  }, []);

  const handleInitialState = useCallback((data) => {
    console.log('🔄 Initial state received in App:', data);
    // Pass initial state data to dashboard via callback
    // This will be handled by the Dashboard component
  }, []);

  // WebSocket connection for real-time updates (only when authenticated)
  const socket = useWebSocket(
    isAuthenticated ? (process.env.REACT_APP_API_URL || 'http://localhost:3014') : null,
    {
      onConnect: handleConnect,
      onDisconnect: handleDisconnect,
      onWebhookReceived: handleWebhookReceived,
      onOrderPlaced: handleOrderPlaced,
      onMarketData: handleMarketData,
      onInitialState: handleInitialState
    }
  );

  // Load initial data when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  const loadAccountData = async (showGlobalLoading = false) => {
    try {
      if (showGlobalLoading) {
        setIsLoading(true);
      }
      setError(null);

      // Try to load accounts, but don't block the entire app if it fails
      const accountsResponse = await api.getAccounts();
      const accounts = Array.isArray(accountsResponse) ? accountsResponse : accountsResponse.accounts || [];
      setAccounts(accounts);

      // Select account with localStorage persistence
      if (accounts.length > 0) {
        // First, try to load previously selected account from localStorage
        const savedAccountId = localStorage.getItem('slingshot_selected_account');
        let targetAccount = null;

        if (savedAccountId) {
          targetAccount = accounts.find(account =>
            String(account.id) === String(savedAccountId)
          );
          console.log('💾 Found saved account in localStorage:', savedAccountId, 'Found:', !!targetAccount);
        }

        // If no saved account or saved account not found, use default fallback logic
        if (!targetAccount) {
          // Try to find a default account
          targetAccount = accounts.find(account =>
            account.id === '33316485' || account.id === 33316485 ||
            String(account.id) === '33316485'
          );
          console.log('🔍 Looking for default account in:', accounts.map(a => ({id: a.id, type: typeof a.id, name: a.name})));
          console.log('🎯 Found default account:', targetAccount);

          if (!targetAccount) {
            // Final fallback to first account
            targetAccount = accounts[0];
            console.log('⚠️ Using first account as final fallback:', targetAccount.id, targetAccount.name);
          }
        }

        if (targetAccount) {
          setSelectedAccount(targetAccount);
          // Save to localStorage for persistence
          localStorage.setItem('slingshot_selected_account', String(targetAccount.id));
          console.log('✅ Selected account:', targetAccount.id, targetAccount.name);
        }
      }

    } catch (err) {
      console.error('Failed to load account data:', err);
      // Don't set error - let Dashboard handle Tradovate connection status
      // The app should still be usable for other features (webhooks, etc.)
    } finally {
      if (showGlobalLoading) {
        setIsLoading(false);
      }
    }
  };

  const handleAccountChange = (account) => {
    setSelectedAccount(account);
    // Save to localStorage for persistence
    if (account) {
      localStorage.setItem('slingshot_selected_account', String(account.id));
      console.log('💾 Saved account selection to localStorage:', account.id, account.name);
    }
    // Subscribe to account-specific updates
    if (socket && account) {
      socket.emit('subscribe_account', account.id);
    }
  };

  // Show loading while checking authentication
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-300">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  // Show loading screen
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-300">Loading Slingshot...</p>
        </div>
      </div>
    );
  }

  // Show error screen
  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-white mb-2">Connection Error</h2>
          <p className="text-gray-300 mb-4">{error}</p>
          <button
            onClick={loadAccountData}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  // Main authenticated app
  return (
    <div className="h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 p-4 flex-shrink-0">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-blue-400">
              Slingshot
            </h1>

            {/* Navigation Tabs */}
            <nav className="flex space-x-2 ml-8">
              <button
                onClick={() => setCurrentView('dashboard')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  currentView === 'dashboard'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
              >
                Dashboard
              </button>
              <button
                onClick={() => setCurrentView('test-trading')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  currentView === 'test-trading'
                    ? 'bg-red-600 text-white'
                    : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
              >
                Test Trading
              </button>
            </nav>
          </div>

          <div className="flex items-center space-x-4">
            {/* Account Selector */}
            {accounts.length > 0 && (
              <select
                value={selectedAccount?.id || ''}
                onChange={(e) => {
                  const account = accounts.find(acc => acc.id.toString() === e.target.value);
                  handleAccountChange(account);
                }}
                className="bg-gray-700 border border-gray-600 text-white px-3 py-1 rounded"
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({account.id})
                  </option>
                ))}
              </select>
            )}

            {/* Connection Status */}
            <div className="flex items-center space-x-2">
              <div
                className={`w-3 h-3 rounded-full ${
                  connectionStatus === 'connected' ? 'bg-green-500' : 'bg-red-500'
                }`}
              ></div>
              <span className="text-sm text-gray-400">
                {connectionStatus === 'connected' ? 'Live' : 'Disconnected'}
              </span>
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content - Full Height */}
      <main className="flex-1 overflow-hidden">
        {currentView === 'dashboard' ? (
          <Dashboard
            account={selectedAccount}
            socket={socket}
            onRefresh={loadAccountData}
            onAccountsLoaded={(loadedAccounts) => {
              setAccounts(loadedAccounts);
              if (loadedAccounts.length > 0 && !selectedAccount) {
                // Use the same localStorage persistence logic as loadAccountData
                const savedAccountId = localStorage.getItem('slingshot_selected_account');
                let targetAccount = null;

                if (savedAccountId) {
                  targetAccount = loadedAccounts.find(account =>
                    String(account.id) === String(savedAccountId)
                  );
                  console.log('💾 Dashboard: Found saved account in localStorage:', savedAccountId, 'Found:', !!targetAccount);
                }

                // If no saved account or saved account not found, use default fallback logic
                if (!targetAccount) {
                  // Try to find the default account
                  targetAccount = loadedAccounts.find(account =>
                    account.id === '33316485' || account.id === 33316485 ||
                    String(account.id) === '33316485'
                  );
                  console.log('🎯 Dashboard: Found default account:', targetAccount);

                  if (!targetAccount) {
                    // Final fallback to first account
                    targetAccount = loadedAccounts[0];
                    console.log('⚠️ Dashboard: Using first account as final fallback:', targetAccount.id, targetAccount.name);
                  }
                }

                if (targetAccount) {
                  setSelectedAccount(targetAccount);
                  // Save to localStorage for persistence
                  localStorage.setItem('slingshot_selected_account', String(targetAccount.id));
                  console.log('✅ Dashboard: Selected account:', targetAccount.id, targetAccount.name);
                }
              }
            }}
          />
        ) : (
          <TestTrading />
        )}
      </main>
    </div>
  );
}

export default App;