import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CpItem } from "./cp-model.js";

const putItemConfig = vi.fn(async (item: CpItem) => item);

vi.mock("./item-ops.js", () => ({
  putItemConfig: (item: CpItem) => putItemConfig(item),
}));

import { setMsgWorkoutBeeperLinkManual, getMsgWorkoutBeeperLink } from "./msg-workout-linking.js";

function baseItem(extraConfig: Record<string, unknown> = {}): CpItem {
  return {
    id: "id-1",
    address: "repo/loca",
    name: "workout",
    type: "Text",
    body: "body",
    config: { ...extraConfig },
    labels: [],
    labelsInherited: [],
  } as unknown as CpItem;
}

describe("setMsgWorkoutBeeperLinkManual", () => {
  beforeEach(() => {
    putItemConfig.mockClear();
  });

  it("assigns and reassigns links.beeper with method manual", async () => {
    const item = baseItem({ links: { other: { x: 1 } } });
    const linked = await setMsgWorkoutBeeperLinkManual(item, {
      messageId: "msg-1",
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    expect(getMsgWorkoutBeeperLink(linked)?.messageId).toBe("msg-1");
    expect(getMsgWorkoutBeeperLink(linked)?.method).toBe("manual");
    expect((linked.config.links as { other: unknown }).other).toEqual({ x: 1 });

    const reassigned = await setMsgWorkoutBeeperLinkManual(linked, {
      messageId: "msg-2",
      timestamp: "2026-01-02T00:00:00.000Z",
    });
    expect(getMsgWorkoutBeeperLink(reassigned)?.messageId).toBe("msg-2");
  });

  it("unlinks by removing links.beeper only", async () => {
    const item = baseItem({
      links: {
        beeper: {
          messageId: "msg-1",
          timestamp: "2026-01-01T00:00:00.000Z",
          linkedAt: "2026-01-01T00:00:00.000Z",
          method: "manual",
        },
        other: { keep: true },
      },
    });
    const cleared = await setMsgWorkoutBeeperLinkManual(item, null);
    expect(getMsgWorkoutBeeperLink(cleared)).toBeNull();
    expect((cleared.config.links as { other: unknown }).other).toEqual({ keep: true });
  });
});
