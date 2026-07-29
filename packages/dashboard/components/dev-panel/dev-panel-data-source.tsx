'use client';

import React, { useCallback, useEffect, useState } from 'react';

type ChadPostgresOption = 'Server PostgreSQL' | 'offline-readonly-backup';
type BeeperMongoOption = 'Server Mongo' | 'Local readonly backup';

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
  snapshotSource?: string;
  snapshotAge?: string | null;
  verificationStatus?: string;
  lastRefresh?: string;
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
        sourceHost?: string;
        sourceDatabase?: string;
        cpItemsCount?: number;
        verificationResult?: string;
      } | null;
      error?: string;
    };
  };
  beeper: {
    active: BeeperActiveView;
    changeOptions: {
      current: BeeperMongoOption;
      options: BeeperMongoOption[];
    };
    label: string;
    backend: string;
    source: string;
    status: string;
    hostPort: string;
    current: 'local' | 'qnap';
  };
}

function ActiveRow({ label, value, testIdPrefix }: { label: string; value: string | number | null | undefined; testIdPrefix: string }) {
  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '4px', fontSize: '12px' }}>
      <span style={{ minWidth: '140px', opacity: 0.75 }}>{label}:</span>
      <span data-testid={`${testIdPrefix}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>{value ?? '—'}</span>
    </div>
  );
}

/** Settings tab — ACTIVE / CHANGE OPTIONS for PostgreSQL and MongoDB. */
export function DevPanelDataSourceTab() {
  const [state, setState] = useState<DataSourceState | null>(null);
  const [selectedPostgres, setSelectedPostgres] = useState<ChadPostgresOption>('Server PostgreSQL');
  const [selectedMongo, setSelectedMongo] = useState<BeeperMongoOption>('Server Mongo');
  const [loading, setLoading] = useState(true);
  const [switchingPostgres, setSwitchingPostgres] = useState(false);
  const [switchingMongo, setSwitchingMongo] = useState(false);
  const [confirmOffline, setConfirmOffline] = useState(false);
  const [confirmMongoLocal, setConfirmMongoLocal] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setSelectedPostgres(data.changeOptions.current);
      setSelectedMongo(data.beeper?.changeOptions?.current ?? data.beeper?.source ?? 'Server Mongo');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reach server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const backupUnavailable = Boolean(
    selectedPostgres === 'offline-readonly-backup' && state && !state.changeOptions.offlineReadonlyBackup.available
  );

  async function handlePostgresSwitch() {
    if (!state || selectedPostgres === state.changeOptions.current) return;
    setSwitchingPostgres(true);
    setError(null);
    try {
      const res = await fetch('/api/dev-settings/db-source', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chadPostgres: selectedPostgres,
          confirmOfflineReadonly: selectedPostgres === 'offline-readonly-backup' ? confirmOffline : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        if (data.active) setState(data);
        return;
      }
      setState(data);
      setSelectedPostgres(data.changeOptions.current);
      setConfirmOffline(false);
      window.dispatchEvent(new Event('chad-data-source-changed'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Switch failed');
    } finally {
      setSwitchingPostgres(false);
    }
  }

  async function handleMongoSwitch() {
    if (!state || selectedMongo === state.beeper.changeOptions.current) return;
    setSwitchingMongo(true);
    setError(null);
    try {
      const res = await fetch('/api/dev-settings/db-source', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beeperMongo: selectedMongo }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        if (data.beeper) setState(data);
        return;
      }
      setState(data);
      setSelectedMongo(data.beeper.changeOptions.current);
      setConfirmMongoLocal(false);
      window.dispatchEvent(new Event('chad-data-source-changed'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Switch failed');
    } finally {
      setSwitchingMongo(false);
    }
  }

  const active = state?.active;
  const beeperActive = state?.beeper?.active;
  const backupMeta = state?.changeOptions.offlineReadonlyBackup.metadata;

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
              {active.snapshotDate && <ActiveRow testIdPrefix="dev-panel-active" label="Snapshot date" value={active.snapshotDate} />}
            </div>
          )}
        </div>

        <div className="dev-data-source-column" data-testid="dev-panel-change-options-column">
          <div className="dev-data-source-heading">CHANGE OPTIONS</div>
          <label htmlFor="dev-panel-chad-source-select" style={{ fontSize: '12px', display: 'block', marginBottom: '6px' }}>
            CHAD PostgreSQL source
          </label>
          <select
            id="dev-panel-chad-source-select"
            data-testid="dev-panel-chad-source-select"
            value={selectedPostgres}
            disabled={loading || switchingPostgres}
            onChange={(e) => {
              setSelectedPostgres(e.target.value as ChadPostgresOption);
              setConfirmOffline(false);
            }}
            style={{ width: '100%', marginBottom: '10px' }}
          >
            <option value="Server PostgreSQL">Server PostgreSQL</option>
            <option value="offline-readonly-backup">offline-readonly-backup</option>
          </select>

          {selectedPostgres === 'offline-readonly-backup' && (
            <div
              data-testid="dev-panel-offline-warning"
              style={{
                background: '#5c0000',
                border: '2px solid #ff5252',
                color: '#fff',
                padding: '12px',
                marginBottom: '10px',
                fontSize: '12px',
                lineHeight: 1.45,
              }}
            >
              <strong>OSTRZEŻENIE — AWARYJNY BACKUP TYLKO DO ODCZYTU</strong>
              <p style={{ margin: '8px 0' }}>
                Ta baza to lokalny snapshot tylko do odczytu. Przełączanie jest odradzane i powinno nastąpić
                wyłącznie gdy serwer lub sieć są niedostępne, a pilny dostęp do danych jest wymagany.
              </p>
              <p style={{ margin: '8px 0' }}>
                W tym trybie nie można tworzyć, edytować, usuwać, synchronizować, migrować ani wysyłać danych do
                Google Sheets. Snapshot może być starszy niż dane na serwerze.
              </p>
              {backupMeta ? (
                <ul style={{ margin: 0, paddingLeft: '18px' }}>
                  <li>Snapshot: {backupMeta.restoreTimestamp ?? '—'}</li>
                  <li>Source: {backupMeta.sourceHost}/{backupMeta.sourceDatabase}</li>
                  <li>cp_items: {backupMeta.cpItemsCount ?? '—'}</li>
                  <li>Verification: {backupMeta.verificationResult ?? '—'}</li>
                </ul>
              ) : (
                <p style={{ margin: '8px 0 0', color: '#ffcdd2' }}>
                  {state?.changeOptions.offlineReadonlyBackup.error ?? 'Brak snapshotu — uruchom refresh-from-server.sh'}
                </p>
              )}
              <label style={{ display: 'flex', gap: '8px', marginTop: '10px', alignItems: 'flex-start' }}>
                <input
                  type="checkbox"
                  data-testid="dev-panel-offline-confirm"
                  checked={confirmOffline}
                  disabled={backupUnavailable}
                  onChange={(e) => setConfirmOffline(e.target.checked)}
                />
                <span>Rozumiem, że to tryb tylko do odczytu i dane mogą być nieaktualne</span>
              </label>
            </div>
          )}

          <button
            type="button"
            className="dev-btn"
            data-testid="dev-panel-switch-button"
            disabled={
              loading ||
              switchingPostgres ||
              !state ||
              selectedPostgres === state.changeOptions.current ||
              backupUnavailable ||
              (selectedPostgres === 'offline-readonly-backup' && !confirmOffline)
            }
            onClick={handlePostgresSwitch}
          >
            {switchingPostgres ? 'Switching…' : 'Switch'}
          </button>
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
            </div>
          )}
        </div>

        <div className="dev-data-source-column" data-testid="dev-panel-mongo-change-options-column">
          <div className="dev-data-source-heading">CHANGE OPTIONS</div>
          <label htmlFor="dev-panel-mongo-source-select" style={{ fontSize: '12px', display: 'block', marginBottom: '6px' }}>
            Beeper MongoDB source
          </label>
          <select
            id="dev-panel-mongo-source-select"
            data-testid="dev-panel-mongo-source-select"
            value={selectedMongo}
            disabled={loading || switchingMongo}
            onChange={(e) => {
              setSelectedMongo(e.target.value as BeeperMongoOption);
              setConfirmMongoLocal(false);
            }}
            style={{ width: '100%', marginBottom: '10px' }}
          >
            <option value="Server Mongo">Server Mongo</option>
            <option value="Local readonly backup">Local readonly backup</option>
          </select>

          {selectedMongo === 'Local readonly backup' && (
            <div
              data-testid="dev-panel-mongo-local-warning"
              style={{
                background: '#5c0000',
                border: '2px solid #ff5252',
                color: '#fff',
                padding: '12px',
                marginBottom: '10px',
                fontSize: '12px',
                lineHeight: 1.45,
              }}
            >
              <strong>OSTRZEŻENIE — LOKALNY BACKUP MONGO TYLKO DO ODCZYTU</strong>
              <p style={{ margin: '8px 0' }}>
                Local readonly backup to offline snapshot Beeper CRM. Wszystkie zapisy (edycja kontaktów, tagi,
                merge, eventy) są zablokowane. Używaj tylko gdy Server Mongo jest niedostępny.
              </p>
              <label style={{ display: 'flex', gap: '8px', marginTop: '10px', alignItems: 'flex-start' }}>
                <input
                  type="checkbox"
                  data-testid="dev-panel-mongo-local-confirm"
                  checked={confirmMongoLocal}
                  onChange={(e) => setConfirmMongoLocal(e.target.checked)}
                />
                <span>Rozumiem, że to tryb tylko do odczytu</span>
              </label>
            </div>
          )}

          <button
            type="button"
            className="dev-btn"
            data-testid="dev-panel-mongo-switch-button"
            disabled={
              loading ||
              switchingMongo ||
              !state ||
              selectedMongo === state.beeper.changeOptions.current ||
              (selectedMongo === 'Local readonly backup' && !confirmMongoLocal)
            }
            onClick={handleMongoSwitch}
          >
            {switchingMongo ? 'Switching…' : 'Switch'}
          </button>
        </div>
      </div>

      {error && (
        <div className="dev-request-detail dev-request-error" style={{ marginTop: '12px' }}>
          <strong>ERROR:</strong>
          <pre className="dev-log-pre dev-stack">{error}</pre>
        </div>
      )}
    </div>
  );
}
