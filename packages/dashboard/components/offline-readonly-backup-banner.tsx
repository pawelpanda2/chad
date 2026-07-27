'use client';

import { useEffect, useState } from 'react';

export function OfflineReadonlyBackupBanner() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/dev-settings/chad-data-mode', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setActive(Boolean(data.offlineReadonlyBackup));
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!active) return null;

  return (
    <div
      data-testid="offline-readonly-backup-banner"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 99990,
        background: '#b71c1c',
        color: '#fff',
        padding: '10px 16px',
        textAlign: 'center',
        fontWeight: 600,
        fontSize: '14px',
      }}
    >
      TRYB AWARYJNY — offline-readonly-backup (TYLKO ODCZYT). Zapis, sync i migracje są zablokowane.
    </div>
  );
}
