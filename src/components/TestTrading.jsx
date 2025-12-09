import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { api } from '../services/api';
import { AlertCircle, RefreshCw, Send, Zap, TrendingUp, Target, Info } from 'lucide-react';

// Load saved settings from localStorage (moved outside component)
const loadSavedSettings = () => {
  const saved = localStorage.getItem('testTrading_riskSettings');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.log('Failed to parse saved settings:', e);
    }
  }
  return {
    stopPoints: 52,
    targetPoints: 0,  // Default to 0 for LS EMA style (trailing stop only)
    trailingTrigger: 22,
    trailingOffset: 6
  };
};

const TestTrading = ({ socket }) => {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Save settings to localStorage
  const saveSettings = (settings) => {
    try {
      localStorage.setItem('testTrading_riskSettings', JSON.stringify(settings));
      console.log('💾 Saved risk settings:', settings);
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  };

  // Test signal state
  const [testSignal, setTestSignal] = useState(() => {
    const saved = loadSavedSettings();
    return {
      action: 'place_limit',
      side: 'buy',
      symbol: 'MNQ',
      price: 0, // Will be set to market price when available
      old_price: 0, // For update_limit actions
      stop_loss: 0,
      take_profit: 0,
      trailing_trigger: saved.trailingTrigger,
      trailing_offset: saved.trailingOffset,
      quantity: 1,
      strategy: 'LS_EMA',
      account: ''
    };
  });

  // Custom symbol state
  const [useCustomSymbol, setUseCustomSymbol] = useState(false);
  const [customSymbol, setCustomSymbol] = useState('');

  // Points mode state
  const [usePointsMode, setUsePointsMode] = useState(true);
  const [pointsConfig, setPointsConfig] = useState(() => {
    const saved = loadSavedSettings();
    return {
      stopPoints: saved.stopPoints,
      targetPoints: saved.targetPoints
    };
  });
  const [sendingSignal, setSendingSignal] = useState(false);
  const [signalResult, setSignalResult] = useState(null);

  // Webhook sequence and simulation state
  const [webhookEvents, setWebhookEvents] = useState([]);
  const [simulationMode, setSimulationMode] = useState('single'); // 'single' or 'sequence'
  const [currentSequence, setCurrentSequence] = useState([]);
  const [sequenceIndex, setSequenceIndex] = useState(0);
  const [autoProgress, setAutoProgress] = useState(false);
  const [sequenceDelay, setSequenceDelay] = useState(2000); // ms between events

  // Market data state
  const [marketData, setMarketData] = useState({});
  const [subscribedSymbols, setSubscribedSymbols] = useState(new Set());

  // Track last sent price for update_limit old_price
  const [lastSentPrice, setLastSentPrice] = useState(null);

  // Get WebSocket connection status
  const isConnected = socket?.isConnected || socket?.ready || false;

  // Subscribe to market data events using the existing socket
  useEffect(() => {
    if (socket && socket.socket) {
      const handleMarketData = (data) => {
        console.log('📊 TestTrading received market_data:', data);

        // Use the close price as the current market price (like Dashboard does)
        const processedData = {
          symbol: data.symbol,
          close: typeof data.close === 'number' ? data.close : null,
          open: typeof data.open === 'number' ? data.open : null,
          high: typeof data.high === 'number' ? data.high : null,
          low: typeof data.low === 'number' ? data.low : null,
          timestamp: data.timestamp || Date.now()
        };

        console.log(`📊 Processed market data for ${data.symbol}:`, processedData);

        setMarketData(prev => ({
          ...prev,
          [data.symbol]: processedData,
          // Also store by base symbol if available
          ...(data.baseSymbol && { [data.baseSymbol]: processedData })
        }));
      };

      socket.socket.on('market_data', handleMarketData);

      return () => {
        socket.socket.off('market_data', handleMarketData);
      };
    }
  }, [socket]);

  // Load accounts on component mount
  useEffect(() => {
    loadAccounts();
  }, []);

  // Subscribe to symbol when it changes
  useEffect(() => {
    if (isConnected && socket && testSignal.symbol && !subscribedSymbols.has(testSignal.symbol)) {
      if (socket.emit || socket.subscribeToQuote) {
        // Use existing socket methods
        if (socket.subscribeToQuote) {
          socket.subscribeToQuote(testSignal.symbol);
        } else if (socket.emit) {
          socket.emit('subscribe_quote', testSignal.symbol);
        }
        setSubscribedSymbols(prev => new Set([...prev, testSignal.symbol]));
      }
    }
  }, [testSignal.symbol, isConnected, socket, subscribedSymbols]);

  // Set initial price to market price when market data becomes available
  useEffect(() => {
    const currentPrice = getCurrentPrice(testSignal.symbol);
    console.log('🔧 Market price effect:', { currentPrice, currentTestPrice: testSignal.price, usePointsMode, stopPoints: pointsConfig.stopPoints });

    if (currentPrice && testSignal.price === 0) {
      // Set initial price to market price using the limit offset logic
      const offset = testSignal.side === 'buy' ? -50 : 50;
      const limitPrice = currentPrice + offset;

      console.log('🔧 Setting initial price:', { currentPrice, offset, limitPrice });

      setTestSignal(prev => ({
        ...prev,
        price: parseFloat(limitPrice.toFixed(2)),
        old_price: parseFloat(limitPrice.toFixed(2))
      }));

      // Calculate stop/target if in points mode
      if (usePointsMode && pointsConfig.stopPoints > 0) {
        console.log('🔧 Calling calculateStopAndTarget with:', { limitPrice, side: testSignal.side, symbol: testSignal.symbol, stopPoints: pointsConfig.stopPoints, targetPoints: pointsConfig.targetPoints });
        calculateStopAndTarget(limitPrice, testSignal.side, testSignal.symbol, pointsConfig.stopPoints, pointsConfig.targetPoints);
      }
    }
  }, [marketData, testSignal.symbol, testSignal.side, usePointsMode, pointsConfig.stopPoints, pointsConfig.targetPoints]);

  // Recalculate stop/target when points configuration changes
  useEffect(() => {
    if (usePointsMode && testSignal.price > 0 && pointsConfig.stopPoints > 0) {
      console.log('🔧 Recalculating due to points change:', { price: testSignal.price, stopPoints: pointsConfig.stopPoints, targetPoints: pointsConfig.targetPoints });
      calculateStopAndTarget(testSignal.price, testSignal.side, testSignal.symbol, pointsConfig.stopPoints, pointsConfig.targetPoints);
    }
  }, [usePointsMode, pointsConfig.stopPoints, pointsConfig.targetPoints, testSignal.price, testSignal.side, testSignal.symbol]);

  const loadAccounts = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getAccounts();
      // The monitoring service returns accounts directly as an array
      const accountsArray = Array.isArray(response) ? response : response.accounts || [];

      if (accountsArray.length > 0) {
        setAccounts(accountsArray);
        setSelectedAccount(accountsArray[0]);
        setTestSignal(prev => ({ ...prev, account: accountsArray[0].id }));
      } else {
        setError('No trading accounts found - make sure the tradovate-service is running and connected');
      }
    } catch (error) {
      setError(`Failed to load accounts: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setTestSignal(prev => ({ ...prev, [field]: value }));

    // Save trailing settings to localStorage
    if (field === 'trailing_trigger' || field === 'trailing_offset') {
      const currentSaved = loadSavedSettings();
      saveSettings({
        ...currentSaved,
        [field === 'trailing_trigger' ? 'trailingTrigger' : 'trailingOffset']: value
      });
    }

    // Handle symbol dropdown change
    if (field === 'symbol') {
      if (value === 'custom') {
        setUseCustomSymbol(true);
        setTestSignal(prev => ({ ...prev, symbol: customSymbol }));
      } else {
        setUseCustomSymbol(false);
        setCustomSymbol('');
      }
    }

    // If price or side changed and we're in points mode, recalculate stop/target
    if ((field === 'price' || field === 'side' || field === 'symbol') && usePointsMode) {
      const newSide = field === 'side' ? value : testSignal.side;
      const newPrice = field === 'price' ? value : testSignal.price;
      const newSymbol = field === 'symbol' ? (value === 'custom' ? customSymbol : value) : testSignal.symbol;
      calculateStopAndTarget(newPrice, newSide, newSymbol, pointsConfig.stopPoints, pointsConfig.targetPoints);
    }
  };

  const handleCustomSymbolChange = (value) => {
    setCustomSymbol(value);
    setTestSignal(prev => ({ ...prev, symbol: value }));

    // Recalculate if in points mode
    if (usePointsMode) {
      calculateStopAndTarget(testSignal.price, testSignal.side, value, pointsConfig.stopPoints, pointsConfig.targetPoints);
    }
  };

  const handlePointsChange = (field, value) => {
    const newPointsConfig = { ...pointsConfig, [field]: value };
    setPointsConfig(newPointsConfig);

    // Save to localStorage
    const currentSaved = loadSavedSettings();
    saveSettings({
      ...currentSaved,
      [field]: value
    });

    // Recalculate stop/target if in points mode
    if (usePointsMode) {
      calculateStopAndTarget(testSignal.price, testSignal.side, testSignal.symbol, newPointsConfig.stopPoints, newPointsConfig.targetPoints);
    }
  };

  const calculateStopAndTarget = (entryPrice, side, symbol, stopPoints, targetPoints) => {
    if (!entryPrice || !stopPoints) return; // Allow targetPoints to be 0

    console.log('🔧 calculateStopAndTarget called with:', { entryPrice, side, symbol, stopPoints, targetPoints });

    let stopLoss, takeProfit;

    if (side === 'buy') {
      // Long position: stop below entry, target above entry
      stopLoss = entryPrice - stopPoints;
      takeProfit = entryPrice + targetPoints;
    } else {
      // Short position: stop above entry, target below entry
      stopLoss = entryPrice + stopPoints;
      takeProfit = entryPrice - targetPoints;
    }

    setTestSignal(prev => ({
      ...prev,
      stop_loss: parseFloat(stopLoss.toFixed(2)),
      // Only set take_profit if targetPoints > 0
      take_profit: targetPoints > 0 ? parseFloat(takeProfit.toFixed(2)) : 0
    }));
  };


  const togglePointsMode = () => {
    const newMode = !usePointsMode;
    setUsePointsMode(newMode);

    // If switching to points mode, recalculate
    if (newMode) {
      calculateStopAndTarget(testSignal.price, testSignal.side, testSignal.symbol, pointsConfig.stopPoints, pointsConfig.targetPoints);
    }
  };

  // Add webhook event to timeline
  const addWebhookEvent = (event) => {
    const newEvent = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toISOString(),
      ...event
    };
    setWebhookEvents(prev => [...prev.slice(-19), newEvent]); // Keep last 20 events
  };

  // Get current market price for symbol
  const getCurrentPrice = (symbol) => {
    const quote = marketData[symbol];
    if (!quote) return null;

    // Use close price as the current market price (matches Dashboard behavior)
    return typeof quote.close === 'number' ? quote.close : null;
  };

  // Check if price is within reasonable range of market (within 200 points)
  const isPriceRealistic = (price, symbol) => {
    const currentPrice = getCurrentPrice(symbol);
    if (!currentPrice) return true; // Allow if no market data
    return Math.abs(price - currentPrice) <= 200;
  };

  // Generate realistic price movement for simulation
  const generatePriceMovement = (basePrice, symbol) => {
    const currentPrice = getCurrentPrice(symbol);
    const useMarketPrice = currentPrice && Math.random() > 0.3; // 70% chance to use market-based price

    if (useMarketPrice) {
      // Generate price within 50 points of current market
      const tickSize = symbol.includes('MNQ') || symbol.includes('NQ') ? 0.25 : 0.25;
      const maxPoints = 50;
      const maxTicks = maxPoints / tickSize;
      const direction = Math.random() > 0.5 ? 1 : -1;
      const ticks = Math.floor(Math.random() * maxTicks);
      return parseFloat((currentPrice + (direction * ticks * tickSize)).toFixed(2));
    } else {
      // Fallback to old method if no market data
      const tickSize = symbol.includes('MNQ') || symbol.includes('NQ') ? 0.25 : 0.25;
      const maxTicks = Math.floor(Math.random() * 20) + 1;
      const direction = Math.random() > 0.5 ? 1 : -1;
      return parseFloat((basePrice + (direction * maxTicks * tickSize)).toFixed(2));
    }
  };

  // Generate EMA-style price update that adjusts from current order price
  const generateEMAPriceUpdate = (currentOrderPrice, side, symbol) => {
    const marketPrice = getCurrentPrice(symbol);
    if (!marketPrice || !currentOrderPrice) return null;

    const tickSize = symbol.includes('MNQ') || symbol.includes('NQ') ? 0.25 : 0.25;

    // Small adjustment from current order price (2-5 points)
    const minPoints = 2;
    const maxPoints = 5;
    const pointsOffset = minPoints + Math.random() * (maxPoints - minPoints);
    const ticksOffset = Math.round(pointsOffset / tickSize);

    // Randomly choose direction (up or down from current order price)
    const direction = Math.random() > 0.5 ? 1 : -1;
    let newPrice = currentOrderPrice + (direction * ticksOffset * tickSize);

    // Safety check: ensure we don't cross into immediate fill territory
    if (side === 'buy' && newPrice >= marketPrice) {
      // Buy order too high, move it safely below market
      newPrice = marketPrice - (5 * tickSize);
    } else if (side === 'sell' && newPrice <= marketPrice) {
      // Sell order too low, move it safely above market
      newPrice = marketPrice + (5 * tickSize);
    }

    return parseFloat(newPrice.toFixed(2));
  };

  // Set price to market +/- 50 points for limit orders
  const setToLimitPrice = () => {
    const currentPrice = getCurrentPrice(testSignal.symbol);
    if (currentPrice) {
      // For buy orders: market - 50 (below market to avoid immediate fill)
      // For sell orders: market + 50 (above market to avoid immediate fill)
      const offset = testSignal.side === 'buy' ? -50 : 50;
      const limitPrice = currentPrice + offset;

      setTestSignal(prev => ({ ...prev, price: parseFloat(limitPrice.toFixed(2)) }));
      if (usePointsMode) {
        calculateStopAndTarget(limitPrice, testSignal.side, testSignal.symbol, pointsConfig.stopPoints, pointsConfig.targetPoints);
      }
    }
  };

  const handleSendSignal = async () => {
    if (!selectedAccount) {
      setError('No account selected');
      return;
    }

    setSendingSignal(true);
    setSignalResult(null);
    setError(null);

    try {
      const signalData = {
        webhook_type: "trading_signal", // Route through trade-orchestrator for position sizing
        action: testSignal.action,
        side: testSignal.side,
        symbol: testSignal.symbol,
        // Use 'price' for place_limit, 'new_price' for update_limit
        ...(testSignal.action === 'update_limit'
          ? { new_price: testSignal.price, old_price: lastSentPrice || testSignal.price }
          : { price: testSignal.price }
        ),
        stop_loss: testSignal.stop_loss,
        ...(testSignal.take_profit > 0 && { take_profit: testSignal.take_profit }),
        trailing_trigger: testSignal.trailing_trigger,
        trailing_offset: testSignal.trailing_offset,
        quantity: testSignal.quantity,
        strategy: testSignal.strategy === 'Custom' ? testSignal.customStrategy : testSignal.strategy,
        account: selectedAccount.id,
        timestamp: new Date().toISOString(),
        source: 'test-interface'
      };

      const monitoringServiceUrl = process.env.REACT_APP_API_URL || 'http://localhost:3014';
      const response = await axios.post(`${monitoringServiceUrl}/webhook`, signalData, {
        headers: { 'Content-Type': 'application/json' }
      });

      // Store the last sent price for future update_limit old_price
      setLastSentPrice(testSignal.price);

      // Add event to timeline
      addWebhookEvent({
        type: 'webhook_sent',
        action: testSignal.action,
        side: testSignal.side,
        symbol: testSignal.symbol,
        price: testSignal.price,
        strategy: testSignal.strategy === 'Custom' ? testSignal.customStrategy : testSignal.strategy,
        status: 'success'
      });

      setSignalResult({
        success: true,
        message: 'Test signal sent successfully!',
        data: response.data,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      // Add error event to timeline
      addWebhookEvent({
        type: 'webhook_error',
        action: testSignal.action,
        side: testSignal.side,
        symbol: testSignal.symbol,
        price: testSignal.price,
        strategy: testSignal.strategy === 'Custom' ? testSignal.customStrategy : testSignal.strategy,
        status: 'error',
        error: error.response?.data?.error || error.message
      });

      setSignalResult({
        success: false,
        message: `Failed to send signal: ${error.response?.data?.error || error.message}`,
        timestamp: new Date().toISOString()
      });
    } finally {
      setSendingSignal(false);
    }
  };

  // Generate an update_limit sequence for LS EMA simulation
  const generateLSEMASequence = () => {
    const basePrice = testSignal.price;
    const sequence = [
      {
        action: 'place_limit',
        side: testSignal.side,
        symbol: testSignal.symbol,
        price: basePrice,
        stop_loss: testSignal.stop_loss,
        strategy: 'LS_EMA'
      },
      {
        action: 'update_limit',
        side: testSignal.side,
        symbol: testSignal.symbol,
        old_price: basePrice,
        price: generatePriceMovement(basePrice, testSignal.symbol),
        stop_loss: testSignal.stop_loss,
        strategy: 'LS_EMA'
      },
      {
        action: 'update_limit',
        side: testSignal.side,
        symbol: testSignal.symbol,
        old_price: generatePriceMovement(basePrice, testSignal.symbol),
        price: generatePriceMovement(basePrice, testSignal.symbol),
        stop_loss: testSignal.stop_loss,
        strategy: 'LS_EMA'
      }
    ];

    // Fix the old_price for second update
    sequence[2].old_price = sequence[1].price;
    return sequence;
  };

  // Clear webhook events
  const clearWebhookEvents = () => {
    setWebhookEvents([]);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6 space-y-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Test Trading Interface</h1>
            <p className="text-gray-400 mt-1">Send test trading signals to validate functionality</p>
          </div>
          <button
            onClick={loadAccounts}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Accounts</span>
          </button>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-500/30 rounded-lg p-4 mb-6">
            <div className="flex items-center space-x-3">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <span className="text-red-300">{error}</span>
            </div>
          </div>
        )}

        {/* Account Selection */}
        {accounts.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-4 mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Trading Account
            </label>
            <select
              value={selectedAccount?.id || ''}
              onChange={(e) => {
                const account = accounts.find(acc => acc.id.toString() === e.target.value);
                setSelectedAccount(account);
                setTestSignal(prev => ({ ...prev, account: account?.id }));
              }}
              className="w-full bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded-lg"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.id})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Test Signal Form */}
        <div className="bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center">
            <Zap className="w-5 h-5 mr-2 text-yellow-400" />
            Test Signal Configuration
          </h2>

          {/* Points Mode Toggle - Only show for place_limit */}
          {testSignal.action === 'place_limit' && (
            <div className="mb-6 p-4 bg-gray-700 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-white">Risk/Reward Calculator</h3>
              <button
                onClick={togglePointsMode}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  usePointsMode
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-gray-600 hover:bg-gray-500 text-gray-300'
                }`}
              >
                {usePointsMode ? '📊 Points Mode' : '💰 Price Mode'}
              </button>
            </div>

            {usePointsMode ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Stop Loss (Points)
                  </label>
                  <input
                    type="number"
                    value={pointsConfig.stopPoints}
                    onChange={(e) => handlePointsChange('stopPoints', parseFloat(e.target.value) || 0)}
                    className="w-full bg-gray-600 border border-gray-500 text-white px-3 py-2 rounded"
                    placeholder="52"
                    step="1"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Points to risk (e.g., 52 points = 52.0 price movement)
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Take Profit (Points) {pointsConfig.targetPoints === 0 && <span className="text-yellow-400">(Disabled)</span>}
                  </label>
                  <input
                    type="number"
                    value={pointsConfig.targetPoints}
                    onChange={(e) => handlePointsChange('targetPoints', parseFloat(e.target.value) || 0)}
                    className="w-full bg-gray-600 border border-gray-500 text-white px-3 py-2 rounded"
                    placeholder="0 = disabled, 100 = enabled"
                    step="1"
                    min="0"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    {pointsConfig.targetPoints === 0
                      ? '🚫 Set to 0 to disable take profit (LS EMA style - trailing stop only)'
                      : `Points to target (e.g., ${pointsConfig.targetPoints} points = ${pointsConfig.targetPoints}.0 price movement)`
                    }
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-gray-400">
                💡 Switch to Points Mode to automatically calculate stop loss and take profit prices from your risk/reward points.
              </p>
            )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Action */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Action</label>
              <select
                value={testSignal.action}
                onChange={(e) => handleInputChange('action', e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded"
              >
                <option value="place_limit">Place Limit Order</option>
                <option value="update_limit">Update Limit Order</option>
                <option value="cancel_limit">Cancel Limit Orders</option>
                <option value="position_closed">Close Position</option>
              </select>
            </div>

            {/* Side */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Side</label>
              <select
                value={testSignal.side}
                onChange={(e) => handleInputChange('side', e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded"
              >
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </div>

            {/* Symbol */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Symbol</label>
              <select
                value={useCustomSymbol ? 'custom' : testSignal.symbol}
                onChange={(e) => handleInputChange('symbol', e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded mb-2"
              >
                <option value="MNQ">MNQ (Micro NASDAQ)</option>
                <option value="NQ">NQ (NASDAQ)</option>
                <option value="MES">MES (Micro S&P)</option>
                <option value="ES">ES (S&P 500)</option>
                <option value="RTY">RTY (Russell 2000)</option>
                <option value="M2K">M2K (Micro Russell)</option>
                <option value="custom">Other (Custom Symbol)</option>
              </select>
              {useCustomSymbol && (
                <input
                  type="text"
                  value={customSymbol}
                  onChange={(e) => handleCustomSymbolChange(e.target.value)}
                  placeholder="Enter custom symbol (e.g., MNQ!, NQ!, BTCUSD)"
                  className="w-full bg-gray-600 border border-gray-500 text-white px-3 py-2 rounded text-sm"
                />
              )}
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Quantity</label>
              <input
                type="number"
                value={testSignal.quantity}
                onChange={(e) => handleInputChange('quantity', parseInt(e.target.value) || 1)}
                className="w-full bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded"
                min="1"
                max="10"
              />
            </div>

            {/* Price - Hide for position_closed */}
            {testSignal.action !== 'position_closed' && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1 flex items-center justify-between">
                  <span>{testSignal.action === 'update_limit' ? 'New Price' : 'Price'}</span>
                  {getCurrentPrice(testSignal.symbol) && (
                    <span className="text-xs text-blue-400">
                      Market: {getCurrentPrice(testSignal.symbol)?.toFixed(2)}
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={testSignal.price}
                    onChange={(e) => handleInputChange('price', parseFloat(e.target.value) || 0)}
                    className={`w-full bg-gray-700 border text-white px-3 py-2 rounded pr-16 ${
                      isPriceRealistic(testSignal.price, testSignal.symbol)
                        ? 'border-gray-600'
                        : 'border-yellow-500 border-2'
                    }`}
                    step="0.25"
                  />
                  <button
                    type="button"
                    onClick={setToLimitPrice}
                    disabled={!getCurrentPrice(testSignal.symbol)}
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white text-xs px-2 py-1 rounded"
                    title={`Set to market ${testSignal.side === 'buy' ? '-50' : '+50'} (limit order)`}
                  >
                    {testSignal.side === 'buy' ? 'M-50' : 'M+50'}
                  </button>
                </div>
                {!isPriceRealistic(testSignal.price, testSignal.symbol) && getCurrentPrice(testSignal.symbol) && (
                  <p className="text-xs text-yellow-400 mt-1">
                    ⚠️ Price is {Math.abs(testSignal.price - getCurrentPrice(testSignal.symbol)).toFixed(0)} points from market
                  </p>
                )}
                {!isConnected && (
                  <p className="text-xs text-gray-500 mt-1">
                    📡 {socket ? 'Connecting to market data...' : 'No market data connection'}
                  </p>
                )}
              </div>
            )}

            {/* Old Price - Auto-managed, show info for update_limit */}
            {testSignal.action === 'update_limit' && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Old Price (Auto)</label>
                <div className="w-full bg-gray-600 border border-gray-500 text-gray-300 px-3 py-2 rounded cursor-not-allowed">
                  {lastSentPrice ? lastSentPrice.toFixed(2) : 'No previous price'}
                </div>
                <p className="text-xs text-blue-400 mt-1">
                  📋 Uses last successfully sent price automatically
                </p>
              </div>
            )}

            {/* Strategy */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Strategy</label>
              <select
                value={testSignal.strategy}
                onChange={(e) => handleInputChange('strategy', e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded"
              >
                <option value="LS_EMA">LS EMA Strategy</option>
                <option value="LDPS">LDPS Trader</option>
                <option value="LDPM">LDPM Strategy</option>
                <option value="LS_Scalper">LS Scalper</option>
                <option value="AI_Algo">AI Algo Trailing Stop</option>
                <option value="Custom">Custom Strategy</option>
              </select>
              {testSignal.strategy === 'Custom' && (
                <input
                  type="text"
                  value={testSignal.customStrategy || ''}
                  onChange={(e) => handleInputChange('customStrategy', e.target.value)}
                  placeholder="Enter custom strategy name"
                  className="w-full bg-gray-600 border border-gray-500 text-white px-3 py-2 rounded text-sm mt-2"
                />
              )}
            </div>

            {/* Order-specific fields - Hide for position_closed and cancel_limit */}
            {(testSignal.action === 'place_limit' || testSignal.action === 'update_limit') && (
              <>
                {/* Stop Loss */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Stop Loss {usePointsMode && <span className="text-green-400">(Auto-calculated)</span>}
                  </label>
                  <input
                    type="number"
                    value={testSignal.stop_loss}
                    onChange={(e) => handleInputChange('stop_loss', parseFloat(e.target.value) || 0)}
                    disabled={usePointsMode}
                    className={`w-full border text-white px-3 py-2 rounded ${
                      usePointsMode
                        ? 'bg-gray-600 border-gray-500 text-gray-300 cursor-not-allowed'
                        : 'bg-gray-700 border-gray-600'
                    }`}
                    step="0.25"
                  />
                  {usePointsMode && (
                    <p className="text-xs text-green-400 mt-1">
                      📉 {pointsConfig.stopPoints} points = {testSignal.stop_loss?.toFixed(2)}
                    </p>
                  )}
                </div>

                {/* Take Profit */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Take Profit {usePointsMode && <span className="text-green-400">(Auto-calculated)</span>}
                  </label>
                  <input
                    type="number"
                    value={testSignal.take_profit}
                    onChange={(e) => handleInputChange('take_profit', parseFloat(e.target.value) || 0)}
                    disabled={usePointsMode}
                    className={`w-full border text-white px-3 py-2 rounded ${
                      usePointsMode
                        ? 'bg-gray-600 border-gray-500 text-gray-300 cursor-not-allowed'
                        : 'bg-gray-700 border-gray-600'
                    }`}
                    step="0.25"
                  />
                  {usePointsMode && (
                    <p className="text-xs text-green-400 mt-1">
                      {pointsConfig.targetPoints === 0
                        ? '🚫 Disabled - no take profit will be sent'
                        : `📈 ${pointsConfig.targetPoints} points = ${testSignal.take_profit?.toFixed(2)}`
                      }
                    </p>
                  )}
                </div>

                {/* Trailing Trigger */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Trailing Trigger (pts)</label>
                  <input
                    type="number"
                    value={testSignal.trailing_trigger}
                    onChange={(e) => handleInputChange('trailing_trigger', parseFloat(e.target.value) || 0)}
                    className="w-full bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded"
                    step="1"
                  />
                </div>

                {/* Trailing Offset */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Trailing Offset (pts)</label>
                  <input
                    type="number"
                    value={testSignal.trailing_offset}
                    onChange={(e) => handleInputChange('trailing_offset', parseFloat(e.target.value) || 0)}
                    className="w-full bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded"
                    step="1"
                  />
                </div>
              </>
            )}
          </div>

          {/* Send Signal Button */}
          <div className="mt-6 flex justify-center">
            <button
              onClick={handleSendSignal}
              disabled={sendingSignal || !selectedAccount}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-8 py-3 rounded-lg flex items-center space-x-2 text-lg font-semibold transition-colors"
            >
              <Send className={`w-5 h-5 ${sendingSignal ? 'animate-pulse' : ''}`} />
              <span>{sendingSignal ? 'Sending...' : 'Send Test Signal'}</span>
            </button>
          </div>
        </div>

        {/* Signal Result */}
        {signalResult && (
          <div className={`mt-4 p-4 rounded-lg border ${
            signalResult.success
              ? 'bg-green-900/30 border-green-500/30'
              : 'bg-red-900/30 border-red-500/30'
          }`}>
            <div className="flex items-start justify-between">
              <div>
                <p className={`font-medium ${
                  signalResult.success ? 'text-green-300' : 'text-red-300'
                }`}>
                  {signalResult.message}
                </p>
                <p className="text-sm text-gray-400 mt-1">
                  {new Date(signalResult.timestamp).toLocaleString()}
                </p>
                {signalResult.data && (
                  <pre className="mt-2 text-xs bg-gray-700 text-gray-300 p-2 rounded overflow-x-auto">
                    {JSON.stringify(signalResult.data, null, 2)}
                  </pre>
                )}
              </div>
              <button
                onClick={() => setSignalResult(null)}
                className="text-gray-400 hover:text-gray-300"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Live Webhook Event Feed */}
        {webhookEvents.length > 0 && (
          <div className="bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white flex items-center">
                <div className="w-3 h-3 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                Live Webhook Events
              </h2>
              <div className="flex space-x-2">
                <span className="text-sm text-gray-400">
                  {webhookEvents.length} events
                </span>
                <button
                  onClick={clearWebhookEvents}
                  className="text-sm text-red-400 hover:text-red-300"
                >
                  Clear All
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {webhookEvents.slice().reverse().map((event) => (
                <div
                  key={event.id}
                  className={`p-3 rounded border-l-4 ${
                    event.status === 'success'
                      ? 'bg-green-900/20 border-green-500'
                      : 'bg-red-900/20 border-red-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span className={`px-2 py-1 text-xs rounded font-medium ${
                        event.action === 'place_limit'
                          ? 'bg-blue-600 text-blue-100'
                          : event.action === 'update_limit'
                          ? 'bg-purple-600 text-purple-100'
                          : event.action === 'cancel_limit'
                          ? 'bg-red-600 text-red-100'
                          : 'bg-gray-600 text-gray-100'
                      }`}>
                        {event.action?.replace('_', ' ').toUpperCase()}
                      </span>
                      <span className={`px-2 py-1 text-xs rounded ${
                        event.side === 'buy'
                          ? 'bg-green-600/30 text-green-300'
                          : 'bg-red-600/30 text-red-300'
                      }`}>
                        {event.side?.toUpperCase()}
                      </span>
                      <span className="text-white font-medium">{event.symbol}</span>
                      {event.price && (
                        <span className="text-gray-300">
                          @ {event.price.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-400">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </div>
                      <div className="text-xs text-gray-500">
                        {event.strategy}
                      </div>
                    </div>
                  </div>
                  {event.error && (
                    <div className="mt-2 text-sm text-red-300">
                      Error: {event.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Webhook Sequence Builder */}
        <div className="bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center">
            🔄 Webhook Sequence Simulator
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Quick Test Actions */}
            <div>
              <h3 className="text-lg font-medium text-white mb-3">Market-Based Test Actions</h3>
              <div className="space-y-3">

                {/* Market Price Actions */}
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      setToLimitPrice();
                      setTestSignal(prev => ({ ...prev, action: 'place_limit' }));
                    }}
                    disabled={!getCurrentPrice(testSignal.symbol)}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-4 py-3 rounded-lg flex items-center space-x-2 transition-colors"
                  >
                    <Target className="w-4 h-4" />
                    <span>Place Limit @ Market {testSignal.side === 'buy' ? '-50' : '+50'}</span>
                  </button>

                  <button
                    onClick={() => {
                      const newPrice = generateEMAPriceUpdate(testSignal.price, testSignal.side, testSignal.symbol);
                      if (newPrice) {
                        setTestSignal(prev => ({
                          ...prev,
                          action: 'update_limit',
                          price: newPrice,
                          take_profit: 0,  // LS EMA strategy doesn't use take profit
                          strategy: 'LS_EMA'
                        }));
                      }
                    }}
                    disabled={!getCurrentPrice(testSignal.symbol)}
                    className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white px-4 py-3 rounded-lg flex items-center space-x-2 transition-colors"
                  >
                    <TrendingUp className="w-4 h-4" />
                    <span>Simulate EMA Price Update</span>
                  </button>

                  <div className="bg-blue-900/30 border border-blue-500/30 rounded-lg p-3">
                    <div className="flex items-start space-x-2">
                      <Info className="w-4 h-4 text-blue-400 mt-0.5" />
                      <div className="text-sm text-blue-200">
                        <p className="font-medium">What these do:</p>
                        <ul className="mt-1 space-y-1 text-xs text-blue-300">
                          <li><strong>Place Limit @ Market ±50:</strong> Sets up a limit order 50 points away from market (won't fill immediately)</li>
                          <li><strong>Simulate EMA Update:</strong> Adjusts current order price by 2-5 points (mimics real EMA strategy behavior)</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Utility Actions */}
                <div className="border-t border-gray-600 pt-3">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        const strategies = ['LS_EMA', 'LDPS', 'LS_Scalper', 'AI_Algo'];
                        const randomStrategy = strategies[Math.floor(Math.random() * strategies.length)];
                        const currentPrice = getCurrentPrice(testSignal.symbol);
                        if (currentPrice) {
                          setTestSignal(prev => ({
                            ...prev,
                            strategy: randomStrategy,
                            price: generatePriceMovement(currentPrice, testSignal.symbol)
                          }));
                        }
                      }}
                      className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-2 rounded text-sm"
                    >
                      🎲 Random Setup
                    </button>
                    <button
                      onClick={() => {
                        setTestSignal(prev => ({
                          ...prev,
                          side: prev.side === 'buy' ? 'sell' : 'buy'
                        }));
                      }}
                      className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-2 rounded text-sm"
                    >
                      🔄 Flip Side
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Market Info and Status */}
            <div>
              <h3 className="text-lg font-medium text-white mb-3">Market Data Status</h3>
              <div className="space-y-3">

                {/* Market Data Display */}
                <div className="bg-gray-900 border border-gray-600 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-300">
                      {testSignal.symbol} Quote
                    </span>
                    <div className={`flex items-center space-x-2 text-xs ${
                      isConnected ? 'text-green-400' : 'text-red-400'
                    }`}>
                      <div className={`w-2 h-2 rounded-full ${
                        isConnected ? 'bg-green-400' : 'bg-red-400'
                      }`}></div>
                      <span>{isConnected ? 'Live' : 'Disconnected'}</span>
                    </div>
                  </div>

                  {marketData[testSignal.symbol] ? (
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-xs text-gray-400">Open</div>
                        <div className="text-blue-400 font-mono">
                          {marketData[testSignal.symbol].open?.toFixed(2) || '--'}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">Current</div>
                        <div className="text-white font-mono font-bold">
                          {marketData[testSignal.symbol].close?.toFixed(2) || '--'}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">H/L</div>
                        <div className="text-gray-300 font-mono text-xs">
                          {marketData[testSignal.symbol].high?.toFixed(2) || '--'} / {marketData[testSignal.symbol].low?.toFixed(2) || '--'}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 py-2">
                      <div className="text-sm">No market data available</div>
                      <div className="text-xs">Check symbol or connection</div>
                    </div>
                  )}
                </div>

                {/* Price Validation Info */}
                <div className="text-sm text-gray-400">
                  <p className="font-medium text-gray-300 mb-2">💡 Validation Tips:</p>
                  <ul className="space-y-1 text-xs">
                    <li>• Orders within 200 points of market price will work in Tradovate</li>
                    <li>• Use "M±50" button to set limit order 50 points from market</li>
                    <li>• Yellow border indicates price may be too far from market</li>
                    <li>• Check live event feed below for webhook confirmations</li>
                  </ul>
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TestTrading;