"use client";

import { useEffect, useMemo, useState } from "react";
import type { ContentItem } from "@/types/content";
import { action, getAllReposNames, getItem } from "@/lib/api";
import { addressToDisplay, normalizeLoca, parentLoca, parseAddressFromItem } from "@/lib/address";
import { FolderView } from "./FolderView";
import { TextView } from "./TextView";

export function ContentBrowser() {
  const [repos, setRepos] = useState<string[]>([]);
  const [repo, setRepo] = useState("Active");
  const [loca, setLoca] = useState("05/08");
  const [item, setItem] = useState<ContentItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  const displayAddress = useMemo(() => item ? addressToDisplay(item.address) : "", [item]);

  async function load(nextRepo = repo, nextLoca = loca, pushHistory = true) {
    try {
      setError(null);
      const cleanLoca = normalizeLoca(nextLoca);
      const nextItem = await getItem(nextRepo, cleanLoca);
      if (pushHistory && item) setHistory((prev) => [...prev, parseAddressFromItem(item).loca]);
      setRepo(nextRepo);
      setLoca(cleanLoca);
      setItem(nextItem);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleAction(actionName: string) {
    const current = item ? parseAddressFromItem(item) : { repo, loca };
    try {
      await action(actionName, current.repo, current.loca);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    getAllReposNames()
      .then((names) => {
        setRepos(names);
        const first = names[0] ?? "Active";
        setRepo(first);
        return load(first, loca, false);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goBack() {
    const prev = history.at(-1);
    if (!prev) return;
    setHistory((items) => items.slice(0, -1));
    void load(repo, prev, false);
  }

  function goUp() {
    void load(repo, parentLoca(loca));
  }

  return (
    <main className="app-shell">
      <div className="field-row">
        <span className="label">Repo::</span>
        <select className="select repo-select" value={repo} onChange={(e) => setRepo(e.target.value)}>
          {repos.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>

      <div className="field-row">
        <span className="label">Loca::</span>
        <input className="input loca-input" value={loca} onChange={(e) => setLoca(e.target.value)} />
      </div>

      <div className="toolbar">
        <button className="btn nav-btn" onClick={goUp}>◀</button>
        <button className="btn nav-btn" onClick={goBack}>↶</button>
        <button className="btn nav-btn" onClick={() => void load(repo, loca)}>GO</button>
        <button className="btn nav-btn" onClick={() => void load(repo, loca)}>▶</button>
      </div>

      {item && (
        <>
          <div className="meta">
            <div>Address: {displayAddress}</div>
            <div>Type: {item.type}</div>
            <div>Name: {item.name}</div>
          </div>

          <FolderView item={item} onNavigate={(nextLoca) => void load(repo, nextLoca)} onAction={handleAction} />
          <TextView item={item} onAction={handleAction} />
        </>
      )}

      {error && <div className="error">{error}</div>}
      <div className="small-note">
        API: {process.env.NEXT_PUBLIC_CONTENT_API_URL} | Mocks: {process.env.NEXT_PUBLIC_USE_MOCKS === "true" ? "on" : "off"}
      </div>
    </main>
  );
}
