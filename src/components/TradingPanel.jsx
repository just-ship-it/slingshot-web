import React, { useState } from 'react';
import axios from 'axios';
import QuickOrder from './QuickOrder';

const formatCurrency = (amount) => {
  if (amount == null) return '--';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(amount);
};

const getPnLColor = (pnl) => {
  if (pnl > 0) return 'text-green-400';
  if (pnl < 0) return 'text-red-400';
  return 'text-gray-400';
};

/** Determine the colored dot for the collapsed handle */
const getHandleDotColor = (tradingData) => {
  const positions = tradingData?.openPositions || [];
  const orders = tradingData?.pendingOrders || [];
  if (positions.length > 0) {
    const side = positions[0].side?.toLowerCase();
    return side === 'short' ? 'bg-red-400' : 'bg-green-400';
  }
  if (orders.length > 0) return 'bg-yellow-400';
  return 'bg-gray-500';
};

const PositionCard = ({ position, onClose, isClosing }) => {
  const side = position.side?.toLowerCase();
  const isLong = side === 'long';
  const quantity = Math.abs(position.netPos || position.quantity || position.signalContext?.quantity || 0);
  const currentPrice = position.currentPrice;
  const entryPrice = position.entryPrice;

  // Trailing stop info
  const trailingOffset = position.signalContext?.trailingOffset;
  const trailingTrigger = position.signalContext?.trailingTrigger;
  const stopPrice = position.stopPrice || position.signalContext?.stopLoss || position.signalContext?.stopPrice || position.stop_loss;
  const targetPrice = position.targetPrice || position.signalContext?.takeProfit || position.take_profit;

  let trailingText = null;
  if (trailingOffset && trailingTrigger) {
    trailingText = `Trail ${trailingOffset}/${trailingTrigger}pt`;
  }

  return (
    <div className="px-2.5 py-2 border-b border-gray-700 last:border-b-0">
      {/* Line 1: side dot + symbol + qty + P&L */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isLong ? 'bg-green-400' : 'bg-red-400'}`} />
          <span className="text-white font-semibold text-sm">{position.symbol}</span>
          <span className="text-gray-400 text-xs">x{quantity}</span>
        </div>
        <span className={`text-sm font-semibold ${getPnLColor(position.unrealizedPnL)}`}>
          {formatCurrency(position.unrealizedPnL)}
        </span>
      </div>
      {/* Line 2: entry -> current */}
      <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-400">
        <span>{formatCurrency(entryPrice)}</span>
        <span className="text-gray-600">&rarr;</span>
        <span className={currentPrice && entryPrice ? (
          (isLong ? currentPrice > entryPrice : currentPrice < entryPrice) ? 'text-green-400' : 'text-red-400'
        ) : 'text-gray-300'}>
          {formatCurrency(currentPrice)}
        </span>
      </div>
      {/* Line 3: SL / TP / trailing + close button */}
      <div className="flex items-center justify-between mt-0.5">
        <div className="flex items-center gap-2 text-xs">
          {stopPrice && <span className="text-orange-400">SL {formatCurrency(stopPrice)}</span>}
          {targetPrice && <span className="text-blue-400">TP {formatCurrency(targetPrice)}</span>}
          {trailingText && <span className="text-purple-300">{trailingText}</span>}
        </div>
        <button
          onClick={() => onClose(position)}
          disabled={isClosing}
          className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-red-600/80 hover:bg-red-500
                     disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors leading-tight"
        >
          {isClosing ? 'Closing...' : 'Close'}
        </button>
      </div>
    </div>
  );
};

const OrderCard = ({ order, onCancel, isCancelling }) => {
  const action = order.action?.toLowerCase();
  const isLong = action === 'long' || action === 'buy';
  const quantity = order.quantity || 0;
  const orderPrice = order.price;
  const distance = order.marketDistance;

  return (
    <div className="px-2.5 py-2 border-b border-gray-700 last:border-b-0">
      {/* Line 1: side dot + symbol + qty + cancel button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isLong ? 'bg-green-400' : 'bg-red-400'}`} />
          <span className="text-white font-semibold text-sm">{order.symbol}</span>
          <span className="text-gray-400 text-xs">x{quantity}</span>
        </div>
        <button
          onClick={() => onCancel(order)}
          disabled={isCancelling}
          className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-red-600/80 hover:bg-red-500
                     disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors leading-tight"
        >
          {isCancelling ? 'Cancelling...' : 'Cancel'}
        </button>
      </div>
      {/* Line 2: order price + distance */}
      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
        <span>@ {formatCurrency(orderPrice)}</span>
        {distance?.points != null && (
          <span className="text-gray-500">
            ({distance.points.toFixed(2)}pt away)
          </span>
        )}
      </div>
    </div>
  );
};

const TradingPanel = ({ open, onToggle, tradingData, isLoading, quotes }) => {
  const [closingPositions, setClosingPositions] = useState(new Set());
  const [cancellingOrders, setCancellingOrders] = useState(new Set());
  const positions = tradingData?.openPositions || [];
  const orders = tradingData?.pendingOrders || [];
  const posCount = positions.length;
  const ordCount = orders.length;
  const hasItems = posCount > 0 || ordCount > 0;

  const handleClosePosition = async (position) => {
    const sideLabel = position.side?.toLowerCase() === 'long' ? 'LONG' : 'SHORT';
    if (!window.confirm(`Close ${sideLabel} ${position.symbol} position?`)) return;

    setClosingPositions(prev => new Set(prev).add(position.symbol));

    try {
      const payload = {
        webhook_type: 'trading_signal',
        action: 'position_closed',
        side: position.side?.toLowerCase() === 'long' ? 'buy' : 'sell',
        symbol: position.symbol,
        strategy: 'MANUAL',
        source: 'dashboard-close',
        timestamp: new Date().toISOString(),
      };
      const url = process.env.REACT_APP_API_URL || 'http://localhost:3014';
      await axios.post(`${url}/webhook`, payload, {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      alert(`Failed to close position: ${err.response?.data?.error || err.message}`);
    } finally {
      setClosingPositions(prev => {
        const next = new Set(prev);
        next.delete(position.symbol);
        return next;
      });
    }
  };

  const handleCancelOrder = async (order) => {
    const sideLabel = (order.action || '').toUpperCase();
    if (!window.confirm(`Cancel ${sideLabel} ${order.symbol} limit @ ${formatCurrency(order.price)}?`)) return;

    const orderId = order.orderId || order.symbol;
    setCancellingOrders(prev => new Set(prev).add(orderId));

    try {
      const strategy = order.strategy || order.signalContext?.strategy;
      const payload = {
        webhook_type: 'trading_signal',
        action: 'cancel_limit',
        side: (order.action || '').toLowerCase(),
        symbol: order.symbol,
        ...(strategy && { strategy }),
        reason: 'Manual cancel from dashboard',
        source: 'dashboard-cancel',
        timestamp: new Date().toISOString(),
      };
      const url = process.env.REACT_APP_API_URL || 'http://localhost:3014';
      await axios.post(`${url}/webhook`, payload, {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      alert(`Failed to cancel order: ${err.response?.data?.error || err.message}`);
    } finally {
      setCancellingOrders(prev => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  // Collapsed: absolutely-positioned handle on the right edge of the bottom row
  if (!open) {
    return (
      <button
        onClick={onToggle}
        className="trading-panel-handle bg-gray-800 border-l border-gray-700 rounded-l-lg flex flex-col items-center justify-center gap-2 hover:bg-gray-700 cursor-pointer"
        title="Open trading panel"
      >
        <span className={`w-2.5 h-2.5 rounded-full ${getHandleDotColor(tradingData)}`} />
        <svg width="10" height="10" viewBox="0 0 10 10" className="text-gray-400">
          <path d="M7 5L3 2v6z" fill="currentColor" transform="rotate(180 5 5)" />
        </svg>
      </button>
    );
  }

  // Open: fills its grid cell naturally
  return (
    <div className="trading-panel bg-gray-800 border-l border-gray-700 rounded-lg flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-blue-400 font-semibold">Pos {posCount}</span>
          <span className="text-gray-600">|</span>
          <span className="text-yellow-400 font-semibold">Ord {ordCount}</span>
        </div>
        <button
          onClick={onToggle}
          className="text-gray-400 hover:text-white p-0.5"
          title="Collapse panel"
        >
          <svg width="14" height="14" viewBox="0 0 10 10">
            <path d="M3 5L7 2v6z" fill="currentColor" />
          </svg>
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <QuickOrder quotes={quotes} />

        {isLoading && !tradingData && (
          <div className="text-center text-gray-500 py-8 text-sm">Loading...</div>
        )}

        {!isLoading && !hasItems && (
          <div className="text-center text-gray-500 py-8 text-sm">
            No active positions or orders
          </div>
        )}

        {/* Positions */}
        {posCount > 0 && (
          <div>
            <div className="px-2.5 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-900/50">
              Positions
            </div>
            {positions.map((pos, i) => (
              <PositionCard
                key={pos.positionId || pos.symbol || i}
                position={pos}
                onClose={handleClosePosition}
                isClosing={closingPositions.has(pos.symbol)}
              />
            ))}
          </div>
        )}

        {/* Orders */}
        {ordCount > 0 && (
          <div>
            <div className="px-2.5 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-900/50">
              Orders
            </div>
            {orders.map((order, i) => (
              <OrderCard
                key={order.orderId || i}
                order={order}
                onCancel={handleCancelOrder}
                isCancelling={cancellingOrders.has(order.orderId || order.symbol)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TradingPanel;
