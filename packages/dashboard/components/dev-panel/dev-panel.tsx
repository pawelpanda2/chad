'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useDevPanelStore } from '@/lib/dev-panel/dev-panel-store';

type MongoSource = 'local' | 'qnap';

interface DbSourceState {
  current: MongoSource;
  target: { source: MongoSource; hostPort: string; error?: string };
}

/** Settings tab content: live local/QNAP Mongo switch (Story 83) — see /api/dev-settings/db-source. */
function DevPanelSettingsTab() {
  const [state, setState] = useState<DbSourceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dev-settings/db-source');
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      setState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reach server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleChange(source: MongoSource) {
    setSwitching(true);
    setError(null);
    try {
      const res = await fetch('/api/dev-settings/db-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      setState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reach server');
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="dev-tab-section">
      <div className="dev-section-title">⚙️ Settings</div>

      <div style={{ marginBottom: '12px' }}>
        <label htmlFor="dev-panel-db-source" style={{ display: 'block', marginBottom: '4px', fontWeight: 600 }}>
          Baza danych (Mongo)
        </label>
        <select
          id="dev-panel-db-source"
          value={state?.current ?? 'local'}
          disabled={loading || switching || !state}
          onChange={(e) => handleChange(e.target.value as MongoSource)}
          className="dev-btn"
          style={{ minWidth: '220px' }}
        >
          <option value="local">Local (docker/local Mongo)</option>
          <option value="qnap">QNAP (server, współdzielone dane)</option>
        </select>
        {switching && <span style={{ marginLeft: '8px' }}>Przełączanie...</span>}
      </div>

      {loading && <div className="dev-no-logs">Ładowanie...</div>}

      {!loading && state && (
        <div className="dev-request-detail">
          <strong>Aktualnie połączony z:</strong>
          <pre className="dev-log-pre">
            {state.current === 'qnap' ? 'QNAP (100.117.139.83:12040)' : 'Local'}
            {'\n'}host:port = {state.target.hostPort}
            {state.target.error ? `\n(błąd rozwiązania: ${state.target.error})` : ''}
          </pre>
        </div>
      )}

      {error && (
        <div className="dev-request-detail dev-request-error">
          <strong>ERROR:</strong>
          <pre className="dev-log-pre dev-stack">{error}</pre>
        </div>
      )}

      <div className="dev-no-logs" style={{ marginTop: '12px' }}>
        Dostępne tylko lokalnie (bare `next dev`) — zablokowane, gdy NODE_ENV=production (czyli na każdym
        środowisku Docker: local-mac-docker, QNAP TEST, QNAP PROD). Zmiana dotyczy całego procesu serwera, nie
        tylko tej karty przeglądarki.
      </div>
    </div>
  );
}

export function DevPanel() {
  const {
    isExpanded,
    activeTab,
    requests,
    errors,
    requestCount,
    errorCount,
    togglePanel,
    setTab,
    clearRequests,
    clearErrors,
  } = useDevPanelStore();

  const [expandedRequests, setExpandedRequests] = useState<Set<number>>(new Set());
  const [expandedErrors, setExpandedErrors] = useState<Set<number>>(new Set());

  const toggleRequestExpand = (id: number) => {
    setExpandedRequests(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleErrorExpand = (id: number) => {
    setExpandedErrors(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const formatDateTime = (date: Date) => {
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
      hour12: false
    });
  };

  const truncate = (str: string | undefined, maxLen: number) => {
    if (!str) return '';
    return str.length <= maxLen ? str : str.substring(0, maxLen) + '...';
  };

  const formatJson = (str: string | undefined) => {
    if (!str) return '';
    try {
      const parsed = JSON.parse(str);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return str;
    }
  };

  if (!isExpanded) {
    // Collapsed handle
    return (
      <div
        className="dev-panel-handle"
        onClick={togglePanel}
        title="Open Dev Panel"
      >
        <span className="dev-handle-icon">🔧</span>
        <span className="dev-handle-text">Dev</span>
        {(errorCount > 0) && (
          <span className="dev-handle-badge">{errorCount}</span>
        )}
      </div>
    );
  }

  // Expanded panel
  return (
    <div className="dev-panel-overlay">
      <div className="dev-panel-container">
        {/* Header */}
        <div className="dev-panel-header">
          <div className="dev-panel-header-left">
            <span className="dev-panel-title">🔧 Dev Panel</span>
            {errorCount > 0 && (
              <span className="dev-badge dev-badge-error">{errorCount}</span>
            )}
          </div>
          <div className="dev-panel-header-right">
            <button className="dev-btn" onClick={() => { clearRequests(); clearErrors(); }} title="Clear all">
              🗑️ Clear
            </button>
            <button className="dev-btn dev-btn-close" onClick={togglePanel} title="Close">
              ✕
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="dev-panel-tabs">
          <button
            className={`dev-tab ${activeTab === 'requests' ? 'active' : ''}`}
            onClick={() => setTab('requests')}
          >
            🌐 Requests {requestCount > 0 ? `(${requestCount})` : ''}
          </button>
          <button
            className={`dev-tab ${activeTab === 'errors' ? 'active' : ''}`}
            onClick={() => setTab('errors')}
          >
            ⚠️ Errors {errorCount > 0 ? `(${errorCount})` : ''}
          </button>
          <button
            className={`dev-tab ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setTab('settings')}
          >
            ⚙️ Settings
          </button>
        </div>

        {/* Content */}
        <div className="dev-panel-content">
          {activeTab === 'requests' && (
            <div className="dev-tab-section">
              <div className="dev-section-title">🌐 HTTP Requests</div>
              <div style={{ marginBottom: '12px' }}>
                <button className="dev-btn" onClick={clearRequests}>🗑️ Clear Requests</button>
              </div>
              
              {requests.length === 0 ? (
                <div className="dev-no-logs">No requests yet</div>
              ) : (
                requests.map((req) => (
                  <div key={req.id} className="dev-request-card">
                    <div className="dev-request-header">
                      <span className="dev-request-id">REQUEST #{req.id}</span>
                      <span className="dev-request-time">{formatDateTime(req.timestamp)}</span>
                      <span className="dev-request-duration">{req.durationMs} ms</span>
                    </div>
                    <div className="dev-request-method-url">
                      <span className="dev-request-method">{req.method}</span>
                      <span className="dev-request-url">{req.url}</span>
                    </div>
                    
                    {req.requestBody && (
                      <div className="dev-request-detail">
                        <strong>REQUEST BODY:</strong>
                        <pre className="dev-log-pre">{req.requestBody}</pre>
                      </div>
                    )}
                    
                    {req.error ? (
                      <div className="dev-request-detail dev-request-error">
                        <strong>ERROR:</strong>
                        <pre className="dev-log-pre dev-stack">{req.error}</pre>
                      </div>
                    ) : (
                      req.statusCode && (
                        <div className="dev-request-detail">
                          <strong>RESPONSE:</strong>
                          <span className="dev-request-status">
                            {req.statusCode} {req.statusText}
                          </span>
                          {req.responseBody && (
                            <div className="dev-response-body-container">
                              <pre className="dev-log-pre">
                                {expandedRequests.has(req.id) 
                                  ? formatJson(req.responseBody) 
                                  : truncate(formatJson(req.responseBody), 1000)}
                              </pre>
                              {req.responseBody.length > 1000 && (
                                <div className="dev-response-actions">
                                  <button 
                                    className="dev-btn dev-btn-toggle-full"
                                    onClick={() => toggleRequestExpand(req.id)}
                                  >
                                    {expandedRequests.has(req.id) ? 'Show less' : `Show full (${req.responseBody.length} chars)`}
                                  </button>
                                  <button 
                                    className="dev-btn dev-btn-toggle-full"
                                    onClick={() => {
                                      navigator.clipboard.writeText(formatJson(req.responseBody) || '');
                                    }}
                                  >
                                    Copy
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'errors' && (
            <div className="dev-tab-section">
              <div className="dev-section-title">⚠️ Errors</div>
              <div style={{ marginBottom: '12px' }}>
                <button className="dev-btn" onClick={clearErrors}>🗑️ Clear Errors</button>
              </div>
              
              {errors.length === 0 ? (
                <div className="dev-no-logs">No errors captured</div>
              ) : (
                errors.map((err) => (
                  <div key={err.id} className="dev-exception-card">
                    <div className="dev-exception-header">
                      <span className="dev-exception-id">
                        {err.source === 'Content Provider' || err.source === 'chad-dba' ? 'BACKEND ERROR' : 'ERROR'} #{err.id}
                      </span>
                      <span className="dev-exception-time">{formatDateTime(err.timestamp)}</span>
                    </div>
                    
                    <div className="dev-exception-source">
                      <strong>Source:</strong> {err.source}
                    </div>
                    
                    <div className="dev-exception-detail">
                      <strong>Message:</strong> {err.message}
                    </div>
                    
                    {err.stackTrace && (
                      <div className="dev-exception-detail">
                        <strong>Stack Trace:</strong>
                        <pre className="dev-log-pre dev-stack">
                          {truncate(err.stackTrace, 2000)}
                        </pre>
                      </div>
                    )}
                    
                    {err.context && (
                      <div className="dev-exception-detail">
                        <strong>Context:</strong>
                        <pre className="dev-log-pre">{err.context}</pre>
                      </div>
                    )}
                    
                    {err.rawError && expandedErrors.has(err.id) && (
                      <div className="dev-raw-details">
                        <div className="dev-error-subtitle">RAW DETAILS</div>
                        <pre className="dev-log-pre dev-raw-json">
                          {formatJson(err.rawError)}
                        </pre>
                      </div>
                    )}
                    
                    {err.rawError && (
                      <div className="dev-raw-details-toggle">
                        <button
                          className="dev-btn dev-btn-raw-toggle"
                          onClick={() => toggleErrorExpand(err.id)}
                        >
                          <span>{expandedErrors.has(err.id) ? '−' : '+'}</span>
                          {expandedErrors.has(err.id) ? ' Hide raw details' : ' Show raw details'}
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'settings' && <DevPanelSettingsTab />}
        </div>
      </div>
    </div>
  );
}