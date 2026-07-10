"use client";

import { useMemo, useState } from "react";
import type { ContentItem } from "@/types/content";
import { createItem } from "@/lib/api";
import { joinLoca, parseAddressFromItem } from "@/lib/address";

type Props = {
  item: ContentItem;
  onNavigate: (loca: string) => void;
  onAction: (actionName: string) => void;
};

function parseChildren(item: ContentItem): Record<string, string> {
  if (item.indexQnameDict) return item.indexQnameDict;
  if (typeof item.body === "string") {
    try { return JSON.parse(item.body) as Record<string, string>; } catch { return {}; }
  }
  if (item.body && typeof item.body === "object") return item.body as Record<string, string>;
  return {};
}

export function FolderView({ item, onNavigate, onAction }: Props) {
  const { repo, loca } = parseAddressFromItem(item);
  const [newType, setNewType] = useState("Text");
  const [newName, setNewName] = useState("");
  const children = useMemo(() => parseChildren(item), [item]);

  async function add() {
    if (!newName.trim()) return;
    await createItem(repo, loca, newType, newName.trim());
    setNewName("");
  }

  if (item.type !== "Folder") return null;

  return (
    <div>
      <div className="toolbar">
        <button className="btn" onClick={() => onAction("Folder")}>Folder</button>
        <button className="btn" onClick={() => onAction("Config")}>Config</button>
        <button className="btn" onClick={() => onAction("Terminal")}>Terminal</button>
        <button className="btn" onClick={() => onAction("Script")}>Script</button>
      </div>

      <div className="toolbar">
        <button className="btn" onClick={add}>Add</button>
        <select className="select" value={newType} onChange={(e) => setNewType(e.target.value)}>
          <option value="Text">Text</option>
          <option value="Folder">Folder</option>
          <option value="Ref">Ref</option>
        </select>
        <input className="input" type="text" value={newName} onChange={(e) => setNewName(e.target.value)} />
      </div>

      {Object.entries(children).map(([idx, name]) => (
        <div className="folder-list-row" key={idx}>
          <span className="folder-index">{idx}</span>
          <button className="btn folder-child-btn" onClick={() => onNavigate(joinLoca(loca, idx))}>{name}</button>
        </div>
      ))}
    </div>
  );
}
