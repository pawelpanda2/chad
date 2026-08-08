import { describe, it, expect } from "vitest";
import {
  buildReadableFileName,
  buildRelativeStoragePath,
  sanitizeStorageSegment,
} from "./path-policy.js";
import { FILE_STORAGE_FEATURES } from "./features.js";

describe("file-storage path-policy", () => {
  it("sanitizes traversal and control chars", () => {
    expect(sanitizeStorageSegment("../evil/name")).toBe("evil-name");
    expect(sanitizeStorageSegment("26-08-01_nn_latina")).toBe("26-08-01_nn_latina");
  });

  it("builds relative storage path under 02_files_refrenced", () => {
    const p = buildRelativeStoragePath(
      "pawel_f",
      FILE_STORAGE_FEATURES.PHOTOS_LEAD_INFO,
      "26-08-01_nn_latina",
      "26-08-01_nn_latina.png",
    );
    expect(p).toBe(
      "02_files_refrenced/pawel_f/01_files_photos/lead-info/26-08-01_nn_latina/26-08-01_nn_latina.png",
    );
  });

  it("collision uses __2 __3", () => {
    const existing = new Set(["latina.png"]);
    expect(buildReadableFileName("latina", "png", existing)).toBe("latina__2.png");
    existing.add("latina__2.png");
    expect(buildReadableFileName("latina", "png", existing)).toBe("latina__3.png");
  });
});
