"use client";

import { useState } from "react";
import type { ContentItem } from "@/types/content";
import { appendLine } from "@/lib/api";
import { parseAddressFromItem } from "@/lib/address";
import { CodeEditorTabs } from "./CodeEditorTabs";

type Props = {
  item: ContentItem;
  onAction: (actionName: string) => void;
};

export function TextView({ item, onAction }: Props) {
  const { repo, loca } = parseAddressFromItem(item);
  const [googleDocMode, setGoogleDocMode] = useState("Open");
  const [addMode, setAddMode] = useState("Text");
  const [line, setLine] = useState("");

  async function add() {
    if (!line.trim()) return;
    await appendLine(repo, loca, line.trim());
    setLine("");
  }

  if (item.type !== "Text") return null;

  return (
    <div>
      <div className="toolbar">
        <button className="btn" onClick={() => onAction("Folder")}>Folder</button>
        <button className="btn" onClick={() => onAction("Content")}>Content</button>
        <button className="btn" onClick={() => onAction("Config")}>Config</button>
        <button className="btn" onClick={() => onAction("Terminal")}>Terminal</button>
      </div>

      <div className="toolbar">
        <select className="select" value={googleDocMode} onChange={(e) => setGoogleDocMode(e.target.value)}>
          <option value="Open">Open</option>
          <option value="Recreate">Recreate</option>
        </select>
        <button className="btn" onClick={() => onAction(`GoogleDoc:${googleDocMode}`)}>GoogleDoc</button>
        <button className="btn" onClick={() => onAction("Tts")}>Tts</button>
      </div>

      <div className="toolbar">
        <button className="btn" onClick={add}>Add</button>
        <select className="select" value={addMode} onChange={(e) => setAddMode(e.target.value)}>
          <option value="Text">Up</option>
          <option value="Folder">Down</option>
        </select>
        <input className="input" type="text" value={line} onChange={(e) => setLine(e.target.value)} />
      </div>

      <CodeEditorTabs code={String(item.body ?? "")} />
    </div>
  );
}
