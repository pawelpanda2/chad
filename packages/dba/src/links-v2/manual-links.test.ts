import { describe, expect, it, vi, beforeEach } from "vitest";

// ── In-memory fake CP item store, same shape/pattern as sync.test.ts ───────
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

vi.mock("../repo-context.js", () => ({
  getCurrentRepoGuid: () => "repo-1",
}));

const { linkBeeperConversationToLead, unlinkBeeperConversationFromLead, linkGoogleContactToLead, unlinkGoogleContactFromLead } =
  await import("./manual-links.js");
const { readLeadLinks } = await import("./links-item.js");
const { repoAndLocaToAddress } = await import("../cp-model.js");

function seedLead(loca: string): FakeItem {
  const address = repoAndLocaToAddress("repo-1", loca);
  const item: FakeItem = { _id: address, config: { id: address, address, type: "Folder", name: loca }, body: "" };
  items.push(item);
  return item;
}

beforeEach(() => {
  items = [];
  getItemByAddress.mockClear();
  getChildrenOf.mockClear();
  createOrGetChild.mockClear();
  putItemBody.mockClear();
});

describe("linkBeeperConversationToLead / unlinkBeeperConversationFromLead", () => {
  it("creates a manual link entry on a lead with no links item yet", async () => {
    const lead = seedLead("lead-a");
    await linkBeeperConversationToLead({ leadLoca: "lead-a", chatId: "chat-1", network: "whatsapp" });
    const links = await readLeadLinks(lead);
    expect(links.beeper).toHaveLength(1);
    expect(links.beeper[0]).toMatchObject({ chatId: "chat-1", type: "whatsapp", method: "manual", matchedOn: "manual" });
  });

  it("is idempotent — re-assigning the same chat to the same lead does not duplicate", async () => {
    const lead = seedLead("lead-a");
    await linkBeeperConversationToLead({ leadLoca: "lead-a", chatId: "chat-1", network: "whatsapp" });
    await linkBeeperConversationToLead({ leadLoca: "lead-a", chatId: "chat-1", network: "whatsapp" });
    const links = await readLeadLinks(lead);
    expect(links.beeper).toHaveLength(1);
  });

  it("preserves existing googleContacts entries when adding a beeper link", async () => {
    const lead = seedLead("lead-a");
    await linkGoogleContactToLead({
      leadLoca: "lead-a",
      resourceName: "people/1",
      displayName: "Anna",
      phone: "+48600000000",
    });
    await linkBeeperConversationToLead({ leadLoca: "lead-a", chatId: "chat-1", network: "whatsapp" });
    const links = await readLeadLinks(lead);
    expect(links.beeper).toHaveLength(1);
    expect(links.googleContacts).toHaveLength(1);
  });

  it("unlinks a manually-linked conversation and leaves other links untouched", async () => {
    const lead = seedLead("lead-a");
    await linkBeeperConversationToLead({ leadLoca: "lead-a", chatId: "chat-1", network: "whatsapp" });
    await linkBeeperConversationToLead({ leadLoca: "lead-a", chatId: "chat-2", network: "instagram" });
    await unlinkBeeperConversationFromLead({ leadLoca: "lead-a", chatId: "chat-1" });
    const links = await readLeadLinks(lead);
    expect(links.beeper.map((e) => e.chatId)).toEqual(["chat-2"]);
  });

  it("unlinking a chat that isn't linked is a no-op (no extra write)", async () => {
    const lead = seedLead("lead-a");
    await linkBeeperConversationToLead({ leadLoca: "lead-a", chatId: "chat-1", network: "whatsapp" });
    putItemBody.mockClear();
    await unlinkBeeperConversationFromLead({ leadLoca: "lead-a", chatId: "does-not-exist" });
    expect(putItemBody).not.toHaveBeenCalled();
    const links = await readLeadLinks(lead);
    expect(links.beeper).toHaveLength(1);
  });

  it("throws for an unknown lead loca", async () => {
    await expect(
      linkBeeperConversationToLead({ leadLoca: "missing-lead", chatId: "chat-1", network: "whatsapp" })
    ).rejects.toThrow(/Lead not found/);
  });

  it("supports one conversation linked to two different leads at the storage layer (uniqueness is a GUI-level contract)", async () => {
    const leadA = seedLead("lead-a");
    const leadB = seedLead("lead-b");
    await linkBeeperConversationToLead({ leadLoca: "lead-a", chatId: "chat-1", network: "whatsapp" });
    await linkBeeperConversationToLead({ leadLoca: "lead-b", chatId: "chat-1", network: "whatsapp" });
    expect((await readLeadLinks(leadA)).beeper).toHaveLength(1);
    expect((await readLeadLinks(leadB)).beeper).toHaveLength(1);
  });
});

describe("linkGoogleContactToLead / unlinkGoogleContactFromLead", () => {
  it("creates a manual Google Contact link, denormalizing displayName/phone", async () => {
    const lead = seedLead("lead-a");
    await linkGoogleContactToLead({ leadLoca: "lead-a", resourceName: "people/1", displayName: "Anna", phone: "+48600000000" });
    const links = await readLeadLinks(lead);
    expect(links.googleContacts).toHaveLength(1);
    expect(links.googleContacts[0]).toMatchObject({
      resourceName: "people/1",
      displayName: "Anna",
      phone: "+48600000000",
      method: "manual",
      matchedOn: "manual",
    });
  });

  it("is idempotent — re-assigning the same contact does not duplicate", async () => {
    const lead = seedLead("lead-a");
    await linkGoogleContactToLead({ leadLoca: "lead-a", resourceName: "people/1", displayName: "Anna", phone: "+48600000000" });
    await linkGoogleContactToLead({ leadLoca: "lead-a", resourceName: "people/1", displayName: "Anna", phone: "+48600000000" });
    const links = await readLeadLinks(lead);
    expect(links.googleContacts).toHaveLength(1);
  });

  it("unlinks a Google Contact without deleting the lead's other links", async () => {
    const lead = seedLead("lead-a");
    await linkGoogleContactToLead({ leadLoca: "lead-a", resourceName: "people/1", displayName: "Anna", phone: "+48600000000" });
    await linkBeeperConversationToLead({ leadLoca: "lead-a", chatId: "chat-1", network: "whatsapp" });
    await unlinkGoogleContactFromLead({ leadLoca: "lead-a", resourceName: "people/1" });
    const links = await readLeadLinks(lead);
    expect(links.googleContacts).toHaveLength(0);
    expect(links.beeper).toHaveLength(1);
  });
});
