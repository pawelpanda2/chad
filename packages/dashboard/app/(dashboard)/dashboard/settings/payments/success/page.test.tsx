// @vitest-environment jsdom
/**
 * Story 116 continuation — regression test for a real reported bug: a
 * payment that genuinely succeeded on Stripe never showed as confirmed
 * because no webhook was reachable, and this page's polling loop had no
 * terminal state once its poll budget ran out — `status` stayed "pending"
 * forever, so the spinner (Loader2 + "Confirming your payment...") never
 * stopped, even though polling itself had silently stopped underneath it.
 * This test locks in the fix: after the poll budget is exhausted while the
 * server keeps reporting "pending", the page must reach an explicit
 * terminal state, not spin forever.
 *
 * Uses fake timers + `act()` directly (not testing-library's `waitFor`,
 * which polls with a real `setInterval` and would otherwise itself hang
 * for real wall-clock seconds under `vi.useFakeTimers()`).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import PaymentsSuccessPage from "./page.js";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("session_id=cs_test_regression"),
  useRouter: () => ({ push: pushMock }),
}));

afterEach(() => {
  cleanup();
  pushMock.mockClear();
});

describe("Settings -> Payments -> success — spinner never hangs forever", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reaches a terminal 'timed_out' state (not an endless spinner) once the poll budget is exhausted while status stays pending", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, status: "pending" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PaymentsSuccessPage />);

    // Drain the 15 x 2s poll loop (MAX_POLLS x POLL_INTERVAL_MS).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15 * 2000 + 500);
    });

    expect(screen.getByText("Still confirming")).toBeTruthy();
    // The spinner's own status text must be gone, not just additional text added.
    expect(screen.queryByText("Confirming your payment...")).toBeNull();
    // A manual retry path must exist — never a dead end.
    expect(screen.getByRole("button", { name: /check again/i })).toBeTruthy();
  });

  it("resolves to 'completed' immediately once the server reports it, without waiting for the full poll budget", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, status: "completed" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PaymentsSuccessPage />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(screen.getByText("Payment successful")).toBeTruthy();
    // Only one request needed — no unnecessary polling once confirmed.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // No "Back to Payments" button — success auto-returns there instead
    // (same Settings tab; a manual back button was redundant).
    expect(screen.queryByRole("link", { name: /back to payments/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /back to payments/i })).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(pushMock).toHaveBeenCalledWith("/dashboard/settings/payments");
  });

  it("'Check again' restarts polling from a terminal state", async () => {
    let responseStatus = "pending";
    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({ success: true, status: responseStatus }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<PaymentsSuccessPage />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15 * 2000 + 500);
    });
    expect(screen.getByText("Still confirming")).toBeTruthy();

    // Simulate the webhook having landed in the meantime.
    responseStatus = "completed";
    const checkAgain = screen.getByRole("button", { name: /check again/i });
    await act(async () => {
      checkAgain.click();
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(screen.getByText("Payment successful")).toBeTruthy();
  });
});
