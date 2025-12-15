import React from 'react';

const SignalsList = ({ title, data, onRefresh, onViewSignal, showAll = true }) => {
  const displayData = showAll ? data : data.slice(0, 10);

  const getStatusColor = (status) => {
    switch (status) {
      case 'received': return 'text-blue-400';
      case 'processed': return 'text-green-400';
      case 'executed': return 'text-green-500';
      case 'failed': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center">
          <span className="mr-2">📡</span>
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
          <p>No signals received yet</p>
          <p className="text-sm mt-2">Trade signals will appear here when webhooks are received</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left text-gray-400 pb-2">Time</th>
                <th className="text-left text-gray-400 pb-2">Signal</th>
                <th className="text-center text-gray-400 pb-2">Status</th>
                <th className="text-center text-gray-400 pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayData.map((signal, index) => (
                <tr
                  key={signal.id || index}
                  className="border-b border-gray-700 hover:bg-gray-700 transition-colors"
                >
                  <td className="py-2 text-gray-300">
                    {formatTime(signal.timestamp)}
                  </td>
                  <td className="py-2 text-white max-w-md">
                    <div className="truncate" title={signal.summary}>
                      {signal.summary || 'Unknown signal'}
                    </div>
                  </td>
                  <td className="py-2 text-center">
                    <span className={`px-2 py-1 rounded text-xs uppercase ${getStatusColor(signal.status)}`}>
                      {signal.status || 'unknown'}
                    </span>
                  </td>
                  <td className="py-2 text-center">
                    <button
                      onClick={() => onViewSignal(signal)}
                      className="text-blue-400 hover:text-blue-300 transition-colors text-xs px-2 py-1 bg-gray-600 rounded"
                      title="View raw JSON data"
                    >
                      View JSON
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default SignalsList;