import React from 'react';

/**
 * LsStatusChip — small visual indicator for the current Liquidity Status (LS)
 * sentiment on the active product. State is bar-close-confirmed upstream
 * (signal-generator/src/websocket/lt-monitor.js), so intrabar reversals do
 * not flicker the chip.
 *
 * Props:
 *   - status: { sentiment: 'BULLISH'|'BEARISH', candleTime: ISO,
 *               priorSentiment: 'BULLISH'|'BEARISH'|null,
 *               product: 'NQ'|'ES' } | null
 *
 * Renders a colored chip with the sentiment + timestamp on hover. If status
 * is null (no LS event observed yet) renders a muted "LS —" placeholder.
 */
const LsStatusChip = ({ status }) => {
  if (!status || !status.sentiment) {
    return (
      <span
        className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-gray-700 text-gray-500"
        title="No LS event observed yet — waiting for first confirmed bar close"
      >
        LS —
      </span>
    );
  }

  const isBull = status.sentiment === 'BULLISH';
  const colorCls = isBull
    ? 'bg-green-600 text-white'
    : 'bg-red-600 text-white';

  // candleTime arrives as ISO 8601 from the monitoring service.
  let hover = `LS ${status.sentiment} (1m bar close)`;
  if (status.candleTime) {
    try {
      const d = new Date(status.candleTime);
      // HH:MM:SS local time
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      hover = `LS ${status.sentiment} since ${hh}:${mm}:${ss}` +
        (status.priorSentiment ? ` (was ${status.priorSentiment})` : '');
    } catch { /* ignore */ }
  }

  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-colors ${colorCls}`}
      title={hover}
    >
      LS {isBull ? 'BULL' : 'BEAR'}
    </span>
  );
};

export default LsStatusChip;
