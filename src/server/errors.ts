import type { ErrorCode } from "../shared/protocol.ts";

const STATUS: Partial<Record<ErrorCode, number>> = {
  BAD_REQUEST: 422,
  UNAUTHENTICATED: 401,
  BAD_CREDENTIALS: 401,
  FORBIDDEN: 403,
  CSRF: 403,
  ORIGIN: 403,
  NOT_EDITOR: 403,
  NOT_OWNER: 403,
  NOT_FOUND: 404,
  WITHDRAWN: 404,
  HANDLE_TAKEN: 409,
  COLLISION: 409,
  STALE_WORLD: 409,
  STALE_VIEW: 409,
  STALE_LEASE: 409,
  NO_LEASE: 409,
  MODE: 409,
  NOT_STABLE: 409,
  ARCHIVED: 409,
  IDEMPOTENCY_CONFLICT: 409,
  REFERENCED: 409,
  INVITE_INVALID: 404,
  INVITE_FULL: 409,
  OUT_OF_BOUNDS: 422,
  NON_FINITE: 422,
  CAPACITY: 409,
  LIMIT: 409,
  INCOMPATIBLE: 409,
  RATE_LIMITED: 429,
  BUSY: 503,
  ROOM_FULL: 503,
  ROOM_LIMIT: 503,
  ROOM_PAUSED: 503,
  SAVE_FAILED: 503,
  STORAGE_FULL: 507,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryAfterMs?: number;
  constructor(code: ErrorCode, message: string, retryAfterMs?: number) {
    super(message);
    this.code = code;
    this.status = STATUS[code] ?? 400;
    this.retryAfterMs = retryAfterMs;
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;
