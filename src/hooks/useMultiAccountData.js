import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../services/api';

const BALANCE_INTERVAL_MS = 60_000;
const FALLBACK_POLL_MS = 30_000;

function groupBy(arr, key) {
  const out = {};
  for (const item of arr) {
    const k = item[key] || 'unknown';
    (out[k] ||= []).push(item);
  }
  return out;
}

function computeTotals(posObj, ordObj) {
  let totalPositions = 0, totalPending = 0, totalUnrealizedPnL = 0;
  for (const list of Object.values(posObj)) {
    totalPositions += list.length;
    for (const p of list) totalUnrealizedPnL += p.unrealizedPnL || 0;
  }
  for (const list of Object.values(ordObj)) totalPending += list.length;
  return { totalPositions, totalPending, totalUnrealizedPnL };
}

async function fetchAccountsList() {
  try {
    const resp = await api.getAccounts();
    return Array.isArray(resp) ? resp : resp?.accounts || [];
  } catch (err) {
    console.error('Failed to fetch accounts:', err);
    return [];
  }
}

async function fetchAllPositions() {
  try {
    const resp = await api.getAllPositions();
    const arr = Array.isArray(resp) ? resp : resp?.positions || [];
    return groupBy(arr, 'accountId');
  } catch (err) {
    console.error('Failed to fetch positions:', err);
    return {};
  }
}

async function fetchAllPending() {
  try {
    const resp = await api.getPendingOrders();
    const arr = resp?.pending || (Array.isArray(resp) ? resp : []);
    return groupBy(arr, 'accountId');
  } catch (err) {
    console.error('Failed to fetch pending orders:', err.message);
    return {};
  }
}

async function fetchBalanceFor(accountId, broker, trackingVia) {
  try {
    const targetId = (broker === 'pickmytrade' && trackingVia) ? trackingVia : accountId;
    const d = await api.getAccountBalance(targetId);
    return {
      balance: d.balance || 0,
      realizedPnL: d.realizedPnL || 0,
      unrealizedPnL: d.unrealizedPnL || 0,
      netLiq: d.netLiq || 0,
      marginUsed: d.marginUsed || 0,
      mode: d.mode || null,
    };
  } catch { return null; }
}

async function fetchBalances(accountsList) {
  const out = {};
  await Promise.all(accountsList.map(async (a) => {
    const via = a.tracking?.via || a.config?.tracking?.via;
    const bal = await fetchBalanceFor(a.id, a.broker, via);
    if (bal) out[a.id] = bal;
  }));
  return out;
}

export const useMultiAccountData = (socket) => {
  const [accounts, setAccounts] = useState([]);
  const [positions, setPositions] = useState({});
  const [pendingOrders, setPendingOrders] = useState({});
  const [balances, setBalances] = useState({});
  const [totals, setTotals] = useState({ totalPositions: 0, totalPending: 0, totalUnrealizedPnL: 0 });
  const [isLoading, setIsLoading] = useState(true);

  const accountsRef = useRef([]);
  const balanceTimer = useRef(null);
  const pollTimer = useRef(null);
  const mountedRef = useRef(true);

  const updateTotals = useCallback((pos, ord) => {
    setTotals(computeTotals(pos, ord));
  }, []);

  // Full reload — accounts + positions + orders + balances
  const reload = useCallback(async () => {
    if (!localStorage.getItem('dashboardToken')) return;
    try {
      setIsLoading(true);
      const accts = await fetchAccountsList();
      const results = await Promise.allSettled([
        fetchAllPositions(),
        fetchAllPending(),
        fetchBalances(accts),
      ]);
      if (!mountedRef.current) return;
      const pos = results[0].status === 'fulfilled' ? results[0].value : {};
      const ord = results[1].status === 'fulfilled' ? results[1].value : {};
      const bal = results[2].status === 'fulfilled' ? results[2].value : {};
      accountsRef.current = accts;
      setAccounts(accts);
      setPositions(pos);
      setPendingOrders(ord);
      setBalances(bal);
      updateTotals(pos, ord);
    } catch (err) {
      console.error('Multi-account reload failed:', err);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [updateTotals]);

  // Lightweight reload — positions + orders only (no accounts, no balances)
  const structuralReload = useCallback(async () => {
    if (!localStorage.getItem('dashboardToken')) return;
    try {
      const [pos, ord] = await Promise.all([fetchAllPositions(), fetchAllPending()]);
      if (!mountedRef.current) return;
      setPositions(pos);
      setPendingOrders(ord);
      updateTotals(pos, ord);
    } catch (err) {
      console.error('Structural reload failed:', err);
    }
  }, [updateTotals]);

  // Balance-only refresh
  const refreshBalances = useCallback(async () => {
    const bal = await fetchBalances(accountsRef.current);
    if (mountedRef.current) setBalances(bal);
  }, []);

  // --- Initial load (once) ---
  useEffect(() => {
    mountedRef.current = true;
    reload();
    return () => { mountedRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Socket listeners ---
  useEffect(() => {
    const s = socket?.socket;
    if (!s) return;

    const onStructural = () => structuralReload();
    const onAccountChanged = () => reload();
    const onRealtimePosition = (data) => {
      setPositions(prev => {
        const acctId = data.accountId;
        if (!acctId || !prev[acctId]) return prev;
        const next = { ...prev };
        next[acctId] = (next[acctId] || []).map(pos =>
          (pos.positionId === data.positionId || pos.symbol === data.symbol)
            ? { ...pos, currentPrice: data.currentPrice, unrealizedPnL: data.unrealizedPnL, lastUpdate: data.lastUpdate }
            : pos
        );
        return next;
      });
    };

    // Structural events (new/closed positions, order lifecycle) → reload
    s.on('position_closed', onStructural);
    s.on('position_snapshot', onStructural);
    s.on('order_placed', onStructural);
    s.on('order_cancelled', onStructural);
    s.on('account_changed', onAccountChanged);
    // Price-only updates → in-place, no reload
    s.on('position_update', onRealtimePosition);
    s.on('position_realtime_update', onRealtimePosition);

    return () => {
      s.off('position_closed', onStructural);
      s.off('position_snapshot', onStructural);
      s.off('order_placed', onStructural);
      s.off('order_cancelled', onStructural);
      s.off('account_changed', onAccountChanged);
      s.off('position_update', onRealtimePosition);
      s.off('position_realtime_update', onRealtimePosition);
    };
  }, [socket?.socket, structuralReload, reload]);

  // --- Balance timer (60s) ---
  useEffect(() => {
    if (!localStorage.getItem('dashboardToken') || accountsRef.current.length === 0) return;
    balanceTimer.current = setInterval(refreshBalances, BALANCE_INTERVAL_MS);
    return () => { clearInterval(balanceTimer.current); };
  }, [accounts.length, refreshBalances]);

  // --- Fallback poll (30s, only when socket disconnected) ---
  useEffect(() => {
    if (socket?.isConnected) {
      if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
      return;
    }
    if (!localStorage.getItem('dashboardToken')) return;
    pollTimer.current = setInterval(structuralReload, FALLBACK_POLL_MS);
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
  }, [socket?.isConnected, structuralReload]);

  return { accounts, positions, pendingOrders, balances, totals, isLoading, reload };
};
