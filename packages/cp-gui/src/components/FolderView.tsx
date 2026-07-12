/**
 * Folder-item view. Ported from
 * packages/net-content-provider/front_blazor/BlazorApp/Components/ItemModels/FolderView.razor
 * (read 2026-07-12). Renders only when `item.Config.type === "Folder"`.
 *
 * `item.Body` is the `{childIndex: childName}` JSON map cp-files/
 * cp-net-adapter both produce (see cp-files/README.md) — parsed here the
 * same way Blazor's `GetIndexQnameDict` does.
 *
 * NOT ported (Stage 2 is read-only): the "Add" child-creation form —
 * calls `PostParentItem`, which still throws in both `cp-files` and
 * `cp-mongo` (Stage 3). Also NOT resolved here: Blazor's `FolderView` Add
 * form offers a `Ref` type option, which `content-provider.md`/
 * `frequent-bugs.md` forbid and `CONTENT_PROVIDER_GUIDE.md` implements —
 * a real, unresolved contradiction (see cp-gui/README.md) not to be
 * copied automatically once write support exists.
 */

import { useState } from "react";
import type { CpItem } from "cp-core";
import type { PluginAdapter } from "../adapters/plugin-adapter.js";
import type { BackendAdapter } from "../adapters/backend-adapter.js";
import { toPluginAddress } from "./plugin-address.js";
import { splitAddress, joinLoca } from "./address-utils.js";

export interface FolderViewProps {
  item: CpItem;
  plugin: PluginAdapter;
  backend: BackendAdapter;
  /** Called with the newly-loaded item after a child is clicked — same role as Blazor's `ReloadItemAsync`. */
  onNavigate: (item: CpItem) => void;
}

function parseChildNameMap(body: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, string>;
    }
  } catch {
    // Falls through to {} — a Folder with an unparseable Body shows no children rather than crashing the view.
  }
  return {};
}

export function FolderView({ item, plugin, backend, onNavigate }: FolderViewProps) {
  const [pluginError, setPluginError] = useState<string | null>(null);
  const [navError, setNavError] = useState<string | null>(null);

  if (item.Config.type !== "Folder") {
    return null;
  }

  const pluginAddress = toPluginAddress(item.Address);
  const childNames = parseChildNameMap(item.Body);

  async function runPluginAction(action: () => Promise<void>) {
    try {
      setPluginError(null);
      await action();
    } catch (err) {
      setPluginError(err instanceof Error ? err.message : "cp-plugin request failed");
    }
  }

  async function handleChildClick(childIndex: string) {
    try {
      setNavError(null);
      const { repoGuid, loca } = splitAddress(item.Address);
      const childItem = await backend.getItem(repoGuid, joinLoca(loca, childIndex));
      onNavigate(childItem);
    } catch (err) {
      setNavError(err instanceof Error ? err.message : "Failed to load item");
    }
  }

  return (
    <div className="cp-folder-view">
      <div className="cp-folder-toolbar">
        <button type="button" onClick={() => runPluginAction(() => plugin.openFolder(pluginAddress))}>
          Folder
        </button>
        <button type="button" onClick={() => runPluginAction(() => plugin.openConfig(pluginAddress))}>
          Config
        </button>
        <button type="button" onClick={() => runPluginAction(() => plugin.openTerminal(pluginAddress))}>
          Terminal
        </button>
      </div>

      {pluginError && <div className="cp-plugin-error">{pluginError}</div>}
      {navError && <div className="cp-nav-error">{navError}</div>}

      <div className="cp-folder-children">
        {Object.entries(childNames).map(([index, name]) => (
          <div key={index}>
            <span className="cp-child-index">{index}</span>
            <button type="button" onClick={() => handleChildClick(index)}>
              {name}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
