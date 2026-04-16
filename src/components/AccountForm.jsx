import React, { useState, useEffect } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { api } from '../services/api';

const AccountForm = ({ account, schemas, allAccounts, onSave, onCancel }) => {
  const isEditing = !!account;

  const [broker, setBroker] = useState(account?.broker || '');
  const [displayName, setDisplayName] = useState(account?.displayName || '');
  const [configValues, setConfigValues] = useState({});
  const [credentialValues, setCredentialValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Initialize form values when editing
  useEffect(() => {
    if (account && schemas) {
      setBroker(account.broker || '');
      setDisplayName(account.displayName || '');

      // Pre-fill config fields from account.config
      const schema = schemas[account.broker];
      if (schema && account.config) {
        const cfg = {};
        (schema.configFields || []).forEach(field => {
          if (account.config[field.key] !== undefined) {
            cfg[field.key] = account.config[field.key];
          }
        });
        setConfigValues(cfg);
      }

      // Credentials are redacted — leave empty so we only send what user types
      setCredentialValues({});
    }
  }, [account, schemas]);

  const selectedSchema = schemas?.[broker];
  const configFields = selectedSchema?.configFields || [];
  const credentialFields = selectedSchema?.fields || [];

  // Get demo tradovate accounts for PMT shadow pairing
  const demoTradovateAccounts = allAccounts.filter(
    a => a.broker === 'tradovate' && a.config?.mode === 'demo' && a.id !== account?.id
  );

  const handleConfigChange = (key, value) => {
    setConfigValues(prev => ({ ...prev, [key]: value }));
  };

  const handleCredentialChange = (key, value) => {
    setCredentialValues(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload = {
        broker,
        displayName: displayName || undefined,
        config: { ...configValues },
        credentials: {},
      };

      // Only include credential fields that were actually typed
      credentialFields.forEach(field => {
        const val = credentialValues[field.key];
        if (val && val.trim() !== '') {
          payload.credentials[field.key] = val.trim();
        }
      });

      // For PMT, include shadow account in config
      if (broker === 'pickmytrade' && configValues.shadowAccountId) {
        payload.config.tracking = { via: configValues.shadowAccountId };
      }

      if (isEditing) {
        await api.updateAccount(account.id, payload);
      } else {
        await api.createAccount(payload);
      }

      onSave();
    } catch (err) {
      setError(err.message || 'Failed to save account');
    } finally {
      setSaving(false);
    }
  };

  const renderField = (field, value, onChange, redactedInfo) => {
    const inputType = field.type === 'password' || field.sensitive ? 'password' : 'text';

    if (field.type === 'select' && field.options) {
      return (
        <div key={field.key} className="mb-3">
          <label className="block text-sm text-gray-300 mb-1">
            {field.label || field.key}
            {field.required && <span className="text-red-400 ml-0.5">*</span>}
          </label>
          <select
            value={value || ''}
            onChange={(e) => onChange(field.key, e.target.value)}
            className="bg-gray-900 text-white border border-gray-700 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full"
          >
            <option value="">Select...</option>
            {field.options.map(opt => (
              <option key={opt.value || opt} value={opt.value || opt}>
                {opt.label || opt}
              </option>
            ))}
          </select>
          {field.help && <p className="text-xs text-gray-500 mt-0.5">{field.help}</p>}
        </div>
      );
    }

    return (
      <div key={field.key} className="mb-3">
        <label className="block text-sm text-gray-300 mb-1">
          {field.label || field.key}
          {field.required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
        <input
          type={inputType}
          value={value || ''}
          onChange={(e) => onChange(field.key, e.target.value)}
          placeholder={redactedInfo ? `****${redactedInfo}` : (field.placeholder || '')}
          className="bg-gray-900 text-white border border-gray-700 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full"
        />
        {field.help && <p className="text-xs text-gray-500 mt-0.5">{field.help}</p>}
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="p-4">
      <h3 className="text-base font-semibold text-white mb-4">
        {isEditing ? 'Edit Account' : 'Add Account'}
      </h3>

      {error && (
        <div className="flex items-center gap-2 bg-red-900/30 border border-red-700 rounded px-3 py-2 mb-4 text-sm text-red-300">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Broker selector */}
      <div className="mb-3">
        <label className="block text-sm text-gray-300 mb-1">
          Broker <span className="text-red-400 ml-0.5">*</span>
        </label>
        <select
          value={broker}
          onChange={(e) => {
            setBroker(e.target.value);
            setConfigValues({});
            setCredentialValues({});
          }}
          disabled={isEditing}
          className="bg-gray-900 text-white border border-gray-700 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full disabled:opacity-50"
        >
          <option value="">Select broker...</option>
          {schemas && Object.entries(schemas).map(([key, schema]) => (
            <option key={key} value={key}>{schema.displayName || key}</option>
          ))}
        </select>
      </div>

      {/* Display name */}
      <div className="mb-3">
        <label className="block text-sm text-gray-300 mb-1">Display Name</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={broker ? `${selectedSchema?.displayName || broker} account` : 'Account name'}
          className="bg-gray-900 text-white border border-gray-700 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full"
        />
      </div>

      {selectedSchema && (
        <>
          {/* Config fields */}
          {configFields.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-400 mb-2 uppercase tracking-wide">Configuration</h4>
              {configFields.map(field =>
                renderField(field, configValues[field.key], handleConfigChange)
              )}
            </div>
          )}

          {/* PMT shadow account */}
          {broker === 'pickmytrade' && (
            <div className="mb-3">
              <label className="block text-sm text-gray-300 mb-1">
                Shadow Account <span className="text-xs text-gray-500">(Tradovate demo for position tracking)</span>
              </label>
              <select
                value={configValues.shadowAccountId || ''}
                onChange={(e) => handleConfigChange('shadowAccountId', e.target.value)}
                className="bg-gray-900 text-white border border-gray-700 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full"
              >
                <option value="">None</option>
                {demoTradovateAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.displayName || acc.id} ({acc.id})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Credential fields */}
          {credentialFields.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-400 mb-2 uppercase tracking-wide">Credentials</h4>
              {isEditing && (
                <p className="text-xs text-gray-500 mb-2">Leave blank to keep existing value.</p>
              )}
              {credentialFields.map(field => {
                const redacted = isEditing && account.credentials?.[field.key];
                const lastFour = redacted?.lastFour || null;
                return renderField(
                  { ...field, sensitive: true },
                  credentialValues[field.key],
                  handleCredentialChange,
                  lastFour
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2 border-t border-gray-700">
        <button
          type="submit"
          disabled={saving || !broker}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-sm flex items-center gap-2"
        >
          {saving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
          {isEditing ? 'Update Account' : 'Create Account'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-gray-400 hover:text-white px-3 py-2 text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
};

export default AccountForm;
