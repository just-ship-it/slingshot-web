import React, { useState } from 'react';
import GexComparisonPanel from './GexComparisonPanel';
import ESGexLevelsPanel from './ESGexLevelsPanel';

const TabbedGexPanel = ({ nqGexData, esGexData, onRefreshNq, onRefreshEs }) => {
  const [activeTab, setActiveTab] = useState('nq');

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Tab bar */}
      <div className="flex gap-1 px-2 pt-1 pb-0 bg-gray-800 rounded-t-lg flex-shrink-0">
        <button
          onClick={() => setActiveTab('nq')}
          className={`px-3 py-0.5 text-xs font-medium rounded-t transition-colors ${
            activeTab === 'nq'
              ? 'bg-gray-700 text-white border-b-2 border-blue-500'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          NQ
        </button>
        <button
          onClick={() => setActiveTab('es')}
          className={`px-3 py-0.5 text-xs font-medium rounded-t transition-colors ${
            activeTab === 'es'
              ? 'bg-gray-700 text-white border-b-2 border-blue-500'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          ES
        </button>
      </div>
      {/* Panel content */}
      <div className="flex-1 min-h-0">
        {activeTab === 'nq' ? (
          <GexComparisonPanel gexData={nqGexData} onRefresh={onRefreshNq} />
        ) : (
          <ESGexLevelsPanel gexData={esGexData} onRefresh={onRefreshEs} />
        )}
      </div>
    </div>
  );
};

export default TabbedGexPanel;
