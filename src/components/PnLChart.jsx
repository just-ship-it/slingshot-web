import React from 'react';

const PnLChart = ({ data, accountId }) => {
  // For now, we'll show a placeholder chart
  // TODO: Implement Chart.js integration when chart data is available

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center justify-between">
        <div className="flex items-center">
          <span className="mr-2">📈</span>
          Daily P&L Chart
        </div>
        {data?.cached && (
          <span className="text-xs text-blue-400 bg-blue-900/30 px-2 py-1 rounded">
            Cached
          </span>
        )}
      </h3>

      {data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className={`text-2xl font-bold ${data.totalDayPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {data.totalDayPnL >= 0 ? '+' : ''}${data.totalDayPnL?.toFixed(2) || '0.00'}
              </div>
              <div className="text-sm text-gray-400">Total Day P&L</div>
            </div>

            <div className="text-center">
              <div className="text-xl font-semibold text-blue-400">
                {data.accountPnL?.length || 0}
              </div>
              <div className="text-sm text-gray-400">Accounts</div>
            </div>

            <div className="text-center">
              <div className="text-xl font-semibold text-yellow-400">
                ${data.accountPnL?.reduce((sum, acc) => sum + (acc.equity || 0), 0).toFixed(0) || '0'}
              </div>
              <div className="text-sm text-gray-400">Total Equity</div>
            </div>

            <div className="text-center">
              <div className="text-xl font-semibold text-purple-400">
                ${data.accountPnL?.reduce((sum, acc) => sum + (acc.balance || 0), 0).toFixed(0) || '0'}
              </div>
              <div className="text-sm text-gray-400">Total Balance</div>
            </div>
          </div>

          {/* Chart placeholder */}
          <div className="h-48 bg-gray-700 rounded-lg flex items-center justify-center">
            <div className="text-center text-gray-400">
              <div className="text-4xl mb-2">📊</div>
              <p>P&L Chart Coming Soon</p>
              <p className="text-sm">Real-time charting with Chart.js</p>
            </div>
          </div>

          {/* Current Account Details */}
          {data.accountPnL && data.accountPnL.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-semibold text-white">Current Account</h4>
              {data.accountPnL.map((account, index) => (
                <div key={index} className="p-3 bg-gray-700 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-blue-300 font-semibold">
                      {account.accountName || account.accountId}
                    </span>
                    <span className={`font-bold text-lg ${account.dayPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {account.dayPnL >= 0 ? '+' : ''}${account.dayPnL?.toFixed(2) || '0.00'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">Balance: </span>
                      <span className="text-white">${(account.balance || 0).toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Equity: </span>
                      <span className="text-white">${(account.equity || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="h-48 bg-gray-700 rounded-lg flex items-center justify-center">
          <div className="text-center text-gray-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
            <p>Loading P&L data...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default PnLChart;