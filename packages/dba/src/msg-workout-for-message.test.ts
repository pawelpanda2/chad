/**
 * Story 125 — find/create the Msg Workout for a lead's last Beeper message.
 * Mocked CP store (same fake-item-store pattern as links-v2/manual-links.test.ts)
 * + mocked Links V2 / Beeper Mongo reads, since the real Postgres/Mongo
 * providers aren't available in a pure unit-test run.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

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
const putItemConfig = vi.fn(async (item: FakeItem) => {
  const existing = findByAddress(item.config.address);
  if (!existing) throw new Error(`putItemConfig: no item at ${item.config.address}`);
  existing.config = { ...item.config };
  return existing;
});

vi.mock("./item-ops.js", () => ({
  getItemByAddress: (a: string) => getItemByAddress(a),
  getChildrenOf: (a: string) => getChildrenOf(a),
  createOrGetChild: (p: FakeItem, n: string, t: string, b?: string) => createOrGetChild(p, n, t, b),
  putItemConfig: (i: FakeItem) => putItemConfig(i),
}));

vi.mock("./repo-context.js", () => ({
  getCurrentRepoGuid: () => "repo-1",
}));

interface FakeBeeperLinkEntry {
  chatId: string;
  type: string;
  method: string;
  matchedOn: string;
  updatedAt: string;
}
let leadBeeperLinks: FakeBeeperLinkEntry[] = [];
const getLeadLinksV2ByLoca = vi.fn(async (_loca: string) => ({ beeper: leadBeeperLinks, googleContacts: [] }));
vi.mock("./links-v2/page-data.js", () => ({
  getLeadLinksV2ByLoca: (loca: string) => getLeadLinksV2ByLoca(loca),
}));

interface FakeBeeperMessage {
  _id: string;
  isSelf: boolean;
  text: string;
  timestamp: string | null;
}
let beeperMessagesByChat: Record<string, FakeBeeperMessage[]> = {};
const getBeeperContact = vi.fn(async (chatId: string) => {
  const messages = beeperMessagesByChat[chatId];
  if (!messages) return null;
  return { contact: { _id: chatId }, channels: [], messages, timelineEvents: [] };
});
vi.mock("./beeper-crm.js", () => ({
  getBeeperContact: (id: string) => getBeeperContact(id),
}));

vi.mock("./leads.js", () => ({
  getMsgWorkoutForEdit: async (loca: string) => {
    const item = findByAddress(`repo-1/${loca}`);
    if (!item) return null;
    return { leadName: "", address: item.config.address, body: item.body };
  },
  saveMsgWorkout: async (loca: string, content: string) => {
    const item = findByAddress(`repo-1/${loca}`);
    if (!item) throw new Error(`no item at repo-1/${loca}`);
    item.body = content;
    return true;
  },
}));

const {
  formatMsgWorkoutNameForMessageTimestamp,
  findMsgWorkoutForLastBeeperMessage,
  findOrCreateMsgWorkoutForLastBeeperMessage,
  saveMsgCreatorEntry,
} = await import("./msg-workout-for-message.js");
const { repoAndLocaToAddress, addressToRepoAndLoca } = await import("./cp-model.js");

function seedLead(loca: string): FakeItem {
  const address = repoAndLocaToAddress("repo-1", loca);
  const item: FakeItem = { _id: address, config: { id: address, address, type: "Folder", name: loca }, body: "" };
  items.push(item);
  return item;
}

beforeEach(() => {
  items = [];
  leadBeeperLinks = [];
  beeperMessagesByChat = {};
  getItemByAddress.mockClear();
  getChildrenOf.mockClear();
  createOrGetChild.mockClear();
  putItemConfig.mockClear();
  getLeadLinksV2ByLoca.mockClear();
  getBeeperContact.mockClear();
});

describe("formatMsgWorkoutNameForMessageTimestamp", () => {
  it("formats YY-MM-DD; HH:mm:ss with zero-padding, from the message's UTC timestamp", () => {
    expect(formatMsgWorkoutNameForMessageTimestamp("2026-08-17T23:04:33.000Z")).toBe("26-08-17; 23:04:33");
  });

  it("zero-pads single-digit month/day/hour/minute/second", () => {
    expect(formatMsgWorkoutNameForMessageTimestamp("2026-01-02T03:04:05.000Z")).toBe("26-01-02; 03:04:05");
  });
});

describe("findMsgWorkoutForLastBeeperMessage — read-only", () => {
  it("reports no-conversation when the lead has no Links V2 Beeper entry", async () => {
    seedLead("lead-a");
    const result = await findMsgWorkoutForLastBeeperMessage("lead-a");
    expect(result).toEqual({ status: "no-conversation" });
    expect(createOrGetChild).not.toHaveBeenCalled();
  });

  it("reports no-messages when the linked conversation has no timestamped messages", async () => {
    seedLead("lead-a");
    leadBeeperLinks = [{ chatId: "chat-1", type: "whatsapp", method: "automatic", matchedOn: "phone", updatedAt: "" }];
    beeperMessagesByChat["chat-1"] = [];
    const result = await findMsgWorkoutForLastBeeperMessage("lead-a");
    expect(result).toEqual({ status: "no-messages" });
    expect(createOrGetChild).not.toHaveBeenCalled();
  });

  it("reports missing + planned name when no workout is linked to the last message yet, and never creates anything", async () => {
    seedLead("lead-a");
    leadBeeperLinks = [{ chatId: "chat-1", type: "whatsapp", method: "automatic", matchedOn: "phone", updatedAt: "" }];
    beeperMessagesByChat["chat-1"] = [
      { _id: "m1", isSelf: false, text: "hi", timestamp: "2026-08-17T23:04:33.000Z" },
    ];
    const result = await findMsgWorkoutForLastBeeperMessage("lead-a");
    expect(result).toEqual({ status: "missing", plannedName: "26-08-17; 23:04:33" });
    expect(createOrGetChild).not.toHaveBeenCalled();
    expect(putItemConfig).not.toHaveBeenCalled();
  });

  it("finds an already-linked workout by config.links.beeper.messageId, never by name/text", async () => {
    const lead = seedLead("lead-a");
    const folder = await createOrGetChild(lead, "msg workout", "Folder");
    const workout = await createOrGetChild(folder, "some custom name", "Folder", "existing body");
    workout.config.links = { beeper: { messageId: "m1", timestamp: "t", linkedAt: "t", method: "automatic" } };
    createOrGetChild.mockClear();

    leadBeeperLinks = [{ chatId: "chat-1", type: "whatsapp", method: "automatic", matchedOn: "phone", updatedAt: "" }];
    beeperMessagesByChat["chat-1"] = [
      { _id: "m1", isSelf: false, text: "hi", timestamp: "2026-08-17T23:04:33.000Z" },
    ];

    const result = await findMsgWorkoutForLastBeeperMessage("lead-a");
    expect(result).toEqual({
      status: "exists",
      workout: { loca: addressToRepoAndLoca(workout.config.address).loca, name: "some custom name", body: "existing body" },
    });
    expect(createOrGetChild).not.toHaveBeenCalled();
  });

  it("picks the LAST message when the conversation has several", async () => {
    seedLead("lead-a");
    leadBeeperLinks = [{ chatId: "chat-1", type: "whatsapp", method: "automatic", matchedOn: "phone", updatedAt: "" }];
    beeperMessagesByChat["chat-1"] = [
      { _id: "m1", isSelf: false, text: "first", timestamp: "2026-08-17T10:00:00.000Z" },
      { _id: "m2", isSelf: true, text: "second", timestamp: "2026-08-17T23:04:33.000Z" },
    ];
    const result = await findMsgWorkoutForLastBeeperMessage("lead-a");
    expect(result).toEqual({ status: "missing", plannedName: "26-08-17; 23:04:33" });
  });
});

describe("findOrCreateMsgWorkoutForLastBeeperMessage", () => {
  function seedOneMessage() {
    seedLead("lead-a");
    leadBeeperLinks = [{ chatId: "chat-1", type: "whatsapp", method: "automatic", matchedOn: "phone", updatedAt: "" }];
    beeperMessagesByChat["chat-1"] = [
      { _id: "m1", isSelf: false, text: "hi", timestamp: "2026-08-17T23:04:33.000Z" },
    ];
  }

  it("creates exactly one workout with the YY-MM-DD; HH:mm:ss name, config['msg-workout'], and links.beeper", async () => {
    seedOneMessage();
    const result = await findOrCreateMsgWorkoutForLastBeeperMessage("lead-a");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.workout.name).toBe("26-08-17; 23:04:33");

    const address = repoAndLocaToAddress("repo-1", result.workout.loca);
    const item = findByAddress(address)!;
    expect(item.config["msg-workout"]).toBe("26-08-17; 23:04:33");
    expect(item.config.links).toMatchObject({
      beeper: { messageId: "m1", timestamp: "2026-08-17T23:04:33.000Z", method: "automatic" },
    });
  });

  it("is idempotent — a second call reuses the same workout, creates no duplicate", async () => {
    seedOneMessage();
    const first = await findOrCreateMsgWorkoutForLastBeeperMessage("lead-a");
    const folder = items.find((i) => i.config.name === "msg workout")!;
    const countAfterFirst = (await getChildrenOf(folder.config.address)).length;

    const second = await findOrCreateMsgWorkoutForLastBeeperMessage("lead-a");
    const countAfterSecond = (await getChildrenOf(folder.config.address)).length;

    expect(first).toEqual(second);
    expect(countAfterSecond).toBe(countAfterFirst);
    expect(countAfterFirst).toBe(1);
  });

  it("creates a second, distinct workout for a different message", async () => {
    seedLead("lead-a");
    leadBeeperLinks = [{ chatId: "chat-1", type: "whatsapp", method: "automatic", matchedOn: "phone", updatedAt: "" }];
    beeperMessagesByChat["chat-1"] = [
      { _id: "m1", isSelf: false, text: "hi", timestamp: "2026-08-17T23:04:33.000Z" },
    ];
    const first = await findOrCreateMsgWorkoutForLastBeeperMessage("lead-a");

    beeperMessagesByChat["chat-1"] = [
      { _id: "m1", isSelf: false, text: "hi", timestamp: "2026-08-17T23:04:33.000Z" },
      { _id: "m2", isSelf: true, text: "bye", timestamp: "2026-08-18T09:00:00.000Z" },
    ];
    const second = await findOrCreateMsgWorkoutForLastBeeperMessage("lead-a");

    expect(first.status).toBe("ok");
    expect(second.status).toBe("ok");
    if (first.status !== "ok" || second.status !== "ok") throw new Error("unreachable");
    expect(first.workout.loca).not.toBe(second.workout.loca);
    expect(second.workout.name).toBe("26-08-18; 09:00:00");
  });

  it("propagates no-conversation/no-messages without creating anything", async () => {
    seedLead("lead-a");
    const result = await findOrCreateMsgWorkoutForLastBeeperMessage("lead-a");
    expect(result).toEqual({ status: "no-conversation" });
    expect(createOrGetChild).not.toHaveBeenCalled();
  });
});

describe("saveMsgCreatorEntry", () => {
  function seedOneMessage() {
    seedLead("lead-a");
    leadBeeperLinks = [{ chatId: "chat-1", type: "whatsapp", method: "automatic", matchedOn: "phone", updatedAt: "" }];
    beeperMessagesByChat["chat-1"] = [
      { _id: "m1", isSelf: false, text: "hi", timestamp: "2026-08-17T23:04:33.000Z" },
    ];
  }

  it("you + dash creates the workout lazily (not on mere lookup) and appends a single line", async () => {
    seedOneMessage();
    // Read-only lookup first, as the bootstrap GET would do — must not create.
    await findMsgWorkoutForLastBeeperMessage("lead-a");
    expect(createOrGetChild).not.toHaveBeenCalled();

    const result = await saveMsgCreatorEntry("lead-a", { who: "you", mode: "dash", text: "hey", author: "irrelevant" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.workout.body).toBe("//you\n- hey");
  });

  it("you + ver numbers versions and never overwrites a previous one", async () => {
    seedOneMessage();
    await saveMsgCreatorEntry("lead-a", { who: "you", mode: "ver", text: "v1 text", author: "irrelevant" });
    const second = await saveMsgCreatorEntry("lead-a", { who: "you", mode: "ver", text: "v2 text", author: "irrelevant" });
    expect(second.status).toBe("ok");
    if (second.status !== "ok") throw new Error("unreachable");
    expect(second.workout.body).toBe("//v1\nv1 text\n\n//v2\nv2 text");
  });

  it("advice + dash uses the session author (never a hardcoded default) and each save is a new separate block", async () => {
    seedOneMessage();
    const first = await saveMsgCreatorEntry("lead-a", { who: "advice", mode: "dash", text: "shorten it", author: "pawel_f" });
    const second = await saveMsgCreatorEntry("lead-a", { who: "advice", mode: "dash", text: "try again", author: "pawel_f" });
    expect(second.status).toBe("ok");
    if (first.status !== "ok" || second.status !== "ok") throw new Error("unreachable");
    expect(second.workout.body).toBe("//advice pawel_f\nshorten it\n\n//advice pawel_f\ntry again");
  });

  it("saves twice for the same message into the same workout (find-or-create reused across saves)", async () => {
    seedOneMessage();
    await saveMsgCreatorEntry("lead-a", { who: "you", mode: "dash", text: "one", author: "x" });
    const folder = items.find((i) => i.config.name === "msg workout")!;
    const workoutsAfterFirst = await getChildrenOf(folder.config.address);
    await saveMsgCreatorEntry("lead-a", { who: "you", mode: "dash", text: "two", author: "x" });
    const workoutsAfterSecond = await getChildrenOf(folder.config.address);
    expect(workoutsAfterSecond.length).toBe(workoutsAfterFirst.length);
    expect(workoutsAfterFirst.length).toBe(1);
  });
});
