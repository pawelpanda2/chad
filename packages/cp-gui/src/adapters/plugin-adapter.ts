/**
 * PluginAdapter — cp-gui's interface to the locally-installed cp-plugin
 * desktop helper (see packages/cp-plugin). Mirrors Blazor's `PluginAdapter`
 * (injected into FolderView.razor / TextView.razor for the Folder/Config/
 * Terminal toolbar buttons).
 *
 * cp-plugin is optional: if unreachable, isAvailable() returns false and
 * cp-gui must disable/hide the relevant buttons or show a clear message —
 * it must NEVER block browsing or editing.
 */

export interface PluginAdapter {
  isAvailable(): Promise<boolean>;
  openConfig(address: string): Promise<void>;
  openBody(address: string): Promise<void>;
  openFolder(address: string): Promise<void>;
  openTerminal(address: string): Promise<void>;
}

/** Not implemented yet — Stage 1 scope is the contract, not the HTTP client. */
export function createHttpPluginAdapter(_baseUrl: string): PluginAdapter {
  throw new Error("createHttpPluginAdapter is not implemented yet (Stage 1 scope: contracts only).");
}
