import { describe, expect, it } from "vitest";
import { parseHeadersFormat } from "../headers/parse-headers-format.js";
import { annotateCpLinkTargets } from "./cp-link.js";

const VALID_UUID = "21d11bdc-f1f4-44d1-b61a-3fa6b039c641";

describe("annotateCpLinkTargets", () => {
  it("attaches the target id to the note immediately following a valid [uuid] marker", () => {
    const nodes = parseHeadersFormat(`[${VALID_UUID}]\n- Wyluzować co najmniej 2h`).nodes;
    const result = annotateCpLinkTargets(nodes);

    // the marker line is dropped — only the linked note remains
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("note");
    expect(result[0].content).toBe("Wyluzować co najmniej 2h");
    expect(result[0].cpLinkTargetId).toBe(VALID_UUID);
  });

  it("handles tab-indented marker + note pairs", () => {
    const nodes = parseHeadersFormat(`//pamiętać\n\t[${VALID_UUID}]\n\t- Wyluzować co najmniej 2h`).nodes;
    const result = annotateCpLinkTargets(nodes);

    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("header");
    expect(result[1].type).toBe("note");
    expect(result[1].cpLinkTargetId).toBe(VALID_UUID);
  });

  it("does not treat an invalid UUID as a marker — dash line stays a plain note", () => {
    const nodes = parseHeadersFormat("[not-a-real-uuid]\n- some text").nodes;
    const result = annotateCpLinkTargets(nodes);

    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("text");
    expect(result[0].content).toBe("[not-a-real-uuid]");
    expect(result[1].cpLinkTargetId).toBeUndefined();
  });

  it("fails safe when a valid UUID marker has no following dash line", () => {
    const nodes = parseHeadersFormat(`[${VALID_UUID}]\nplain text, not a note`).nodes;
    const result = annotateCpLinkTargets(nodes);

    // marker line is left exactly as-is (unchanged rendering), nothing linked
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("text");
    expect(result[0].content).toBe(`[${VALID_UUID}]`);
    expect(result[0].cpLinkTargetId).toBeUndefined();
    expect(result[1].cpLinkTargetId).toBeUndefined();
  });

  it("fails safe when a valid UUID marker is the very last line", () => {
    const nodes = parseHeadersFormat(`[${VALID_UUID}]`).nodes;
    const result = annotateCpLinkTargets(nodes);

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe(`[${VALID_UUID}]`);
    expect(result[0].cpLinkTargetId).toBeUndefined();
  });

  it("gives two consecutive marker+note pairs each their own target", () => {
    const otherUuid = "5a9c8b7d-1111-4222-8333-444455556666";
    const nodes = parseHeadersFormat(
      [`[${VALID_UUID}]`, "- first", `[${otherUuid}]`, "- second"].join("\n")
    ).nodes;
    const result = annotateCpLinkTargets(nodes);

    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("first");
    expect(result[0].cpLinkTargetId).toBe(VALID_UUID);
    expect(result[1].content).toBe("second");
    expect(result[1].cpLinkTargetId).toBe(otherUuid);
  });

  it("leaves ordinary headers-format content (no markers) completely untouched", () => {
    const content = "//short\n- overview note one\nt; a todo\nd; done item";
    const nodes = parseHeadersFormat(content).nodes;
    const result = annotateCpLinkTargets(nodes);

    expect(result).toEqual(nodes);
  });

  it("attaches the target id to a header immediately following a valid [uuid] marker", () => {
    const nodes = parseHeadersFormat(`[${VALID_UUID}]\n//braki wiedzy`).nodes;
    const result = annotateCpLinkTargets(nodes);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("header");
    expect(result[0].content).toBe("braki wiedzy");
    expect(result[0].cpLinkTargetId).toBe(VALID_UUID);
  });

  it("handles a tab-indented header immediately following a valid [uuid] marker", () => {
    const nodes = parseHeadersFormat(`[${VALID_UUID}]\n\t//braki wiedzy`).nodes;
    const result = annotateCpLinkTargets(nodes);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("header");
    expect(result[0].cpLinkTargetId).toBe(VALID_UUID);
  });

  it("does not treat an invalid UUID as a marker before a header", () => {
    const nodes = parseHeadersFormat("[invalid]\n//header").nodes;
    const result = annotateCpLinkTargets(nodes);

    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("text");
    expect(result[0].content).toBe("[invalid]");
    expect(result[1].type).toBe("header");
    expect(result[1].cpLinkTargetId).toBeUndefined();
  });

  it("fails safe when a valid UUID marker is followed by plain text (not note/header)", () => {
    const nodes = parseHeadersFormat(`[${VALID_UUID}]\nplain text`).nodes;
    const result = annotateCpLinkTargets(nodes);

    expect(result).toHaveLength(2);
    expect(result[0].content).toBe(`[${VALID_UUID}]`);
    expect(result[0].cpLinkTargetId).toBeUndefined();
    expect(result[1].type).toBe("text");
    expect(result[1].cpLinkTargetId).toBeUndefined();
  });
});
