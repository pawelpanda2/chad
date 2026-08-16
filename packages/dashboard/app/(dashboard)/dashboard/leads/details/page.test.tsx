// @vitest-environment jsdom
/**
 * Lead Details — Groups card (new frame showing which Beeper group(s) a
 * lead's linked conversations belong to, derived client-side from the
 * lead's linked `chatId`s via the existing `/api/beeper-crm/contacts` +
 * `/api/beeper-crm/groups` list endpoints — no new endpoint). "Full View"
 * always links to the standalone Groups page.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { DashboardHistoryProvider } from "@/components/shared/dashboard-history-provider";
import LeadDetailsPageImpl from "./page.js";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/leads/details",
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), forward: vi.fn() }),
  useSearchParams: () => new URLSearchParams("leadName=Lead+A&leadLoca=01"),
}));

function LeadDetailsPage() {
  return (
    <DashboardHistoryProvider>
      <LeadDetailsPageImpl />
    </DashboardHistoryProvider>
  );
}

afterEach(() => {
  cleanup();
});

const BASE_DETAILS = {
  leadKey: "a",
  leadName: "Lead A",
  loca: "01",
  contacts: null,
  msgWorkouts: [],
  msgWorkoutsNotFound: true,
  links: { beeper: [] as { chatId: string; type: string }[], googleContacts: [] as never[] },
};

function makeFetchMock(details: typeof BASE_DETAILS, contacts: unknown[] = [], groups: unknown[] = []) {
  return vi.fn().mockImplementation(async (url: string) => {
    if (url.startsWith("/api/leads-dashboard/details")) {
      return { ok: true, json: async () => details };
    }
    if (url.startsWith("/api/beeper-crm/contacts")) {
      return { ok: true, json: async () => contacts };
    }
    if (url.startsWith("/api/beeper-crm/groups")) {
      return { ok: true, json: async () => groups };
    }
    if (url.startsWith("/api/leads/photos")) {
      return { ok: true, json: async () => [] };
    }
    return { ok: false, json: async () => ({ error: "unhandled in test" }) };
  });
}

describe("Lead Details — Groups card", () => {
  it("shows 'No group' without hitting the contacts/groups endpoints when the lead has zero linked Beeper conversations", async () => {
    const fetchMock = makeFetchMock(BASE_DETAILS);
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      render(<LeadDetailsPage />);
    });
    await waitFor(() => expect(screen.getByText("No group")).toBeTruthy());

    const calledUrls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(calledUrls.some((u) => u.startsWith("/api/beeper-crm/contacts"))).toBe(false);
    expect(calledUrls.some((u) => u.startsWith("/api/beeper-crm/groups"))).toBe(false);

    vi.unstubAllGlobals();
  });

  it("resolves and displays the group(s) a lead's linked chatId belongs to", async () => {
    const details = { ...BASE_DETAILS, links: { beeper: [{ chatId: "chat-x", type: "whatsapp" }], googleContacts: [] } };
    const contacts = [{ _id: "chat-x", groupId: "group-1" }, { _id: "chat-other", groupId: "group-2" }];
    const groups = [{ _id: "group-1", name: "VIP" }, { _id: "group-2", name: "Cold" }];
    vi.stubGlobal("fetch", makeFetchMock(details, contacts, groups));

    await act(async () => {
      render(<LeadDetailsPage />);
    });

    await waitFor(() => expect(screen.getByText("VIP")).toBeTruthy());
    expect(screen.queryByText("Cold")).toBeNull();
    expect(screen.queryByText("No group")).toBeNull();

    vi.unstubAllGlobals();
  });

  it("shows 'No group' if the linked chatId's contact has no groupId", async () => {
    const details = { ...BASE_DETAILS, links: { beeper: [{ chatId: "chat-x", type: "whatsapp" }], googleContacts: [] } };
    const contacts = [{ _id: "chat-x", groupId: null }];
    vi.stubGlobal("fetch", makeFetchMock(details, contacts, []));

    await act(async () => {
      render(<LeadDetailsPage />);
    });

    await waitFor(() => expect(screen.getByText("No group")).toBeTruthy());

    vi.unstubAllGlobals();
  });

  it("'Full View' link always points at the standalone Groups page", async () => {
    vi.stubGlobal("fetch", makeFetchMock(BASE_DETAILS));

    await act(async () => {
      render(<LeadDetailsPage />);
    });
    await waitFor(() => expect(screen.getByText("Groups")).toBeTruthy());

    const fullViewLink = screen.getByRole("link", { name: "Full View" });
    expect(fullViewLink.getAttribute("href")).toBe("/dashboard/msg-automation/groups");

    vi.unstubAllGlobals();
  });
});
