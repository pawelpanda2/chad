import type { KnowledgeError } from "dba";

/**
 * HTTP status mapping for dba's KnowledgeError codes — shared by the
 * `/api/knowledge/**` routes (a `route.ts` may only export HTTP handlers,
 * so this lives here, same convention as `folders-api.ts`).
 */
export function statusForKnowledgeError(error: KnowledgeError): number {
  switch (error.code) {
    case "INVALID_SLUG":
      return 400;
    case "CATEGORY_NOT_FOUND":
    case "DOCUMENT_NOT_FOUND":
      return 404;
    default:
      return 500;
  }
}
