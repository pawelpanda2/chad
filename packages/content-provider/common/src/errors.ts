/**
 * Shared error type for every storage implementation (cp-files, cp-mongo,
 * cp-net-adapter) and, later, the API layer — so callers can distinguish
 * "Content Provider said no" from an unrelated crash without each adapter
 * inventing its own error shape.
 */
export class ContentProviderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "ContentProviderError";
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

export interface ValidationResult {
  valid: boolean;
  /** Present only when valid === false. */
  reason?: string;
}
