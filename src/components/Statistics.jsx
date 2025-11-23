import React from 'react';

const Statistics = ({ stats, positions, orders }) => {
  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
        <span className="mr-2">📊</span>
        Trading Statistics
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-400">
            {stats?.totalPositions || positions?.length || 0}
          </div>
          <div className="text-sm text-gray-400">Total Positions</div>
        </div>

        <div className="text-center">
          <div className="text-2xl font-bold text-green-400">
            {stats?.longPositions || positions?.filter(p => p.qty > 0).length || 0}
          </div>
          <div className="text-sm text-gray-400">Long</div>
        </div>

        <div className="text-center">
          <div className="text-2xl font-bold text-red-400">
            {stats?.shortPositions || positions?.filter(p => p.qty < 0).length || 0}
          </div>
          <div className="text-sm text-gray-400">Short</div>
        </div>

        <div className="text-center">
          <div className="text-2xl font-bold text-yellow-400">
            {stats?.pendingOrders || orders?.filter(o => o.status === 'Working').length || 0}
          </div>
          <div className="text-sm text-gray-400">Working Orders</div>
        </div>

        <div className="text-center">
          <div className="text-2xl font-bold text-purple-400">
            {stats?.filledOrders || orders?.filter(o => o.status === 'Filled').length || 0}
          </div>
          <div className="text-sm text-gray-400">Filled Orders</div>
        </div>

        <div className="text-center">
          <div className="text-2xl font-bold text-orange-400">
            ${stats?.totalDayPnL?.toFixed(2) || '0.00'}
          </div>
          <div className="text-sm text-gray-400">Day P&L</div>
        </div>
      </div>
    </div>
  );
};

export default Statistics;