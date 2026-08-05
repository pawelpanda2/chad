import { describe, expect, it, vi } from "vitest";
import { GoogleContactsError, listAllGoogleContacts, listGoogleContactsPage } from "google-contacts";

describe("listGoogleContactsPage / listAllGoogleContacts", () => {
  it("maps one page and surfaces nextPageToken", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            connections: [{ resourceName: "people/a", names: [{ displayName: "A" }] }],
            nextPageToken: "tok2",
          }),
          { status: 200 },
        ),
    );
    const page = await listGoogleContactsPage({
      accessToken: "at",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(page.contacts).toHaveLength(1);
    expect(page.contacts[0]?.displayName).toBe("A");
    expect(page.nextPageToken).toBe("tok2");
  });

  it("follows pagination until exhausted", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            connections: [{ resourceName: "people/1", names: [{ displayName: "One" }] }],
            nextPageToken: "p2",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            connections: [{ resourceName: "people/2", names: [{ displayName: "Two" }] }],
          }),
          { status: 200 },
        ),
      );
    const all = await listAllGoogleContacts("at", { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(all.map((c) => c.displayName)).toEqual(["One", "Two"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("maps 401 to auth_expired without leaking body", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { status: "UNAUTHENTICATED", message: "secret-token-xyz" } }), {
          status: 401,
        }),
    );
    await expect(
      listGoogleContactsPage({ accessToken: "bad", fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toMatchObject({ code: "auth_expired" });
    try {
      await listGoogleContactsPage({ accessToken: "bad", fetchImpl: fetchImpl as unknown as typeof fetch });
    } catch (err) {
      expect(err).toBeInstanceOf(GoogleContactsError);
      expect(String((err as Error).message)).not.toContain("secret-token-xyz");
    }
  });
});
