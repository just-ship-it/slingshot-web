import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, RefreshCw, CheckCircle, XCircle, Shield, AlertCircle, Settings } from 'lucide-react';
import { api } from '../services/api';
import AccountForm from './AccountForm';
import RoutingMatrix from './RoutingMatrix';

const AccountsManager = ({ onClose }) => {
  const [accounts, setAccounts] = useState([]);
  const [schemas, setSchemas] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Right panel modes: 'detail' | 'add' | 'edit' | 'routing'
  const [panelMode, setPanelMode] = useState('detail');

  // Connection test
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Active tab: 'accounts' | 'routing'
  const [activeTab, setActiveTab] = useState('accounts');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [acctRes, schemaRes] = await Promise.all([
        api.getAccounts(),
        api.getConnectorSchemas().catch(() => null),
      ]);
      const accts = Array.isArray(acctRes) ? acctRes : acctRes?.accounts || [];
      setAccounts(accts);
      if (schemaRes) setSchemas(schemaRes);
      // Select first account if none selected
      if (!selectedId && accts.length > 0) {
        setSelectedId(accts[0].id);
      }
    } catch (err) {
      setError(err.message || 'Failed to load accounts');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { loadData(); }, [loadData]);

  const selectedAccount = accounts.find(a => a.id === selectedId) || null;

  const handleTestConnection = async (accountId) => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.testAccount(accountId);
      setTestResult({ success: true, message: result.message || 'Connection successful' });
    } catch (err) {
      setTestResult({ success: false, message: err.message || 'Connection failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async (accountId) => {
    setDeleting(true);
    try {
      await api.deleteAccount(accountId);
      setConfirmDelete(null);
      setSelectedId(null);
      setPanelMode('detail');
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to delete account');
    } finally {
      setDeleting(false);
    }
  };

  const handleFormSave = async () => {
    setPanelMode('detail');
    await loadData();
  };

  const getBrokerBadge = (account) => {
    const broker = account.broker || 'tradovate';
    if (broker === 'pickmytrade') {
      return <span className="text-xs px-2 py-0.5 rounded-full bg-purple-900 text-purple-300">PickMyTrade</span>;
    }
    return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900 text-blue-300">Tradovate</span>;
  };

  const getModeBadge = (account) => {
    if (account.broker === 'pickmytrade') return null;
    const mode = account.config?.mode || 'demo';
    if (mode === 'live') {
      return <span className="text-xs px-2 py-0.5 rounded-full bg-green-900 text-green-300">Live</span>;
    }
    return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-900 text-yellow-300">Demo</span>;
  };

  const getStatusDot = (account) => {
    const connected = account.status === 'connected' || account.status === 'ok';
    return (
      <span
        className={`w-2 h-2 rounded-full inline-block ${connected ? 'bg-green-500' : 'bg-gray-600'}`}
        title={connected ? 'Connected' : 'Unknown'}
      />
    );
  };

  const formatDate = (d) => {
    if (!d) return '--';
    return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // -- Renders --

  const renderAccountList = () => (
    <div className="w-full lg:w-[35%] border-r border-gray-700 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {accounts.map(acc => (
          <button
            key={acc.id}
            onClick={() => { setSelectedId(acc.id); setPanelMode('detail'); setTestResult(null); setConfirmDelete(null); }}
            className={`w-full text-left rounded-lg p-3 border transition-colors ${
              selectedId === acc.id
                ? 'bg-gray-700 border-blue-500'
                : 'bg-gray-800 border-gray-700 hover:border-gray-600'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                {getStatusDot(acc)}
                <span className="text-sm font-medium text-white truncate">
                  {acc.displayName || acc.id}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {getModeBadge(acc)}
                {getBrokerBadge(acc)}
              </div>
            </div>
            <div className="text-xs text-gray-500 truncate">
              ID: {acc.id}
              {acc.enabled === false && <span className="ml-2 text-yellow-500">(disabled)</span>}
            </div>
          </button>
        ))}
        {accounts.length === 0 && !loading && (
          <div className="text-center py-8 text-gray-500 text-sm">No accounts configured</div>
        )}
      </div>
      <div className="p-3 border-t border-gray-700 flex-shrink-0">
        <button
          onClick={() => { setPanelMode('add'); setSelectedId(null); setTestResult(null); }}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Account
        </button>
      </div>
    </div>
  );

  const renderDetailPanel = () => {
    if (panelMode === 'add') {
      return (
        <AccountForm
          account={null}
          schemas={schemas}
          allAccounts={accounts}
          onSave={handleFormSave}
          onCancel={() => { setPanelMode('detail'); if (accounts.length > 0) setSelectedId(accounts[0].id); }}
        />
      );
    }

    if (panelMode === 'edit' && selectedAccount) {
      return (
        <AccountForm
          account={selectedAccount}
          schemas={schemas}
          allAccounts={accounts}
          onSave={handleFormSave}
          onCancel={() => setPanelMode('detail')}
        />
      );
    }

    if (!selectedAccount) {
      return (
        <div className="flex items-center justify-center h-full text-gray-500 text-sm">
          Select an account or add a new one
        </div>
      );
    }

    const acc = selectedAccount;
    const schema = schemas?.[acc.broker];
    const credentialFields = schema?.fields || [];

    return (
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">{acc.displayName || acc.id}</h3>
            <div className="flex items-center gap-2 mt-1">
              {getBrokerBadge(acc)}
              {getModeBadge(acc)}
              {getStatusDot(acc)}
            </div>
          </div>
          <button
            onClick={() => setPanelMode('edit')}
            className="flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white px-3 py-1.5 rounded text-sm transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            Edit
          </button>
        </div>

        {/* Info section */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h4 className="text-sm font-medium text-gray-400 mb-2 uppercase tracking-wide">Account Info</h4>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt className="text-gray-500">ID</dt>
              <dd className="text-white font-mono">{acc.id}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Broker</dt>
              <dd className="text-white">{schemas?.[acc.broker]?.displayName || acc.broker}</dd>
            </div>
            {acc.config?.mode && (
              <div>
                <dt className="text-gray-500">Mode</dt>
                <dd className="text-white capitalize">{acc.config.mode}</dd>
              </div>
            )}
            {acc.enabled !== undefined && (
              <div>
                <dt className="text-gray-500">Enabled</dt>
                <dd className={acc.enabled !== false ? 'text-green-400' : 'text-yellow-400'}>
                  {acc.enabled !== false ? 'Yes' : 'No'}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-gray-500">Created</dt>
              <dd className="text-white">{formatDate(acc.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Updated</dt>
              <dd className="text-white">{formatDate(acc.updatedAt)}</dd>
            </div>
          </dl>
        </div>

        {/* Credentials section */}
        {credentialFields.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-gray-400" />
              <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wide">Credentials</h4>
            </div>
            <dl className="space-y-1.5 text-sm">
              {credentialFields.map(field => {
                const cred = acc.credentials?.[field.key];
                const display = cred?.hasValue
                  ? '********'
                  : '(not set)';
                return (
                  <div key={field.key} className="flex items-center justify-between">
                    <dt className="text-gray-500">{field.label || field.key}</dt>
                    <dd className="text-gray-300 font-mono text-xs">{display}</dd>
                  </div>
                );
              })}
            </dl>
          </div>
        )}

        {/* Shadow account for PMT */}
        {acc.broker === 'pickmytrade' && acc.config?.tracking?.via && (
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <h4 className="text-sm font-medium text-gray-400 mb-2 uppercase tracking-wide">Shadow Account</h4>
            <p className="text-sm text-gray-300">
              Position tracking via: <span className="font-mono text-white">{acc.config.tracking.via}</span>
            </p>
          </div>
        )}

        {/* Connection test */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h4 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wide">Connection Test</h4>
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleTestConnection(acc.id)}
              disabled={testing}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 rounded text-sm flex items-center gap-2"
            >
              {testing ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Test Connection
            </button>
            {testResult && (
              <div className={`flex items-center gap-1.5 text-sm ${testResult.success ? 'text-green-400' : 'text-red-400'}`}>
                {testResult.success ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {testResult.message}
              </div>
            )}
          </div>
        </div>

        {/* Delete */}
        <div className="border-t border-gray-700 pt-4">
          {confirmDelete === acc.id ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-red-400">Delete this account?</span>
              <button
                onClick={() => handleDelete(acc.id)}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-3 py-1.5 rounded text-sm flex items-center gap-2"
              >
                {deleting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                Confirm Delete
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="text-gray-400 hover:text-white px-3 py-1.5 text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(acc.id)}
              className="flex items-center gap-2 text-red-400 hover:text-red-300 text-sm transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Account
            </button>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        Loading accounts...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex border-b border-gray-700 px-4 flex-shrink-0">
        <button
          onClick={() => setActiveTab('accounts')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'accounts'
              ? 'border-blue-500 text-white'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          Accounts
        </button>
        <button
          onClick={() => setActiveTab('routing')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'routing'
              ? 'border-blue-500 text-white'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          Routing Matrix
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-900/30 border border-red-700 rounded mx-4 mt-3 px-3 py-2 text-sm text-red-300 flex-shrink-0">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">dismiss</button>
        </div>
      )}

      {activeTab === 'accounts' ? (
        <div className="flex flex-1 min-h-0">
          {renderAccountList()}
          <div className="flex-1 overflow-y-auto">
            {renderDetailPanel()}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
          <RoutingMatrix accounts={accounts} />
        </div>
      )}
    </div>
  );
};

export default AccountsManager;
