/**
 * cp-mongo — optional MongoDB backend for Content Provider.
 * Still selectable via cp-entry / CP_DEFAULT_BACKEND=mongo.
 */

export { mongoStorage } from "./provider/storage.js";
export * from "./models/document.js";
export * from "./client.js";
