/**
 * Top-level nav + item host. Ported from
 * packages/net-content-provider/front_blazor/BlazorApp/Pages/Repos.razor
 * (read 2026-07-12) — repo picker, loca input, toolbar, address/type/name
 * display, then renders both TextView and FolderView unconditionally
 * underneath (each self-checks `item.Config.type`), same pattern as Blazor.
 *
 * One deliberate improvement over the Blazor original, not a faithful
 * port: Blazor's toolbar has THREE buttons (←, ↶, →) that are all wired
 * to the exact same `OnBackArrowBtnClicked` handler — the "undo"/forward
 * buttons are dead, duplicate code in the real source, not a feature
 * worth replicating. This component implements one real, working
 * back/forward history stack instead.
 *
 * NOT ported: Logout (Blazor's `[Authorize]` was already removed for
 * local dev in the source itself, and no auth system exists yet in this
 * stack — see cp-api/README.md's "No auth" note).
 */

import { useEffect, useState } from "react";
import type { CpItem } from "cp-core";
import type { BackendAdapter } from "../adapters/backend-adapter.js";
import type { PluginAdapter } from "../adapters/plugin-adapter.js";
import type { RepoAdapter } from "../adapters/repo-adapter.js";
import { TextView } from "./TextView.js";
import { FolderView } from "./FolderView.js";
import { splitAddress } from "./address-utils.js";

export interface ContentProviderBrowserProps {
  backend: BackendAdapter;
  plugin: PluginAdapter;
  repo: RepoAdapter;
}

export function ContentProviderBrowser({ backend, plugin, repo }: ContentProviderBrowserProps) {
  const [repos, setRepos] = useState<{ repoGuid: string; name: string }[]>([]);
  const [selectedRepoGuid, setSelectedRepoGuid] = useState<string>("");
  const [locaInput, setLocaInput] = useState<string>("");
  const [history, setHistory] = useState<CpItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const currentItem = history[history.length - 1] ?? null;

  useEffect(() => {
    repo.listRepos().then((list) => {
      setRepos(list);
      if (list.length > 0) {
        setSelectedRepoGuid(list[0].repoGuid);
      }
    });
    // Load once on mount, matching Blazor's OnInitializedAsync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function navigate(item: CpItem) {
    setError(null);
    setHistory((prev) => [...prev, item]);
    setLocaInput(splitAddress(item.Address).loca);
  }

  async function handleRepoChange(repoGuid: string) {
    setSelectedRepoGuid(repoGuid);
    setLocaInput("");
    setHistory([]);
    try {
      const root = await backend.getItem(repoGuid, "");
      navigate(root);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load repo root");
    }
  }

  async function handleGo() {
    try {
      setError(null);
      const item = await backend.getItem(selectedRepoGuid, locaInput);
      setHistory((prev) => [...prev, item]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load item");
    }
  }

  function handleBack() {
    setHistory((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.slice(0, -1);
      const item = next[next.length - 1];
      setLocaInput(splitAddress(item.Address).loca);
      return next;
    });
  }

  return (
    <div className="cp-browser">
      <div className="cp-nav-row">
        Repo::{" "}
        <select value={selectedRepoGuid} onChange={(e) => handleRepoChange(e.target.value)}>
          {repos.map((r) => (
            <option key={r.repoGuid} value={r.repoGuid}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <div className="cp-nav-row">
        Loca::{" "}
        <input type="text" value={locaInput} onChange={(e) => setLocaInput(e.target.value)} />
      </div>
      <div className="cp-toolbar">
        <button type="button" onClick={handleBack} disabled={history.length <= 1}>
          ← Back
        </button>
        <button type="button" onClick={handleGo}>
          GO
        </button>
      </div>

      {error && <div className="cp-error">{error}</div>}

      {currentItem ? (
        <>
          <div className="cp-item-info">
            <div>Address: {currentItem.Address}</div>
            <div>Type: {currentItem.Config.type}</div>
            <div>Name: {currentItem.Config.name}</div>
          </div>
          <TextView item={currentItem} plugin={plugin} />
          <FolderView item={currentItem} plugin={plugin} backend={backend} onNavigate={navigate} />
        </>
      ) : (
        <div>Loading item...</div>
      )}
    </div>
  );
}
