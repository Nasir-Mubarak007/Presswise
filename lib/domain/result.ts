/**
 * One result shape for every server action and route handler.
 * Callers narrow on `ok` before reading `data` or `error`.
 */
export type Result<T, E = AppError> = { ok: true; data: T } | { ok: false; error: E };

/** A failure the caller can show to a person. */
export type AppError = {
  /** Stable machine code, for example "order.not_found". */
  code: string;
  /** Safe to show to a person. */
  message: string;
  /** Field level messages keyed by form field name. */
  fields?: Record<string, string>;
};

export function ok<T, E = AppError>(data: T): Result<T, E> {
  return { ok: true, data };
}

export function err<E = AppError>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is { ok: true; data: T } {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok;
}
