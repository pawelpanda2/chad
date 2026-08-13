import { describe, expect, it } from "vitest";
import {
  cpAddressRepoGuid,
  cpAddressToFoldersHref,
  cpAddressToItemViewHref,
  cpAddressToRouteSlug,
  cpRouteSlugToAddress,
  cpRouteSlugToParts,
} from "./route-codec.js";

const REPO_GUID = "21d11bdc-f1f4-44d1-b61a-3fa6b039c641";

describe("cpAddressToRouteSlug / cpRouteSlugToAddress round-trip", () => {
  it("round-trips a bare repo root address", () => {
    const slug = cpAddressToRouteSlug(REPO_GUID);
    expect(slug).toBe(REPO_GUID);
    expect(cpRouteSlugToAddress(slug!)).toBe(REPO_GUID);
  });

  it("round-trips a single loca segment", () => {
    const address = `${REPO_GUID}/14`;
    const slug = cpAddressToRouteSlug(address);
    expect(slug).toBe(`${REPO_GUID}-14`);
    expect(cpRouteSlugToAddress(slug!)).toBe(address);
  });

  it("round-trips a multi-segment loca despite the UUID's own hyphens", () => {
    const address = `${REPO_GUID}/14/13/01`;
    const slug = cpAddressToRouteSlug(address);
    expect(slug).toBe(`${REPO_GUID}-14-13-01`);
    expect(cpRouteSlugToAddress(slug!)).toBe(address);
  });
});

describe("cpAddressToRouteSlug rejects malformed input", () => {
  it("rejects an invalid UUID prefix", () => {
    expect(cpAddressToRouteSlug("not-a-uuid/14")).toBeNull();
  });

  it("rejects a non-numeric loca segment", () => {
    expect(cpAddressToRouteSlug(`${REPO_GUID}/leads`)).toBeNull();
  });

  it("rejects a path-traversal segment", () => {
    expect(cpAddressToRouteSlug(`${REPO_GUID}/../etc/passwd`)).toBeNull();
  });
});

describe("cpRouteSlugToAddress rejects malformed input", () => {
  it("rejects a slug shorter than a UUID", () => {
    expect(cpRouteSlugToAddress("too-short")).toBeNull();
  });

  it("rejects an invalid UUID prefix", () => {
    expect(cpRouteSlugToAddress(`${"g".repeat(36)}-14`)).toBeNull();
  });

  it("rejects a non-numeric loca segment", () => {
    expect(cpRouteSlugToAddress(`${REPO_GUID}-leads`)).toBeNull();
  });

  it("rejects a path-traversal attempt smuggled into the slug", () => {
    expect(cpRouteSlugToAddress(`${REPO_GUID}-..%2f..%2fetc`)).toBeNull();
  });

  it("rejects a slug with no separator right after the UUID", () => {
    expect(cpRouteSlugToAddress(`${REPO_GUID}x14`)).toBeNull();
  });
});

describe("cpAddressToFoldersHref", () => {
  it("builds the canonical Folders href", () => {
    expect(cpAddressToFoldersHref(`${REPO_GUID}/14/13/01`)).toBe(
      `/dashboard/folders/${REPO_GUID}-14-13-01`,
    );
  });

  it("returns null for a malformed address", () => {
    expect(cpAddressToFoldersHref("garbage")).toBeNull();
  });
});

describe("cpAddressRepoGuid", () => {
  it("extracts the repoGuid prefix", () => {
    expect(cpAddressRepoGuid(`${REPO_GUID}/14/13`)).toBe(REPO_GUID);
    expect(cpAddressRepoGuid(REPO_GUID)).toBe(REPO_GUID);
  });

  it("returns null when the address doesn't start with a valid UUID", () => {
    expect(cpAddressRepoGuid("garbage/14")).toBeNull();
  });
});

describe("cpAddressToItemViewHref", () => {
  it("builds the canonical Item View href", () => {
    expect(cpAddressToItemViewHref(`${REPO_GUID}/14/07/03/01`)).toBe(
      `/dashboard/item-view/${REPO_GUID}-14-07-03-01`,
    );
  });

  it("returns null for a malformed address", () => {
    expect(cpAddressToItemViewHref("garbage")).toBeNull();
  });
});

describe("cpRouteSlugToParts", () => {
  it("splits a slug straight into {repoGuid, loca}", () => {
    expect(cpRouteSlugToParts(`${REPO_GUID}-14-13-01`)).toEqual({ repoGuid: REPO_GUID, loca: "14/13/01" });
  });

  it("returns an empty loca for the bare repo root", () => {
    expect(cpRouteSlugToParts(REPO_GUID)).toEqual({ repoGuid: REPO_GUID, loca: "" });
  });

  it("returns null for a malformed slug", () => {
    expect(cpRouteSlugToParts("garbage")).toBeNull();
  });
});
