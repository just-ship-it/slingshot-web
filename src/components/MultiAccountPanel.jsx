import React, { useState } from 'react';
import { ChevronDown, ChevronRight, RefreshCw, AlertTriangle } from 'lucide-react';

const formatCurrency = (amount) => {
  if (amount == null) return '--';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(amount);
};

const formatPnL = (amount) => {
  if (amount == null) return '--';
  const prefix = amount >= 0 ? '+' : '';
  return `${prefix}${formatCurrency(amount)}`;
};

const getPnLColor = (pnl) => {
  if (pnl > 0) return 'text-green-400';
  if (pnl < 0) return 'text-red-400';
  return 'text-gray-400';
};

const getBrokerBadge = (broker) => {
  if (broker === 'pickmytrade') {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-purple-900 text-purple-300">PMT</span>;
  }
  return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900 text-blue-300">Tradovate</span>;
};

const getModeBadge = (account) => {
  if (account.broker === 'pickmytrade') {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-purple-900 text-purple-300">PMT</span>;
  }
  const mode = account.config?.mode || 'demo';
  if (mode === 'live') {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-green-900 text-green-300">Live</span>;
  }
  return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-900 text-yellow-300">Demo</span>;
};

/** Positions list for an account. Two-line card per position so the
 * strategy name has room without horizontal scrolling. One position per
 * symbol max, so a list is the right shape — no table-style scanning needed. */
const PositionsTable = ({ positions }) => {
  if (!positions || positions.length === 0) {
    return (
      <div className="px-4 py-3 text-sm text-gray-500">No open positions</div>
    );
  }

  const fmtPrice = (v) => v != null ? Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--';

  return (
    <div className="divide-y divide-gray-700/50">
      {positions.map((pos, i) => {
        const side = (pos.side || '').toLowerCase();
        const isLong = side === 'long' || (pos.netPos && pos.netPos > 0);
        const qty = Math.abs(pos.netPos || pos.quantity || 0);
        const signedQty = `${isLong ? '+' : '-'}${qty}`;

        return (
          <div key={pos.positionId || pos.symbol || i} className="px-4 py-2">
            {/* Top row: side + symbol + strategy + P&L */}
            <div className="flex items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isLong ? 'bg-green-400' : 'bg-red-400'}`} title={isLong ? 'Long' : 'Short'} />
                <span className="text-gray-200 font-medium">{pos.symbol}</span>
                <span className="text-gray-300 font-mono text-xs">{signedQty}</span>
                <span className="text-gray-400 text-xs truncate" title={pos.strategy || ''}>
                  {pos.strategy || '--'}
                </span>
              </div>
              <span className={`font-semibold text-sm flex-shrink-0 ${getPnLColor(pos.unrealizedPnL)}`}>
                {formatPnL(pos.unrealizedPnL)}
              </span>
            </div>
            {/* Bottom row: Entry • SL • TP • Current — compact monospace strip */}
            <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs font-mono">
              <span>
                <span className="text-gray-500 mr-1">Entry</span>
                <span className="text-gray-300">{fmtPrice(pos.entryPrice)}</span>
              </span>
              <span>
                <span className="text-gray-500 mr-1">SL</span>
                <span className="text-red-400/80">{fmtPrice(pos.stopLoss)}</span>
              </span>
              <span>
                <span className="text-gray-500 mr-1">TP</span>
                <span className="text-green-400/80">{fmtPrice(pos.takeProfit)}</span>
              </span>
              <span>
                <span className="text-gray-500 mr-1">@</span>
                <span className="text-gray-200">{fmtPrice(pos.currentPrice)}</span>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** Working orders table for an account */
const OrdersTable = ({ orders }) => {
  if (!orders || orders.length === 0) {
    return (
      <div className="px-4 py-3 text-sm text-gray-500">No working orders</div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-gray-400 text-xs uppercase tracking-wider">
          <th className="text-left px-4 py-1.5 font-medium">Symbol</th>
          <th className="text-left px-2 py-1.5 font-medium">Side</th>
          <th className="text-right px-2 py-1.5 font-medium">Qty</th>
          <th className="text-right px-2 py-1.5 font-medium">Price</th>
          <th className="text-left px-4 py-1.5 font-medium">Strategy</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((order, i) => {
          const action = (order.action || order.direction || order.side || '').toLowerCase();
          const isLong = action === 'long' || action === 'buy';

          return (
            <tr key={order.orderId || order.signalId || i} className="border-t border-gray-700/50">
              <td className="px-4 py-1.5 text-gray-200 font-medium">{order.symbol}</td>
              <td className="px-2 py-1.5">
                <span className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${isLong ? 'bg-green-400' : 'bg-red-400'}`} />
                  <span className="text-gray-300">{isLong ? 'Buy' : 'Sell'}</span>
                </span>
              </td>
              <td className="px-2 py-1.5 text-right text-gray-200">{order.quantity || 1}</td>
              <td className="px-2 py-1.5 text-right text-gray-300 font-mono">
                {order.price != null ? Number(order.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--'}
              </td>
              <td className="px-4 py-1.5 text-gray-400 text-xs">{order.strategy || '--'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

/** Single account card */
const AccountCard = ({ account, positions, orders, balance, hasBalanceError }) => {
  // Default expanded if the account has any activity
  const hasActivity = (positions?.length || 0) > 0 || (orders?.length || 0) > 0;
  const [expanded, setExpanded] = useState(hasActivity);

  const posCount = positions?.length || 0;
  const ordCount = orders?.length || 0;
  const accountPnL = (balance?.realizedPnL || 0) + (balance?.unrealizedPnL || 0);
  const acctBalance = balance?.balance;

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 mb-3">
      {/* Card header — grid for vertical alignment across cards */}
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="w-full px-4 py-3 grid items-center cursor-pointer hover:bg-gray-700/50 rounded-t-lg transition-colors"
        style={{ gridTemplateColumns: '100px 60px auto auto auto auto' }}
      >
        {/* Name */}
        <div className="flex items-center gap-2 min-w-0 max-w-[100px]">
          <span className="text-sm font-semibold text-white truncate">
            {account.displayName || account.id}
          </span>
        </div>

        {/* Badge */}
        <div className="flex items-center gap-1.5 px-3 min-w-[60px] justify-start">
          {getModeBadge(account)}
        </div>

        {/* Balance — "Bal" label + right-aligned number in fixed columns */}
        <div className="flex items-center gap-1 px-3 min-w-[140px]">
          <span className="text-gray-500 text-sm w-7 text-right flex-shrink-0">Bal</span>
          {hasBalanceError ? (
            <span className="flex items-center gap-1 text-yellow-500 text-xs">
              <AlertTriangle className="w-3 h-3" />
              --
            </span>
          ) : acctBalance != null ? (
            <span className="text-white text-sm font-medium font-mono flex-1 text-right">{formatCurrency(acctBalance)}</span>
          ) : (
            <span className="text-gray-500 text-sm flex-1 text-right">--</span>
          )}
        </div>

        {/* Account P&L (realized + unrealized for the day) */}
        <div className="text-right px-3 min-w-[120px]">
          <span className={`text-sm font-medium ${getPnLColor(accountPnL)}`}>
            {formatPnL(accountPnL)}
          </span>
        </div>

        {/* Position / order counts */}
        <div className="flex items-center gap-1.5 px-2 min-w-[100px] justify-end">
          {posCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-300 font-medium">
              {posCount} pos
            </span>
          )}
          {ordCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-900/60 text-yellow-300 font-medium">
              {ordCount} ord
            </span>
          )}
        </div>

        {/* Chevron */}
        <div className="flex-shrink-0 pl-2">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {/* Card body */}
      {expanded && (
        <div className="border-t border-gray-700">
          {/* Positions section */}
          <div>
            <div className="px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-900/50">
              Positions
            </div>
            <PositionsTable positions={positions} />
          </div>

          {/* Orders section */}
          <div>
            <div className="px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-900/50 border-t border-gray-700">
              Working Orders
            </div>
            <OrdersTable orders={orders} />
          </div>
        </div>
      )}
    </div>
  );
};

/** Main multi-account panel */
const MultiAccountPanel = ({ accounts, positions, pendingOrders, balances, totals, isLoading, onReload }) => {
  if (isLoading && (!accounts || accounts.length === 0)) {
    return (
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <div className="flex items-center justify-center gap-2 text-gray-400 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading accounts...
        </div>
      </div>
    );
  }

  if (!accounts || accounts.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <div className="text-center text-gray-500 text-sm">
          No accounts configured. Use the Accounts manager to add one.
        </div>
      </div>
    );
  }

  const posObj = positions || {};
  const ordObj = pendingOrders || {};
  const balObj = balances || {};

  // Hide accounts that are used as shadows by another account (e.g. tradovate-demo when it's a PMT shadow)
  const shadowIds = new Set(
    accounts.filter(a => a.tracking?.via || a.config?.tracking?.via)
      .map(a => a.tracking?.via || a.config?.tracking?.via)
  );
  const visibleAccounts = accounts.filter(a => !shadowIds.has(a.id));

  return (
    <div className="multi-account-panel">
      {/* Panel header */}
      <div className="flex items-center justify-between px-1 py-1.5 mb-1">
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-400 font-medium">
            {visibleAccounts.length} account{visibleAccounts.length !== 1 ? 's' : ''}
          </span>
          {totals.totalPositions > 0 && (
            <span className="text-blue-400 font-semibold">
              {totals.totalPositions} position{totals.totalPositions !== 1 ? 's' : ''}
            </span>
          )}
          {totals.totalPending > 0 && (
            <span className="text-yellow-400 font-semibold">
              {totals.totalPending} order{totals.totalPending !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {onReload && (
          <button
            onClick={onReload}
            className="text-gray-400 hover:text-white p-1 rounded transition-colors"
            title="Refresh all accounts"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {/* Account cards */}
      {visibleAccounts.map(account => (
        <AccountCard
          key={account.id}
          account={account}
          positions={posObj[account.id] || []}
          orders={ordObj[account.id] || []}
          balance={balObj[account.id] || null}
          hasBalanceError={!balObj[account.id] && !isLoading}
        />
      ))}
    </div>
  );
};

export default MultiAccountPanel;
