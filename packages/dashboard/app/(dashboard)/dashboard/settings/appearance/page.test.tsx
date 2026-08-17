// @vitest-environment jsdom
/**
 * Settings → Appearance: real ThemeModeSelector (next-themes), no dummy switches.
 */
import { describe, expect, it, afterEach, beforeAll } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@/components/theme-provider";
import AppearancePage from "./page.js";

beforeAll(() => {
  window.matchMedia =
    window.matchMedia ||
    ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList);
});

afterEach(cleanup);

function renderWithTheme() {
  return render(
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AppearancePage />
    </ThemeProvider>,
  );
}

describe("Settings → Appearance", () => {
  it("renders profile picture and the real Light/Dark/System theme selector", () => {
    renderWithTheme();
    expect(screen.getByText("Profile Picture")).toBeTruthy();
    expect(screen.getByRole("button", { name: /change picture/i })).toBeTruthy();
    expect(screen.getByText("Theme")).toBeTruthy();
    expect(screen.getByRole("button", { name: /light/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /dark/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /system/i })).toBeTruthy();
  });

  it("does not render placeholder appearance copy", () => {
    renderWithTheme();
    expect(screen.queryByText("Customize the appearance of the app.")).toBeNull();
    expect(screen.queryByText("Appearance settings content goes here.")).toBeNull();
    expect(screen.queryByText(/Choose your preferred theme/i)).toBeNull();
  });
});
