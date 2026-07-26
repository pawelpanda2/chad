'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useDevPanelStore } from '@/lib/dev-panel/dev-panel-store';

type DbSource = 'local' | 'qnap';

interface SourceState {
  current: DbSource;
  target: { source: DbSource; hostPort: string; error?: string };
  probe?: { ok: boolean; itemCount?: number; error?: string };
}

interface DbSourceState {
  postgres: SourceState;
  mongo: SourceState;
}

function SourceToggle({
  id,
  value,
  disabled,
  onChange,
  localLabel,
  serverLabel,
}: {
  id: string;
  value: DbSource;
  disabled: boolean;
  onChange: (next: DbSource) => void;
  localLabel: string;
  serverLabel: string;
}) {
  return (
    <div
      id={id}
      role="group"
      aria-label={id}
      style={{ display: 'inline-flex', gap: '4px', flexWrap: 'wrap' }}
    >
      <button
        type="button"
        className={`dev-btn ${value === 'local' ? 'dev-btn-source-active' : ''}`}
        disabled={disabled}
        aria-pressed={value === 'local'}
        data-testid={`${id}-local`}
        onClick={() => onChange('local')}
      >
        {localLabel}
      </button>
      <button
        type="button"
        className={`dev-btn ${value === 'qnap' ? 'dev-btn-source-active' : ''}`}
        disabled={disabled}
        aria-pressed={value === 'qnap'}
        data-testid={`${id}-qnap`}
        onClick={() => onChange('qnap')}
      >
        {serverLabel}
      </button>
    </div>
  );
}

/** Settings tab: Local vs Server (QNAP) for Postgres + Beeper Mongo. */
function DevPanelSettingsTab() {
  const [state, setState] = useState<DbSourceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<'postgres' | 'mongo' | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dev-settings/db-source', { credentials: 'include' });
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

  async function handleChange(kind: 'postgres' | 'mongo', source: DbSource) {
    if (!state || state[kind].current === source) return;

    // Optimistic UI — controlled <select> used to snap back to the old value
    // for the whole probe round-trip, which looked like "combobox broken".
    const previous = state;
    setState({
      ...state,
      [kind]: {
        ...state[kind],
        current: source,
        target: { ...state[kind].target, source, hostPort: '…' },
        probe: undefined,
      },
    });
    setSwitching(kind);
    setError(null);
    setSyncResult(null);

    try {
      const res = await fetch('/api/dev-settings/db-source', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [kind]: source }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        if (data.postgres || data.mongo) setState(data);
        else setState(previous);
        return;
      }
      setState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reach server');
      setState(previous);
    } finally {
      setSwitching(null);
    }
  }

  async function handleSyncFromQnap() {
    setSyncing(true);
    setError(null);
    setSyncResult(null);
    try {
      const res = await fetch('/api/dev-settings/sync-local-postgres', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? `Sync failed (${res.status})`);
        return;
      }
      setSyncResult(
        `Synced ${data.itemsCopied} items + ${data.historyCopied} history rows\n` +
          `${data.sourceHostPort} → ${data.destHostPort}\n` +
          `at ${data.syncedAt}`
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  const busy = switching !== null || syncing;
  const postgresValue = state?.postgres.current ?? 'local';
  const mongoValue = state?.mongo.current ?? 'local';

  return (
    <div className="dev-tab-section">
      <div className="dev-section-title">⚙️ Settings</div>

      <p style={{ fontSize: '12px', opacity: 0.85, marginBottom: '12px' }}>
        Postgres = Folders / History / login. Mongo = Beeper CRM.
        Local = mirror volume; Server = QNAP over Tailscale.
      </p>

      <div style={{ marginBottom: '16px' }}>
        <div style={{ marginBottom: '4px', fontWeight: 600 }}>Postgres (CHAD)</div>
        <SourceToggle
          id="dev-panel-postgres-source"
          value={postgresValue}
          disabled={loading || !state || busy}
          onChange={(next) => handleChange('postgres', next)}
          localLabel="Local"
          serverLabel="Server (QNAP)"
        />
        {switching === 'postgres' && <span style={{ marginLeft: '8px' }}>Przełączanie…</span>}
        {!loading && state && (
          <pre className="dev-log-pre" style={{ marginTop: '6px' }} data-testid="dev-panel-postgres-status">
            {state.postgres.current === 'qnap' ? 'Server Postgres (QNAP)' : 'Local Postgres (mirror)'}
            {'\n'}host:port = {state.postgres.target.hostPort}
            {state.postgres.target.error ? `\n(błąd URI: ${state.postgres.target.error})` : ''}
            {state.postgres.probe
              ? state.postgres.probe.ok
                ? `\nprobe OK — cp_items=${state.postgres.probe.itemCount}`
                : `\nprobe FAIL — ${state.postgres.probe.error}`
              : ''}
          </pre>
        )}
        <div style={{ marginTop: '8px' }}>
          <button
            type="button"
            className="dev-btn"
            disabled={loading || busy}
            onClick={handleSyncFromQnap}
          >
            {syncing ? 'Syncing QNAP → local…' : 'Sync local Postgres from QNAP'}
          </button>
        </div>
        {syncResult && (
          <pre className="dev-log-pre" style={{ marginTop: '6px' }}>
            {syncResult}
          </pre>
        )}
      </div>

      <div style={{ marginBottom: '12px' }}>
        <div style={{ marginBottom: '4px', fontWeight: 600 }}>Mongo (Beeper)</div>
        <SourceToggle
          id="dev-panel-mongo-source"
          value={mongoValue}
          disabled={loading || !state || busy}
          onChange={(next) => handleChange('mongo', next)}
          localLabel="Local"
          serverLabel="Server (QNAP)"
        />
        {switching === 'mongo' && <span style={{ marginLeft: '8px' }}>Przełączanie…</span>}
        {!loading && state && (
          <pre className="dev-log-pre" style={{ marginTop: '6px' }} data-testid="dev-panel-mongo-status">
            {state.mongo.current === 'qnap' ? 'Server Mongo (QNAP)' : 'Local Mongo'}
            {'\n'}host:port = {state.mongo.target.hostPort}
            {state.mongo.target.error ? `\n(błąd: ${state.mongo.target.error})` : ''}
          </pre>
        )}
      </div>

      {loading && <div className="dev-no-logs">Ładowanie…</div>}

      {error && (
        <div className="dev-request-detail dev-request-error">
          <strong>ERROR:</strong>
          <pre className="dev-log-pre dev-stack">{error}</pre>
        </div>
      )}

      <div className="dev-no-logs" style={{ marginTop: '12px' }}>
        Local only. Preference: `/app/data/dev-db-source.json`. After switching,
        next API calls use the new DB (no full page reload required).
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