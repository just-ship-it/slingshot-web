// [build: 2026-05-22T17:55] Cache-buster — force a fresh artifact upload to
// Cloudflare Pages. Their dedupe-on-hash skipped the prior empty-commit
// redeploy ("Uploaded 0 files (7 already uploaded)") and we suspect one of
// the cached artifacts is bad. Touching App.js changes the bundle hash.
import React, { useState, useEffect, useCallback } from 'react';
import Dashboard from './components/Dashboard';
import PlatformStatus from './components/PlatformStatus';
import MacroBriefing from './components/MacroBriefing';
import PnLPanel from './components/PnLPanel';
import CompactHeader from './components/CompactHeader';
import AccountsManager from './components/AccountsManager';
import ToastContainer, { formatToastMessage } from './components/ToastContainer';
import Login from './components/Login';
import { useWebSocket } from './hooks/useWebSocket';
import { useTradingData } from './hooks/useTradingData';
import { useMultiAccountData } from './hooks/useMultiAccountData';
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
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showMacroModal, setShowMacroModal] = useState(false);
  const [showPnLModal, setShowPnLModal] = useState(false);
  const [showAccountsModal, setShowAccountsModal] = useState(false);

  // Lifted state for header
  const [quotes, setQuotes] = useState({});
  const [accountSummary, setAccountSummary] = useState(null);

  // Trading panel + toast state
  const [tradingPanelOpen, setTradingPanelOpen] = useState(() => {
    try { return localStorage.getItem('slingshot_trading_panel_open') === 'true'; }
    catch { return false; }
  });
  const [toasts, setToasts] = useState([]);
  const [posFlashKey, setPosFlashKey] = useState(0);

  // Persist trading panel open/closed state
  useEffect(() => {
    try { localStorage.setItem('slingshot_trading_panel_open', tradingPanelOpen); }
    catch { /* ignore */ }
  }, [tradingPanelOpen]);

  // Tradovate status (shared between Dashboard and PlatformStatus)
  const [tradovateStatus, setTradovateStatus] = useState('disabled');

  const checkTradovateConnection = useCallback(async () => {
    try {
      setTradovateStatus('checking');
      const healthResponse = await api.getTradingHealth();
      if (healthResponse.authenticated) {
        setTradovateStatus('connected');
      } else {
        setTradovateStatus(healthResponse.authenticationStatus === 'failed' ? 'auth_failed' : 'disconnected');
      }
    } catch (error) {
      console.error('Tradovate connection check failed:', error);
      setTradovateStatus('error');
    }
  }, []);

  // Check authentication status on app start
  useEffect(() => {
    const checkAuth = async () => {
      const authenticated = authUtils.isAuthenticated();
      if (authenticated) {
        const isValid = await authUtils.validateToken();
        if (isValid) {
          setIsAuthenticated(true);
        } else {
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
    setIsAuthenticated(true);
  };

  // Handle logout
  const handleLogout = () => {
    authUtils.logout();
    setIsAuthenticated(false);
    setAccounts([]);
    setSelectedAccount(null);
    localStorage.removeItem('slingshot_selected_account');
  };

  // Memoized WebSocket callbacks
  const handleConnect = useCallback(() => {
    setConnectionStatus('connected');
  }, []);

  const handleDisconnect = useCallback(() => {
    setConnectionStatus('disconnected');
  }, []);

  const handleWebhookReceived = useCallback(() => {}, []);
  const handleOrderPlaced = useCallback(() => {}, []);
  const handleMarketData = useCallback(() => {}, []);
  const handleInitialState = useCallback(() => {}, []);

  // WebSocket connection
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

  // Trading data hook (positions + orders with real-time updates)
  const handleTradingChangeEvent = useCallback((event) => {
    // Flash the header indicator
    setPosFlashKey(k => k + 1);
    // Add a toast
    const message = formatToastMessage(event);
    if (message) {
      setToasts(prev => [...prev, { id: Date.now() + Math.random(), type: event.type, message, duration: 4000 }]);
    }
  }, []);

  const { tradingData, isLoading: tradingDataLoading } = useTradingData(socket, handleTradingChangeEvent);

  // Multi-account data hook (replaces single-account pattern for trading panel)
  const multiAccountData = useMultiAccountData(socket);

  const openPositionCount = multiAccountData.totals?.totalPositions || tradingData?.stats?.totalPositions || 0;
  const pendingOrderCount = multiAccountData.totals?.totalPending || tradingData?.stats?.totalWorkingOrders || 0;

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Load initial data when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      setIsLoading(false);
      checkTradovateConnection().catch(console.error);
    }
  }, [isAuthenticated, checkTradovateConnection]);

  const loadAccountData = async (showGlobalLoading = false) => {
    try {
      if (showGlobalLoading) setIsLoading(true);
      setError(null);

      const accountsResponse = await api.getAccounts();
      const accts = Array.isArray(accountsResponse) ? accountsResponse : accountsResponse.accounts || [];
      setAccounts(accts);

      if (accts.length > 0) {
        const savedAccountId = localStorage.getItem('slingshot_selected_account');
        let targetAccount = null;

        if (savedAccountId) {
          targetAccount = accts.find(account => String(account.id) === String(savedAccountId));
        }
        if (!targetAccount) {
          targetAccount = accts.find(account =>
            account.id === '33316485' || account.id === 33316485 || String(account.id) === '33316485'
          );
          if (!targetAccount) targetAccount = accts[0];
        }
        if (targetAccount) {
          setSelectedAccount(targetAccount);
          localStorage.setItem('slingshot_selected_account', String(targetAccount.id));
        }
      }
    } catch (err) {
      console.error('Failed to load account data:', err);
    } finally {
      if (showGlobalLoading) setIsLoading(false);
    }
  };

  const handleAccountChange = (account) => {
    setSelectedAccount(account);
    if (account) {
      localStorage.setItem('slingshot_selected_account', String(account.id));
    }
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

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

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
          <div className="text-red-500 text-6xl mb-4">!</div>
          <h2 className="text-xl font-bold text-white mb-2">Connection Error</h2>
          <p className="text-gray-300 mb-4">{error}</p>
          <button onClick={loadAccountData} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-900 text-white flex flex-col overflow-hidden">
      <CompactHeader
        quotes={quotes}
        accountSummary={accountSummary}
        openPositionCount={openPositionCount}
        pendingOrderCount={pendingOrderCount}
        posFlashKey={posFlashKey}
        tradingPanelOpen={tradingPanelOpen}
        onToggleTradingPanel={() => setTradingPanelOpen(prev => !prev)}
        totals={multiAccountData.totals}
        connectionStatus={connectionStatus}
        onStatusClick={() => setShowStatusModal(true)}
        onMacroClick={() => setShowMacroModal(true)}
        onPnLClick={() => setShowPnLModal(true)}
        onAccountsClick={() => setShowAccountsModal(true)}
        onLogout={handleLogout}
      />

      <main className="flex-1 overflow-hidden">
        <Dashboard
          account={selectedAccount}
          socket={socket}
          onRefresh={loadAccountData}
          tradovateStatus={tradovateStatus}
          onTradovateCheck={checkTradovateConnection}
          onQuotesChange={setQuotes}
          onAccountSummaryChange={setAccountSummary}
          tradingPanelOpen={tradingPanelOpen}
          onToggleTradingPanel={() => setTradingPanelOpen(prev => !prev)}
          onShowStatus={() => setShowStatusModal(true)}
          multiAccountData={multiAccountData}
          onAccountsLoaded={(loadedAccounts) => {
            setAccounts(loadedAccounts);
            if (loadedAccounts.length > 0 && !selectedAccount) {
              const savedAccountId = localStorage.getItem('slingshot_selected_account');
              let targetAccount = null;
              if (savedAccountId) {
                targetAccount = loadedAccounts.find(account => String(account.id) === String(savedAccountId));
              }
              if (!targetAccount) {
                targetAccount = loadedAccounts.find(account =>
                  account.id === '33316485' || account.id === 33316485 || String(account.id) === '33316485'
                );
                if (!targetAccount) targetAccount = loadedAccounts[0];
              }
              if (targetAccount) {
                setSelectedAccount(targetAccount);
                localStorage.setItem('slingshot_selected_account', String(targetAccount.id));
              }
            }
          }}
        />
      </main>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Platform Status Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-start justify-center pt-12 px-4">
          <div className="bg-gray-900 rounded-lg w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border border-gray-700">
            <div className="flex justify-between items-center px-4 py-3 border-b border-gray-700 flex-shrink-0">
              <h2 className="text-lg font-semibold text-white">Platform Status</h2>
              <button
                onClick={() => setShowStatusModal(false)}
                className="text-gray-400 hover:text-white transition-colors text-xl leading-none px-1"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <PlatformStatus socket={socket} tradovateStatus={tradovateStatus} />
            </div>
          </div>
        </div>
      )}

      {/* P&L History Modal */}
      {showPnLModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-start justify-center pt-8 px-4">
          <div className="bg-gray-900 rounded-lg w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-gray-700">
            <div className="flex justify-between items-center px-4 py-3 border-b border-gray-700 flex-shrink-0">
              <h2 className="text-lg font-semibold text-white">P&L History</h2>
              <button
                onClick={() => setShowPnLModal(false)}
                className="text-gray-400 hover:text-white transition-colors text-xl leading-none px-1"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <PnLPanel />
            </div>
          </div>
        </div>
      )}

      {/* Macro Briefing Modal */}
      {showMacroModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-start justify-center pt-12 px-4">
          <div className="bg-gray-900 rounded-lg w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border border-gray-700">
            <div className="flex justify-between items-center px-4 py-3 border-b border-gray-700 flex-shrink-0">
              <h2 className="text-lg font-semibold text-white">Macro Briefing</h2>
              <button
                onClick={() => setShowMacroModal(false)}
                className="text-gray-400 hover:text-white transition-colors text-xl leading-none px-1"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <MacroBriefing />
            </div>
          </div>
        </div>
      )}

      {/* Accounts & Routing Modal */}
      {showAccountsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-start justify-center pt-8 px-4">
          <div className="bg-gray-900 rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-gray-700">
            <div className="flex justify-between items-center px-4 py-3 border-b border-gray-700 flex-shrink-0">
              <h2 className="text-lg font-semibold text-white">Accounts & Routing</h2>
              <button onClick={() => setShowAccountsModal(false)} className="text-gray-400 hover:text-white transition-colors text-xl leading-none px-1">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <AccountsManager onClose={() => setShowAccountsModal(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
