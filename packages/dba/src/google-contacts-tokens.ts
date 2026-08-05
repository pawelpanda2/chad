/**
 * Per-user Google Contacts OAuth refresh-token storage.
 *
 * Stored as encrypted JSON in a Text item under the user's own repo:
 *   integrations / google-contacts / oauth-tokens
 *
 * Never returns plaintext tokens to callers other than the decrypt helpers
 * used server-side to call People API.
 */

import {
  resolveByNames,
  findOrCreateFolderChain,
  createOrGetChild,
  putItemBody,
  getChildrenOf,
} from "./item-ops.js";
import { encryptSecret, decryptSecret } from "./secrets-crypto.js";

const FOLDER_PATH = ["integrations", "google-contacts"] as const;
const TOKEN_ITEM_NAME = "oauth-tokens";

export interface StoredGoogleContactsTokens {
  refreshToken: string;
  updatedAt: string;
}

function encodeBody(tokens: StoredGoogleContactsTokens): string {
  return encryptSecret(JSON.stringify(tokens));
}

function decodeBody(body: string): StoredGoogleContactsTokens | null {
  if (!body?.trim()) return null;
  try {
    const json = JSON.parse(decryptSecret(body)) as Partial<StoredGoogleContactsTokens>;
    if (typeof json.refreshToken !== "string" || !json.refreshToken.trim()) return null;
    return {
      refreshToken: json.refreshToken,
      updatedAt: typeof json.updatedAt === "string" ? json.updatedAt : "",
    };
  } catch {
    return null;
  }
}

async function findTokenItem() {
  const folder = await resolveByNames([...FOLDER_PATH]);
  if (!folder) return null;
  const children = await getChildrenOf(folder.config.address);
  return children.find((c) => c.config.type === "Text" && c.config.name === TOKEN_ITEM_NAME) ?? null;
}

/** Whether the current repo has a stored (encrypted) refresh token. Never returns the token. */
export async function hasGoogleContactsConnection(): Promise<boolean> {
  const item = await findTokenItem();
  if (!item || typeof item.body !== "string") return false;
  return decodeBody(item.body) !== null;
}

/** Load decrypted refresh token for the current repo context, or null. */
export async function getGoogleContactsRefreshToken(): Promise<string | null> {
  const item = await findTokenItem();
  if (!item || typeof item.body !== "string") return null;
  return decodeBody(item.body)?.refreshToken ?? null;
}

/** Persist refresh token (encrypted) for the current user repo. */
export async function saveGoogleContactsRefreshToken(refreshToken: string): Promise<void> {
  const token = refreshToken.trim();
  if (!token) throw new Error("refreshToken is required");
  const folder = await findOrCreateFolderChain([...FOLDER_PATH]);
  const item = await createOrGetChild(folder, TOKEN_ITEM_NAME, "Text", "");
  const body = encodeBody({ refreshToken: token, updatedAt: new Date().toISOString() });
  await putItemBody(item.config.address, body);
}

/** Remove stored tokens for the current user (disconnect). */
export async function clearGoogleContactsTokens(): Promise<void> {
  const item = await findTokenItem();
  if (!item) return;
  await putItemBody(item.config.address, "");
}
