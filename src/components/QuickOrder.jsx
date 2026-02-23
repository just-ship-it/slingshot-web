import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const STORAGE_KEY = 'quickOrder_settings';

const loadSettings = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) { /* ignore */ }
  return {
    side: 'buy',
    symbol: 'MNQ',
    quantity: 1,
    orderType: 'place_limit',
    stopPoints: 52,
    targetPoints: 0,
    trailingTrigger: 22,
    trailingOffset: 6,
    collapsed: false,
  };
};

const saveSettings = (settings) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) { /* ignore */ }
};

const QuickOrder = ({ quotes }) => {
  const [settings, setSettings] = useState(loadSettings);
  const [limitPrice, setLimitPrice] = useState(0);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  // Persist settings changes
  const update = useCallback((patch) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  // Get live market price for selected symbol
  const marketPrice = (() => {
    if (!quotes) return null;
    const q = quotes[settings.symbol] || quotes[settings.symbol.replace('M', '')];
    return q?.close ?? null;
  })();

  // Snap limit price to market when market price first arrives and limitPrice is 0
  useEffect(() => {
    if (marketPrice && limitPrice === 0) {
      const offset = settings.side === 'buy' ? -50 : 50;
      setLimitPrice(parseFloat((marketPrice + offset).toFixed(2)));
    }
  }, [marketPrice]); // eslint-disable-line react-hooks/exhaustive-deps

  // Computed stop/target absolute prices
  const entryPrice = settings.orderType === 'place_market' ? marketPrice : limitPrice;
  const stopLossPrice = entryPrice
    ? parseFloat((settings.side === 'buy' ? entryPrice - settings.stopPoints : entryPrice + settings.stopPoints).toFixed(2))
    : null;
  const takeProfitPrice = entryPrice && settings.targetPoints > 0
    ? parseFloat((settings.side === 'buy' ? entryPrice + settings.targetPoints : entryPrice - settings.targetPoints).toFixed(2))
    : 0;

  const snapToMarket = () => {
    if (!marketPrice) return;
    const offset = settings.side === 'buy' ? -50 : 50;
    setLimitPrice(parseFloat((marketPrice + offset).toFixed(2)));
  };

  // Auto-clear result after 5s
  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => setResult(null), 5000);
    return () => clearTimeout(t);
  }, [result]);

  const handleSubmit = async () => {
    if (sending) return;
    setSending(true);
    setResult(null);

    const payload = {
      webhook_type: 'trading_signal',
      action: settings.orderType,
      side: settings.side,
      symbol: settings.symbol,
      ...(settings.orderType === 'place_limit' && { price: limitPrice }),
      stop_loss: stopLossPrice || 0,
      ...(takeProfitPrice > 0 && { take_profit: takeProfitPrice }),
      stop_points: settings.stopPoints,
      target_points: settings.targetPoints,
      trailing_trigger: settings.trailingTrigger,
      trailing_offset: settings.trailingOffset,
      quantity: settings.quantity,
      strategy: 'MANUAL',
      source: 'quick-order',
      timestamp: new Date().toISOString(),
    };

    try {
      const url = process.env.REACT_APP_API_URL || 'http://localhost:3014';
      await axios.post(`${url}/webhook`, payload, {
        headers: { 'Content-Type': 'application/json' },
      });
      setResult({ ok: true, msg: `${settings.side.toUpperCase()} ${settings.symbol} sent` });
    } catch (err) {
      setResult({ ok: false, msg: err.response?.data?.error || err.message });
    } finally {
      setSending(false);
    }
  };

  const isBuy = settings.side === 'buy';

  if (settings.collapsed) {
    return (
      <div>
        <button
          onClick={() => update({ collapsed: false })}
          className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-900/50 hover:bg-gray-900/80"
        >
          <span>Quick Order</span>
          <svg width="10" height="10" viewBox="0 0 10 10" className="text-gray-400">
            <path d="M2 4l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-gray-700">
      {/* Header */}
      <button
        onClick={() => update({ collapsed: true })}
        className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-900/50 hover:bg-gray-900/80"
      >
        <span>Quick Order</span>
        <svg width="10" height="10" viewBox="0 0 10 10" className="text-gray-400">
          <path d="M2 7l3-3 3 3" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>

      <div className="px-2.5 py-2 space-y-2">
        {/* Row 1: Side toggle + Symbol pills */}
        <div className="flex items-center gap-1.5">
          {/* Side */}
          <button
            onClick={() => update({ side: 'buy' })}
            className={`flex-1 text-xs font-bold py-1 rounded-l ${
              isBuy ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >BUY</button>
          <button
            onClick={() => update({ side: 'sell' })}
            className={`flex-1 text-xs font-bold py-1 rounded-r ${
              !isBuy ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >SELL</button>

          <div className="w-px h-5 bg-gray-600 mx-0.5" />

          {/* Symbol */}
          <button
            onClick={() => update({ symbol: 'MNQ' })}
            className={`text-xs font-semibold px-2 py-1 rounded ${
              settings.symbol === 'MNQ' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >MNQ</button>
          <button
            onClick={() => update({ symbol: 'MES' })}
            className={`text-xs font-semibold px-2 py-1 rounded ${
              settings.symbol === 'MES' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >MES</button>
        </div>

        {/* Row 2: Qty stepper + Market price */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => update({ quantity: Math.max(1, settings.quantity - 1) })}
              className="bg-gray-700 hover:bg-gray-600 text-gray-300 w-6 h-6 rounded text-sm flex items-center justify-center"
            >-</button>
            <span className="text-white text-sm font-mono w-6 text-center">{settings.quantity}</span>
            <button
              onClick={() => update({ quantity: Math.min(10, settings.quantity + 1) })}
              className="bg-gray-700 hover:bg-gray-600 text-gray-300 w-6 h-6 rounded text-sm flex items-center justify-center"
            >+</button>
          </div>
          <div className="flex-1 text-right">
            <span className="text-xs text-gray-500">Mkt </span>
            <span className={`text-sm font-mono ${marketPrice ? 'text-white' : 'text-gray-600'}`}>
              {marketPrice ? marketPrice.toFixed(2) : '--'}
            </span>
          </div>
        </div>

        {/* Row 3: Order type + Limit price */}
        <div className="flex items-center gap-1.5">
          <select
            value={settings.orderType}
            onChange={(e) => update({ orderType: e.target.value })}
            className="bg-gray-700 border border-gray-600 text-white text-xs px-1.5 py-1 rounded w-20"
          >
            <option value="place_limit">Limit</option>
            <option value="place_market">Market</option>
          </select>

          {settings.orderType === 'place_limit' && (
            <>
              <input
                type="number"
                value={limitPrice}
                onChange={(e) => setLimitPrice(parseFloat(e.target.value) || 0)}
                step="0.25"
                className="flex-1 bg-gray-700 border border-gray-600 text-white text-xs px-2 py-1 rounded font-mono"
              />
              <button
                onClick={snapToMarket}
                disabled={!marketPrice}
                className="bg-gray-600 hover:bg-gray-500 disabled:opacity-40 text-gray-300 text-xs px-1.5 py-1 rounded"
                title={`Snap to market ${isBuy ? '-50' : '+50'}`}
              >
                Snap
              </button>
            </>
          )}
        </div>

        {/* Row 4: Stop / Target (points) */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500 w-8">SL</label>
          <input
            type="number"
            value={settings.stopPoints}
            onChange={(e) => update({ stopPoints: parseFloat(e.target.value) || 0 })}
            step="1"
            className="flex-1 bg-gray-700 border border-gray-600 text-white text-xs px-2 py-1 rounded font-mono"
          />
          <label className="text-xs text-gray-500 w-8 text-right">TP</label>
          <input
            type="number"
            value={settings.targetPoints}
            onChange={(e) => update({ targetPoints: parseFloat(e.target.value) || 0 })}
            step="1"
            min="0"
            className="flex-1 bg-gray-700 border border-gray-600 text-white text-xs px-2 py-1 rounded font-mono"
          />
          <span className="text-xs text-gray-600">pts</span>
        </div>

        {/* Row 5: Trailing trigger / offset */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500 w-8">Trig</label>
          <input
            type="number"
            value={settings.trailingTrigger}
            onChange={(e) => update({ trailingTrigger: parseFloat(e.target.value) || 0 })}
            step="1"
            className="flex-1 bg-gray-700 border border-gray-600 text-white text-xs px-2 py-1 rounded font-mono"
          />
          <label className="text-xs text-gray-500 w-8 text-right">Trail</label>
          <input
            type="number"
            value={settings.trailingOffset}
            onChange={(e) => update({ trailingOffset: parseFloat(e.target.value) || 0 })}
            step="1"
            className="flex-1 bg-gray-700 border border-gray-600 text-white text-xs px-2 py-1 rounded font-mono"
          />
          <span className="text-xs text-gray-600">pts</span>
        </div>

        {/* Computed prices summary */}
        {entryPrice > 0 && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {stopLossPrice && <span className="text-orange-400/70">SL {stopLossPrice.toFixed(2)}</span>}
            {takeProfitPrice > 0 && <span className="text-blue-400/70">TP {takeProfitPrice.toFixed(2)}</span>}
            {settings.targetPoints === 0 && <span className="text-purple-300/70">trail only</span>}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={sending || (settings.orderType === 'place_limit' && !limitPrice)}
          className={`w-full py-1.5 rounded text-sm font-bold transition-colors disabled:opacity-40 ${
            isBuy
              ? 'bg-green-600 hover:bg-green-500 text-white'
              : 'bg-red-600 hover:bg-red-500 text-white'
          }`}
        >
          {sending ? 'Sending...' : `${settings.side.toUpperCase()} ${settings.quantity} ${settings.symbol} ${settings.orderType === 'place_market' ? 'MKT' : `@ ${limitPrice || '--'}`}`}
        </button>

        {/* Result feedback */}
        {result && (
          <div className={`text-xs px-2 py-1 rounded ${
            result.ok ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'
          }`}>
            {result.msg}
          </div>
        )}
      </div>
    </div>
  );
};

export default QuickOrder;
