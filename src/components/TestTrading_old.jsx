import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { api } from '../services/api';
import { AlertCircle, RefreshCw, TrendingUp, TrendingDown, DollarSign, Activity, Shield, FileText, Send, Zap } from 'lucide-react';

const TestTrading = () => {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [accountSnapshot, setAccountSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

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
  const [sendingSignal, setSendingSignal] = useState(false);
  const [signalResult, setSignalResult] = useState(null);

  // Fetch accounts on component mount
  useEffect(() => {
    fetchAccounts();
  }, []);

  // Auto-refresh logic
  useEffect(() => {
    let interval;
    if (autoRefresh && selectedAccount) {
      interval = setInterval(() => {
        fetchAccountSnapshot(selectedAccount);
      }, 5000); // Refresh every 5 seconds
    }
    return () => clearInterval(interval);
  }, [autoRefresh, selectedAccount]);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get('/api/account/list');
      if (response.data.success) {
        setAccounts(response.data.accounts);
        // Auto-select first account if available
        if (response.data.accounts.length > 0 && !selectedAccount) {
          setSelectedAccount(response.data.accounts[0].id);
          fetchAccountSnapshot(response.data.accounts[0].id);
        }
      }
    } catch (err) {
      setError(`Failed to fetch accounts: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchAccountSnapshot = async (accountId) => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get(`/api/account/${accountId}/snapshot`);
      if (response.data.success) {
        setAccountSnapshot(response.data.snapshot);
        setLastUpdate(new Date());
      }
    } catch (err) {
      setError(`Failed to fetch account snapshot: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(value);
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return '-';
    return `${value.toFixed(2)}%`;
  };

  const sendTestSignal = async () => {
    try {
      setSendingSignal(true);
      setSignalResult(null);
      setError(null);

      // Prepare signal data matching webhook schema
      const signalData = {
        action: testSignal.action,
        side: testSignal.side,
        symbol: testSignal.symbol,
        price: parseFloat(testSignal.price),
        stop_loss: parseFloat(testSignal.stop_loss),
        take_profit: parseFloat(testSignal.take_profit),
        trailing_trigger: parseFloat(testSignal.trailing_trigger),
        trailing_offset: parseFloat(testSignal.trailing_offset),
        quantity: parseInt(testSignal.quantity),
        strategy: testSignal.strategy,
        account: testSignal.account || selectedAccount || 'default'
      };

      // Remove undefined/NaN values
      Object.keys(signalData).forEach(key => {
        if (signalData[key] === undefined || (typeof signalData[key] === 'number' && isNaN(signalData[key]))) {
          delete signalData[key];
        }
      });

      console.log('Sending test signal:', signalData);

      // Send to webhook/autotrader endpoint
      const response = await axios.post('/webhook/autotrader', signalData);

      setSignalResult({
        success: true,
        message: 'Test signal sent successfully',
        data: response.data,
        timestamp: new Date().toISOString()
      });

    } catch (err) {
      console.error('Test signal error:', err);
      setSignalResult({
        success: false,
        message: `Failed to send signal: ${err.response?.data?.error || err.message}`,
        timestamp: new Date().toISOString()
      });
    } finally {
      setSendingSignal(false);
    }
  };

  const handleSignalInputChange = (field, value) => {
    setTestSignal(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <div className="p-6 bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white mb-2">Test Trading Dashboard</h1>
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-900/30 text-red-400 border border-red-500/30">
            <Activity className="w-4 h-4 mr-1" />
            LIVE ACCOUNT - REAL MONEY
          </span>
          {lastUpdate && (
            <span className="text-sm text-gray-400">
              Last updated: {lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-4 bg-red-900/30 border border-red-500/30 rounded-lg flex items-start">
          <AlertCircle className="w-5 h-5 text-red-400 mr-2 mt-0.5" />
          <div className="text-red-300">{error}</div>
        </div>
      )}

      {/* Account Selection and Controls */}
      <div className="mb-6 bg-gray-800 rounded-lg shadow p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-300">Account:</label>
            <select
              value={selectedAccount || ''}
              onChange={(e) => {
                setSelectedAccount(e.target.value);
                if (e.target.value) {
                  fetchAccountSnapshot(e.target.value);
                }
              }}
              className="px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select Account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.nickname || account.id})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm text-gray-300">Auto-refresh (5s)</span>
            </label>
            <button
              onClick={() => selectedAccount && fetchAccountSnapshot(selectedAccount)}
              disabled={loading || !selectedAccount}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-500 disabled:bg-gray-600 flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Test Signal Panel */}
      <div className="mb-6 bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center">
          <Zap className="w-5 h-5 mr-2 text-blue-400" />
          Send Test Signal
        </h2>

        <div className="space-y-4">
          {/* First Row - Core Action Fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {/* Action */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Action</label>
              <select
                value={testSignal.action}
                onChange={(e) => handleSignalInputChange('action', e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="place_limit">place_limit</option>
                <option value="cancel_limit">cancel_limit</option>
                <option value="position_closed">position_closed</option>
                <option value="BUY">BUY (legacy)</option>
                <option value="SELL">SELL (legacy)</option>
              </select>
            </div>

            {/* Side */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Side</label>
              <select
                value={testSignal.side}
                onChange={(e) => handleSignalInputChange('side', e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="buy">buy</option>
                <option value="sell">sell</option>
              </select>
            </div>

            {/* Symbol */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Symbol</label>
              <select
                value={testSignal.symbol}
                onChange={(e) => handleSignalInputChange('symbol', e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="MNQ">MNQ (Micro E-mini Nasdaq-100) 🛡️</option>
                <option value="MES">MES (Micro E-mini S&P 500) 🛡️</option>
                <option value="NQ1!">NQ1! (Nasdaq-100)</option>
                <option value="ES1!">ES1! (S&P 500)</option>
                <option value="RTY1!">RTY1! (Russell 2000)</option>
                <option value="NQ">NQ (E-mini Nasdaq-100)</option>
                <option value="ES">ES (E-mini S&P 500)</option>
              </select>
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Quantity</label>
              <input
                type="number"
                min="1"
                max="10"
                value={testSignal.quantity}
                onChange={(e) => handleSignalInputChange('quantity', e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Second Row - Price Fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {/* Price */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Price</label>
              <input
                type="number"
                step="0.25"
                value={testSignal.price}
                onChange={(e) => handleSignalInputChange('price', e.target.value)}
                placeholder="Entry price"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Stop Loss */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Stop Loss</label>
              <input
                type="number"
                step="0.25"
                value={testSignal.stop_loss}
                onChange={(e) => handleSignalInputChange('stop_loss', e.target.value)}
                placeholder="Stop loss price"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Take Profit */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Take Profit</label>
              <input
                type="number"
                step="0.25"
                value={testSignal.take_profit}
                onChange={(e) => handleSignalInputChange('take_profit', e.target.value)}
                placeholder="Take profit price"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Strategy */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Strategy</label>
              <select
                value={testSignal.strategy}
                onChange={(e) => handleSignalInputChange('strategy', e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="LDPS">LDPS</option>
                <option value="TEST">TEST</option>
                <option value="MANUAL">MANUAL</option>
              </select>
            </div>
          </div>

          {/* Third Row - Trailing Fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Trailing Trigger */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Trailing Trigger</label>
              <input
                type="number"
                step="0.1"
                value={testSignal.trailing_trigger}
                onChange={(e) => handleSignalInputChange('trailing_trigger', e.target.value)}
                placeholder="Points to trigger trailing"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Trailing Offset */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Trailing Offset</label>
              <input
                type="number"
                step="0.1"
                value={testSignal.trailing_offset}
                onChange={(e) => handleSignalInputChange('trailing_offset', e.target.value)}
                placeholder="Points behind price"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Send Button */}
            <div className="flex items-end">
              <button
                onClick={sendTestSignal}
                disabled={sendingSignal || !testSignal.symbol || !testSignal.quantity}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-500 disabled:bg-gray-600 disabled:text-gray-400 flex items-center justify-center gap-2 h-[42px]"
              >
                <Send className={`w-4 h-4 ${sendingSignal ? 'animate-pulse' : ''}`} />
                {sendingSignal ? 'Sending...' : 'Send Signal'}
              </button>
            </div>
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

      {/* Account Data Display - Removed for clean test interface */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {/* Balance Card */}
          <div className="bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center">
              <DollarSign className="w-5 h-5 mr-2 text-green-400" />
              Account Balance
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Cash Balance:</span>
                <span className="font-semibold text-white">{formatCurrency(accountSnapshot.balance.balance)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Equity:</span>
                <span className="font-semibold text-white">{formatCurrency(accountSnapshot.balance.equity)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Available Funds:</span>
                <span className="font-semibold text-green-400">
                  {formatCurrency(accountSnapshot.balance.availableFunds)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Day P&L:</span>
                <span className={`font-semibold ${accountSnapshot.balance.dayPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(accountSnapshot.balance.dayPnL)}
                </span>
              </div>
            </div>
          </div>

          {/* Margin Card */}
          <div className="bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center">
              <Shield className="w-5 h-5 mr-2 text-blue-400" />
              Margin Information
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Margin Used:</span>
                <span className="font-semibold text-white">{formatCurrency(accountSnapshot.balance.margin)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Margin Usage:</span>
                <span className="font-semibold text-white">{formatPercent(parseFloat(accountSnapshot.balance.marginUsagePercent))}</span>
              </div>
              {accountSnapshot.margin && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Initial Margin:</span>
                    <span className="font-semibold text-white">{formatCurrency(accountSnapshot.margin.initialMargin)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Maintenance:</span>
                    <span className="font-semibold text-white">{formatCurrency(accountSnapshot.margin.maintenanceMargin)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Positions Summary Card */}
          <div className="bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center">
              <FileText className="w-5 h-5 mr-2 text-yellow-400" />
              Positions Summary
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Total Positions:</span>
                <span className="font-semibold text-white">{accountSnapshot.positions.count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Long Positions:</span>
                <span className="font-semibold text-green-400">{accountSnapshot.positions.long}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Short Positions:</span>
                <span className="font-semibold text-red-400">{accountSnapshot.positions.short}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Working Orders:</span>
                <span className="font-semibold text-blue-400">{accountSnapshot.orders.working.length}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Positions Table */}
      {accountSnapshot && accountSnapshot.positions.list.length > 0 && (
        <div className="mt-6 bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-700">
            <h2 className="text-lg font-semibold text-white">Open Positions</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Contract
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Side
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Quantity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Avg Price
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    P&L
                  </th>
                </tr>
              </thead>
              <tbody className="bg-gray-800 divide-y divide-gray-700">
                {accountSnapshot.positions.list.map((position, idx) => (
                  <tr key={idx}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                      {position.contractName || `Contract ${position.contractId}`}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {position.netPos > 0 ? (
                        <span className="flex items-center text-green-400">
                          <TrendingUp className="w-4 h-4 mr-1" />
                          Long
                        </span>
                      ) : (
                        <span className="flex items-center text-red-400">
                          <TrendingDown className="w-4 h-4 mr-1" />
                          Short
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                      {Math.abs(position.netPos)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                      {formatCurrency(position.netPrice)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={position.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {formatCurrency(position.pnl || 0)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Active Orders Table */}
      {accountSnapshot && accountSnapshot.orders.working.length > 0 && (
        <div className="mt-6 bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-700">
            <h2 className="text-lg font-semibold text-white">Active Orders</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Order ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Side
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Quantity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Price
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-gray-800 divide-y divide-gray-700">
                {accountSnapshot.orders.working.map((order) => (
                  <tr key={order.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                      {order.id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                      {order.ordType}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={order.action === 'Buy' ? 'text-green-400' : 'text-red-400'}>
                        {order.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                      {order.totalQty}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                      {order.price ? formatCurrency(order.price) : 'Market'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-900/30 text-blue-400 border border-blue-500/30">
                        {order.ordStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default TestTrading;