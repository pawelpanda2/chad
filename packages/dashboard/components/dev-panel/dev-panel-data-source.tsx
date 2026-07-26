'use client';

import React, { useCallback, useEffect, useState } from 'react';

type ChadPostgresOption = 'Server PostgreSQL' | 'offline-readonly-backup';

interface ActiveView {
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

interface DataSourceState {
  active: ActiveView;
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
    label: string;
    backend: string;
    source: string;
    status: string;
    hostPort: string;
    current: 'local' | 'qnap';
  };
}

function ActiveRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '4px', fontSize: '12px' }}>
      <span style={{ minWidth: '140px', opacity: 0.75 }}>{label}:</span>
      <span data-testid={`dev-panel-active-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>{value ?? '—'}</span>
    </div>
  );
}

/** Settings tab — ACTIVE / CHANGE OPTIONS two-column data source panel. */
export function DevPanelDataSourceTab() {
  const [state, setState] = useState<DataSourceState | null>(null);
  const [selected, setSelected] = useState<ChadPostgresOption>('Server PostgreSQL');
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [confirmOffline, setConfirmOffline] = useState(false);
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
      setSelected(data.changeOptions.current);
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
    selected === 'offline-readonly-backup' && state && !state.changeOptions.offlineReadonlyBackup.available
  );

  async function handleSwitch() {
    if (!state || selected === state.changeOptions.current) return;
    setSwitching(true);
    setError(null);
    try {
      const res = await fetch('/api/dev-settings/db-source', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chadPostgres: selected,
          confirmOfflineReadonly: selected === 'offline-readonly-backup' ? confirmOffline : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        if (data.active) setState(data);
        return;
      }
      setState(data);
      setSelected(data.changeOptions.current);
      setConfirmOffline(false);
      window.dispatchEvent(new Event('chad-data-source-changed'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Switch failed');
    } finally {
      setSwitching(false);
    }
  }

  const active = state?.active;
  const backupMeta = state?.changeOptions.offlineReadonlyBackup.metadata;

  return (
    <div className="dev-tab-section">
      <div className="dev-section-title">⚙️ Settings — CHAD data source</div>

      <div className="dev-data-source-grid" data-testid="dev-panel-data-source-grid">
        <div className="dev-data-source-column" data-testid="dev-panel-active-column">
          <div className="dev-data-source-heading">ACTIVE</div>
          {loading && <div className="dev-no-logs">Ładowanie…</div>}
          {!loading && active && (
            <div data-testid="dev-panel-active-status">
              <ActiveRow label="CHAD data source" value={active.chadDataSource} />
              <ActiveRow label="Mode" value={active.mode} />
              <ActiveRow label="Environment" value={active.environment} />
              <ActiveRow label="Backend" value={active.backend} />
              <ActiveRow label="Host" value={active.host} />
              <ActiveRow label="Port" value={active.port} />
              <ActiveRow label="Database" value={active.database} />
              <ActiveRow label="Read access" value={active.readAccess} />
              <ActiveRow label="Write access" value={active.writeAccess} />
              <ActiveRow label="Connection status" value={active.connectionStatus} />
              <ActiveRow label="cp_items count" value={active.cpItemsCount} />
              <ActiveRow label="Last checked" value={active.lastChecked} />
              {active.snapshotDate && <ActiveRow label="Snapshot date" value={active.snapshotDate} />}
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
            value={selected}
            disabled={loading || switching}
            onChange={(e) => {
              setSelected(e.target.value as ChadPostgresOption);
              setConfirmOffline(false);
            }}
            style={{ width: '100%', marginBottom: '10px' }}
          >
            <option value="Server PostgreSQL">Server PostgreSQL</option>
            <option value="offline-readonly-backup">offline-readonly-backup</option>
          </select>

          {selected === 'offline-readonly-backup' && (
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
              switching ||
              !state ||
              selected === state.changeOptions.current ||
              backupUnavailable ||
              (selected === 'offline-readonly-backup' && !confirmOffline)
            }
            onClick={handleSwitch}
          >
            {switching ? 'Switching…' : 'Switch'}
          </button>
        </div>
      </div>

      {state?.beeper && (
        <div style={{ marginTop: '20px', paddingTop: '12px', borderTop: '1px solid #3e3e42' }} data-testid="dev-panel-beeper-info">
          <div style={{ fontWeight: 600, marginBottom: '6px' }}>{state.beeper.label}</div>
          <ActiveRow label="Backend" value={state.beeper.backend} />
          <ActiveRow label="Source" value={state.beeper.source} />
          <ActiveRow label="Status" value={state.beeper.status} />
          <ActiveRow label="Host" value={state.beeper.hostPort} />
          <p style={{ fontSize: '11px', opacity: 0.75, marginTop: '8px' }}>
            Beeper CRM nie jest źródłem danych CHAD — tylko informacja.
          </p>
        </div>
      )}

      {error && (
        <div className="dev-request-detail dev-request-error" style={{ marginTop: '12px' }}>
          <strong>ERROR:</strong>
          <pre className="dev-log-pre dev-stack">{error}</pre>
        </div>
      )}
    </div>
  );
}
