import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { api } from '../services/api';

const WELL_KNOWN_STRATEGIES = ['GEX_FLIP_IVPCT', 'GEX_LT_3M_CROSSOVER', 'GEX_LEVEL_FADE', 'LS_FLIP_TRIGGER_BAR', 'IV_SKEW_GEX', 'SHORT_DTE_IV', 'AI_TRADER'];

const RoutingMatrix = ({ accounts = [] }) => {
  const [routes, setRoutes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingCell, setSavingCell] = useState(null); // "strategy:accountId"
  const [saveResult, setSaveResult] = useState(null); // { key, success }

  const loadRoutes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getRoutes();
      setRoutes(data);
    } catch (err) {
      setError(err.message || 'Failed to load routes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRoutes(); }, [loadRoutes]);

  // Build list of all strategy names from routes + well-known
  const strategyNames = React.useMemo(() => {
    const names = new Set(WELL_KNOWN_STRATEGIES);
    if (routes?.routes) {
      Object.keys(routes.routes).forEach(k => names.add(k));
    }
    return Array.from(names);
  }, [routes]);

  const defaultAccountIds = routes?.defaultAccounts || [];

  const isChecked = (strategy, accountId) => {
    if (strategy === '__defaults__') {
      return defaultAccountIds.includes(accountId);
    }
    const strategyRoute = routes?.routes?.[strategy];
    if (strategyRoute) {
      return strategyRoute.includes(accountId);
    }
    // No explicit route — inherits defaults (show as inherited)
    return null;
  };

  const handleToggle = async (strategy, accountId) => {
    const cellKey = `${strategy}:${accountId}`;
    setSavingCell(cellKey);
    setSaveResult(null);

    try {
      if (strategy === '__defaults__') {
        const newDefaults = defaultAccountIds.includes(accountId)
          ? defaultAccountIds.filter(id => id !== accountId)
          : [...defaultAccountIds, accountId];
        await api.setDefaultRoute(newDefaults);
      } else {
        const current = routes?.routes?.[strategy] || [];
        const currentlyChecked = current.includes(accountId);
        const newIds = currentlyChecked
          ? current.filter(id => id !== accountId)
          : [...current, accountId];
        await api.setStrategyRoute(strategy, newIds);
      }

      // Reload routes to get fresh state
      const data = await api.getRoutes();
      setRoutes(data);
      setSaveResult({ key: cellKey, success: true });
    } catch (err) {
      setSaveResult({ key: cellKey, success: false });
    } finally {
      setSavingCell(null);
      setTimeout(() => setSaveResult(null), 1500);
    }
  };

  const getBrokerBadge = (account) => {
    const broker = account.broker || 'tradovate';
    if (broker === 'pickmytrade') {
      return <span className="text-xs px-1.5 py-0.5 rounded bg-purple-900 text-purple-300">PMT</span>;
    }
    return <span className="text-xs px-1.5 py-0.5 rounded bg-blue-900 text-blue-300">TV</span>;
  };

  const getModeBadge = (account) => {
    // Tradovate accounts have an explicit live/demo mode; PMT routes through
    // its own broker so the badge is not meaningful there.
    if ((account.broker || 'tradovate') === 'pickmytrade') return null;
    const mode = account.config?.mode || 'demo';
    if (mode === 'live') {
      return <span className="text-xs px-1.5 py-0.5 rounded bg-green-900 text-green-300">LIVE</span>;
    }
    return <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-900 text-yellow-300">DEMO</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400">
        <RefreshCw className="w-4 h-4 animate-spin mr-2" />
        Loading routes...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-8 text-red-400">
        <AlertCircle className="w-4 h-4 mr-2" />
        {error}
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No accounts configured. Add an account first.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-700">
            <th className="text-left text-gray-400 font-medium py-2 px-3 whitespace-nowrap">Strategy</th>
            {accounts.map(acc => (
              <th key={acc.id} className="text-center py-2 px-3">
                <div className="flex flex-col items-center gap-0.5">
                  <div className="flex items-center gap-1">
                    {getBrokerBadge(acc)}
                    {getModeBadge(acc)}
                  </div>
                  <span className="text-gray-300 text-xs whitespace-nowrap">
                    {acc.displayName || acc.id}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Defaults row */}
          <tr className="border-b border-gray-600 bg-gray-800/50">
            <td className="py-2 px-3 font-medium text-yellow-400 whitespace-nowrap">
              Defaults
              <span className="text-gray-500 text-xs ml-1">(fallback)</span>
            </td>
            {accounts.map(acc => {
              const cellKey = `__defaults__:${acc.id}`;
              const checked = defaultAccountIds.includes(acc.id);
              const isSaving = savingCell === cellKey;
              const result = saveResult?.key === cellKey ? saveResult : null;

              return (
                <td key={acc.id} className="text-center py-2 px-2">
                  <div className="flex items-center justify-center">
                    {isSaving ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />
                    ) : result ? (
                      result.success
                        ? <CheckCircle className="w-4 h-4 text-green-400" />
                        : <AlertCircle className="w-4 h-4 text-red-400" />
                    ) : (
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleToggle('__defaults__', acc.id)}
                        className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500 cursor-pointer"
                      />
                    )}
                  </div>
                </td>
              );
            })}
          </tr>

          {/* Strategy rows */}
          {strategyNames.map(strategy => (
            <tr key={strategy} className="border-b border-gray-700/50 hover:bg-gray-800/30">
              <td className="py-2 px-3 text-gray-300 whitespace-nowrap">{strategy}</td>
              {accounts.map(acc => {
                const cellKey = `${strategy}:${acc.id}`;
                const checked = isChecked(strategy, acc.id);
                const isInherited = checked === null;
                const inheritedChecked = isInherited && defaultAccountIds.includes(acc.id);
                const isSaving = savingCell === cellKey;
                const result = saveResult?.key === cellKey ? saveResult : null;

                return (
                  <td key={acc.id} className="text-center py-2 px-2">
                    <div className="flex items-center justify-center">
                      {isSaving ? (
                        <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />
                      ) : result ? (
                        result.success
                          ? <CheckCircle className="w-4 h-4 text-green-400" />
                          : <AlertCircle className="w-4 h-4 text-red-400" />
                      ) : isInherited ? (
                        <input
                          type="checkbox"
                          checked={inheritedChecked}
                          onChange={() => handleToggle(strategy, acc.id)}
                          className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500 cursor-pointer opacity-40"
                          title="Inherited from defaults (click to set explicit route)"
                        />
                      ) : (
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggle(strategy, acc.id)}
                          className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500 cursor-pointer"
                        />
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default RoutingMatrix;
