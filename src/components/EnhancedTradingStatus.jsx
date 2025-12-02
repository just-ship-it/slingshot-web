import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

const EnhancedTradingStatus = ({ socket, onPositionClosed }) => {
  const [tradingData, setTradingData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [previousPositionCount, setPreviousPositionCount] = useState(0);
  const [lastValidPrices, setLastValidPrices] = useState({});

  // Load enhanced trading status data
  const loadEnhancedStatus = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await api.getEnhancedTradingStatus();
      setTradingData(response);
      setLastUpdate(new Date());

      console.log('🎯 Enhanced trading status loaded:', response);
    } catch (error) {
      console.error('❌ Failed to load enhanced trading status:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Real-time update handler for positions
  const handlePositionRealtimeUpdate = (positionUpdate) => {
    console.log('🔄 Real-time position update received:', positionUpdate);

    setTradingData(prevData => {
      if (!prevData || !prevData.openPositions) return prevData;

      const updatedPositions = prevData.openPositions.map(pos => {
        if (pos.positionId === positionUpdate.positionId || pos.symbol === positionUpdate.symbol) {
          return {
            ...pos,
            currentPrice: positionUpdate.currentPrice,
            unrealizedPnL: positionUpdate.unrealizedPnL,
            realizedPnL: positionUpdate.realizedPnL,
            lastUpdate: positionUpdate.lastUpdate,
            marketData: positionUpdate.marketData
          };
        }
        return pos;
      });

      return {
        ...prevData,
        openPositions: updatedPositions,
        stats: {
          ...prevData.stats,
          totalUnrealizedPnL: updatedPositions.reduce((sum, pos) => sum + (pos.unrealizedPnL || 0), 0)
        }
      };
    });

    setLastUpdate(new Date());
  };

  // Real-time update handler for orders
  const handleOrderRealtimeUpdate = (orderUpdate) => {
    console.log('🔄 Real-time order update received:', orderUpdate);

    setTradingData(prevData => {
      if (!prevData || !prevData.pendingOrders) return prevData;

      const updatedOrders = prevData.pendingOrders.map(order => {
        if (order.orderId === orderUpdate.orderId) {
          return {
            ...order,
            currentPrice: orderUpdate.currentPrice,
            marketDistance: orderUpdate.marketDistance,
            marketData: orderUpdate.marketData,
            lastUpdate: orderUpdate.lastUpdate
          };
        }
        return order;
      });

      return {
        ...prevData,
        pendingOrders: updatedOrders
      };
    });

    setLastUpdate(new Date());
  };

  // Load data on mount and set up WebSocket listeners
  useEffect(() => {
    // Load initial data
    loadEnhancedStatus();

    // Set up WebSocket listeners for real-time updates
    if (socket && socket.isConnected) {
      console.log('🔌 Setting up real-time update listeners');

      socket.subscribe('position_realtime_update', handlePositionRealtimeUpdate);
      socket.subscribe('order_realtime_update', handleOrderRealtimeUpdate);

      return () => {
        socket.unsubscribe('position_realtime_update', handlePositionRealtimeUpdate);
        socket.unsubscribe('order_realtime_update', handleOrderRealtimeUpdate);
      };
    } else {
      console.warn('⚠️ WebSocket not available, falling back to polling');
      // Fall back to polling if WebSocket not available
      const interval = setInterval(loadEnhancedStatus, 15000);
      return () => clearInterval(interval);
    }
  }, [socket]);

  // Monitor position count changes to detect closures and trigger account balance updates
  useEffect(() => {
    if (!tradingData?.openPositions) return;

    const currentPositionCount = tradingData.openPositions.length;

    // If positions decreased, likely a position was closed - refresh account balance
    if (previousPositionCount > 0 && currentPositionCount < previousPositionCount) {
      const closedPositions = previousPositionCount - currentPositionCount;
      console.log(`🔔 Detected ${closedPositions} position(s) closed - requesting account balance update`);

      // Trigger account balance refresh via callback
      if (onPositionClosed) {
        onPositionClosed();
      }
    }

    setPreviousPositionCount(currentPositionCount);
  }, [tradingData?.openPositions?.length, previousPositionCount, onPositionClosed]);

  // Format currency
  const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  // Format percentage
  const formatPercentage = (value) => {
    if (value === null || value === undefined) return 'N/A';
    return `${value.toFixed(2)}%`;
  };

  // Format date/time
  const formatDateTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Get distance color based on proximity to market
  const getDistanceColor = (distancePercent) => {
    if (!distancePercent) return 'text-gray-400';
    if (distancePercent < 0.5) return 'text-green-400';
    if (distancePercent < 1.0) return 'text-yellow-400';
    return 'text-red-400';
  };

  // Get P&L color
  const getPnLColor = (pnl) => {
    if (pnl > 0) return 'text-green-400';
    if (pnl < 0) return 'text-red-400';
    return 'text-gray-400';
  };

  if (isLoading && !tradingData) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="text-center text-gray-500 py-8">
          <div className="text-2xl mb-2">⏳</div>
          <div>Loading enhanced trading status...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="text-center text-red-400 py-4">
          <div className="text-2xl mb-2">❌</div>
          <div>Error loading enhanced trading status</div>
          <div className="text-xs text-gray-400 mt-2">{error}</div>
          <button
            onClick={loadEnhancedStatus}
            className="mt-2 bg-blue-600 hover:bg-blue-700 px-3 py-1 text-xs rounded"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const hasPendingOrders = tradingData?.pendingOrders?.length > 0;
  const hasOpenPositions = tradingData?.openPositions?.length > 0;
  const hasActiveItems = hasPendingOrders || hasOpenPositions;

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      {/* Trading Status Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 p-3 bg-gray-700 rounded">
        <div className="text-center">
          <div className="text-xs text-gray-400">Open Positions</div>
          <div className="font-bold text-blue-400 text-lg">
            {tradingData?.stats?.totalPositions || 0}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-400">Pending Orders</div>
          <div className="font-bold text-yellow-400 text-lg">
            {tradingData?.stats?.totalWorkingOrders || 0}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-400">Daily Trades</div>
          <div className="font-bold text-lg text-gray-400">
            {tradingData?.stats?.dailyTrades || 0}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-400">Last Updated</div>
          <div className="font-bold text-lg text-gray-300">
            {lastUpdate ? lastUpdate.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              second: '2-digit',
              hour12: true
            }) : 'Loading...'}
          </div>
        </div>
      </div>

      {/* Open Positions Section - Compact Layout */}
      {hasOpenPositions && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-blue-400 mb-3 flex items-center gap-2">
            <span>📊</span>
            Open Positions ({tradingData.openPositions.length})
          </h4>
          <div className="space-y-2">
            {tradingData.openPositions.map((position, idx) => {
              // Debug logging to see available fields
              console.log(`🔍 Position ${idx} data:`, position);

              const side = position.side?.toLowerCase();
              const isLong = side === 'long';
              const quantity = Math.abs(position.netPos || position.quantity || position.signalContext?.quantity || 0);
              const currentPrice = position.currentPrice;
              const entryPrice = position.entryPrice;
              const isAboveEntry = currentPrice && entryPrice && (
                (isLong && currentPrice > entryPrice) ||
                (!isLong && currentPrice < entryPrice)
              );

              // Format trailing stop display from separate values or legacy fields
              const trailingOffset = position.signalContext?.trailingOffset;
              const trailingTrigger = position.signalContext?.trailingTrigger;
              const legacyTrailing = position.signalContext?.trailingStop || position.trailingStopPrice;

              let trailingDisplay = null;
              let trailingActivationDistance = null;

              if (trailingOffset && trailingTrigger && currentPrice && entryPrice) {
                // Calculate how far price needs to move to activate trailing stop
                const pointsFromEntry = Math.abs(currentPrice - entryPrice);
                const pointsToActivation = Math.max(0, trailingTrigger - pointsFromEntry);

                // Calculate actual activation level
                const activationLevel = isLong ?
                  entryPrice + trailingTrigger :
                  entryPrice - trailingTrigger;

                trailingDisplay = `${trailingOffset}pt / ${trailingTrigger}pt`;
                if (pointsToActivation > 0) {
                  // Round to nearest tick (0.25)
                  const ticksToActivation = Math.round(pointsToActivation / 0.25) * 0.25;
                  trailingActivationDistance = `${ticksToActivation}pt to ${formatCurrency(activationLevel)}`;
                } else {
                  trailingActivationDistance = `Active`;
                }
              } else if (legacyTrailing) {
                trailingDisplay = typeof legacyTrailing === 'string' ? legacyTrailing : `${legacyTrailing}pt`;
              }

              return (
                <div key={idx} className="bg-gray-800 border border-gray-600 rounded-lg overflow-hidden">
                  {/* Header Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 py-3 bg-gray-700 border-b border-gray-600 gap-2">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className={`flex items-center gap-1 sm:gap-2 font-semibold text-sm ${
                        isLong ? 'text-green-400' : 'text-red-400'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${
                          isLong ? 'bg-green-400' : 'bg-red-400'
                        }`}></span>
                        {isLong ? 'LONG' : 'SHORT'}
                      </div>
                      <span className="font-bold text-white text-lg">{position.symbol}</span>
                      <span className="text-gray-400 text-sm">×{quantity}</span>
                    </div>
                    <div className={`font-semibold text-lg ${getPnLColor(position.unrealizedPnL)} sm:text-right`}>
                      {formatCurrency(position.unrealizedPnL)}
                    </div>
                  </div>

                  {/* Price Grid - Responsive: 2 cols on mobile, 5 on larger screens */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-400 uppercase tracking-wide">Entry</span>
                      <span className="text-sm font-medium text-gray-100">
                        {formatCurrency(position.entryPrice)}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-400 uppercase tracking-wide">Current</span>
                      <span className={`text-sm font-medium ${
                        isAboveEntry ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatCurrency(position.currentPrice)}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-400 uppercase tracking-wide">Target</span>
                      <span className={`text-sm font-medium ${
                        (position.targetPrice || position.signalContext?.takeProfit) ? 'text-blue-400' : 'text-gray-500'
                      }`}>
                        {position.targetPrice ? formatCurrency(position.targetPrice) :
                         position.signalContext?.takeProfit ? formatCurrency(position.signalContext.takeProfit) : '—'}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-400 uppercase tracking-wide">Stop Loss</span>
                      <span className={`text-sm font-medium ${
                        (position.stopPrice || position.signalContext?.stopLoss || position.signalContext?.stopPrice) ? 'text-orange-400' : 'text-gray-500'
                      }`}>
                        {position.stopPrice ? formatCurrency(position.stopPrice) :
                         position.signalContext?.stopLoss ? formatCurrency(position.signalContext.stopLoss) :
                         position.signalContext?.stopPrice ? formatCurrency(position.signalContext.stopPrice) : '—'}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-400 uppercase tracking-wide">Trailing</span>
                      <span className={`text-sm font-medium ${
                        trailingDisplay ? 'text-purple-300' : 'text-gray-500'
                      }`}>
                        {trailingDisplay || '—'}
                      </span>
                      {trailingActivationDistance && (
                        <span className={`text-xs ${
                          trailingActivationDistance === 'Active' ? 'text-green-400' : 'text-yellow-400'
                        }`}>
                          {trailingActivationDistance}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="px-4 py-2 border-t border-gray-600 text-xs text-gray-400">
                    Opened {position.signalContext?.timestamp ?
                      new Date(position.signalContext.timestamp).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric'
                      }) + ', ' + new Date(position.signalContext.timestamp).toLocaleTimeString('en-US', {
                        hour: 'numeric', minute: '2-digit', hour12: true
                      }) : 'Unknown'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pending Orders Section - Compact Layout */}
      {hasPendingOrders && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-yellow-400 mb-3 flex items-center gap-2">
            <span>⏳</span>
            Pending Orders from Trade Signals ({tradingData.pendingOrders.length})
          </h4>
          <div className="space-y-2">
            {tradingData.pendingOrders.map((order, idx) => {
              const action = order.action?.toLowerCase();
              const isLong = action === 'long' || action === 'buy';
              const quantity = order.quantity || 0;
              const orderPrice = order.price;
              // Use marketData.currentPrice if available, fallback to cached price to prevent flickering
              const rawCurrentPrice = order.marketData?.currentPrice || order.currentMarketData?.close;
              const priceKey = order.baseSymbol || order.symbol;

              // Use cached price as fallback to prevent "No Data" flickering
              const currentPrice = (rawCurrentPrice && !isNaN(rawCurrentPrice))
                ? rawCurrentPrice
                : (lastValidPrices[priceKey] || null);
              const marketDistance = order.marketDistance;

              // Format trailing stop display from separate values
              const trailingOffset = order.signalContext?.trailingOffset;
              const trailingTrigger = order.signalContext?.trailingTrigger;
              const legacyTrailing = order.signalContext?.trailingStop;

              let trailingDisplay = null;
              let trailingActivationDistance = null;

              if (trailingOffset && trailingTrigger) {
                trailingDisplay = `${trailingOffset}pt / ${trailingTrigger}pt`;
                // For pending orders, can't calculate activation distance without entry price
                // Will show activation distance once order is filled and becomes a position
              } else if (legacyTrailing) {
                trailingDisplay = typeof legacyTrailing === 'string' ? legacyTrailing : `${legacyTrailing}pt`;
              }

              return (
                <div key={idx} className="bg-gray-800 border border-yellow-500/30 rounded-lg overflow-hidden">
                  {/* Header Row */}
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-700 border-b border-gray-600">
                    <div className="flex items-center gap-3">
                      <div className={`flex items-center gap-2 font-semibold text-sm ${
                        isLong ? 'text-green-400' : 'text-red-400'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${
                          isLong ? 'bg-green-400' : 'bg-red-400'
                        }`}></span>
                        {isLong ? 'LONG' : 'SHORT'}
                      </div>
                      <span className="font-bold text-white text-lg">{order.symbol}</span>
                      <span className="text-gray-400 text-sm">×{quantity}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-yellow-400 font-medium">{order.orderStatus}</div>
                      <div className="text-xs text-gray-500">ID: {order.orderId}</div>
                    </div>
                  </div>

                  {/* Price Grid - Responsive: 2 cols on mobile, 5 on larger screens */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-400 uppercase tracking-wide">Order Price</span>
                      <span className="text-sm font-medium text-gray-100">
                        {formatCurrency(orderPrice)}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-400 uppercase tracking-wide">Current</span>
                      <span className={`text-sm font-medium ${
                        currentPrice ? 'text-white' : 'text-gray-500'
                      }`}>
                        {currentPrice ? formatCurrency(currentPrice) : 'No Data'}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-400 uppercase tracking-wide">Target</span>
                      <span className={`text-sm font-medium ${
                        order.signalContext?.takeProfit ? 'text-blue-400' : 'text-gray-500'
                      }`}>
                        {order.signalContext?.takeProfit ? formatCurrency(order.signalContext.takeProfit) : '—'}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-400 uppercase tracking-wide">Stop Loss</span>
                      <span className={`text-sm font-medium ${
                        order.signalContext?.stopLoss ? 'text-orange-400' : 'text-gray-500'
                      }`}>
                        {order.signalContext?.stopLoss ? formatCurrency(order.signalContext.stopLoss) : '—'}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-400 uppercase tracking-wide">Trailing</span>
                      <span className={`text-sm font-medium ${
                        trailingDisplay ? 'text-purple-300' : 'text-gray-500'
                      }`}>
                        {trailingDisplay || 'None'}
                      </span>
                      {trailingDisplay && (
                        <span className="text-xs text-blue-400">
                          On fill
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Market Distance Info (if available) */}
                  {marketDistance && currentPrice && (
                    <div className="px-4 py-2 bg-gray-900 border-t border-gray-600">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-400">Market Distance:</span>
                        <span className={`font-medium ${getDistanceColor(marketDistance.percentage)}`}>
                          {marketDistance.points?.toFixed(2)} pts ({formatPercentage(marketDistance.percentage)})
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="px-4 py-2 border-t border-gray-600 text-xs text-gray-400">
                    Placed {order.createdAt || order.timestamp ?
                      new Date(order.createdAt || order.timestamp).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric'
                      }) + ', ' + new Date(order.createdAt || order.timestamp).toLocaleTimeString('en-US', {
                        hour: 'numeric', minute: '2-digit', hour12: true
                      }) : 'Unknown'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!hasActiveItems && (
        <div className="text-center text-gray-500 py-8">
          <div className="text-4xl mb-3">💤</div>
          <div className="text-lg font-semibold mb-2">No Active Trading Activity</div>
          <div className="text-sm">
            No pending orders or open positions from trade signals
          </div>
        </div>
      )}

      {/* Data Source Info */}
      {tradingData?.source && (
        <div className="mt-4 text-xs text-gray-500 text-center">
          Data source: {tradingData.source}
          {tradingData.source === 'monitoring_fallback' && (
            <span className="text-yellow-400 ml-2">⚠️ Using fallback data</span>
          )}
        </div>
      )}
    </div>
  );
};

export default EnhancedTradingStatus;