/**
 * cp-api — single HTTP entry point for Content Provider.
 *
 * Endpoints (all GET, read-only — Stage 2):
 *   GET /health
 *   GET /storage/status
 *   GET /repos
 *   GET /repos/:repoId/root
 *   GET /repos/:repoId/items/<slash-joined loca>
 *   GET /repos/:repoId/by-names?names=a,b,c
 *   GET /repos/:repoId/many-by-name?parentLoca=X&name=Y
 *   GET /repos/:repoId/find?loca=X&phrase=Y
 *
 * No write endpoints (PUT/POST) yet — Stage 3, once cp-files/cp-mongo
 * implement Put/PostParentItem for real.
 */

import http from "node:http";
import { URL } from "node:url";
import {
  handleHealth,
  handleStorageStatus,
  handleListRepos,
  handleGetItem,
  handleGetByNames,
  handleGetManyByName,
  handleFindRecursively,
} from "./routes.js";
import { sendError } from "./http.js";

const PORT = Number(process.env.CP_API_PORT ?? 12027);

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== "GET") {
    sendError(res, 405, `Method ${req.method} not allowed — this API is read-only (Stage 2)`);
    return;
  }

  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const segments = url.pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    sendError(res, 404, "Not found");
    return;
  }

  if (segments[0] === "health" && segments.length === 1) {
    await handleHealth(res);
    return;
  }

  if (segments[0] === "storage" && segments[1] === "status" && segments.length === 2) {
    await handleStorageStatus(res);
    return;
  }

  if (segments[0] === "repos") {
    if (segments.length === 1) {
      await handleListRepos(res);
      return;
    }

    const repoId = segments[1];
    const rest = segments.slice(2);

    if (rest.length === 0) {
      sendError(res, 404, "Specify /root, /items/<loca>, /by-names, /many-by-name, or /find");
      return;
    }

    if (rest[0] === "root" && rest.length === 1) {
      await handleGetItem(res, repoId, "");
      return;
    }

    if (rest[0] === "items") {
      const loca = rest.slice(1).join("/");
      await handleGetItem(res, repoId, loca);
      return;
    }

    if (rest[0] === "by-names" && rest.length === 1) {
      const names = (url.searchParams.get("names") ?? "").split(",").filter(Boolean);
      await handleGetByNames(res, repoId, names);
      return;
    }

    if (rest[0] === "many-by-name" && rest.length === 1) {
      const parentLoca = url.searchParams.get("parentLoca") ?? "";
      const name = url.searchParams.get("name") ?? "";
      await handleGetManyByName(res, repoId, parentLoca, name);
      return;
    }

    if (rest[0] === "find" && rest.length === 1) {
      const loca = url.searchParams.get("loca") ?? "";
      const phrase = url.searchParams.get("phrase") ?? "";
      await handleFindRecursively(res, repoId, loca, phrase);
      return;
    }
  }

  sendError(res, 404, `Not found: ${url.pathname}`);
});

server.listen(PORT, () => {
  console.log(`cp-api listening on http://localhost:${PORT}`);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use`);
  } else {
    console.error("Server error:", err);
  }
  process.exit(1);
});
