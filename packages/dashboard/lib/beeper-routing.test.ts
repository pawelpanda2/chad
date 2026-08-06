import { describe, expect, it } from "vitest";

/** Pure redirect helper mirrored by Beeper page (Story 105). */
export function resolveBeeperLegacyTarget(
	tab: string | null,
): "beeper-conv" | "multiview" {
	if (tab === "permissions" || tab === "groups" || tab === "msg-workout") {
		return "multiview";
	}
	return "beeper-conv";
}

describe("Beeper / MultiView routing (Story 105)", () => {
	it("keeps Conv on bare beeper and conversations tab", () => {
		expect(resolveBeeperLegacyTarget(null)).toBe("beeper-conv");
		expect(resolveBeeperLegacyTarget("conv")).toBe("beeper-conv");
		expect(resolveBeeperLegacyTarget("conversations")).toBe("beeper-conv");
		expect(resolveBeeperLegacyTarget("settings")).toBe("beeper-conv");
	});

	it("sends legacy multi-tabs to MultiView", () => {
		expect(resolveBeeperLegacyTarget("permissions")).toBe("multiview");
		expect(resolveBeeperLegacyTarget("groups")).toBe("multiview");
		expect(resolveBeeperLegacyTarget("msg-workout")).toBe("multiview");
	});
});
