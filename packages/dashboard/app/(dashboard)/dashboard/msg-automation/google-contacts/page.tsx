"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { FRAME_SECTION_GAP_CLASS, LIST_ROW_CLASS, LIST_ROW_WRAPPER_CLASS } from "@/components/shared/layout-tokens";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBox } from "@/components/shared/error-box";
import { cn } from "@/lib/utils";
import { Loader2, RefreshCw, Unplug, X } from "lucide-react";
import {
  GOOGLE_CONTACTS_NO_GROUP_ID,
  filterGoogleContacts,
  isGoogleContactsPillGroup,
} from "google-contacts";

interface GoogleContactRow {
  resourceName: string;
  displayName: string | null;
  phones: string[];
  emails: string[];
  photoUrl: string | null;
  organizations: string[];
  groupResourceNames: string[];
}

interface GoogleGroupRow {
  resourceName: string;
  name: string;
  groupType: string | null;
  memberCount: number | null;
}

type PageState =
  | { kind: "loading" }
  | { kind: "not_configured"; message: string }
  | { kind: "not_connected" }
  | { kind: "auth_error"; message: string }
  | { kind: "empty" }
  | { kind: "list"; contacts: GoogleContactRow[]; groups: GoogleGroupRow[] }
  | { kind: "error"; message: string };

const LIST_PANEL_CLASS = "w-full max-w-[400px]";

export default function GoogleContactsPage() {
  return (
    <Suspense fallback={null}>
      <GoogleContactsPageContent />
    </Suspense>
  );
}

function DetailSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function GoogleContactsPageContent() {
  const searchParams = useSearchParams();
  const oauthErrorParam = searchParams.get("error");
  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [redirectUri, setRedirectUri] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedResourceName, setSelectedResourceName] = useState<string | null>(null);

  const load = useCallback(async () => {
    const oauthError = oauthErrorParam;
    if (oauthError) {
      setState({
        kind: "auth_error",
        message:
          oauthError === "auth_denied"
            ? "Google authorization was denied."
            : oauthError === "invalid_state"
              ? "OAuth state validation failed. Try connecting again."
              : `Connection failed (${oauthError}).`,
      });
    } else {
      setState({ kind: "loading" });
    }
    try {
      const statusRes = await fetch("/api/google-contacts/status");
      const statusJson = await statusRes.json();
      if (typeof statusJson.redirectUri === "string") {
        setRedirectUri(statusJson.redirectUri);
      }
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
      if (oauthError && !statusJson.connected) {
        return;
      }
      if (!statusJson.connected) {
        setSelectedResourceName(null);
        setState({ kind: "not_connected" });
        return;
      }

      const listRes = await fetch("/api/google-contacts/list");
      const listJson = await listRes.json();
      if (listJson.code === "not_connected" || listJson.code === "auth_expired") {
        setSelectedResourceName(null);
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
      const contacts: GoogleContactRow[] = Array.isArray(listJson.contacts)
        ? listJson.contacts.map((c: GoogleContactRow) => ({
            ...c,
            groupResourceNames: Array.isArray(c.groupResourceNames) ? c.groupResourceNames : [],
          }))
        : [];
      const groups: GoogleGroupRow[] = Array.isArray(listJson.groups) ? listJson.groups : [];
      setState(contacts.length === 0 ? { kind: "empty" } : { kind: "list", contacts, groups });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, [oauthErrorParam]);

  useEffect(() => {
    void load();
  }, [load]);

  const pillGroups = useMemo(() => {
    if (state.kind !== "list") return [] as GoogleGroupRow[];
    return state.groups
      .filter((g) => isGoogleContactsPillGroup(g.resourceName))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [state]);

  const pillGroupIds = useMemo(() => pillGroups.map((g) => g.resourceName), [pillGroups]);

  const groupNameByResource = useMemo(() => {
    const map = new Map<string, string>();
    if (state.kind === "list") {
      for (const g of state.groups) map.set(g.resourceName, g.name);
    }
    return map;
  }, [state]);

  const visibleContacts = useMemo(() => {
    if (state.kind !== "list") return [] as GoogleContactRow[];
    return filterGoogleContacts(state.contacts, {
      query,
      selectedGroupIds,
      pillGroupIds,
    });
  }, [state, query, selectedGroupIds, pillGroupIds]);

  useEffect(() => {
    if (!selectedResourceName) return;
    if (!visibleContacts.some((c) => c.resourceName === selectedResourceName)) {
      setSelectedResourceName(null);
    }
  }, [visibleContacts, selectedResourceName]);

  const selectedContact = useMemo(() => {
    if (!selectedResourceName || state.kind !== "list") return null;
    return state.contacts.find((c) => c.resourceName === selectedResourceName) ?? null;
  }, [selectedResourceName, state]);

  function toggleGroup(id: string) {
    setSelectedGroupIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

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
      setQuery("");
      setSelectedGroupIds([]);
      setSelectedResourceName(null);
      setState({ kind: "not_connected" });
    } finally {
      setBusy(false);
    }
  }

  const totalCount = state.kind === "list" ? state.contacts.length : 0;
  const showPanel = state.kind === "list" || state.kind === "empty";
  const hasSelection = Boolean(selectedContact);

  return (
    <DashboardPageShell
      title="Google Contacts"
      upLevel={{ href: "/dashboard/msg-automation", label: "Msg Auto" }}
      scroll={false}
      contentClassName={FRAME_SECTION_GAP_CLASS}
    >
      <div className={cn("flex shrink-0 flex-wrap items-center gap-2", LIST_PANEL_CLASS)}>
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
        {showPanel && (
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
          <span className="text-xs text-muted-foreground">
            {visibleContacts.length} / {totalCount} contacts
          </span>
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

      {(state.kind === "not_connected" || state.kind === "auth_error") && redirectUri && (
        <div className="rounded-lg border px-3 py-2 text-xs text-muted-foreground">
          <div className="font-medium text-foreground">OAuth redirect URI (must match Google Cloud Console exactly)</div>
          <code className="mt-1 block break-all select-all">{redirectUri}</code>
        </div>
      )}

      {state.kind === "not_connected" && (
        <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Connect your Google account to list contacts (read-only).
        </div>
      )}

      {state.kind === "empty" && (
        <div className={cn("rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground", LIST_PANEL_CLASS)}>
          No contacts found on this Google account.
        </div>
      )}

      {state.kind === "list" && (
        <div className="flex min-h-0 flex-1 gap-2">
          <div
            className={cn(
              "flex min-h-0 flex-col gap-2",
              LIST_PANEL_CLASS,
              hasSelection && "hidden md:flex",
            )}
          >
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, phone, email…"
              className="h-8 shrink-0 text-sm"
              aria-label="Search contacts"
            />

            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              {pillGroups.map((g) => {
                const active = selectedGroupIds.includes(g.resourceName);
                return (
                  <button
                    key={g.resourceName}
                    type="button"
                    onClick={() => toggleGroup(g.resourceName)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                    aria-pressed={active}
                  >
                    {g.name}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => toggleGroup(GOOGLE_CONTACTS_NO_GROUP_ID)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  selectedGroupIds.includes(GOOGLE_CONTACTS_NO_GROUP_ID)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
                aria-pressed={selectedGroupIds.includes(GOOGLE_CONTACTS_NO_GROUP_ID)}
              >
                — no group —
              </button>
            </div>

            {visibleContacts.length === 0 ? (
              <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                No contacts match the current search or group filters.
              </div>
            ) : (
              <div
                className={cn(
                  LIST_ROW_WRAPPER_CLASS,
                  "flex min-h-0 w-full flex-1 flex-col overflow-y-auto",
                )}
              >
                <div className="divide-y">
                  {visibleContacts.map((c) => {
                    const selected = c.resourceName === selectedResourceName;
                    return (
                      <button
                        key={c.resourceName}
                        type="button"
                        onClick={() => setSelectedResourceName(c.resourceName)}
                        className={cn(
                          "flex w-full gap-3 text-left",
                          LIST_ROW_CLASS,
                          selected && "bg-accent",
                        )}
                      >
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
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {selectedContact && (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border bg-muted/10 md:max-w-[420px]">
              <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
                <span className="truncate text-sm font-medium">
                  {selectedContact.displayName || "(no name)"}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedResourceName(null)}
                  aria-label="Close contact details"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                <div className="flex items-center gap-3">
                  {selectedContact.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selectedContact.photoUrl}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-full object-cover bg-muted"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-semibold text-muted-foreground">
                      {(selectedContact.displayName || "?").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold">
                      {selectedContact.displayName || (
                        <span className="font-normal text-muted-foreground">(no name)</span>
                      )}
                    </div>
                  </div>
                </div>

                <DetailSection label="Phones">
                  {selectedContact.phones.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <ul className="space-y-1 break-all">
                      {selectedContact.phones.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  )}
                </DetailSection>

                <DetailSection label="Emails">
                  {selectedContact.emails.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <ul className="space-y-1 break-all">
                      {selectedContact.emails.map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  )}
                </DetailSection>

                <DetailSection label="Organizations">
                  {selectedContact.organizations.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <ul className="space-y-1 break-words">
                      {selectedContact.organizations.map((o) => (
                        <li key={o}>{o}</li>
                      ))}
                    </ul>
                  )}
                </DetailSection>

                <DetailSection label="Groups">
                  {(() => {
                    const names = selectedContact.groupResourceNames
                      .map((id) => groupNameByResource.get(id))
                      .filter((n): n is string => Boolean(n));
                    if (names.length === 0) {
                      return <span className="text-muted-foreground">— no group —</span>;
                    }
                    return (
                      <div className="flex flex-wrap gap-1.5">
                        {names.map((n) => (
                          <span
                            key={n}
                            className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
                          >
                            {n}
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                </DetailSection>
              </div>
            </div>
          )}
        </div>
      )}
    </DashboardPageShell>
  );
}
