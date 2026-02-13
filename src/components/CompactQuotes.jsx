import React from 'react';

const SYMBOL_GROUPS = [
  { symbols: ['NQ', 'QQQ'], label: 'NQ' },
  { symbols: ['ES', 'SPY'], label: 'ES' },
];

const CompactQuotes = ({ quotes = {} }) => {
  const formatChange = (value) => {
    if (value == null) return null;
    const prefix = value > 0 ? '+' : '';
    return `${prefix}${value.toFixed(2)}`;
  };

  return (
    <div className="sticky top-0 z-20 bg-gray-900 border-b border-gray-700 px-4 py-2">
      <div className="flex items-center justify-center gap-1 overflow-x-auto">
        {SYMBOL_GROUPS.map((group, gi) => (
          <React.Fragment key={group.label}>
            {gi > 0 && (
              <div className="w-px h-6 bg-gray-600 mx-2 flex-shrink-0" />
            )}
            {group.symbols.map(symbol => {
              const quote = quotes[symbol];
              const hasPrevClose = quote?.prevClose != null && quote?.close != null;
              const changePoints = hasPrevClose ? quote.close - quote.prevClose : (quote?.change ?? null);
              const changePct = hasPrevClose && quote.prevClose !== 0
                ? ((quote.close - quote.prevClose) / quote.prevClose) * 100
                : (quote?.changePercent ?? null);
              const changeColor = changePoints > 0 ? 'text-green-400' : changePoints < 0 ? 'text-red-400' : 'text-gray-500';

              return (
                <div key={symbol} className="flex items-center gap-2 px-3 py-0.5 flex-shrink-0">
                  <span className="font-mono text-sm font-semibold text-gray-400">{symbol}</span>
                  <span className="font-mono text-lg font-medium text-white">
                    {quote?.close?.toFixed(2) || '--'}
                  </span>
                  {changePoints != null && (
                    <span className={`font-mono text-sm ${changeColor}`}>
                      {formatChange(changePoints)} ({formatChange(changePct)}%)
                    </span>
                  )}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default CompactQuotes;
