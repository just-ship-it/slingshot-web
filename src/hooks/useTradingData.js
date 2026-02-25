import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../services/api';

/**
 * Custom hook for trading data (positions + orders) with real-time WebSocket updates.
 * Extracted from EnhancedTradingStatus.jsx.
 *
 * @param {object} socket - useWebSocket return value
 * @param {function} onChangeEvent - called on structural changes: ({ type, data }) => void
 * @returns {{ tradingData, isLoading, error, lastUpdate, reload }}
 */
export const useTradingData = (socket, onChangeEvent) => {
  const [tradingData, setTradingData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  // Track previous IDs to detect structural changes
  const prevPositionIdsRef = useRef(null);
  const prevOrderIdsRef = useRef(null);
  const prevOrdersMapRef = useRef(new Map());
  const cancelledOrderIdsRef = useRef(new Set());
  const onChangeEventRef = useRef(onChangeEvent);
  useEffect(() => { onChangeEventRef.current = onChangeEvent; }, [onChangeEvent]);

  const reload = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await api.getEnhancedTradingStatus();
      setTradingData(response);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Failed to load enhanced trading status:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Detect structural changes (positions/orders added or removed) and fire callback
  useEffect(() => {
    if (!tradingData) return;

    const posIds = (tradingData.openPositions || []).map(p => p.positionId || p.symbol).sort().join(',');
    const ordIds = (tradingData.pendingOrders || []).map(o => o.orderId).sort().join(',');

    if (prevPositionIdsRef.current !== null && posIds !== prevPositionIdsRef.current) {
      // Positions changed structurally
      const prevSet = new Set(prevPositionIdsRef.current.split(',').filter(Boolean));
      const curSet = new Set(posIds.split(',').filter(Boolean));

      for (const id of curSet) {
        if (!prevSet.has(id)) {
          const pos = (tradingData.openPositions || []).find(p => (p.positionId || p.symbol) === id);
          onChangeEventRef.current?.({ type: 'position_opened', data: pos });
        }
      }
      for (const id of prevSet) {
        if (!curSet.has(id)) {
          onChangeEventRef.current?.({ type: 'position_closed', data: { id } });
        }
      }
    }

    if (prevOrderIdsRef.current !== null && ordIds !== prevOrderIdsRef.current) {
      const prevSet = new Set(prevOrderIdsRef.current.split(',').filter(Boolean));
      const curSet = new Set(ordIds.split(',').filter(Boolean));

      for (const id of curSet) {
        if (!prevSet.has(id)) {
          const order = (tradingData.pendingOrders || []).find(o => String(o.orderId) === id);
          onChangeEventRef.current?.({ type: 'order_placed', data: order });
        }
      }
      for (const id of prevSet) {
        if (!curSet.has(id)) {
          const prevOrder = prevOrdersMapRef.current.get(id) || { id };
          const wasCancelled = cancelledOrderIdsRef.current.has(id);
          if (wasCancelled) cancelledOrderIdsRef.current.delete(id);
          onChangeEventRef.current?.({ type: wasCancelled ? 'order_cancelled' : 'order_filled', data: prevOrder });
        }
      }
    }

    // Save current orders for next diff
    const newMap = new Map();
    (tradingData.pendingOrders || []).forEach(o => { if (o.orderId) newMap.set(String(o.orderId), o); });
    prevOrdersMapRef.current = newMap;

    prevPositionIdsRef.current = posIds;
    prevOrderIdsRef.current = ordIds;
  }, [tradingData]);

  // Load on mount (only when user is authenticated — check for token)
  useEffect(() => {
    if (localStorage.getItem('dashboardToken')) reload();
  }, [reload]);

  // WebSocket listeners
  useEffect(() => {
    if (!socket?.socket) return;

    // Price-only updates — apply in-place, no reload
    const handlePositionRealtimeUpdate = (data) => {
      setTradingData(prev => {
        if (!prev?.openPositions) return prev;
        const updatedPositions = prev.openPositions.map(pos => {
          if (pos.positionId === data.positionId || pos.symbol === data.symbol) {
            return {
              ...pos,
              currentPrice: data.currentPrice,
              unrealizedPnL: data.unrealizedPnL,
              realizedPnL: data.realizedPnL,
              lastUpdate: data.lastUpdate,
              marketData: data.marketData,
            };
          }
          return pos;
        });
        return {
          ...prev,
          openPositions: updatedPositions,
          stats: {
            ...prev.stats,
            totalUnrealizedPnL: updatedPositions.reduce((sum, p) => sum + (p.unrealizedPnL || 0), 0),
          },
        };
      });
      setLastUpdate(new Date());
    };

    const handleOrderRealtimeUpdate = (data) => {
      setTradingData(prev => {
        if (!prev?.pendingOrders) return prev;
        const updatedOrders = prev.pendingOrders.map(order => {
          if (order.orderId === data.orderId) {
            return {
              ...order,
              currentPrice: data.currentPrice,
              marketDistance: data.marketDistance,
              marketData: data.marketData,
              lastUpdate: data.lastUpdate,
            };
          }
          return order;
        });
        return { ...prev, pendingOrders: updatedOrders };
      });
      setLastUpdate(new Date());
    };

    // Structural changes — full reload
    const handleStructuralChange = () => reload();

    // Track cancelled order IDs so diff logic can distinguish cancel vs fill
    const handleOrderCancelled = (data) => {
      if (data?.orderId) cancelledOrderIdsRef.current.add(String(data.orderId));
      reload();
    };

    socket.socket.on('position_realtime_update', handlePositionRealtimeUpdate);
    socket.socket.on('order_realtime_update', handleOrderRealtimeUpdate);
    socket.socket.on('position_update', handleStructuralChange);
    socket.socket.on('position_closed', handleStructuralChange);
    socket.socket.on('order_placed', handleStructuralChange);
    socket.socket.on('order_update', handleStructuralChange);
    socket.socket.on('order_cancelled', handleOrderCancelled);

    return () => {
      socket.socket.off('position_realtime_update', handlePositionRealtimeUpdate);
      socket.socket.off('order_realtime_update', handleOrderRealtimeUpdate);
      socket.socket.off('position_update', handleStructuralChange);
      socket.socket.off('position_closed', handleStructuralChange);
      socket.socket.off('order_placed', handleStructuralChange);
      socket.socket.off('order_update', handleStructuralChange);
      socket.socket.off('order_cancelled', handleOrderCancelled);
    };
  }, [socket, reload]);

  // Fallback polling when WebSocket not available
  useEffect(() => {
    if (socket?.isConnected) return;
    if (!localStorage.getItem('dashboardToken')) return;
    const interval = setInterval(reload, 15000);
    return () => clearInterval(interval);
  }, [socket?.isConnected, reload]);

  return { tradingData, isLoading, error, lastUpdate, reload };
};

export default useTradingData;
