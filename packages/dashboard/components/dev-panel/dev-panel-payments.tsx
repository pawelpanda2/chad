"use client";

import { useCallback, useEffect, useState } from "react";

interface PaymentEventRow {
  id: number;
  occurredAt: string;
  stage: string;
  chadEnvironment: string | null;
  stripeMode: string | null;
  checkoutSessionId: string | null;
  paymentIntentId: string | null;
  repoGuid: string | null;
  username: string | null;
  amountMinor: number | null;
  currency: string | null;
  status: string | null;
  message: string | null;
}

const STAGE_COLORS: Record<string, string> = {
  checkout_create_requested: "#8a8a8a",
  checkout_created: "#4caf50",
  checkout_create_failed: "#f44336",
  webhook_received: "#8a8a8a",
  webhook_verified: "#4caf50",
  webhook_rejected: "#f44336",
  payment_completed: "#4caf50",
  payment_failed: "#f44336",
};

function formatAmount(row: PaymentEventRow): string {
  if (row.amountMinor === null || !row.currency) return "";
  return `${(row.amountMinor / 100).toFixed(2)} ${row.currency}`;
}

/**
 * Dev Panel → Payments — sanitized Stripe Checkout/webhook lifecycle events
 * (Story 116 continuation). Backed by `cp_stripe_payment_events` (via
 * GET /api/dev-panel/payments-events), so — unlike the Requests/Errors
 * tabs' in-memory client store — this survives a page refresh. Never shows
 * card data, secrets, or raw Stripe payloads (sanitized at write time in
 * packages/dba/src/payments.ts).
 */
export function DevPanelPaymentsTab() {
  const [events, setEvents] = useState<PaymentEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dev-panel/payments-events");
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Failed to load payment events");
        setEvents([]);
        return;
      }
      setEvents(data.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payment events");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="dev-tab-section">
      <div className="dev-section-title">💳 Payments lifecycle</div>
      <div style={{ marginBottom: "12px" }}>
        <button className="dev-btn" onClick={load} disabled={loading}>
          {loading ? "Loading..." : "🔄 Refresh"}
        </button>
      </div>

      {error && (
        <div className="dev-request-detail dev-request-error" style={{ marginBottom: "12px" }}>
          <strong>ERROR:</strong>
          <pre className="dev-log-pre dev-stack">{error}</pre>
        </div>
      )}

      {!loading && events.length === 0 && !error ? (
        <div className="dev-no-logs">No payment events yet</div>
      ) : (
        events.map((event) => (
          <div key={event.id} className="dev-request-card">
            <div className="dev-request-header">
              <span
                className="dev-request-id"
                style={{ color: STAGE_COLORS[event.stage] || undefined }}
              >
                {event.stage}
              </span>
              <span className="dev-request-time">{new Date(event.occurredAt).toLocaleString()}</span>
              {event.stripeMode && <span className="dev-request-status">{event.stripeMode}</span>}
              {event.chadEnvironment && <span className="dev-request-duration">{event.chadEnvironment}</span>}
            </div>
            <div className="dev-request-method-url">
              {event.checkoutSessionId && (
                <span className="dev-request-url" title={event.checkoutSessionId}>
                  session: {event.checkoutSessionId}
                </span>
              )}
              {event.paymentIntentId && (
                <span className="dev-request-url" title={event.paymentIntentId}>
                  pi: {event.paymentIntentId}
                </span>
              )}
            </div>
            {(event.username || event.status || event.amountMinor !== null) && (
              <div className="dev-request-detail">
                {event.username && <span>user: {event.username} </span>}
                {formatAmount(event) && <span>amount: {formatAmount(event)} </span>}
                {event.status && <span>status: {event.status}</span>}
              </div>
            )}
            {event.message && (
              <div className="dev-request-detail">
                <pre className="dev-log-pre">{event.message}</pre>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
