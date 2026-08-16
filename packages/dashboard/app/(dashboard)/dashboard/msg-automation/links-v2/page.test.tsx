// @vitest-environment jsdom
/**
 * Links V2 page — UX fixes: optimistic drag/drop linking with a pending
 * spinner (instead of only showing the linked conversation after the link
 * POST + a full leads refetch both resolve), Search+Group in one row
 * (Leads/right, Conv/left), lead/conversation names as new-tab links, and
 * the Links(left)/Conv(right) center-panel split with independent
 * per-selection visibility.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DashboardHistoryProvider } from "@/components/shared/dashboard-history-provider";
import LinksV2PageImpl from "./page.js";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/msg-automation/links-v2",
  useRouter: () => ({ back: vi.fn(), forward: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function LinksV2Page() {
  return (
    <DashboardHistoryProvider>
      <LinksV2PageImpl />
    </DashboardHistoryProvider>
  );
}

interface FakeDataTransfer {
  setData: (k: string, v: string) => void;
  getData: (k: string) => string;
  effectAllowed?: string;
}
function makeDataTransfer(): FakeDataTransfer {
  const store: Record<string, string> = {};
  return {
    setData: (k, v) => {
      store[k] = v;
    },
    getData: (k) => store[k] ?? "",
  };
}
/**
 * jsdom's real DragEvent has a getter-only `dataTransfer` that `fireEvent`'s
 * init-dict merge can't override, so a plain `fireEvent.dragStart(el, {
 * dataTransfer })` silently drops our fake object. Dispatching a generic
 * `Event` with `dataTransfer` attached via `defineProperty` sidesteps that —
 * React's synthetic drag event just reads whatever `.dataTransfer` the
 * native event carries, regardless of its concrete constructor.
 */
function fireDragEvent(element: Element, type: "dragstart" | "drop" | "dragover", dataTransfer: FakeDataTransfer) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer, configurable: true });
  // Unlike `fireEvent.*`, a raw `dispatchEvent` isn't auto-wrapped in `act()`,
  // so the resulting state update (the optimistic pending entry) wouldn't be
  // flushed synchronously — the very thing under test.
  act(() => {
    element.dispatchEvent(event);
  });
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const LEAD_A = { leadKey: "a", leadName: "Lead A", loca: "01", draft: false, links: { beeper: [], googleContacts: [] } };
const LEAD_B = { leadKey: "b", leadName: "Lead B", loca: "02", draft: false, links: { beeper: [], googleContacts: [] } };
const CONTACT_X = {
  _id: "chat-x",
  displayName: "Contact X",
  platformNetwork: "whatsapp",
  lastMessage: { text: "hi", timestamp: null, network: "whatsapp" },
  groupId: null,
};

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

/**
 * Routes the page's known GET endpoints; POST /beeper-link and
 * /beeper-unlink are driven per-test via `linkImpl`/`unlinkImpl` (for
 * controlling timing with a deferred promise), but the mock still applies
 * the mutation to its own `leads` copy once that promise resolves
 * successfully — so a subsequent `GET /api/msg-automation/links-v2` (the
 * page's post-link refetch) reflects the real, persisted result, the same
 * as the real backend would.
 */
function makeFetchMock({
  leads: initialLeads,
  linkImpl,
  unlinkImpl,
}: {
  leads: (typeof LEAD_A)[];
  linkImpl?: () => Promise<Response>;
  unlinkImpl?: () => Promise<Response>;
}) {
  const leads = initialLeads.map((l) => ({
    ...l,
    links: { beeper: [...l.links.beeper], googleContacts: [...l.links.googleContacts] },
  }));
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/msg-automation/links-v2" && (!init || init.method === undefined)) {
      return jsonResponse({ success: true, leads });
    }
    if (url === "/api/beeper-crm/contacts") {
      return jsonResponse([CONTACT_X]);
    }
    if (url === "/api/google-contacts/list") {
      return jsonResponse({ contacts: [] });
    }
    if (url === "/api/beeper-crm/groups/default") {
      return jsonResponse(null);
    }
    if (url === "/api/msg-automation/links-v2/beeper-link" && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { leadLoca: string; chatId: string; network: string };
      const res = linkImpl ? await linkImpl() : jsonResponse({ success: true });
      if (res.ok) {
        const lead = leads.find((l) => l.loca === body.leadLoca);
        if (lead && !lead.links.beeper.some((e) => e.chatId === body.chatId)) {
          lead.links.beeper.push({ chatId: body.chatId, type: body.network });
        }
      }
      return res;
    }
    if (url === "/api/msg-automation/links-v2/beeper-unlink" && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { leadLoca: string; chatId: string };
      const res = unlinkImpl ? await unlinkImpl() : jsonResponse({ success: true });
      if (res.ok) {
        const lead = leads.find((l) => l.loca === body.leadLoca);
        if (lead) lead.links.beeper = lead.links.beeper.filter((e) => e.chatId !== body.chatId);
      }
      return res;
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Clicks the row itself (by its `data-lead-loca`/`data-chat-id` test hook), never the name — the name is now a link that intentionally stops row-click propagation. */
function clickLeadRow(loca: string) {
  const row = document.querySelector(`[data-lead-loca="${loca}"]`);
  if (!row) throw new Error(`Lead row not found for loca=${loca}`);
  fireEvent.click(row);
}
function clickConvRow(chatId: string) {
  const row = document.querySelector(`[data-chat-id="${chatId}"]`);
  if (!row) throw new Error(`Conversation row not found for chatId=${chatId}`);
  fireEvent.click(row);
}

/**
 * Scoped to the Leads-tab grid: the main tabs bar (Leads/Conv/Google) ALSO
 * has a "Conv" button, so an unscoped `getByRole("button", { name: "Conv" })`
 * is ambiguous — every center-panel Links/Conv toggle assertion must go
 * through this.
 */
function leadsGrid() {
  return within(screen.getByTestId("leads-grid"));
}

async function loadAndSelectLead(fetchMock: ReturnType<typeof vi.fn>, leadName = "Lead A", loca = "01") {
  render(<LinksV2Page />);
  await screen.findByText(leadName);
  clickLeadRow(loca);
  await leadsGrid().findByRole("button", { name: "Links" });
}

describe("Links V2 — optimistic drag/drop linking", () => {
  it("shows the dropped conversation immediately with a pending spinner, before the link POST resolves", async () => {
    const link = deferred<Response>();
    const fetchMock = makeFetchMock({ leads: [LEAD_A], linkImpl: () => link.promise });
    vi.stubGlobal("fetch", fetchMock);

    await loadAndSelectLead(fetchMock);

    const dt = makeDataTransfer();
    const sourceRow = screen.getByText("Contact X").closest('[draggable="true"]')!;
    fireDragEvent(sourceRow, "dragstart", dt);
    const dropZone = screen.getByTestId("links-assign-drop-zone");
    fireDragEvent(dropZone, "drop", dt);

    // Optimistic: appears + spinner, synchronously, before the POST settles.
    expect(within(dropZone).getByText("Contact X")).toBeTruthy();
    expect(screen.getByLabelText("Linking…")).toBeTruthy();

    link.resolve(jsonResponse({ success: true }));
    await waitFor(() => expect(screen.queryByLabelText("Linking…")).toBeNull());
    expect(within(dropZone).getByText("Contact X")).toBeTruthy();
  });

  it("rolls back (spinner disappears, item removed) and surfaces an error on failure", async () => {
    const link = deferred<Response>();
    const fetchMock = makeFetchMock({ leads: [LEAD_A], linkImpl: () => link.promise });
    vi.stubGlobal("fetch", fetchMock);

    await loadAndSelectLead(fetchMock);

    const dt = makeDataTransfer();
    fireDragEvent(screen.getByText("Contact X").closest('[draggable="true"]')!, "dragstart", dt);
    const dropZone = screen.getByTestId("links-assign-drop-zone");
    fireDragEvent(dropZone, "drop", dt);

    expect(screen.getByLabelText("Linking…")).toBeTruthy();

    link.reject(new Error("link failed"));
    await waitFor(() => expect(screen.queryByLabelText("Linking…")).toBeNull());
    expect(within(dropZone).queryByText("Contact X")).toBeNull();
    await screen.findByText("link failed");
  });

  it("blocks a second link attempt for the same conversation while one is already pending", async () => {
    const link = deferred<Response>();
    const fetchMock = makeFetchMock({ leads: [LEAD_A], linkImpl: () => link.promise });
    vi.stubGlobal("fetch", fetchMock);

    await loadAndSelectLead(fetchMock);

    const dt = makeDataTransfer();
    const sourceRow = screen.getByText("Contact X").closest('[draggable="true"]')!;
    const dropZone = screen.getByTestId("links-assign-drop-zone");

    fireDragEvent(sourceRow, "dragstart", dt);
    fireDragEvent(dropZone, "drop", dt);
    const linkCallsAfterFirst = fetchMock.mock.calls.filter((c) => c[0] === "/api/msg-automation/links-v2/beeper-link").length;

    // Second drop attempt for the same still-pending chat — must be a no-op.
    fireDragEvent(sourceRow, "dragstart", dt);
    fireDragEvent(dropZone, "drop", dt);
    const linkCallsAfterSecond = fetchMock.mock.calls.filter((c) => c[0] === "/api/msg-automation/links-v2/beeper-link").length;

    expect(linkCallsAfterSecond).toBe(linkCallsAfterFirst);
    expect(within(dropZone).getAllByText("Contact X")).toHaveLength(1);

    link.resolve(jsonResponse({ success: true }));
    await waitFor(() => expect(screen.queryByLabelText("Linking…")).toBeNull());
  });

  it("reflects the real backend state after refetch (no leftover pending/optimistic artifacts)", async () => {
    const fetchMock = makeFetchMock({ leads: [LEAD_A] });
    vi.stubGlobal("fetch", fetchMock);
    await loadAndSelectLead(fetchMock);

    const dt = makeDataTransfer();
    fireDragEvent(screen.getByText("Contact X").closest('[draggable="true"]')!, "dragstart", dt);
    const dropZone = screen.getByTestId("links-assign-drop-zone");
    fireDragEvent(dropZone, "drop", dt);

    await waitFor(() => expect(screen.queryByLabelText("Linking…")).toBeNull());
    const row = within(dropZone).getByText("Contact X").closest('[data-chat-id="chat-x"]')!;
    expect(row.getAttribute("data-pending")).toBeNull();
  });
});

describe("Links V2 — Search + Group in one row", () => {
  // Both panels list the same Beeper contacts, so the group filter's own
  // aria-label is unambiguous even though "Search" (placeholder) isn't —
  // anchoring on the group filter first and scoping the search lookup to
  // its row proves they share one container, and sidesteps the ambiguity.
  it("Leads tab, right panel: search and group filter share one row container", async () => {
    const fetchMock = makeFetchMock({ leads: [LEAD_A] });
    vi.stubGlobal("fetch", fetchMock);
    render(<LinksV2Page />);
    await screen.findByText("Lead A");

    const group = screen.getByLabelText("Filter by contact group");
    const row = group.closest(".flex.items-center")!;
    expect(within(row).getByPlaceholderText("Search")).toBeTruthy();
  });

  it("Conv tab, left panel: search and group filter share one row container", async () => {
    const fetchMock = makeFetchMock({ leads: [LEAD_A] });
    vi.stubGlobal("fetch", fetchMock);
    render(<LinksV2Page />);
    await screen.findByText("Lead A");

    // Unambiguous here: the center panel's own "Conv" toggle doesn't exist
    // yet (no conversation selected), so this is only the main tab button.
    fireEvent.click(screen.getByRole("button", { name: "Conv" }));
    const group = screen.getByLabelText("Filter by contact group");
    const row = group.closest(".flex.items-center")!;
    expect(within(row).getByPlaceholderText("Search")).toBeTruthy();
  });

  it("search and group filter both apply together (client-side)", async () => {
    const contactY = { ...CONTACT_X, _id: "chat-y", displayName: "Contact Y", groupId: "g1" };
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/msg-automation/links-v2") return jsonResponse({ success: true, leads: [LEAD_A] });
      if (url === "/api/beeper-crm/contacts") return jsonResponse([CONTACT_X, contactY]);
      if (url === "/api/google-contacts/list") return jsonResponse({ contacts: [] });
      if (url === "/api/beeper-crm/groups/default") return jsonResponse(null);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<LinksV2Page />);
    await screen.findByText("Lead A");
    await screen.findByText("Contact X");
    expect(screen.getByText("Contact Y")).toBeTruthy();

    // The right panel's own search (same row as the group filter), not the
    // left leads-list search.
    const rightSearch = within(screen.getByLabelText("Filter by contact group").closest(".flex.items-center")!).getByPlaceholderText(
      "Search"
    );

    fireEvent.change(rightSearch, { target: { value: "Contact" } });
    expect(screen.getByText("Contact X")).toBeTruthy();
    expect(screen.getByText("Contact Y")).toBeTruthy();

    fireEvent.change(rightSearch, { target: { value: "Y" } });
    expect(screen.queryByText("Contact X")).toBeNull();
    expect(screen.getByText("Contact Y")).toBeTruthy();
  });
});

describe("Links V2 — lead and conversation names are links", () => {
  it("lead name is an <a target=_blank> to the canonical Lead Details route, click doesn't select the row", async () => {
    const fetchMock = makeFetchMock({ leads: [LEAD_A] });
    vi.stubGlobal("fetch", fetchMock);
    render(<LinksV2Page />);
    await screen.findByText("Lead A");

    const link = screen.getByText("Lead A").closest("a")!;
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    // URLSearchParams (used by getLeadDetailsHref), not encodeURIComponent —
    // spaces become "+", not "%20".
    expect(link.getAttribute("href")).toBe(
      `/dashboard/leads/details?${new URLSearchParams({ leadName: "Lead A", leadLoca: "01" }).toString()}`
    );

    // Row itself is still not "selected" (Links panel not yet shown) purely from a name click.
    fireEvent.click(link);
    expect(screen.queryByRole("button", { name: "Links" })).toBeNull();
  });

  it("conversation name is an <a target=_blank> to /dashboard/beeper?contact=<chatId>", async () => {
    const fetchMock = makeFetchMock({ leads: [LEAD_A] });
    vi.stubGlobal("fetch", fetchMock);
    render(<LinksV2Page />);
    await screen.findByText("Contact X");

    const link = screen.getByText("Contact X").closest("a")!;
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("href")).toBe(`/dashboard/beeper?contact=${encodeURIComponent("chat-x")}`);
  });
});

describe("Links V2 — Links(left)/Conv(right) center panel, 4 selection states", () => {
  it("nothing selected: neither Links nor Conv renders", async () => {
    const fetchMock = makeFetchMock({ leads: [LEAD_A, LEAD_B] });
    vi.stubGlobal("fetch", fetchMock);
    render(<LinksV2Page />);
    await screen.findByText("Lead A");
    expect(leadsGrid().queryByRole("button", { name: "Links" })).toBeNull();
    expect(leadsGrid().queryByRole("button", { name: "Conv" })).toBeNull();
  });

  it("lead selected only: Links shows (open), Conv absent", async () => {
    const fetchMock = makeFetchMock({ leads: [LEAD_A, LEAD_B] });
    vi.stubGlobal("fetch", fetchMock);
    render(<LinksV2Page />);
    await screen.findByText("Lead A");
    clickLeadRow("01");

    await leadsGrid().findByRole("button", { name: "Links" });
    expect(leadsGrid().queryByRole("button", { name: "Conv" })).toBeNull();
  });

  it("conversation selected only: Conv shows (open), Links absent", async () => {
    const fetchMock = makeFetchMock({ leads: [LEAD_A, LEAD_B] });
    vi.stubGlobal("fetch", fetchMock);
    render(<LinksV2Page />);
    await screen.findByText("Contact X");
    clickConvRow("chat-x");

    await leadsGrid().findByRole("button", { name: "Conv" });
    expect(leadsGrid().queryByRole("button", { name: "Links" })).toBeNull();
  });

  it("both selected: Links and Conv show at once, Links before Conv in DOM order (left before right)", async () => {
    const fetchMock = makeFetchMock({ leads: [LEAD_A, LEAD_B] });
    vi.stubGlobal("fetch", fetchMock);
    render(<LinksV2Page />);
    await screen.findByText("Lead A");
    clickLeadRow("01");
    await leadsGrid().findByRole("button", { name: "Links" });

    clickConvRow("chat-x");
    await leadsGrid().findByRole("button", { name: "Conv" });

    const linksBtn = leadsGrid().getByRole("button", { name: "Links" });
    const convBtn = leadsGrid().getByRole("button", { name: "Conv" });
    expect(linksBtn.compareDocumentPosition(convBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("selection change updates visibility immediately, no refresh", async () => {
    const fetchMock = makeFetchMock({ leads: [LEAD_A, LEAD_B] });
    vi.stubGlobal("fetch", fetchMock);
    render(<LinksV2Page />);
    await screen.findByText("Lead A");

    clickLeadRow("01");
    await leadsGrid().findByRole("button", { name: "Links" });

    clickLeadRow("02");
    // Still just one Links panel, no stale duplicate, no reload needed.
    expect(leadsGrid().getAllByRole("button", { name: "Links" })).toHaveLength(1);
  });
});
