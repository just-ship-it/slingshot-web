import React from 'react';

const PositionBanner = ({ productPosition }) => {
  if (!productPosition?.in_position) return null;

  if (productPosition.is_own) {
    const sideLabel = productPosition.side?.toUpperCase() || '?';
    const sideColor = productPosition.side === 'long' ? 'text-green-400' : 'text-red-400';
    const borderColor = productPosition.side === 'long' ? 'border-green-600' : 'border-red-600';
    const bgColor = productPosition.side === 'long' ? 'bg-green-900/30' : 'bg-red-900/30';
    const qty = productPosition.quantity != null ? `${productPosition.quantity} ` : '';
    const sym = productPosition.symbol || '';
    const price = productPosition.entry_price != null
      ? ` @ ${productPosition.entry_price.toFixed(2)}`
      : '';

    return (
      <div className={`${bgColor} border ${borderColor} rounded px-1.5 py-1 mb-1.5 text-[15px] flex items-center`}>
        <span className={`${sideColor} font-semibold`}>{sideLabel}</span>
        <span className="text-gray-300 ml-2 font-mono">
          {qty}{sym}{price}
        </span>
      </div>
    );
  }

  return (
    <div className="bg-yellow-900/20 border border-yellow-700/50 rounded px-1.5 py-1 mb-1.5 text-[15px]">
      <span className="text-yellow-500">Blocked</span>
      <span className="text-gray-400 ml-1.5">
        — position held by {productPosition.strategy || 'another strategy'}
      </span>
    </div>
  );
};

export default PositionBanner;
