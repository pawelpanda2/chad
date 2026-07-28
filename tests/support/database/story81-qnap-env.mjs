#!/usr/bin/env node
/**
 * Story 81 — load QNAP Mongo + Postgres URIs for host-side migration scripts.
 * Never prints secrets. Uses .env.local (Mongo) + .env.qnap (Postgres, override).
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, "../../..");

const QNAP_TAILSCALE_HOST = "100.117.139.83";
const QNAP_MONGO_PORT = "12040";
const QNAP_POSTGRES_PORT = "12042";

export function loadStory81QnapEnv() {
  dotenv.config({ path: path.join(REPO_ROOT, ".env.local") });
  dotenv.config({ path: path.join(REPO_ROOT, ".env.qnap"), override: true });

  const mongoUser = process.env.MONGO_ROOT_USERNAME;
  const mongoPass = process.env.MONGO_ROOT_PASSWORD;
  if (!mongoUser || !mongoPass) {
    throw new Error("MONGO_ROOT_USERNAME/MONGO_ROOT_PASSWORD missing (.env.local)");
  }
  process.env.MONGODB_URI =
    process.env.MONGODB_URI ??
    `mongodb://${mongoUser}:${mongoPass}@${QNAP_TAILSCALE_HOST}:${QNAP_MONGO_PORT}/chad?authSource=admin&directConnection=true`;

  const pgUser = process.env.POSTGRES_USER || "chad";
  const pgPass = process.env.POSTGRES_PASSWORD;
  const pgDb = process.env.POSTGRES_DB || "chad";
  if (!pgPass) {
    throw new Error("POSTGRES_PASSWORD missing (.env.qnap)");
  }
  process.env.POSTGRES_URI =
    `postgres://${encodeURIComponent(pgUser)}:${encodeURIComponent(pgPass)}@${QNAP_TAILSCALE_HOST}:${QNAP_POSTGRES_PORT}/${pgDb}`;

  process.env.DBA_MONGO_ENABLED = "true";
  process.env.DBA_CONTENT_PROVIDER_ENABLED = "false";
}

export const CHAD_ADMIN_REPO_GUID = "0fc7da8d-3466-4964-a24c-dfc0d0fef87c";
export const TEST3_REPO_GUID = "5a9c8b7d-6e5f-4a3b-2c1d-0e9f8a7b6c5d";
