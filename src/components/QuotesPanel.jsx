import React, { useState, useEffect } from 'react';

const QuotesPanel = ({ quotes = {}, isLoading = false }) => {
  const [expandedSymbol, setExpandedSymbol] = useState(null);

  // Debug: Log when quotes prop changes
  useEffect(() => {
    console.log('🎯 QuotesPanel received quotes update:', {
      BTC: quotes.BTC?.close,
      MNQ: quotes.MNQ?.close,
      NQ: quotes.NQ?.close,
      MES: quotes.MES?.close,
      ES: quotes.ES?.close,
      allKeys: Object.keys(quotes),
      quotesObjectReference: quotes,
      timestamp: new Date().toISOString()
    });
  }, [quotes]);

  // Additional debug: Log every render
  console.log('🔄 QuotesPanel rendering with quotes keys:', Object.keys(quotes));

  // Supported symbols that we want to display
  const supportedSymbols = ['MNQ', 'NQ', 'MES', 'ES', 'BTC'];

  // Price change calculation removed - showing current prices only

  // Format large numbers (e.g., volume)
  const formatVolume = (volume) => {
    if (!volume) return '0';
    if (volume >= 1000000) return `${(volume / 1000000).toFixed(1)}M`;
    if (volume >= 1000) return `${(volume / 1000).toFixed(1)}K`;
    return volume.toString();
  };

  if (isLoading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">📊 Live Quotes</h3>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
        </div>
        <div className="space-y-2">
          {supportedSymbols.map(symbol => (
            <div key={symbol} className="animate-pulse flex items-center justify-between p-2 bg-gray-700 rounded">
              <div className="h-4 bg-gray-600 rounded w-12"></div>
              <div className="h-4 bg-gray-600 rounded w-20"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">📊 Live Quotes</h3>
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-xs text-gray-400">Live</span>
        </div>
      </div>

      <div className="space-y-3">
        {supportedSymbols.map(symbol => {
          // Get quote data for this symbol - directly access by base symbol key
          const quote = quotes[symbol];

          const isExpanded = expandedSymbol === symbol;

          return (
            <div key={symbol} className="border border-gray-700 rounded-lg overflow-hidden">
              {/* Main Quote Row */}
              <div
                className="flex items-center justify-between p-3 bg-gray-750 hover:bg-gray-700 cursor-pointer transition-colors"
                onClick={() => setExpandedSymbol(isExpanded ? null : symbol)}
              >
                <div className="flex items-center space-x-3">
                  <span className="font-mono font-semibold text-white text-sm">
                    {symbol}
                  </span>
                  {quote?.timestamp && (
                    <span className="text-xs text-gray-400">
                      {new Date(quote.timestamp).toLocaleTimeString()}
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-4">
                  {quote ? (
                    <>
                      <div className="text-right">
                        <div className="text-white font-semibold">
                          {quote.close?.toFixed(2) || '—'}
                        </div>
                        {quote.previousClose && (
                          <div className={`text-xs ${quote.close > quote.previousClose ? 'text-green-400' : quote.close < quote.previousClose ? 'text-red-400' : 'text-gray-400'}`}>
                            {quote.close > quote.previousClose ? '▲' : quote.close < quote.previousClose ? '▼' : ''}
                            {Math.abs(quote.close - quote.previousClose).toFixed(2)}
                          </div>
                        )}
                      </div>
                      <div className="text-gray-400">
                        {isExpanded ? '▼' : '▶'}
                      </div>
                    </>
                  ) : (
                    <div className="text-gray-500 text-sm">No Data</div>
                  )}
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && quote && (
                <div className="p-3 bg-gray-800 border-t border-gray-700">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-gray-400 mb-1">Open</div>
                      <div className="text-white font-mono">
                        {quote.open?.toFixed(2) || '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-400 mb-1">High</div>
                      <div className="text-white font-mono text-green-400">
                        {quote.high?.toFixed(2) || '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-400 mb-1">Low</div>
                      <div className="text-white font-mono text-red-400">
                        {quote.low?.toFixed(2) || '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-400 mb-1">Close</div>
                      <div className="text-white font-mono">
                        {quote.close?.toFixed(2) || '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-400 mb-1">Volume</div>
                      <div className="text-white font-mono">
                        {formatVolume(quote.volume)}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-400 mb-1">Prev Close</div>
                      <div className="text-white font-mono">
                        {quote.previousClose?.toFixed(2) || '—'}
                      </div>
                    </div>
                  </div>

                  {quote.symbol && (
                    <div className="mt-3 pt-3 border-t border-gray-700">
                      <div className="text-xs text-gray-400">
                        Contract: <span className="text-gray-300 font-mono">{quote.symbol}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {Object.keys(quotes).length === 0 && (
        <div className="text-center py-8">
          <div className="text-gray-500 mb-2">📡</div>
          <div className="text-gray-400 text-sm">
            Waiting for market data...
          </div>
          <div className="text-gray-500 text-xs mt-1">
            Market data service connecting
          </div>
        </div>
      )}
    </div>
  );
};

export default QuotesPanel;