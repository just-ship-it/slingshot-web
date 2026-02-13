import React, { useState } from 'react';
import IVSkewPanel from './IVSkewPanel';
import ESCrossSignalPanel from './ESCrossSignalPanel';

const TABS = [
  { id: 'iv-skew', label: 'IV Skew (NQ)' },
  { id: 'es-cross', label: 'ES Cross-Signal' }
];

const StrategyTabPanel = ({ socket, quotes }) => {
  const [activeTab, setActiveTab] = useState('iv-skew');

  return (
    <div>
      {/* Tab Bar */}
      <div className="flex space-x-1 mb-2">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 rounded-t-lg text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-gray-800 text-white'
                : 'bg-gray-900 text-gray-400 hover:text-gray-300 hover:bg-gray-800/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'iv-skew' && (
        <IVSkewPanel socket={socket} quotes={quotes} />
      )}
      {activeTab === 'es-cross' && (
        <ESCrossSignalPanel socket={socket} quotes={quotes} />
      )}
    </div>
  );
};

export default StrategyTabPanel;
