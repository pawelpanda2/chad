import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as listLicenses } from "./route.js";
import { GET as getLicenseDetail } from "./[id]/route.js";
import { GET as getLicensePdf } from "./[id]/pdf/route.js";

vi.mock("@/lib/session", () => ({
  getCurrentUserFromCookies: vi.fn(),
}));

import { getCurrentUserFromCookies } from "@/lib/session";

const adminUser = { repoGuid: "admin-repo", username: "admin", isAdmin: true, isActive: true, role: "admin" as const };
const normalUser = { repoGuid: "user-repo", username: "test2", isAdmin: false, isActive: true, role: "user" as const };

describe("admin licenses API auth", () => {
  beforeEach(() => {
    vi.mocked(getCurrentUserFromCookies).mockReset();
  });

  it("returns 403 for unauthenticated list", async () => {
    vi.mocked(getCurrentUserFromCookies).mockResolvedValue(null);
    const res = await listLicenses();
    expect(res.status).toBe(403);
  });

  it("returns 403 for non-admin list", async () => {
    vi.mocked(getCurrentUserFromCookies).mockResolvedValue(normalUser as never);
    const res = await listLicenses();
    expect(res.status).toBe(403);
  });

  it("returns 403 for non-admin detail", async () => {
    vi.mocked(getCurrentUserFromCookies).mockResolvedValue(normalUser as never);
    const res = await getLicenseDetail(new Request("http://local/api/admin/licenses/x"), {
      params: Promise.resolve({ id: "x" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 403 for non-admin pdf", async () => {
    vi.mocked(getCurrentUserFromCookies).mockResolvedValue(normalUser as never);
    const res = await getLicensePdf(new Request("http://local/api/admin/licenses/x/pdf"), {
      params: Promise.resolve({ id: "x" }),
    });
    expect(res.status).toBe(403);
  });

  it("allows admin list request through auth gate", async () => {
    vi.mocked(getCurrentUserFromCookies).mockResolvedValue(adminUser as never);
    const res = await listLicenses();
    expect(res.status).not.toBe(403);
  });
});
