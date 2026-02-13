import React from 'react';

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

const PositionCard = ({ position }) => {
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
      {/* Line 3: SL / TP / trailing */}
      <div className="flex items-center gap-2 mt-0.5 text-xs">
        {stopPrice && <span className="text-orange-400">SL {formatCurrency(stopPrice)}</span>}
        {targetPrice && <span className="text-blue-400">TP {formatCurrency(targetPrice)}</span>}
        {trailingText && <span className="text-purple-300">{trailingText}</span>}
      </div>
    </div>
  );
};

const OrderCard = ({ order }) => {
  const action = order.action?.toLowerCase();
  const isLong = action === 'long' || action === 'buy';
  const quantity = order.quantity || 0;
  const orderPrice = order.price;
  const distance = order.marketDistance;

  return (
    <div className="px-2.5 py-2 border-b border-gray-700 last:border-b-0">
      {/* Line 1: side dot + symbol + qty + status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isLong ? 'bg-green-400' : 'bg-red-400'}`} />
          <span className="text-white font-semibold text-sm">{order.symbol}</span>
          <span className="text-gray-400 text-xs">x{quantity}</span>
        </div>
        <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-medium">
          {order.orderStatus || 'Working'}
        </span>
      </div>
      {/* Line 2: order price + distance */}
      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
        <span>@ {formatCurrency(orderPrice)}</span>
        {distance?.points != null && (
          <span className="text-gray-500">
            ({distance.points.toFixed(1)}pt away)
          </span>
        )}
      </div>
    </div>
  );
};

const TradingPanel = ({ open, onToggle, tradingData, isLoading }) => {
  const positions = tradingData?.openPositions || [];
  const orders = tradingData?.pendingOrders || [];
  const posCount = positions.length;
  const ordCount = orders.length;
  const hasItems = posCount > 0 || ordCount > 0;

  // Collapsed: absolutely-positioned handle on the right edge of the bottom row
  if (!open) {
    return (
      <button
        onClick={onToggle}
        className="trading-panel-handle bg-gray-800 border-l border-gray-700 flex flex-col items-center justify-center gap-2 hover:bg-gray-700 cursor-pointer"
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
    <div className="trading-panel bg-gray-800 border-l border-gray-700 flex flex-col">
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
              <PositionCard key={pos.positionId || pos.symbol || i} position={pos} />
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
              <OrderCard key={order.orderId || i} order={order} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TradingPanel;
