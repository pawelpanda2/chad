/**
 * cp-postgre — optional PostgreSQL backend for Content Provider.
 * Selectable via cp-entry / CP_DEFAULT_BACKEND=postgre.
 */

export { postgreStorage } from "./provider/storage.js";
export * from "./models/row.js";
export * from "./client.js";
