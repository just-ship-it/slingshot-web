import React, { useState, useEffect, useRef } from 'react';
import GexComparisonPanel from './GexComparisonPanel';
import GexChart from './GexChart';
import IVSkewPanel from './IVSkewPanel';
import ShortDTEIVPanel from './ShortDTEIVPanel';
import LTCandleRegimePanel from './LTCandleRegimePanel';
import TabbedGexPanel from './TabbedGexPanel';
import TradingPanel from './TradingPanel';
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
  tradingData,
  tradingDataLoading,
}) => {
  const [accountSummary, setAccountSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [quotes, setQuotes] = useState({});

  // GEX data
  const [gexData, setGexData] = useState({ cboe: null, tradier: null });
  const [esGexData, setEsGexData] = useState({ cboe: null, tradier: null });

  // LT levels
  const [nqLtLevels, setNqLtLevels] = useState(null);
  const [esLtLevels, setEsLtLevels] = useState(null);

  // Strategy status
  const [strategyStatus, setStrategyStatus] = useState(null);

  // Strategy list (for showing/hiding panels based on enabled state)
  const [strategies, setStrategies] = useState([]);

  // Chart product toggle (NQ/ES)
  const [chartProduct, setChartProduct] = useState('nq');

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

  const fetchEsGexData = async () => {
    try {
      const [cboe, tradier] = await Promise.all([
        api.getEsGexLevels().catch(() => null),
        api.getEsTradierGexLevels().catch(() => null)
      ]);
      setEsGexData({ cboe, tradier });
    } catch (err) {
      console.error('Error fetching ES GEX data:', err);
    }
  };

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
    fetchEsGexData();
    const gexInterval = setInterval(() => { fetchGexData(); fetchEsGexData(); }, 3 * 60 * 1000);

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
      else if (product === 'ES') setEsLtLevels(data);
    };

    const handleStrategyStatusChange = () => {
      fetchStrategies();
    };

    socket.socket.on('market_data', handleMarketData);
    socket.socket.on('gex_levels', handleGexLevelsUpdate);
    socket.socket.on('lt_levels', handleLtLevels);
    socket.socket.on('initial_state', handleInitialState);
    socket.socket.on('account_data_updated', handleAccountDataUpdated);
    socket.socket.on('position_update', handlePositionChange);
    socket.socket.on('position_closed', handlePositionChange);
    socket.socket.on('strategyStatus', handleStrategyStatusChange);

    return () => {
      socket.socket.off('market_data', handleMarketData);
      socket.socket.off('gex_levels', handleGexLevelsUpdate);
      socket.socket.off('lt_levels', handleLtLevels);
      socket.socket.off('initial_state', handleInitialState);
      socket.socket.off('account_data_updated', handleAccountDataUpdated);
      socket.socket.off('position_update', handlePositionChange);
      socket.socket.off('position_closed', handlePositionChange);
      socket.socket.off('strategyStatus', handleStrategyStatusChange);
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

  return (
    <div className="dashboard-split">
      {/* Left column: info panels stacked */}
      <div className="dashboard-left">
        <div className="panel-ivskew">
          <IVSkewPanel socket={socket} quotes={quotes} />
        </div>
        <div className="panel-gex">
          <TabbedGexPanel
            nqGexData={gexData}
            esGexData={esGexData}
            onRefreshNq={fetchGexData}
            onRefreshEs={fetchEsGexData}
          />
        </div>
        <TradingPanel
          open={true}
          onToggle={() => {}}
          tradingData={tradingData}
          isLoading={tradingDataLoading}
          quotes={quotes}
        />
        <div className="panel-alerts">
          <AlertPanel socket={socket} />
        </div>
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

      {/* Right column: chart with NQ/ES toggle in header */}
      <div className="dashboard-right">
        <div className="panel-chart">
          <GexChart
            quote={chartProduct === 'nq' ? (quotes.NQ || quotes.MNQ) : (quotes.ES || quotes.MES)}
            gexData={chartProduct === 'nq' ? gexData : esGexData}
            strategyStatus={chartProduct === 'nq' ? strategyStatus : null}
            product={chartProduct}
            ltLevels={chartProduct === 'nq' ? nqLtLevels : esLtLevels}
            getCandlesFn={chartProduct === 'es' ? api.getEsCandles : undefined}
            onProductChange={setChartProduct}
          />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
