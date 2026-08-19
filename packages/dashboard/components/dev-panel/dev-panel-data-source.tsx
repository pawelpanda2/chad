'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useDebugSettings } from '@/lib/dev-panel/use-debug-settings';
import { useIsLocalRuntime } from '@/lib/dev-panel/use-is-local-runtime';
import { formatNavigationHistorySnapshot } from '@/lib/dev-panel/format-navigation-history';
import { getActiveNavigationHistorySnapshot, clearActiveNavigationHistory } from '@/components/shared/dashboard-history-provider';

type ChadPostgresOption = 'Server PostgreSQL' | 'Offline backup — read only';
type BeeperMongoOption = 'Server Mongo' | 'Local Mongo';

interface PostgresActiveView {
  chadDataSource: string;
  mode: string;
  environment: string;
  backend: string;
  host: string;
  port: string;
  database: string;
  readAccess: string;
  writeAccess: string;
  connectionStatus: string;
  cpItemsCount: number | null;
  lastChecked: string;
  snapshotDate?: string;
  snapshotAge?: string | null;
  verificationStatus?: string;
}

interface BeeperLocalMirrorStatus {
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  age: string | null;
  result: string;
  lastError?: string;
}

interface BeeperActiveView {
  beeperDataSource: string;
  mode: string;
  environment: string;
  backend: string;
  host: string;
  port: string;
  database: string;
  readAccess: string;
  writeAccess: string;
  connectionStatus: string;
  contactsCount: number | null;
  messagesCount: number | null;
  lastChecked: string;
  localMirror: BeeperLocalMirrorStatus;
}

interface DataSourceState {
  active: PostgresActiveView;
  changeOptions: {
    current: ChadPostgresOption;
    options: ChadPostgresOption[];
    offlineReadonlyBackup: {
      available: boolean;
      metadata: {
        restoreTimestamp?: string;
        verificationResult?: string;
      } | null;
      age?: string | null;
      error?: string;
    };
  };
  beeper: {
    active: BeeperActiveView;
    changeOptions: {
      current: BeeperMongoOption;
      options: BeeperMongoOption[];
      localMirror: {
        available: boolean;
        status: BeeperLocalMirrorStatus;
        error?: string;
      };
    };
  };
}

function ActiveRow({
  label,
  value,
  testIdPrefix,
}: {
  label: string;
  value: string | number | null | undefined;
  testIdPrefix: string;
}) {
  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '4px', fontSize: '12px' }}>
      <span style={{ minWidth: '140px', opacity: 0.75 }}>{label}:</span>
      <span data-testid={`${testIdPrefix}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>{value ?? '—'}</span>
    </div>
  );
}

function RadioOption({
  name,
  value,
  checked,
  disabled,
  label,
  testId,
  onChange,
}: {
  name: string;
  value: string;
  checked: boolean;
  disabled?: boolean;
  label: string;
  testId: string;
  onChange: () => void;
}) {
  return (
    <label
      className="dev-radio-row"
      data-testid={testId}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 4px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '12px',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        style={{ cursor: disabled ? 'not-allowed' : 'pointer', accentColor: '#007acc' }}
      />
      <span>{label}</span>
    </label>
  );
}

type SettingsSubTab = 'databases' | 'debug';

/**
 * Dev Panel → Settings — Story 126 split this into `Databases` (everything
 * below, unchanged behavior/persistence/source-of-truth) and `Debug` (new —
 * currently just the history-debug-combobox visibility toggle).
 */
export function DevPanelDataSourceTab() {
  const [subTab, setSubTab] = useState<SettingsSubTab>('databases');

  return (
    <div>
      <div className="dev-panel-tabs" style={{ marginBottom: '8px' }}>
        <button
          type="button"
          className={`dev-tab ${subTab === 'databases' ? 'active' : ''}`}
          onClick={() => setSubTab('databases')}
          data-testid="dev-panel-settings-subtab-databases"
        >
          Databases
        </button>
        <button
          type="button"
          className={`dev-tab ${subTab === 'debug' ? 'active' : ''}`}
          onClick={() => setSubTab('debug')}
          data-testid="dev-panel-settings-subtab-debug"
        >
          Debug
        </button>
      </div>
      {subTab === 'databases' && <DevPanelDatabasesTab />}
      {subTab === 'debug' && <DevPanelDebugTab />}
    </div>
  );
}

/**
 * `Debug` sub-tab — Story 126's combobox-visibility toggle, plus Story 127's
 * Copy (clipboard snapshot of the exact stack `↶`/`↷`/the combobox use) and
 * Clear (resets that stack to just the current page — never touches `←`,
 * which is a separate stateless resolver, see `lib/dashboard-hierarchy.ts`).
 * Copy/Clear read the live stack via `dashboard-history-provider.tsx`'s
 * module bridge (Dev Panel mounts outside `DashboardHistoryProvider`'s own
 * tree, so it can't use the `useDashboardHistory()` hook directly).
 */
function DevPanelDebugTab() {
  const [settings, setSettings] = useDebugSettings();
  const isLocal = useIsLocalRuntime();
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const handleCopy = useCallback(async () => {
    const snapshot = getActiveNavigationHistorySnapshot();
    if (!snapshot) {
      setCopyFeedback('No active page');
    } else {
      try {
        await navigator.clipboard.writeText(formatNavigationHistorySnapshot(snapshot));
        setCopyFeedback('Copied!');
      } catch {
        setCopyFeedback('Copy failed');
      }
    }
    setTimeout(() => setCopyFeedback(null), 1500);
  }, []);

  const handleClear = useCallback(() => {
    clearActiveNavigationHistory();
  }, []);

  return (
    <div className="dev-tab-section">
      <div className="dev-section-title">🐞 Settings — debug</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <label
          className="dev-radio-row"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 4px', cursor: 'pointer', fontSize: '12px' }}
        >
          <input
            type="checkbox"
            checked={settings.navigationHistoryVisible}
            onChange={(e) => setSettings({ ...settings, navigationHistoryVisible: e.target.checked })}
            data-testid="dev-panel-debug-nav-history-toggle"
            style={{ cursor: 'pointer', accentColor: '#007acc' }}
          />
          <span>Show navigation history debug combobox</span>
        </label>
        <button
          type="button"
          className="dev-btn"
          onClick={handleCopy}
          title="Copy the exact ↶/↷ navigation history to clipboard"
          data-testid="dev-panel-debug-nav-history-copy"
        >
          {copyFeedback ?? 'Copy'}
        </button>
        <button
          type="button"
          className="dev-btn"
          onClick={handleClear}
          disabled={!isLocal}
          title={isLocal ? 'Reset ↶/↷ navigation history to just the current page' : 'LOCAL only'}
          data-testid="dev-panel-debug-nav-history-clear"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

/** `Databases` sub-tab — ACTIVE / CHANGE OPTIONS with native radio groups (unchanged, Story 126 only relocated this under a sub-tab). */
function DevPanelDatabasesTab() {
  const [state, setState] = useState<DataSourceState | null>(null);
  const [selectedPostgres, setSelectedPostgres] = useState<ChadPostgresOption>('Server PostgreSQL');
  const [selectedMongo, setSelectedMongo] = useState<BeeperMongoOption>('Server Mongo');
  const [loading, setLoading] = useState(true);
  const [switchingPostgres, setSwitchingPostgres] = useState(false);
  const [switchingMongo, setSwitchingMongo] = useState(false);
  const [confirmOffline, setConfirmOffline] = useState(false);
  const [postgresError, setPostgresError] = useState<string | null>(null);
  const [mongoError, setMongoError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setPostgresError(null);
    setMongoError(null);
    try {
      const res = await fetch('/api/dev-settings/db-source', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) {
        setPostgresError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      setState(data);
      setSelectedPostgres(data.changeOptions.current);
      setSelectedMongo(data.beeper?.changeOptions?.current ?? 'Server Mongo');
    } catch (err) {
      setPostgresError(err instanceof Error ? err.message : 'Failed to reach server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const backupUnavailable = Boolean(
    selectedPostgres === 'Offline backup — read only' &&
      state &&
      !state.changeOptions.offlineReadonlyBackup.available
  );

  async function handlePostgresApply() {
    if (!state || selectedPostgres === state.changeOptions.current) return;
    setSwitchingPostgres(true);
    setPostgresError(null);
    try {
      const res = await fetch('/api/dev-settings/db-source', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chadPostgres: selectedPostgres,
          confirmOfflineReadonly:
            selectedPostgres === 'Offline backup — read only' ? confirmOffline : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPostgresError(data.error ?? `Request failed (${res.status})`);
        if (data.active) setState((prev) => ({ ...prev!, ...data }));
        return;
      }
      setState(data);
      setSelectedPostgres(data.changeOptions.current);
      setConfirmOffline(false);
      window.dispatchEvent(new Event('chad-data-source-changed'));
    } catch (err) {
      setPostgresError(err instanceof Error ? err.message : 'Switch failed');
    } finally {
      setSwitchingPostgres(false);
    }
  }

  async function handleMongoApply() {
    if (!state || selectedMongo === state.beeper.changeOptions.current) return;
    setSwitchingMongo(true);
    setMongoError(null);
    try {
      const res = await fetch('/api/dev-settings/db-source', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beeperMongo: selectedMongo }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMongoError(data.error ?? `Request failed (${res.status})`);
        if (data.beeper) setState((prev) => ({ ...prev!, ...data }));
        return;
      }
      setState(data);
      setSelectedMongo(data.beeper.changeOptions.current);
      window.dispatchEvent(new Event('chad-data-source-changed'));
    } catch (err) {
      setMongoError(err instanceof Error ? err.message : 'Switch failed');
    } finally {
      setSwitchingMongo(false);
    }
  }

  const active = state?.active;
  const beeperActive = state?.beeper?.active;
  const backupMeta = state?.changeOptions.offlineReadonlyBackup.metadata;
  const backupAge = state?.changeOptions.offlineReadonlyBackup.age;

  return (
    <div className="dev-tab-section">
      <div className="dev-section-title">⚙️ Settings — data sources</div>

      <div className="dev-section-subtitle" style={{ marginBottom: '8px', fontSize: '13px', fontWeight: 600 }}>
        PostgreSQL (CHAD)
      </div>
      <div className="dev-data-source-grid" data-testid="dev-panel-data-source-grid">
        <div className="dev-data-source-column" data-testid="dev-panel-active-column">
          <div className="dev-data-source-heading">ACTIVE</div>
          {loading && <div className="dev-no-logs">Ładowanie…</div>}
          {!loading && active && (
            <div data-testid="dev-panel-active-status">
              <ActiveRow testIdPrefix="dev-panel-active" label="CHAD data source" value={active.chadDataSource} />
              <ActiveRow testIdPrefix="dev-panel-active" label="Mode" value={active.mode} />
              <ActiveRow testIdPrefix="dev-panel-active" label="Environment" value={active.environment} />
              <ActiveRow testIdPrefix="dev-panel-active" label="Backend" value={active.backend} />
              <ActiveRow testIdPrefix="dev-panel-active" label="Host" value={active.host} />
              <ActiveRow testIdPrefix="dev-panel-active" label="Port" value={active.port} />
              <ActiveRow testIdPrefix="dev-panel-active" label="Database" value={active.database} />
              <ActiveRow testIdPrefix="dev-panel-active" label="Read access" value={active.readAccess} />
              <ActiveRow testIdPrefix="dev-panel-active" label="Write access" value={active.writeAccess} />
              <ActiveRow testIdPrefix="dev-panel-active" label="Connection status" value={active.connectionStatus} />
              <ActiveRow testIdPrefix="dev-panel-active" label="cp_items count" value={active.cpItemsCount} />
              <ActiveRow testIdPrefix="dev-panel-active" label="Last checked" value={active.lastChecked} />
              {active.snapshotDate && (
                <ActiveRow testIdPrefix="dev-panel-active" label="Snapshot date" value={active.snapshotDate} />
              )}
            </div>
          )}
        </div>

        <div className="dev-data-source-column" data-testid="dev-panel-change-options-column">
          <div className="dev-data-source-heading">CHANGE OPTIONS</div>
          <fieldset
            disabled={loading || switchingPostgres}
            style={{ border: 'none', margin: 0, padding: 0 }}
            data-testid="dev-panel-chad-postgres-fieldset"
          >
            <legend style={{ fontSize: '12px', marginBottom: '6px', padding: 0 }}>CHAD PostgreSQL source</legend>
            <RadioOption
              name="chad-postgres-source"
              value="server"
              checked={selectedPostgres === 'Server PostgreSQL'}
              disabled={loading || switchingPostgres}
              label="Server PostgreSQL"
              testId="dev-panel-radio-postgres-server"
              onChange={() => {
                setSelectedPostgres('Server PostgreSQL');
                setConfirmOffline(false);
              }}
            />
            <RadioOption
              name="chad-postgres-source"
              value="offline-readonly-backup"
              checked={selectedPostgres === 'Offline backup — read only'}
              disabled={loading || switchingPostgres}
              label="Offline backup — read only"
              testId="dev-panel-radio-postgres-offline"
              onChange={() => setSelectedPostgres('Offline backup — read only')}
            />
          </fieldset>

          {selectedPostgres === 'Offline backup — read only' && (
            <div
              data-testid="dev-panel-offline-warning"
              style={{
                background: '#5c0000',
                border: '1px solid #ff5252',
                color: '#fff',
                padding: '8px',
                margin: '8px 0',
                fontSize: '11px',
                lineHeight: 1.35,
              }}
            >
              <div>Tryb awaryjny: tylko odczyt.</div>
              <div>Dane mogą być nieaktualne. Zapisy i synchronizacja są wyłączone.</div>
              {backupMeta ? (
                <div style={{ marginTop: '6px', opacity: 0.9 }}>
                  <div>Snapshot: {backupMeta.restoreTimestamp ?? '—'}</div>
                  <div>Age: {backupAge ?? '—'}</div>
                  <div>Status: {backupMeta.verificationResult ?? '—'}</div>
                </div>
              ) : (
                <div style={{ marginTop: '6px', color: '#ffcdd2' }}>
                  {state?.changeOptions.offlineReadonlyBackup.error ?? 'Brak snapshotu'}
                </div>
              )}
              <label
                style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'flex-start', cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  data-testid="dev-panel-offline-confirm"
                  checked={confirmOffline}
                  disabled={backupUnavailable || switchingPostgres}
                  onChange={(e) => setConfirmOffline(e.target.checked)}
                />
                <span>Rozumiem — włącz tryb tylko do odczytu</span>
              </label>
            </div>
          )}

          <button
            type="button"
            className="dev-btn"
            data-testid="dev-panel-apply-postgres"
            disabled={
              loading ||
              switchingPostgres ||
              !state ||
              selectedPostgres === state.changeOptions.current ||
              backupUnavailable ||
              (selectedPostgres === 'Offline backup — read only' && !confirmOffline)
            }
            onClick={handlePostgresApply}
          >
            {switchingPostgres ? 'Applying…' : 'Apply PostgreSQL source'}
          </button>
          {postgresError && (
            <div className="dev-request-detail dev-request-error" style={{ marginTop: '8px' }} data-testid="dev-panel-postgres-error">
              <strong>ERROR:</strong>
              <pre className="dev-log-pre dev-stack">{postgresError}</pre>
            </div>
          )}
        </div>
      </div>

      <div
        className="dev-section-subtitle"
        style={{ marginTop: '24px', marginBottom: '8px', fontSize: '13px', fontWeight: 600 }}
        data-testid="dev-panel-mongo-section-title"
      >
        MongoDB (Beeper CRM)
      </div>
      <div className="dev-data-source-grid" data-testid="dev-panel-mongo-data-source-grid">
        <div className="dev-data-source-column" data-testid="dev-panel-mongo-active-column">
          <div className="dev-data-source-heading">ACTIVE</div>
          {loading && <div className="dev-no-logs">Ładowanie…</div>}
          {!loading && beeperActive && (
            <div data-testid="dev-panel-mongo-active-status">
              <ActiveRow testIdPrefix="dev-panel-mongo-active" label="Beeper data source" value={beeperActive.beeperDataSource} />
              <ActiveRow testIdPrefix="dev-panel-mongo-active" label="Mode" value={beeperActive.mode} />
              <ActiveRow testIdPrefix="dev-panel-mongo-active" label="Environment" value={beeperActive.environment} />
              <ActiveRow testIdPrefix="dev-panel-mongo-active" label="Backend" value={beeperActive.backend} />
              <ActiveRow testIdPrefix="dev-panel-mongo-active" label="Host" value={beeperActive.host} />
              <ActiveRow testIdPrefix="dev-panel-mongo-active" label="Port" value={beeperActive.port} />
              <ActiveRow testIdPrefix="dev-panel-mongo-active" label="Database" value={beeperActive.database} />
              <ActiveRow testIdPrefix="dev-panel-mongo-active" label="Read access" value={beeperActive.readAccess} />
              <ActiveRow testIdPrefix="dev-panel-mongo-active" label="Write access" value={beeperActive.writeAccess} />
              <ActiveRow testIdPrefix="dev-panel-mongo-active" label="Connection status" value={beeperActive.connectionStatus} />
              <ActiveRow testIdPrefix="dev-panel-mongo-active" label="contacts count" value={beeperActive.contactsCount} />
              <ActiveRow testIdPrefix="dev-panel-mongo-active" label="messages count" value={beeperActive.messagesCount} />
              <ActiveRow testIdPrefix="dev-panel-mongo-active" label="Last checked" value={beeperActive.lastChecked} />
              <ActiveRow
                testIdPrefix="dev-panel-mongo-active"
                label="local mirror last successful sync"
                value={beeperActive.localMirror.lastSuccessAt}
              />
              <ActiveRow
                testIdPrefix="dev-panel-mongo-active"
                label="local mirror age/status"
                value={
                  beeperActive.localMirror.result === 'never run'
                    ? 'never run'
                    : `${beeperActive.localMirror.age ?? '—'} / ${beeperActive.localMirror.result}`
                }
              />
            </div>
          )}
        </div>

        <div className="dev-data-source-column" data-testid="dev-panel-mongo-change-options-column">
          <div className="dev-data-source-heading">CHANGE OPTIONS</div>
          <fieldset
            disabled={loading || switchingMongo}
            style={{ border: 'none', margin: 0, padding: 0 }}
            data-testid="dev-panel-beeper-mongo-fieldset"
          >
            <legend style={{ fontSize: '12px', marginBottom: '6px', padding: 0 }}>Beeper Mongo source</legend>
            <RadioOption
              name="beeper-mongo-source"
              value="qnap"
              checked={selectedMongo === 'Server Mongo'}
              disabled={loading || switchingMongo}
              label="Server Mongo"
              testId="dev-panel-radio-mongo-server"
              onChange={() => setSelectedMongo('Server Mongo')}
            />
            <RadioOption
              name="beeper-mongo-source"
              value="local"
              checked={selectedMongo === 'Local Mongo'}
              disabled={loading || switchingMongo}
              label="Local Mongo — read only"
              testId="dev-panel-radio-mongo-local"
              onChange={() => setSelectedMongo('Local Mongo')}
            />
          </fieldset>

          {selectedMongo === 'Local Mongo' && (
            <div
              data-testid="dev-panel-mongo-local-warning"
              style={{
                background: '#5c0000',
                border: '1px solid #ff5252',
                color: '#fff',
                padding: '8px',
                margin: '8px 0',
                fontSize: '11px',
                lineHeight: 1.35,
              }}
            >
              <div>Tryb awaryjny: tylko odczyt.</div>
              <div>Dane mogą być nieaktualne. Zapisy są zablokowane.</div>
              {state?.beeper.changeOptions.localMirror.available ? (
                <div style={{ marginTop: '6px', opacity: 0.9 }}>
                  <div>Last successful sync: {state.beeper.changeOptions.localMirror.status.lastSuccessAt ?? '—'}</div>
                  <div>Age: {state.beeper.changeOptions.localMirror.status.age ?? '—'}</div>
                </div>
              ) : (
                <div style={{ marginTop: '6px', color: '#ffcdd2' }}>
                  {state?.beeper.changeOptions.localMirror.error ?? 'Local mirror not available'}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            className="dev-btn"
            data-testid="dev-panel-apply-mongo"
            style={{ marginTop: '10px' }}
            disabled={
              loading ||
              switchingMongo ||
              !state ||
              selectedMongo === state.beeper.changeOptions.current ||
              (selectedMongo === 'Local Mongo' && !state.beeper.changeOptions.localMirror.available)
            }
            onClick={handleMongoApply}
          >
            {switchingMongo ? 'Applying…' : 'Apply Mongo source'}
          </button>
          {mongoError && (
            <div className="dev-request-detail dev-request-error" style={{ marginTop: '8px' }} data-testid="dev-panel-mongo-error">
              <strong>ERROR:</strong>
              <pre className="dev-log-pre dev-stack">{mongoError}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
