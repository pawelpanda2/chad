// @vitest-environment jsdom
/**
 * Msg Auto → Msg Workout: on first mount with no `?group=` in the URL, the
 * page must apply the user's configured default group (same "apply once on
 * mount" pattern already used by MultiView/Links V2) instead of silently
 * starting on "All groups". Regression for a page that had the
 * BeeperGroupFilter combobox but was missing this effect.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { DashboardHistoryProvider } from "@/components/shared/dashboard-history-provider";
import MsgWorkoutPageImpl from "./page.js";

const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/msg-automation/msg-workout",
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), back: vi.fn(), forward: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

function MsgWorkoutPage() {
  return (
    <DashboardHistoryProvider>
      <MsgWorkoutPageImpl />
    </DashboardHistoryProvider>
  );
}

afterEach(() => {
  cleanup();
  replaceMock.mockClear();
  vi.unstubAllGlobals();
});

function makeFetchMock() {
  return vi.fn().mockImplementation(async (url: string) => {
    if (typeof url === "string" && url.startsWith("/api/beeper-crm/groups/default")) {
      return { ok: true, json: async () => ({ _id: "group-girl", name: "girl" }) };
    }
    if (typeof url === "string" && url.startsWith("/api/beeper-crm/groups")) {
      return { ok: true, json: async () => [{ _id: "group-girl", name: "girl" }] };
    }
    if (typeof url === "string" && url.startsWith("/api/beeper-crm/contacts")) {
      return { ok: true, json: async () => [] };
    }
    return { ok: false, json: async () => ({ error: "unhandled in test" }) };
  });
}

describe("Msg Auto → Msg Workout — default group applied on mount", () => {
  it("replaces the URL with the configured default group id when no ?group= is present", async () => {
    vi.stubGlobal("fetch", makeFetchMock());

    await act(async () => {
      render(<MsgWorkoutPage />);
    });

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith(
        expect.stringContaining("group=group-girl"),
        expect.anything()
      )
    );
  });
});
