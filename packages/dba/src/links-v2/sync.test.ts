import { describe, expect, it, vi, beforeEach } from "vitest";

// ── In-memory fake CP item store, shared by the item-ops.js mock below ─────
interface FakeConfig {
  id: string;
  address: string;
  type: string;
  name: string;
  [key: string]: unknown;
}
interface FakeItem {
  _id: string;
  config: FakeConfig;
  body: string;
}

let items: FakeItem[] = [];

function findByAddress(address: string): FakeItem | null {
  return items.find((i) => i.config.address === address) ?? null;
}

const getItemByAddress = vi.fn(async (address: string) => findByAddress(address));
const getChildrenOf = vi.fn(async (parentAddress: string) =>
  items.filter((i) => {
    if (!i.config.address.startsWith(`${parentAddress}/`)) return false;
    const rest = i.config.address.slice(parentAddress.length + 1);
    return !rest.includes("/");
  })
);
const createOrGetChild = vi.fn(async (parent: FakeItem, name: string, type: string, body = "") => {
  const address = `${parent.config.address}/${name}`;
  const existing = findByAddress(address);
  if (existing) return existing;
  const item: FakeItem = { _id: address, config: { id: address, address, type, name }, body };
  items.push(item);
  return item;
});
const putItemBody = vi.fn(async (address: string, body: string) => {
  const item = findByAddress(address);
  if (!item) throw new Error(`putItemBody: no item at ${address}`);
  item.body = body;
  return item;
});

vi.mock("../item-ops.js", () => ({
  getItemByAddress: (a: string) => getItemByAddress(a),
  getChildrenOf: (a: string) => getChildrenOf(a),
  createOrGetChild: (p: FakeItem, n: string, t: string, b?: string) => createOrGetChild(p, n, t, b),
  putItemBody: (a: string, b: string) => putItemBody(a, b),
}));

// ── leads.js — leads list + per-lead phone lookup ───────────────────────────
interface FakeLead {
  leadKey: string;
  leadName: string;
  loca: string;
  hasContacts: boolean;
  draft: boolean;
}
let leadsList: FakeLead[] = [];
let leadPhoneByLoca: Record<string, string | undefined> = {};

const getAllLeadsWithContacts = vi.fn(async () => leadsList);
const getLeadDetails = vi.fn(async (_leadName: string, loca: string) => ({
  contacts: leadPhoneByLoca[loca] ? { phone: leadPhoneByLoca[loca] } : null,
}));

vi.mock("../leads.js", () => ({
  getAllLeadsWithContacts: () => getAllLeadsWithContacts(),
  getLeadDetails: (leadName: string, loca: string) => getLeadDetails(leadName, loca),
}));

// ── repo-context.js — fixed repo for every test ─────────────────────────────
vi.mock("../repo-context.js", () => ({
  getCurrentRepoGuid: () => "repo-1",
}));

// ── beeper/google-contacts providers — fully controllable per test ─────────
const beeperBuildIndex = vi.fn(async () => [] as unknown[]);
const beeperFindMatches = vi.fn((_lead: unknown, _index: unknown) => [] as unknown[]);
vi.mock("./beeper-provider.js", () => ({
  beeperLinkProvider: {
    id: "beeper",
    buildIndex: () => beeperBuildIndex(),
    findMatchesForLead: (lead: unknown, index: unknown) => beeperFindMatches(lead, index),
  },
}));

const googleContactsBuildIndex = vi.fn(async () => ({ connected: false, candidates: [] }));
const googleContactsFindMatches = vi.fn((_lead: unknown, _index: unknown) => [] as unknown[]);
vi.mock("./google-contacts-provider.js", () => ({
  googleContactsLinkProvider: {
    id: "google-contacts",
    buildIndex: () => googleContactsBuildIndex(),
    findMatchesForLead: (lead: unknown, index: unknown) => googleContactsFindMatches(lead, index),
  },
}));

// ── draft-leads.js — controllable creation result ───────────────────────────
const createDraftLeadFromBeeperContact = vi.fn(async (candidate: { chatId: string }, _usedNames: Set<string>) => ({
  created: true,
  leadName: `draft-for-${candidate.chatId}`,
}));
vi.mock("./draft-leads.js", () => ({
  createDraftLeadFromBeeperContact: (candidate: { chatId: string }, usedNames: Set<string>) =>
    createDraftLeadFromBeeperContact(candidate, usedNames),
}));

const { syncLinksV2ForCurrentRepo } = await import("./sync.js");

function leadItem(loca: string): FakeItem {
  return { _id: `repo-1/${loca}`, config: { id: `repo-1/${loca}`, address: `repo-1/${loca}`, type: "Folder", name: loca }, body: "" };
}

beforeEach(() => {
  items = [];
  leadsList = [];
  leadPhoneByLoca = {};
  getItemByAddress.mockClear();
  getChildrenOf.mockClear();
  createOrGetChild.mockClear();
  putItemBody.mockClear();
  getAllLeadsWithContacts.mockClear();
  getLeadDetails.mockClear();
  beeperBuildIndex.mockReset().mockResolvedValue([]);
  beeperFindMatches.mockReset().mockReturnValue([]);
  googleContactsBuildIndex.mockReset().mockResolvedValue({ connected: false, candidates: [] });
  googleContactsFindMatches.mockReset().mockReturnValue([]);
  createDraftLeadFromBeeperContact.mockClear();
});

describe("syncLinksV2ForCurrentRepo", () => {
  it("writes multiple chats and multiple providers for one lead", async () => {
    leadsList = [{ leadKey: "01", leadName: "Lead A", loca: "lead-a", hasContacts: true, draft: false }];
    items.push(leadItem("lead-a") as FakeItem);
    leadPhoneByLoca["lead-a"] = "600123456";

    beeperFindMatches.mockReturnValue([
      { chatId: "chat1", type: "whatsapp", method: "automatic", matchedOn: "phone", updatedAt: "t" },
      { chatId: "chat2", type: "instagram", method: "automatic", matchedOn: "phone", updatedAt: "t" },
    ]);
    googleContactsFindMatches.mockReturnValue([
      { resourceName: "people/c1", displayName: "Anna", phone: "600123456", method: "automatic", matchedOn: "phone", updatedAt: "t" },
    ]);

    const report = await syncLinksV2ForCurrentRepo();

    expect(report.newBeeperLinks).toBe(2);
    expect(report.newGoogleContactsLinks).toBe(1);
    expect(report.draftLeadsCreated).toHaveLength(0);

    const linksItem = items.find((i) => i.config.address === "repo-1/lead-a/links");
    expect(linksItem?.body).toContain("chat1");
    expect(linksItem?.body).toContain("chat2");
    expect(linksItem?.body).toContain("people/c1");
  });

  it("does not create duplicate links across two consecutive runs", async () => {
    leadsList = [{ leadKey: "01", leadName: "Lead A", loca: "lead-a", hasContacts: true, draft: false }];
    items.push(leadItem("lead-a") as FakeItem);
    leadPhoneByLoca["lead-a"] = "600123456";
    beeperFindMatches.mockReturnValue([
      { chatId: "chat1", type: "whatsapp", method: "automatic", matchedOn: "phone", updatedAt: "t" },
    ]);

    const first = await syncLinksV2ForCurrentRepo();
    expect(first.newBeeperLinks).toBe(1);
    expect(createOrGetChild).toHaveBeenCalledTimes(1);

    // Second run: the provider mock proposes the exact same candidate again
    // (simulating a provider that doesn't itself dedupe) — the merge inside
    // sync.ts must still report zero new links and must not write again.
    const second = await syncLinksV2ForCurrentRepo();
    expect(second.newBeeperLinks).toBe(0);
    expect(putItemBody).not.toHaveBeenCalled();
    expect(createOrGetChild).toHaveBeenCalledTimes(1);
  });

  it("creates a Draft Lead for an unmatched Beeper contact", async () => {
    leadsList = [];
    beeperBuildIndex.mockResolvedValue([
      { chatId: "chat-unmatched", type: "whatsapp", displayName: "Stranger", phoneDigits: ["600999888"] },
    ]);

    const report = await syncLinksV2ForCurrentRepo();

    expect(report.draftLeadsCreated).toEqual(["draft-for-chat-unmatched"]);
    expect(createDraftLeadFromBeeperContact).toHaveBeenCalledTimes(1);
  });

  it("never creates a second Draft Lead for a contact already linked to a lead", async () => {
    leadsList = [{ leadKey: "01", leadName: "26-08-05_dl_Stranger", loca: "lead-a", hasContacts: true, draft: true }];
    items.push(leadItem("lead-a") as FakeItem);
    // The draft lead's own `links` item already points at this chat (written
    // when the draft was first created) — readLeadLinks must see it via
    // getChildrenOf, so it needs to actually exist in the fake store.
    await createOrGetChild(leadItem("lead-a"), "links", "Text", "beeper:\n  - chatId: chat-unmatched\n    type: whatsapp\n");

    beeperBuildIndex.mockResolvedValue([
      { chatId: "chat-unmatched", type: "whatsapp", displayName: "Stranger", phoneDigits: ["600999888"] },
    ]);
    // No phone on the draft lead itself — matching must rely on the already-
    // stored links item, not a fresh phone match, exactly like production.
    leadPhoneByLoca["lead-a"] = undefined;

    const report = await syncLinksV2ForCurrentRepo();

    expect(report.draftLeadsCreated).toHaveLength(0);
    expect(createDraftLeadFromBeeperContact).not.toHaveBeenCalled();
  });
});
