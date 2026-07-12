/**
 * Text-item view. Ported from
 * packages/net-content-provider/front_blazor/BlazorApp/Components/ItemModels/TextView.razor
 * (read 2026-07-12). Renders only when `item.Config.type === "Text"` —
 * same "always mounted, self-checks type" pattern as Blazor's
 * `TextView`/`FolderView` (both rendered unconditionally by the parent,
 * each decides internally whether to show anything).
 *
 * NOT ported (Stage 2 is read-only; none of these have a
 * ContentProviderStorage-contract equivalent to call anyway):
 * - Row 2 (GoogleDoc/Tts buttons) — Blazor's own "Open" branch was
 *   entirely commented out already; "Recreate"/Tts call raw
 *   `Backend.InvokeStringArgsApi` operations with no equivalent in
 *   cp-core's ContentProviderStorage (no GoogleDoc/Tts methods exist).
 *   Omitted rather than inventing new contract methods no one asked for.
 * - Row 3 (Add child + body-editing "Save") — both are writes;
 *   `cp-files`/`cp-mongo`'s `Put`/`PostParentItem` still throw
 *   (Stage 3). Body is rendered read-only instead of Blazor's editable
 *   `CodeEditorTabs`.
 */

import { useState } from "react";
import type { CpItem } from "cp-core";
import type { PluginAdapter } from "../adapters/plugin-adapter.js";
import { toPluginAddress } from "./plugin-address.js";

export interface TextViewProps {
  item: CpItem;
  plugin: PluginAdapter;
}

export function TextView({ item, plugin }: TextViewProps) {
  const [pluginError, setPluginError] = useState<string | null>(null);

  if (item.Config.type !== "Text") {
    return null;
  }

  const pluginAddress = toPluginAddress(item.Address);

  async function runPluginAction(action: () => Promise<void>) {
    try {
      setPluginError(null);
      await action();
    } catch (err) {
      // cp-plugin is optional by design — never block browsing, just surface the failure.
      setPluginError(err instanceof Error ? err.message : "cp-plugin request failed");
    }
  }

  return (
    <div className="cp-text-view">
      <div className="cp-text-toolbar">
        <button type="button" onClick={() => runPluginAction(() => plugin.openFolder(pluginAddress))}>
          Folder
        </button>
        <button type="button" onClick={() => runPluginAction(() => plugin.openBody(pluginAddress))}>
          Content
        </button>
        <button type="button" onClick={() => runPluginAction(() => plugin.openConfig(pluginAddress))}>
          Config
        </button>
        <button type="button" onClick={() => runPluginAction(() => plugin.openTerminal(pluginAddress))}>
          Terminal
        </button>
      </div>

      {pluginError && <div className="cp-plugin-error">{pluginError}</div>}

      <pre className="cp-text-body">{item.Body}</pre>
    </div>
  );
}
