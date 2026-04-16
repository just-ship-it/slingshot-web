import React from 'react';
import { Settings } from 'lucide-react';

const TICKER_GROUPS = [
  { symbols: ['NQ', 'QQQ'], separator: false },
  { symbols: ['ES', 'SPY'], separator: true },
];

const CompactHeader = ({
  quotes = {},
  openPositionCount = 0,
  pendingOrderCount = 0,
  posFlashKey = 0,
  tradingPanelOpen = false,
  onToggleTradingPanel,
  totals = {},
  connectionStatus,
  onStatusClick,
  onMacroClick,
  onPnLClick,
  onAccountsClick,
  onLogout,
}) => {
  const formatChange = (value) => {
    if (value == null) return null;
    const prefix = value > 0 ? '+' : '';
    return `${prefix}${value.toFixed(2)}`;
  };

  const renderTickers = () => (
    TICKER_GROUPS.map((group, gi) => (
      <React.Fragment key={gi}>
        {group.separator && (
          <div className="w-px h-4 bg-gray-600 flex-shrink-0 ticker-separator" />
        )}
        <div className="flex items-center gap-2 flex-shrink-0">
          {group.symbols.map(symbol => {
            const quote = quotes[symbol];
            const hasPrevClose = quote?.prevClose != null && quote?.close != null;
            const changePoints = hasPrevClose ? quote.close - quote.prevClose : (quote?.change ?? null);
            const changePct = hasPrevClose && quote.prevClose !== 0
              ? ((quote.close - quote.prevClose) / quote.prevClose) * 100
              : (quote?.changePercent ?? null);
            const changeColor = changePoints > 0 ? 'text-green-400' : changePoints < 0 ? 'text-red-400' : 'text-gray-300';

            return (
              <span key={symbol} className="flex items-center gap-1 flex-shrink-0 whitespace-nowrap">
                <span className="font-semibold text-gray-300">{symbol}</span>
                <span className="font-mono text-white">
                  {quote?.close != null ? Number(quote.close).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--'}
                </span>
                {changePct != null && (
                  <span className={`font-mono ${changeColor}`}>
                    {formatChange(changePct)}%
                  </span>
                )}
              </span>
            );
          })}
        </div>
      </React.Fragment>
    ))
  );

  const totalUnrealizedPnL = totals?.totalUnrealizedPnL;
  const totalPnLColor = totalUnrealizedPnL > 0 ? 'text-green-400' : totalUnrealizedPnL < 0 ? 'text-red-400' : 'text-gray-300';

  const renderAccountStats = () => (
    <div className="flex items-center gap-3">
      <button
        onClick={onPnLClick}
        className="hover:bg-gray-700 px-1.5 py-0.5 rounded transition-colors"
        title="View P&L History"
      >
        <span className="text-gray-300 mr-1">P&L</span>
        <span className={`font-semibold ${totalPnLColor}`}>
          {totalUnrealizedPnL != null
            ? `${totalUnrealizedPnL >= 0 ? '+' : ''}$${Math.abs(totalUnrealizedPnL).toFixed(2)}`
            : '--'
          }
        </span>
      </button>
      <button
        onClick={onToggleTradingPanel}
        className={`desktop-only flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${
          tradingPanelOpen ? 'bg-gray-600' : 'hover:bg-gray-700'
        }`}
        title="Toggle trading panel"
      >
        <span key={posFlashKey} className={posFlashKey > 0 ? 'pos-flash' : ''}>
          <span className="text-gray-300 mr-1">Pos</span>
          <span className="font-semibold text-white">{openPositionCount}</span>
          {pendingOrderCount > 0 && (
            <>
              <span className="text-gray-500 mx-1">|</span>
              <span className="text-gray-300">Ord</span>
              <span className="font-semibold text-yellow-400 ml-1">{pendingOrderCount}</span>
            </>
          )}
        </span>
      </button>
    </div>
  );

  return (
    <div className="compact-header flex-shrink-0">
      {/* Primary header row */}
      <div className="flex items-center px-4 bg-gray-800 border-b border-gray-700 h-10 min-h-[40px]">
        {/* Left: Logo */}
        <span className="text-[19px] font-bold text-blue-400 tracking-tight flex-shrink-0 desktop-only">Slingshot</span>

        {/* Center: Tickers (desktop only) */}
        <div className="header-desktop-tickers items-center justify-center gap-4 text-[15px] flex-1 min-w-0">
          {renderTickers()}
        </div>

        {/* Spacer for mobile (pushes controls right when tickers hidden) */}
        <div className="header-mobile-spacer flex-1" />

        {/* Right: controls */}
        <div className="flex items-center gap-3 text-[15px] flex-shrink-0">
          {/* Account stats (desktop only) */}
          <div className="header-desktop-stats items-center gap-3">
            {renderAccountStats()}
          </div>

          {/* Accounts & Routing */}
          <button
            onClick={onAccountsClick}
            className="flex items-center gap-1 text-gray-300 hover:text-white hover:bg-gray-700 px-1.5 py-0.5 rounded transition-colors"
            title="Accounts & Routing"
          >
            <Settings className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="desktop-only">Accounts</span>
          </button>

          {/* Macro briefing modal */}
          <button
            onClick={onMacroClick}
            className="flex items-center gap-1 text-gray-300 hover:text-white hover:bg-gray-700 px-1.5 py-0.5 rounded transition-colors"
            title="Macro Briefing"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
              <path d="M4 1h6l4 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M10 1v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M6 9h4M6 12h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Macro
          </button>

          {/* Connection status */}
          <button
            onClick={onStatusClick}
            className="flex items-center gap-1 hover:bg-gray-700 px-1.5 py-0.5 rounded transition-colors"
            title="Platform Status"
          >
            <span className={`w-[7px] h-[7px] rounded-full ${
              connectionStatus === 'connected' ? 'bg-green-500' : 'bg-red-500'
            }`} />
            <span className="text-gray-300">
              {connectionStatus === 'connected' ? 'Live' : 'Off'}
            </span>
          </button>

          {/* Logout */}
          <button
            onClick={onLogout}
            className="text-red-400 hover:text-red-300 font-bold transition-colors"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Sub-header row: tickers + account info (tablet/phone only) */}
      <div className="header-subrow flex items-center justify-between px-4 py-1.5 bg-gray-800/80 border-b border-gray-700 text-[13px] gap-x-4 gap-y-0.5 flex-wrap">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {renderTickers()}
        </div>
        <div className="flex items-center gap-3">
          {renderAccountStats()}
        </div>
      </div>
    </div>
  );
};

export default CompactHeader;
