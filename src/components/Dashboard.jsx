import React, { useState, useEffect, useRef } from 'react';
import GexComparisonPanel from './GexComparisonPanel';
import GexChart from './GexChart';
import IVSkewPanel from './IVSkewPanel';
import ShortDTEIVPanel from './ShortDTEIVPanel';
import LTCandleRegimePanel from './LTCandleRegimePanel';
import GexFlipIvpctPanel from './GexFlipIvpctPanel';
import GexLt3mCrossoverPanel from './GexLt3mCrossoverPanel';
import GexLevelFadePanel from './GexLevelFadePanel';
import LsFlipTriggerBarPanel from './LsFlipTriggerBarPanel';
import BookReadinessPanel from './BookReadinessPanel';
import TabbedGexPanel from './TabbedGexPanel';
import MultiAccountPanel from './MultiAccountPanel';
import AITraderPanel from './AITraderPanel';
import AlertPanel from './AlertPanel';
import { api } from '../services/api';

const Dashboard = ({
  account,
  socket,
  onRefresh,
  onAccountsLoaded,
  tradovateStatus,
  onTradovateCheck,
  onQuotesChange,
  onAccountSummaryChange,
  tradingPanelOpen,
  onToggleTradingPanel,
  onShowStatus,
  multiAccountData,
}) => {
  const [accountSummary, setAccountSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [quotes, setQuotes] = useState({});

  // GEX data
  const [gexData, setGexData] = useState({ cboe: null, tradier: null });
  // [2026-05-20] ES GEX state disabled — data-service no longer publishes it.
  // const [esGexData, setEsGexData] = useState({ cboe: null, tradier: null });

  // LT levels
  const [nqLtLevels, setNqLtLevels] = useState(null);
  // [2026-05-20] ES LT state disabled — data-service no longer publishes it.
  // const [esLtLevels, setEsLtLevels] = useState(null);

  // LS (Liquidity Status) — bull/bear sentiment per product. Updated on
  // every confirmed 1m bar-close flip via the 'ls_status' socket event.
  const [nqLsStatus, setNqLsStatus] = useState(null);
  // [2026-05-20] ES LS state disabled — data-service no longer publishes it.
  // const [esLsStatus, setEsLsStatus] = useState(null);

  // TradingView auth health — drives the JWT-needs-refresh banner.
  // Updated by initial_state seed + the 'tv_auth_state' WebSocket event.
  const [tvAuthState, setTvAuthState] = useState({ status: 'healthy' });

  // Strategy status
  const [strategyStatus, setStrategyStatus] = useState(null);

  // Strategy list (for showing/hiding panels based on enabled state)
  const [strategies, setStrategies] = useState([]);

  // [2026-05-20] Chart product toggle removed — only NQ is rendered now.
  // Keep the variable as a const so dependent code paths still resolve.
  const chartProduct = 'nq';
  // const [chartProduct, setChartProduct] = useState('nq');

  // Polling state
  const [pollingInterval, setPollingInterval] = useState(null);

  // Refs for callbacks to avoid stale closures
  const onQuotesChangeRef = useRef(onQuotesChange);
  const onAccountSummaryChangeRef = useRef(onAccountSummaryChange);
  useEffect(() => { onQuotesChangeRef.current = onQuotesChange; }, [onQuotesChange]);
  useEffect(() => { onAccountSummaryChangeRef.current = onAccountSummaryChange; }, [onAccountSummaryChange]);

  // Push quotes up to App
  useEffect(() => {
    onQuotesChangeRef.current?.(quotes);
  }, [quotes]);

  // Push accountSummary up to App
  useEffect(() => {
    onAccountSummaryChangeRef.current?.(accountSummary);
  }, [accountSummary]);

  // --- Data loading ---
  const loadQuotes = async () => {
    try {
      const quotesData = await api.getQuotes?.() || {};
      setQuotes(quotesData);
    } catch (error) {
      console.error('Failed to load quotes:', error.message);
    }
  };

  const loadAccountSummary = async () => {
    if (!account?.id) return;
    try {
      const response = await api.getAccountSummary(account.id);
      setAccountSummary(response.summary);
    } catch (error) {
      console.error('Failed to load account summary:', error);
      if (error.response?.status === 503) {
        setAccountSummary({
          accountId: account.id, balance: 0, equity: 0, margin: 0, availableFunds: 0,
          dayPnL: 0, dayPnLPercent: 0, totalPositions: 0, longPositions: 0, shortPositions: 0,
          workingOrders: 0, tradesExecutedToday: 0, cached: false, empty: true, loading: true
        });
      }
    }
  };

  const loadAccountsIfNeeded = async () => {
    if (!account && onAccountsLoaded) {
      try {
        const accountsResponse = await api.getAccounts();
        const accounts = Array.isArray(accountsResponse) ? accountsResponse : accountsResponse.accounts || [];
        if (accounts.length > 0) onAccountsLoaded(accounts);
      } catch (error) {
        console.log('Accounts not available:', error.message);
      }
    }
  };

  const loadDashboardData = async () => {
    if (isLoading) return;
    try {
      setIsLoading(true);
      await loadAccountSummary();
      await loadQuotes();
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchGexData = async () => {
    try {
      const [cboe, tradier] = await Promise.all([
        api.getGexLevels().catch(() => null),
        api.getTradierGexLevels().catch(() => null)
      ]);
      setGexData({ cboe, tradier });
    } catch (err) {
      console.error('Error fetching NQ GEX data:', err);
    }
  };

  // [2026-05-20] fetchEsGexData disabled — data-service no longer initializes
  // the ES GEX calculator. The `api.getEsGexLevels()` endpoint will return
  // errors or 503 if called.
  // const fetchEsGexData = async () => {
  //   try {
  //     const [cboe, tradier] = await Promise.all([
  //       api.getEsGexLevels().catch(() => null),
  //       api.getEsTradierGexLevels().catch(() => null)
  //     ]);
  //     setEsGexData({ cboe, tradier });
  //   } catch (err) {
  //     console.error('Error fetching ES GEX data:', err);
  //   }
  // };

  const fetchStrategyStatus = async () => {
    try {
      const response = await api.getStrategyStatus();
      if (response?.data) setStrategyStatus(response.data);
    } catch (err) {
      console.error('Error fetching NQ strategy status:', err);
    }
  };

  const fetchStrategies = async () => {
    try {
      const data = await api.getStrategiesList();
      if (Array.isArray(data)) setStrategies(data);
      else if (data?.strategies) setStrategies(data.strategies);
    } catch (err) {
      console.error('Error fetching strategies list:', err);
    }
  };


  // --- Mount effect ---
  useEffect(() => {
    setIsLoading(false);

    loadAccountsIfNeeded().catch(error => console.error('Background loading error:', error));

    onTradovateCheck?.().catch(console.error);

    fetchGexData();
    // [2026-05-20] fetchEsGexData() disabled — see commented-out function above.
    const gexInterval = setInterval(() => { fetchGexData(); }, 3 * 60 * 1000);

    fetchStrategyStatus();
    fetchStrategies();
    const strategyInterval = setInterval(() => { fetchStrategyStatus(); fetchStrategies(); }, 30 * 1000);

    return () => {
      clearInterval(gexInterval);
      clearInterval(strategyInterval);
    };
  }, []);

  // Socket reconnection
  useEffect(() => {
    if (socket?.isConnected) {
      Promise.all([loadQuotes(), onRefresh()]).catch(console.error);
    }
  }, [socket?.isConnected]);

  // --- WebSocket listeners (only data the Dashboard needs) ---
  useEffect(() => {
    if (!socket?.socket) return;

    const handleMarketData = (data) => {
      setQuotes(prev => {
        const key = data.baseSymbol || data.symbol;
        const existing = prev[key] || {};
        const incoming = {};
        if (data.symbol != null) incoming.symbol = data.symbol;
        if (data.baseSymbol != null) incoming.baseSymbol = data.baseSymbol;
        if (data.close != null) incoming.close = data.close;
        if (data.volume != null) incoming.volume = data.volume;
        if (data.timestamp != null) incoming.timestamp = data.timestamp;
        incoming.candleTimestamp = data.candleTimestamp ?? null;
        if (data.open != null) incoming.open = data.open;
        if (data.high != null) incoming.high = data.high;
        if (data.low != null) incoming.low = data.low;
        if (data.sessionOpen != null) incoming.sessionOpen = data.sessionOpen;
        if (data.sessionHigh != null) incoming.sessionHigh = data.sessionHigh;
        if (data.sessionLow != null) incoming.sessionLow = data.sessionLow;
        if (data.prevClose != null) incoming.prevClose = data.prevClose;
        if (data.change != null) incoming.change = data.change;
        if (data.changePercent != null) incoming.changePercent = data.changePercent;
        const merged = { ...existing, ...incoming };
        const updates = { ...prev, [data.symbol]: merged };
        if (data.baseSymbol) updates[data.baseSymbol] = merged;
        return updates;
      });
    };

    const handleGexLevelsUpdate = (data) => {
      if (data) {
        setGexData(prev => ({ cboe: data.cboe || prev.cboe, tradier: data.tradier || prev.tradier }));
      }
    };

    const handleInitialState = (data) => {
      if (data.quotes && Object.keys(data.quotes).length > 0) {
        setQuotes(data.quotes);
      } else {
        loadQuotes();
      }
    };

    const handleAccountDataUpdated = (data) => {
      if (data.dataType === 'balance' && data.accountId === account?.id) {
        setAccountSummary(prev => prev ? { ...prev, ...data.data, cached: true, dataAge: 0 } : null);
      }
    };

    const handlePositionChange = () => {
      loadAccountSummary();
    };

    const handleLtLevels = (data) => {
      if (!data) return;
      const product = (data.product || 'NQ').toUpperCase();
      if (product === 'NQ') setNqLtLevels(data);
      // [2026-05-20] ES LT routing disabled — data-service no longer publishes
      // ES LT levels. Ignore any stale events that arrive from older deploys.
      // else if (product === 'ES') setEsLtLevels(data);
    };

    const handleLsStatus = (data) => {
      if (!data) return;
      const product = (data.product || 'NQ').toUpperCase();
      if (product === 'NQ') setNqLsStatus(data);
      // [2026-05-20] ES LS routing disabled — data-service no longer publishes
      // ES LS state.
      // else if (product === 'ES') setEsLsStatus(data);
    };

    // TV auth state — sent on initial socket connect (seed) and on every
    // tv_auth_* event thereafter (status flips between 'healthy' /
    // 'degraded'). Drives the top-of-dashboard banner that tells Drew to
    // refresh the JWT.
    const handleTvAuthState = (data) => {
      if (data && typeof data === 'object') setTvAuthState(data);
    };

    const handleStrategyStatusChange = () => {
      fetchStrategies();
    };

    socket.socket.on('market_data', handleMarketData);
    socket.socket.on('gex_levels', handleGexLevelsUpdate);
    socket.socket.on('lt_levels', handleLtLevels);
    socket.socket.on('ls_status', handleLsStatus);
    socket.socket.on('initial_state', handleInitialState);
    socket.socket.on('account_data_updated', handleAccountDataUpdated);
    socket.socket.on('position_update', handlePositionChange);
    socket.socket.on('position_closed', handlePositionChange);
    socket.socket.on('strategyStatus', handleStrategyStatusChange);
    socket.socket.on('tv_auth_state', handleTvAuthState);

    // Seed TV auth state from REST in case we missed the initial socket
    // emit (fast page-load / reconnect races). Endpoint returns the same
    // tvAuthState object the WebSocket event carries.
    fetch(`${api.baseUrl || ''}/api/tv-auth/status`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('dashboardToken') || ''}` }
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setTvAuthState(d); })
      .catch(() => { /* harmless */ });

    // Seed initial LS state from REST in case we missed flips before connecting.
    api.getLsStatus()
      .then(res => {
        if (res?.data) {
          if (res.data.NQ) setNqLsStatus(res.data.NQ);
          // [2026-05-20] ES LS seed disabled.
          // if (res.data.ES) setEsLsStatus(res.data.ES);
        }
      })
      .catch(() => { /* endpoint unavailable, ignore */ });

    return () => {
      socket.socket.off('market_data', handleMarketData);
      socket.socket.off('gex_levels', handleGexLevelsUpdate);
      socket.socket.off('lt_levels', handleLtLevels);
      socket.socket.off('ls_status', handleLsStatus);
      socket.socket.off('initial_state', handleInitialState);
      socket.socket.off('account_data_updated', handleAccountDataUpdated);
      socket.socket.off('position_update', handlePositionChange);
      socket.socket.off('position_closed', handlePositionChange);
      socket.socket.off('strategyStatus', handleStrategyStatusChange);
      socket.socket.off('tv_auth_state', handleTvAuthState);
    };
  }, [socket, account]);

  // Load dashboard data when account becomes available
  useEffect(() => {
    if (account?.id) loadDashboardData();
  }, [account]);

  // Subscribe to account updates
  useEffect(() => {
    if (socket?.isConnected && account?.id) {
      socket.subscribeToAccount(account.id);
    }
  }, [socket, account]);

  // Polling for live updates
  useEffect(() => {
    const hasRecentCachedData = accountSummary?.cached && accountSummary?.dataAge && accountSummary.dataAge < 5 * 60 * 1000;
    if (account?.id && tradovateStatus === 'connected' && !hasRecentCachedData) {
      const intervalId = setInterval(() => loadDashboardData(), 120000);
      setPollingInterval(intervalId);
      return () => clearInterval(intervalId);
    } else if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
  }, [account, tradovateStatus, accountSummary]);

  useEffect(() => {
    return () => { if (pollingInterval) clearInterval(pollingInterval); };
  }, [pollingInterval]);

  // Loading state
  if (isLoading && !account && !accountSummary) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // Check if a strategy is enabled by name
  const isStrategyEnabled = (name) => {
    if (strategies.length === 0) return true; // Show all panels until strategies load
    return strategies.some(s => s.name === name && s.enabled);
  };

  // ---- TV auth banner ----
  // Shown when the data-service / signal-generator reports a degraded
  // TradingView session — usually means the JWT needs to be refreshed
  // (manual Chrome DevTools pull). Banner auto-clears when LT studies
  // start emitting again (tv_auth_restored).
  const renderTvAuthBanner = () => {
    if (!tvAuthState || tvAuthState.status !== 'degraded') return null;
    const sinceLabel = tvAuthState.since
      ? new Date(tvAuthState.since).toLocaleTimeString('en-US', {
          timeZone: 'America/New_York', hour12: false,
          hour: '2-digit', minute: '2-digit',
        }) + ' ET'
      : 'unknown';
    return (
      <div className="bg-red-900 border-b-2 border-red-500 text-red-100 px-4 py-2 text-sm flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="text-base">🔴</span>
          <div className="min-w-0">
            <div className="font-semibold">TradingView JWT needs refresh</div>
            <div className="text-xs text-red-200/80 truncate">
              {tvAuthState.message || `Auth degraded since ${sinceLabel}`}
              {tvAuthState.source ? ` · source: ${tvAuthState.source}` : ''}
              {tvAuthState.tokenTTLSec != null
                ? ` · token TTL: ${Math.floor(tvAuthState.tokenTTLSec / 60)}m`
                : ''}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {onShowStatus && (
            <button
              onClick={onShowStatus}
              className="text-xs px-3 py-1 bg-red-700 hover:bg-red-600 border border-red-400 text-white rounded transition-colors font-semibold whitespace-nowrap"
              title="Open Platform Status to set a new JWT or bootstrap the auto-refresh session"
            >
              Fix it →
            </button>
          )}
          <div className="text-xs text-red-200 whitespace-nowrap">since {sinceLabel}</div>
        </div>
      </div>
    );
  };

  return (
    <>
      {renderTvAuthBanner()}
      <div className="dashboard-split">
      {/* Column 1 (1/5): strategy panels */}
      <div className="dashboard-left">
        {(isStrategyEnabled('preclose-continuation') || isStrategyEnabled('monday-strength') || isStrategyEnabled('gapup-fade')) && (
          <div className="panel-book-readiness">
            <BookReadinessPanel socket={socket} quotes={quotes} />
          </div>
        )}
        {isStrategyEnabled('gex-flip-ivpct') && (
          <div className="panel-gex-flip-ivpct">
            <GexFlipIvpctPanel socket={socket} quotes={quotes} />
          </div>
        )}
        {isStrategyEnabled('gex-lt-3m-crossover') && (
          <div className="panel-gex-lt-3m-crossover">
            <GexLt3mCrossoverPanel socket={socket} quotes={quotes} />
          </div>
        )}
        {isStrategyEnabled('gex-level-fade') && (
          <div className="panel-gex-level-fade">
            <GexLevelFadePanel socket={socket} quotes={quotes} />
          </div>
        )}
        {isStrategyEnabled('ls-flip-trigger-bar') && (
          <div className="panel-ls-flip-trigger-bar">
            <LsFlipTriggerBarPanel socket={socket} quotes={quotes} />
          </div>
        )}
        {isStrategyEnabled('iv-skew-gex') && (
          <div className="panel-ivskew">
            <IVSkewPanel socket={socket} quotes={quotes} />
          </div>
        )}
        {isStrategyEnabled('ai-trader') && (
          <div className="panel-ai-trader">
            <AITraderPanel />
          </div>
        )}
        {isStrategyEnabled('short-dte-iv') && (
          <div className="panel-es-cross">
            <ShortDTEIVPanel socket={socket} quotes={quotes} />
          </div>
        )}
        {isStrategyEnabled('lt-candle-regime') && (
          <div className="panel-lt-regime">
            <LTCandleRegimePanel socket={socket} quotes={quotes} />
          </div>
        )}
      </div>

      {/* Column 2 (1/5): GEX levels, accounts, alerts */}
      <div className="dashboard-mid">
        <div className="panel-gex">
          {/* [2026-05-20] ES props passed as null/no-op — TabbedGexPanel now
              renders NQ only (ES tab commented out). */}
          <TabbedGexPanel
            nqGexData={gexData}
            esGexData={null}
            onRefreshNq={fetchGexData}
            onRefreshEs={() => {}}
          />
        </div>
        {multiAccountData && (
          <MultiAccountPanel
            accounts={multiAccountData.accounts}
            positions={multiAccountData.positions}
            pendingOrders={multiAccountData.pendingOrders}
            balances={multiAccountData.balances}
            totals={multiAccountData.totals}
            isLoading={multiAccountData.isLoading}
            onReload={multiAccountData.reload}
          />
        )}
        <div className="panel-alerts" style={{ flex: '1 1 auto', minHeight: '100px' }}>
          <AlertPanel socket={socket} accounts={multiAccountData?.accounts || []} />
        </div>
      </div>

      {/* Column 3 (3/5): NQ chart only.
          [2026-05-20] ES toggle removed — chartProduct is hard-coded to 'nq'.
          ES branches of the prop ternaries are dropped (esGexData/esLtLevels/
          esLsStatus state no longer exists). To restore the toggle, uncomment
          the chartProduct useState above and re-thread the ES props. */}
      <div className="dashboard-right">
        <div className="panel-chart">
          <GexChart
            quote={quotes.NQ || quotes.MNQ}
            gexData={gexData}
            strategyStatus={strategyStatus}
            product="nq"
            ltLevels={nqLtLevels}
            lsStatus={nqLsStatus}
            onProductChange={() => {}}
          />
        </div>
      </div>
      </div>
    </>
  );
};

export default Dashboard;
