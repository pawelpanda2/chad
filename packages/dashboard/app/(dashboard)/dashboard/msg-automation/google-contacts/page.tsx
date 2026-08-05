"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { FRAME_SECTION_GAP_CLASS, LIST_ROW_CLASS, LIST_ROW_WRAPPER_CLASS } from "@/components/shared/layout-tokens";
import { Button } from "@/components/ui/button";
import { ErrorBox } from "@/components/shared/error-box";
import { cn } from "@/lib/utils";
import { Loader2, RefreshCw, Unplug } from "lucide-react";

interface GoogleContactRow {
  resourceName: string;
  displayName: string | null;
  phones: string[];
  emails: string[];
  photoUrl: string | null;
  organizations: string[];
}

type PageState =
  | { kind: "loading" }
  | { kind: "not_configured"; message: string }
  | { kind: "not_connected" }
  | { kind: "auth_error"; message: string }
  | { kind: "empty" }
  | { kind: "list"; contacts: GoogleContactRow[] }
  | { kind: "error"; message: string };

export default function GoogleContactsPage() {
  return (
    <Suspense fallback={null}>
      <GoogleContactsPageContent />
    </Suspense>
  );
}

function GoogleContactsPageContent() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const statusRes = await fetch("/api/google-contacts/status");
      const statusJson = await statusRes.json();
      if (statusRes.status === 401) {
        setState({ kind: "error", message: "Not authenticated" });
        return;
      }
      if (!statusJson.success) {
        setState({ kind: "error", message: statusJson.error || "Failed to check connection" });
        return;
      }
      if (!statusJson.configured) {
        setState({
          kind: "not_configured",
          message:
            "Google Contacts is not configured on this server (GOOGLE_CONTACTS_CLIENT_ID / CLIENT_SECRET / REDIRECT_URI).",
        });
        return;
      }
      if (!statusJson.connected) {
        setState({ kind: "not_connected" });
        return;
      }

      const listRes = await fetch("/api/google-contacts/list");
      const listJson = await listRes.json();
      if (listJson.code === "not_connected" || listJson.code === "auth_expired") {
        setState(
          listJson.code === "auth_expired"
            ? { kind: "auth_error", message: "Google authorization expired or was revoked. Connect again." }
            : { kind: "not_connected" },
        );
        return;
      }
      if (!listRes.ok || !listJson.success) {
        setState({ kind: "error", message: listJson.error || "Failed to load contacts" });
        return;
      }
      const contacts: GoogleContactRow[] = Array.isArray(listJson.contacts) ? listJson.contacts : [];
      setState(contacts.length === 0 ? { kind: "empty" } : { kind: "list", contacts });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const err = searchParams.get("error");
    if (err) {
      setState({
        kind: "auth_error",
        message:
          err === "auth_denied"
            ? "Google authorization was denied."
            : err === "invalid_state"
              ? "OAuth state validation failed. Try connecting again."
              : `Connection failed (${err}).`,
      });
    }
  }, [searchParams]);

  async function handleConnect() {
    setBusy(true);
    try {
      const res = await fetch("/api/google-contacts/connect");
      const json = await res.json();
      if (!res.ok || !json.success || !json.authUrl) {
        setState({
          kind: json.code === "not_configured" ? "not_configured" : "error",
          message: json.error || "Failed to start Google authorization",
        });
        return;
      }
      window.location.href = json.authUrl as string;
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    try {
      await fetch("/api/google-contacts/disconnect", { method: "POST" });
      setState({ kind: "not_connected" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardPageShell
      title="Google Contacts"
      upLevel={{ href: "/dashboard/msg-automation", label: "Msg Auto" }}
      scroll={false}
      contentClassName={FRAME_SECTION_GAP_CLASS}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {(state.kind === "not_connected" || state.kind === "auth_error" || state.kind === "not_configured") && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={busy || state.kind === "not_configured"}
            onClick={() => void handleConnect()}
          >
            Connect Google account
          </Button>
        )}
        {(state.kind === "list" || state.kind === "empty") && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              disabled={busy}
              onClick={() => void load()}
            >
              <RefreshCw className={cn("h-3 w-3", busy && "animate-spin")} />
              Refresh
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              disabled={busy}
              onClick={() => void handleDisconnect()}
            >
              <Unplug className="h-3 w-3" />
              Disconnect
            </Button>
          </>
        )}
        {state.kind === "list" && (
          <span className="text-xs text-muted-foreground">{state.contacts.length} contacts</span>
        )}
      </div>

      {state.kind === "loading" && (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading contacts…
        </div>
      )}

      {(state.kind === "error" || state.kind === "auth_error" || state.kind === "not_configured") && (
        <ErrorBox message={state.message} />
      )}

      {state.kind === "not_connected" && (
        <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Connect your Google account to list contacts (read-only).
        </div>
      )}

      {state.kind === "empty" && (
        <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          No contacts found on this Google account.
        </div>
      )}

      {state.kind === "list" && (
        <div
          className={cn(
            LIST_ROW_WRAPPER_CLASS,
            "flex min-h-0 w-full max-w-[720px] flex-1 flex-col overflow-y-auto",
          )}
        >
          <div className="divide-y">
            {state.contacts.map((c) => (
              <div key={c.resourceName} className={cn("flex gap-3", LIST_ROW_CLASS)}>
                {c.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.photoUrl}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-full object-cover bg-muted"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                    {(c.displayName || "?").slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {c.displayName || <span className="text-muted-foreground">(no name)</span>}
                  </div>
                  {c.phones.length > 0 && (
                    <div className="truncate text-xs text-muted-foreground">{c.phones.join(" · ")}</div>
                  )}
                  {c.emails.length > 0 && (
                    <div className="truncate text-xs text-muted-foreground">{c.emails.join(" · ")}</div>
                  )}
                  {c.organizations.length > 0 && (
                    <div className="truncate text-xs text-muted-foreground">{c.organizations.join(" · ")}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </DashboardPageShell>
  );
}
