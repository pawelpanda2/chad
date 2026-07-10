"use client";

import { useState } from "react";

type Props = {
  code: string;
  onChange?: (value: string) => void;
};

export function CodeEditorTabs({ code, onChange }: Props) {
  const [activeTab, setActiveTab] = useState<"preview" | "edit">("preview");
  const [localCode, setLocalCode] = useState(code);

  function update(value: string) {
    setLocalCode(value);
    onChange?.(value);
  }

  return (
    <div>
      <div className="tabs">
        <button className={`btn tab-btn ${activeTab === "preview" ? "tab-btn-active" : ""}`} onClick={() => setActiveTab("preview")}>
          🧾 Podgląd
        </button>
        <button className={`btn tab-btn ${activeTab === "edit" ? "tab-btn-active" : ""}`} onClick={() => setActiveTab("edit")}>
          ✏️ Edytor
        </button>
      </div>

      {activeTab === "preview" ? (
        <textarea readOnly className="text-area" value={localCode} />
      ) : (
        <textarea className="text-area" value={localCode} onChange={(e) => update(e.target.value)} />
      )}
    </div>
  );
}
