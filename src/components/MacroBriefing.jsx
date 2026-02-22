import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { api } from '../services/api';

const POLL_INTERVAL = 3000; // 3 seconds

const MacroBriefing = () => {
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fetchBriefing = useCallback(async () => {
    try {
      const data = await api.getLatestBriefing();
      setBriefing(data);
    } catch (err) {
      if (err.status !== 404) {
        setError(err.message || 'Failed to load briefing');
      }
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const status = await api.getBriefingStatus();
        if (!status.generating) {
          // Generation finished — fetch the new briefing and stop polling
          stopPolling();
          setGenerating(false);
          await fetchBriefing();
        }
      } catch {
        // Ignore poll errors
      }
    }, POLL_INTERVAL);
  }, [stopPolling, fetchBriefing]);

  // On mount: fetch briefing + check if generation is already in progress
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const [, status] = await Promise.allSettled([
          fetchBriefing(),
          api.getBriefingStatus()
        ]);
        if (status.status === 'fulfilled' && status.value.generating) {
          setGenerating(true);
          startPolling();
        }
      } finally {
        setLoading(false);
      }
    };
    init();
    return stopPolling;
  }, [fetchBriefing, startPolling, stopPolling]);

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      setError(null);
      await api.generateBriefing();
      startPolling();
    } catch (err) {
      if (err.status === 429) {
        // Already generating — just start polling
        startPolling();
      } else {
        setError(err.message || 'Failed to generate briefing');
        setGenerating(false);
      }
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    // Append T12:00:00 to avoid UTC midnight parsing which shifts the day back in US timezones
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  const formatTime = (ms) => {
    if (!ms) return '';
    const seconds = Math.round(ms / 1000);
    return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
  };

  const regimeColor = (regime) => {
    if (!regime) return 'bg-gray-600';
    const r = regime.toLowerCase();
    if (r.includes('risk_on') || r.includes('bullish')) return 'bg-green-600';
    if (r.includes('risk_off') || r.includes('bearish')) return 'bg-red-600';
    if (r.includes('caution') || r.includes('mixed')) return 'bg-yellow-600';
    return 'bg-gray-600';
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto mb-3"></div>
          <p className="text-gray-400 text-[15px]">Loading briefing...</p>
        </div>
      </div>
    );
  }

  // No briefing available (and not currently generating)
  if (!briefing && !generating && !error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4">📋</div>
          <h2 className="text-xl font-bold text-white mb-2">No Briefing Available</h2>
          <p className="text-gray-400 mb-6 text-[15px]">
            Generate a macro briefing to get an AI-powered analysis of current market conditions,
            economic data, and trading regime assessment.
          </p>
          <button
            onClick={handleGenerate}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2.5 rounded-lg transition-colors text-[15px] font-medium"
          >
            Generate Briefing
          </button>
        </div>
      </div>
    );
  }

  // Generating with no prior briefing to show
  if (!briefing && generating) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-500 mx-auto mb-4"></div>
          <h2 className="text-lg font-semibold text-white mb-2">Generating Briefing...</h2>
          <p className="text-gray-400 text-[15px]">
            Collecting FRED, market, and Slingshot data, then generating AI narrative. This typically takes ~2 minutes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-[15px] font-semibold text-white">Macro Briefing</h2>
          {briefing?.date && (
            <span className="text-xs text-gray-400">{formatDate(briefing.date)}</span>
          )}
          {briefing?.generationTimeMs && (
            <span className="text-xs text-gray-500">({formatTime(briefing.generationTimeMs)})</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Data source badges */}
          {briefing?.dataSources && (
            <div className="flex items-center gap-1.5">
              {Object.entries(briefing.dataSources).map(([source, ok]) => (
                <span
                  key={source}
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    ok ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
                  }`}
                >
                  {source.toUpperCase()}
                </span>
              ))}
            </div>
          )}

          {/* Regime pill */}
          {briefing?.regimes?.composite && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold text-white ${regimeColor(briefing.regimes.composite)}`}>
              {briefing.regimes.composite.replace(/_/g, ' ').toUpperCase()}
            </span>
          )}

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-3 py-1 rounded text-xs font-medium transition-colors"
          >
            {generating ? (
              <span className="flex items-center gap-1.5">
                <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></span>
                Generating...
              </span>
            ) : (
              'Regenerate'
            )}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-red-900/30 border-b border-red-800 text-red-300 text-xs">
          {error}
        </div>
      )}

      {/* Markdown content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <article className="max-w-5xl mx-auto">
          <ReactMarkdown
            components={{
              h1: ({ children }) => (
                <h1 className="text-2xl font-bold text-white mb-6 pb-3 border-b border-gray-600">
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <div className="mt-8 mb-4 bg-gray-800/60 rounded-t-lg border-l-4 border-blue-500 px-4 py-2.5">
                  <h2 className="text-lg font-bold text-blue-400 tracking-wide uppercase m-0">
                    {children}
                  </h2>
                </div>
              ),
              h3: ({ children }) => (
                <h3 className="text-base font-semibold text-gray-200 mt-5 mb-2 pb-1 border-b border-gray-700/60">
                  {children}
                </h3>
              ),
              p: ({ children }) => (
                <p className="text-[15px] text-gray-300 leading-relaxed my-4">{children}</p>
              ),
              strong: ({ children }) => (
                <strong className="text-white font-semibold">{children}</strong>
              ),
              ul: ({ children }) => (
                <ul className="space-y-4 my-4 ml-1">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="space-y-4 my-4 ml-1 list-decimal list-inside">{children}</ol>
              ),
              li: ({ children }) => (
                <li className="text-[15px] text-gray-300 leading-relaxed pl-2 border-l-2 border-gray-700 ml-2">
                  {children}
                </li>
              ),
              hr: () => (
                <div className="my-8 border-t border-gray-600/50" />
              ),
              table: ({ children }) => (
                <div className="my-4 rounded-lg overflow-hidden border border-gray-700">
                  <table className="w-full text-[15px]">{children}</table>
                </div>
              ),
              thead: ({ children }) => (
                <thead className="bg-gray-800">{children}</thead>
              ),
              th: ({ children }) => (
                <th className="text-left text-gray-200 font-semibold px-3 py-2 border-b border-gray-600">{children}</th>
              ),
              td: ({ children }) => (
                <td className="text-gray-300 px-3 py-1.5 border-b border-gray-700/50">{children}</td>
              ),
              code: ({ children }) => (
                <code className="text-green-400 bg-gray-800 px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>
              ),
              a: ({ href, children }) => (
                <a href={href} className="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noreferrer">{children}</a>
              ),
            }}
          >
            {briefing?.fullReport || ''}
          </ReactMarkdown>
        </article>
      </div>
    </div>
  );
};

export default React.memo(MacroBriefing);
