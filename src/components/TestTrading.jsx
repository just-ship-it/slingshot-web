import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { api } from '../services/api';
import { AlertCircle, RefreshCw, Send, Zap } from 'lucide-react';

const TestTrading = () => {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Test signal state
  const [testSignal, setTestSignal] = useState({
    action: 'place_limit',
    side: 'buy',
    symbol: 'MNQ',
    price: 23599.5,
    stop_loss: 23547.5,
    take_profit: 23699.5,
    trailing_trigger: 22,
    trailing_offset: 6,
    quantity: 1,
    strategy: 'LDPS',
    account: ''
  });

  // Points mode state
  const [usePointsMode, setUsePointsMode] = useState(true);
  const [pointsConfig, setPointsConfig] = useState({
    stopPoints: 52,
    targetPoints: 100
  });
  const [sendingSignal, setSendingSignal] = useState(false);
  const [signalResult, setSignalResult] = useState(null);

  // Load accounts on component mount
  useEffect(() => {
    loadAccounts();
  }, []);

  // Calculate initial stop/target when component mounts in points mode
  useEffect(() => {
    if (usePointsMode && testSignal.price) {
      calculateStopAndTarget(testSignal.price, testSignal.side, testSignal.symbol, pointsConfig.stopPoints, pointsConfig.targetPoints);
    }
  }, []);

  const loadAccounts = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getAccounts();
      if (response.accounts && response.accounts.length > 0) {
        setAccounts(response.accounts);
        setSelectedAccount(response.accounts[0]);
        setTestSignal(prev => ({ ...prev, account: response.accounts[0].id }));
      } else {
        setError('No trading accounts found');
      }
    } catch (error) {
      setError(`Failed to load accounts: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setTestSignal(prev => ({ ...prev, [field]: value }));

    // If price or side changed and we're in points mode, recalculate stop/target
    if ((field === 'price' || field === 'side' || field === 'symbol') && usePointsMode) {
      const newSide = field === 'side' ? value : testSignal.side;
      const newPrice = field === 'price' ? value : testSignal.price;
      const newSymbol = field === 'symbol' ? value : testSignal.symbol;
      calculateStopAndTarget(newPrice, newSide, newSymbol, pointsConfig.stopPoints, pointsConfig.targetPoints);
    }
  };

  const handlePointsChange = (field, value) => {
    const newPointsConfig = { ...pointsConfig, [field]: value };
    setPointsConfig(newPointsConfig);

    // Recalculate stop/target if in points mode
    if (usePointsMode) {
      calculateStopAndTarget(testSignal.price, testSignal.side, testSignal.symbol, newPointsConfig.stopPoints, newPointsConfig.targetPoints);
    }
  };

  const calculateStopAndTarget = (entryPrice, side, symbol, stopPoints, targetPoints) => {
    if (!entryPrice || !stopPoints || !targetPoints) return;

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
      take_profit: parseFloat(takeProfit.toFixed(2))
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
        ...testSignal,
        account: selectedAccount.id,
        timestamp: new Date().toISOString(),
        source: 'test-interface'
      };

      const response = await axios.post('http://localhost:3001/autotrader', signalData, {
        headers: { 'Content-Type': 'application/json' }
      });

      setSignalResult({
        success: true,
        message: 'Test signal sent successfully!',
        data: response.data,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      setSignalResult({
        success: false,
        message: `Failed to send signal: ${error.response?.data?.error || error.message}`,
        timestamp: new Date().toISOString()
      });
    } finally {
      setSendingSignal(false);
    }
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

          {/* Points Mode Toggle */}
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
                    Take Profit (Points)
                  </label>
                  <input
                    type="number"
                    value={pointsConfig.targetPoints}
                    onChange={(e) => handlePointsChange('targetPoints', parseFloat(e.target.value) || 0)}
                    className="w-full bg-gray-600 border border-gray-500 text-white px-3 py-2 rounded"
                    placeholder="100"
                    step="1"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Points to target (e.g., 100 points = 100.0 price movement)
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-gray-400">
                💡 Switch to Points Mode to automatically calculate stop loss and take profit prices from your risk/reward points.
              </p>
            )}
          </div>

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
                <option value="cancel_limit">Cancel Limit Orders</option>
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
                value={testSignal.symbol}
                onChange={(e) => handleInputChange('symbol', e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded"
              >
                <option value="MNQ">MNQ (Micro NASDAQ)</option>
                <option value="NQ">NQ (NASDAQ)</option>
                <option value="MES">MES (Micro S&P)</option>
                <option value="ES">ES (S&P 500)</option>
                <option value="RTY">RTY (Russell 2000)</option>
                <option value="M2K">M2K (Micro Russell)</option>
              </select>
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

            {/* Price */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Price</label>
              <input
                type="number"
                value={testSignal.price}
                onChange={(e) => handleInputChange('price', parseFloat(e.target.value) || 0)}
                className="w-full bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded"
                step="0.25"
              />
            </div>

            {/* Strategy */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Strategy</label>
              <input
                type="text"
                value={testSignal.strategy}
                onChange={(e) => handleInputChange('strategy', e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded"
                placeholder="Strategy name"
              />
            </div>

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
                  📈 {pointsConfig.targetPoints} points = {testSignal.take_profit?.toFixed(2)}
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
      </div>
    </div>
  );
};

export default TestTrading;