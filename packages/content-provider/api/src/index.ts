/**
 * cp-api's library entry (route handlers, for tests/tooling). Running the
 * actual server is `npm start` / `node dist/server.js` — server.ts isn't
 * re-exported here since starting it as a side effect of importing this
 * module would be surprising.
 */
export * from "./routes.js";
export * from "./http.js";
