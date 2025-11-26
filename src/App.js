import React, { useState, useEffect, useCallback } from 'react';
import Dashboard from './components/Dashboard';
import TestTrading from './components/TestTrading';
import { useWebSocket } from './hooks/useWebSocket';
import { api } from './services/api';
import './App.css';

function App() {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard' or 'test-trading'

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

  // WebSocket connection for real-time updates
  const socket = useWebSocket(process.env.REACT_APP_API_URL || 'http://localhost:3014', {
    onConnect: handleConnect,
    onDisconnect: handleDisconnect,
    onWebhookReceived: handleWebhookReceived,
    onOrderPlaced: handleOrderPlaced,
    onMarketData: handleMarketData
  });

  // Load initial data - don't block on accounts since Tradovate might not be connected
  useEffect(() => {
    // Just set loading to false and let the Dashboard handle Tradovate connection status
    setIsLoading(false);
  }, []);

  const loadAccountData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Try to load accounts, but don't block the entire app if it fails
      const accountsResponse = await api.getAccounts();
      const accounts = Array.isArray(accountsResponse) ? accountsResponse : accountsResponse.accounts || [];
      setAccounts(accounts);

      // Select default account (761526) or first available account
      if (accounts.length > 0) {
        // Try to find the default account (761526) - compare as strings
        const defaultAccount = accounts.find(account =>
          account.id === '761526' || account.id === 761526 ||
          String(account.id) === '761526'
        );
        console.log('🔍 Looking for account 761526 in:', accounts.map(a => ({id: a.id, type: typeof a.id, name: a.name})));
        console.log('🎯 Found default account:', defaultAccount);
        if (defaultAccount) {
          setSelectedAccount(defaultAccount);
          console.log('✅ Selected default account:', defaultAccount.id, defaultAccount.name);
        } else {
          // Fallback to first account if default not found
          setSelectedAccount(accounts[0]);
          console.log('⚠️ Default account not found, using first account:', accounts[0].id, accounts[0].name);
        }
      }

    } catch (err) {
      console.error('Failed to load account data:', err);
      // Don't set error - let Dashboard handle Tradovate connection status
      // The app should still be usable for other features (webhooks, etc.)
    } finally {
      setIsLoading(false);
    }
  };

  const handleAccountChange = (account) => {
    setSelectedAccount(account);
    // Subscribe to account-specific updates
    if (socket && account) {
      socket.emit('subscribe_account', account.id);
    }
  };

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

  return (
    <div className="h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 p-4 flex-shrink-0">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-blue-400">
              🚀 Slingshot
            </h1>
            <span className="text-sm text-gray-400">AutoTrading Platform</span>

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
                // Try to find the default account (761526) - compare as strings
                const defaultAccount = loadedAccounts.find(account =>
                  account.id === '761526' || account.id === 761526 ||
                  String(account.id) === '761526'
                );
                if (defaultAccount) {
                  setSelectedAccount(defaultAccount);
                  console.log('✅ Dashboard loaded default account:', defaultAccount.id, defaultAccount.name);
                } else {
                  // Fallback to first account if default not found
                  setSelectedAccount(loadedAccounts[0]);
                  console.log('⚠️ Dashboard: Default account not found, using first account:', loadedAccounts[0].id, loadedAccounts[0].name);
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