import React from 'react';
import { apiUtils } from '../services/api';

const AccountInfo = ({ account, summary, isLoading }) => {
  if (isLoading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Account Overview</h3>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex justify-between">
              <div className="h-4 bg-gray-700 rounded w-20 animate-pulse"></div>
              <div className="h-4 bg-gray-700 rounded w-24 animate-pulse"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const dayPnLColor = apiUtils.getPnLColor(summary?.dayPnL || 0);
  const dayPnLPercent = summary?.dayPnLPercent || 0;

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
        <span className="mr-2">💼</span>
        Account Overview
      </h3>

      <div className="space-y-4">
        {/* Account Balance */}
        <div className="flex justify-between items-center">
          <span className="text-gray-400">Balance</span>
          <span className="text-white font-semibold">
            {apiUtils.formatCurrency(summary?.balance)}
          </span>
        </div>

        {/* Equity */}
        <div className="flex justify-between items-center">
          <span className="text-gray-400">Equity</span>
          <span className="text-white font-semibold">
            {apiUtils.formatCurrency(summary?.equity)}
          </span>
        </div>

        {/* Available Funds */}
        <div className="flex justify-between items-center">
          <span className="text-gray-400">Available Funds</span>
          <span className="text-white font-semibold">
            {apiUtils.formatCurrency(summary?.availableFunds)}
          </span>
        </div>

        {/* Margin Used */}
        <div className="flex justify-between items-center">
          <span className="text-gray-400">Margin Used</span>
          <span className="text-white font-semibold">
            {apiUtils.formatCurrency(summary?.margin)}
          </span>
        </div>

        {/* Day P&L */}
        <div className="border-t border-gray-700 pt-4">
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Day P&L</span>
            <div className="text-right">
              <div className={`font-semibold ${dayPnLColor}`}>
                {apiUtils.formatCurrency(summary?.dayPnL)}
              </div>
              <div className={`text-sm ${dayPnLColor}`}>
                ({dayPnLPercent > 0 ? '+' : ''}{dayPnLPercent.toFixed(2)}%)
              </div>
            </div>
          </div>
        </div>

        {/* Trading Statistics */}
        <div className="border-t border-gray-700 pt-4 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Positions</span>
            <span className="text-white">
              {summary?.totalPositions || 0}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-400 ml-4">Long</span>
            <span className="text-green-400">
              {summary?.longPositions || 0}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-400 ml-4">Short</span>
            <span className="text-red-400">
              {summary?.shortPositions || 0}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-400">Working Orders</span>
            <span className="text-yellow-400">
              {summary?.workingOrders || 0}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-400">Trades Today</span>
            <span className="text-blue-400">
              {summary?.tradesExecutedToday || 0}
            </span>
          </div>
        </div>

        {/* Status Indicator */}
        <div className="border-t border-gray-700 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Status</span>
            <div className="flex items-center space-x-2">
              {summary?.loading ? (
                <>
                  <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse"></div>
                  <span className="text-yellow-400 text-sm">Loading</span>
                </>
              ) : summary?.cached ? (
                <>
                  <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                  <span className="text-blue-400 text-sm">Cached</span>
                </>
              ) : (
                <>
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-green-400 text-sm">Live</span>
                </>
              )}
            </div>
          </div>
          {summary?.dataAge && summary.cached && (
            <div className="flex items-center justify-between mt-1">
              <span className="text-gray-400 text-xs">Last Updated</span>
              <span className="text-gray-400 text-xs">
                {Math.round(summary.dataAge / 1000)}s ago
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AccountInfo;