import React, { useState } from 'react';
import GexComparisonPanel from './GexComparisonPanel';
// [2026-05-20] ESGexLevelsPanel import + ES tab disabled — no live ES strategies
// and data-service no longer publishes ES GEX. Re-enable the import + the
// ES tab JSX below if reviving ES.
// import ESGexLevelsPanel from './ESGexLevelsPanel';

const TabbedGexPanel = ({ nqGexData, esGexData, onRefreshNq, onRefreshEs }) => {
  // ES tab disabled — only NQ panel renders. Tab bar collapses to a single
  // header label rather than tabs, so the component visually identifies
  // itself as "NQ GEX" without forcing UI churn.
  const [activeTab] = useState('nq');

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Header (was tab bar with NQ/ES tabs — single label now) */}
      <div className="flex gap-1 px-2 pt-1 pb-0 bg-gray-800 rounded-t-lg flex-shrink-0">
        <div className="px-3 py-0.5 text-xs font-medium rounded-t bg-gray-700 text-white border-b-2 border-blue-500">
          NQ
        </div>
        {/* ES tab — disabled
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
        */}
      </div>
      {/* Panel content */}
      <div className="flex-1 min-h-0">
        <GexComparisonPanel gexData={nqGexData} onRefresh={onRefreshNq} />
        {/* ES panel — disabled
        {activeTab === 'es' && (
          <ESGexLevelsPanel gexData={esGexData} onRefresh={onRefreshEs} />
        )}
        */}
      </div>
    </div>
  );
};

export default TabbedGexPanel;
