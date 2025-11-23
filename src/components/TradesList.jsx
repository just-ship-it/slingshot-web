import React from 'react';
import { apiUtils } from '../services/api';

const TradesList = ({ title, data, type, onRefresh, showAll = true }) => {
  const displayData = showAll ? data : data.slice(0, 5);

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center">
          <span className="mr-2">{type === 'positions' ? '📍' : '📋'}</span>
          {title}
          <span className="ml-2 text-sm text-gray-400">({data.length})</span>
        </h3>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="text-gray-400 hover:text-white transition-colors"
          >
            🔄
          </button>
        )}
      </div>

      {displayData.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <p>No {type} found</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left text-gray-400 pb-2">Symbol</th>
                {type === 'positions' ? (
                  <>
                    <th className="text-right text-gray-400 pb-2">Qty</th>
                    <th className="text-right text-gray-400 pb-2">Avg Price</th>
                    <th className="text-right text-gray-400 pb-2">P&L</th>
                  </>
                ) : (
                  <>
                    <th className="text-right text-gray-400 pb-2">Type</th>
                    <th className="text-right text-gray-400 pb-2">Side</th>
                    <th className="text-right text-gray-400 pb-2">Qty</th>
                    <th className="text-right text-gray-400 pb-2">Price</th>
                    <th className="text-right text-gray-400 pb-2">Time</th>
                    <th className="text-right text-gray-400 pb-2">Status</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {displayData.map((item, index) => (
                <tr key={index} className="border-b border-gray-700 hover:bg-gray-700">
                  <td className="py-2 text-white font-medium">
                    {item.symbol || item.contractName || 'Unknown'}
                  </td>
                  {type === 'positions' ? (
                    <>
                      <td className={`py-2 text-right ${apiUtils.getPositionStatusColor(item.qty)}`}>
                        {item.qty > 0 ? '+' : ''}{item.qty}
                      </td>
                      <td className="py-2 text-right text-gray-300">
                        {apiUtils.formatCurrency(item.avgPrice || item.price)}
                      </td>
                      <td className={`py-2 text-right ${apiUtils.getPnLColor(item.pnl)}`}>
                        {apiUtils.formatCurrency(item.pnl || item.unrealizedPnL || 0)}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-2 text-right text-gray-300">
                        {item.orderType || 'Market'}
                      </td>
                      <td className={`py-2 text-right ${item.action === 'Buy' ? 'text-green-400' : 'text-red-400'}`}>
                        {item.action || 'Unknown'}
                      </td>
                      <td className="py-2 text-right text-white">
                        {item.qty || item.orderQty || 0}
                      </td>
                      <td className="py-2 text-right text-gray-300">
                        {item.limitPrice ? apiUtils.formatCurrency(item.limitPrice) : 'Market'}
                      </td>
                      <td className="py-2 text-right text-gray-400 text-xs">
                        {item.timestamp ?
                          new Date(item.timestamp).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: true
                          })
                          : 'Unknown'}
                      </td>
                      <td className={`py-2 text-right ${apiUtils.getOrderStatusColor(item.status)}`}>
                        {item.status || 'Unknown'}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TradesList;