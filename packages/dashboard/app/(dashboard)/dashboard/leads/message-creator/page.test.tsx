// @vitest-environment jsdom
/**
 * Story 125 — Msg Creator composer: you/advice x dash/ver. comboboxes wired
 * to the Msg Workout tied to the lead's last Beeper message. Exercises the
 * REAL rendered page (`./page.js`), the route serving localhost:12020's
 * `/dashboard/leads/message-creator` — not a parallel/mock composer.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DashboardHistoryProvider } from "@/components/shared/dashboard-history-provider";
import MessageCreatorPageImpl from "./page.js";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/leads/message-creator",
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), forward: vi.fn() }),
  useSearchParams: () => new URLSearchParams("leadName=Lead+A&leadLoca=01"),
}));

function MessageCreatorPage() {
  return (
    <DashboardHistoryProvider>
      <MessageCreatorPageImpl />
    </DashboardHistoryProvider>
  );
}

afterEach(() => {
  cleanup();
});

const BASE_BOOTSTRAP = {
  leadName: "Lead A",
  leadLoca: "01",
  schools: [],
  promptVersions: [],
  models: [],
  approachContext: "",
  proposals: "",
  historicalYouSuggestion: null,
  reports: [],
  conversation: { found: true, body: "", channel: null, hash: null, messages: [] },
  allRuns: [],
  messageRunCounts: {},
  resolvedPrompt: null,
  msgWorkout: { status: "missing", plannedName: "26-08-17; 23:04:33" },
};

function makeFetchMock(bootstrap: unknown, onEntryPost?: (body: unknown) => unknown) {
  return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (typeof url === "string" && url.startsWith("/api/leads/message-creator/entry") && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      const result = onEntryPost?.(body) ?? { success: true, workout: { loca: "01/99", name: "x", body: "//you\n- hey" } };
      return { ok: true, json: async () => result };
    }
    if (typeof url === "string" && url.startsWith("/api/leads/message-creator")) {
      return { ok: true, json: async () => ({ success: true, data: bootstrap }) };
    }
    return { ok: false, json: async () => ({ error: "unhandled in test" }) };
  });
}

describe("Msg Creator composer — real renderer", () => {
  it("shows the you/advice and dash/ver. comboboxes, defaulting to you + dash, with no old placeholder", async () => {
    vi.stubGlobal("fetch", makeFetchMock(BASE_BOOTSTRAP));

    await act(async () => {
      render(<MessageCreatorPage />);
    });
    await waitFor(() => expect(screen.getByLabelText("Composer author type")).toBeTruthy());

    // Expand the collapsible composer panel (starts closed, same as before).
    fireEvent.click(screen.getByText("Message proposals"));

    const whoSelect = screen.getByLabelText("Composer author type") as HTMLSelectElement;
    const modeSelect = screen.getByLabelText("Composer entry mode") as HTMLSelectElement;
    expect(whoSelect.value).toBe("you");
    expect(modeSelect.value).toBe("dash");
    expect(Array.from(whoSelect.options).map((o) => o.value)).toEqual(["you", "advice"]);
    expect(Array.from(modeSelect.options).map((o) => o.value)).toEqual(["dash", "ver"]);

    expect(screen.queryByPlaceholderText("Write or paste your own message proposal...")).toBeNull();
  });

  it("disables the composer when the lead has no linked Beeper conversation", async () => {
    const bootstrap = { ...BASE_BOOTSTRAP, msgWorkout: { status: "no-conversation" } };
    vi.stubGlobal("fetch", makeFetchMock(bootstrap));

    await act(async () => {
      render(<MessageCreatorPage />);
    });
    await waitFor(() => expect(screen.getByLabelText("Composer author type")).toBeTruthy());
    fireEvent.click(screen.getByText("Message proposals"));

    expect((screen.getByLabelText("Composer author type") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText("New entry") as HTMLInputElement).disabled).toBe(true);
  });

  it("you + dash: Save posts who=you, mode=dash and shows the returned workout body", async () => {
    let posted: unknown = null;
    vi.stubGlobal(
      "fetch",
      makeFetchMock(BASE_BOOTSTRAP, (body) => {
        posted = body;
        return { success: true, workout: { loca: "01/99", name: "26-08-17; 23:04:33", body: "//you\n- hey there" } };
      })
    );

    await act(async () => {
      render(<MessageCreatorPage />);
    });
    await waitFor(() => expect(screen.getByLabelText("Composer author type")).toBeTruthy());
    fireEvent.click(screen.getByText("Message proposals"));

    const input = screen.getByLabelText("New entry") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "hey there" } });
    const saveButton = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.includes("Save") && b.textContent?.includes("msg"));
    fireEvent.click(saveButton!);

    await waitFor(() => expect(posted).toEqual({ leadLoca: "01", who: "you", mode: "dash", text: "hey there" }));
    await waitFor(() => expect(document.querySelector("pre")?.textContent).toBe("//you\n- hey there"));
  });

  it("switching to advice + ver. shows a textarea (multiline) instead of the single-line input", async () => {
    vi.stubGlobal("fetch", makeFetchMock(BASE_BOOTSTRAP));

    await act(async () => {
      render(<MessageCreatorPage />);
    });
    await waitFor(() => expect(screen.getByLabelText("Composer author type")).toBeTruthy());
    fireEvent.click(screen.getByText("Message proposals"));

    fireEvent.change(screen.getByLabelText("Composer author type"), { target: { value: "advice" } });
    fireEvent.change(screen.getByLabelText("Composer entry mode"), { target: { value: "ver" } });

    const textarea = screen.getByLabelText("New entry");
    expect(textarea.tagName).toBe("TEXTAREA");
  });
});
