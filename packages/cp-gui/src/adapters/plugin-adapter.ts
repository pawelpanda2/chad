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

/**
 * HTTP implementation, calling `cp-plugin`'s endpoints directly (see
 * packages/cp-plugin/README.md and ADDRESS_FORMATS.md). `address` here is
 * cp-plugin's OWN dash-joined address format
 * (`{repoGuid}-{physical-loca-with-dashes}`), NOT the slash-joined `loca`
 * used elsewhere in Content Provider (cp-core/cp-files/cp-api) — this is
 * cp-plugin's local URL scheme, a genuinely separate convention (see
 * cp-core's types.ts for why the two aren't the same thing). Callers of
 * this adapter are responsible for passing cp-plugin-shaped addresses.
 *
 * `isAvailable()` never throws — cp-plugin is optional by design, a
 * network failure here just means "not available," not an error to
 * propagate and block browsing/editing over.
 */
export function createHttpPluginAdapter(baseUrl: string): PluginAdapter {
  const root = baseUrl.replace(/\/+$/, "");

  async function get(path: string): Promise<void> {
    const response = await fetch(`${root}${path}`);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const message = typeof body === "object" && body && "error" in body ? String((body as { error: unknown }).error) : response.statusText;
      throw new Error(`cp-plugin request failed (${response.status}): ${message}`);
    }
  }

  return {
    async isAvailable() {
      try {
        const response = await fetch(`${root}/health`);
        return response.ok;
      } catch {
        return false;
      }
    },
    openConfig: (address) => get(`/openconfig/${address}`),
    openBody: (address) => get(`/openbody/${address}`),
    openFolder: (address) => get(`/openfolder/${address}`),
    openTerminal: (address) => get(`/terminal/${address}`),
  };
}
