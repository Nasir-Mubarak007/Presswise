/**
 * Structured console logging. One JSON line per event, with a level, an
 * event name, and the request id when the caller has one.
 */
type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown> & { requestId?: string };

function emit(level: LogLevel, event: string, fields: LogFields = {}) {
  if (level === "debug" && process.env.NODE_ENV === "production") return;

  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    event,
    ...fields,
  });

  if (level === "warn" || level === "error") {
    console.error(line);
    return;
  }

  console.log(line);
}

export type Logger = {
  debug: (event: string, fields?: LogFields) => void;
  info: (event: string, fields?: LogFields) => void;
  warn: (event: string, fields?: LogFields) => void;
  error: (event: string, fields?: LogFields) => void;
};

function withRequestId(requestId: string): Logger {
  return {
    debug: (event, fields) => emit("debug", event, { ...fields, requestId }),
    info: (event, fields) => emit("info", event, { ...fields, requestId }),
    warn: (event, fields) => emit("warn", event, { ...fields, requestId }),
    error: (event, fields) => emit("error", event, { ...fields, requestId }),
  };
}

export const logger: Logger & { withRequest: (requestId: string) => Logger } = {
  debug: (event, fields) => emit("debug", event, fields),
  info: (event, fields) => emit("info", event, fields),
  warn: (event, fields) => emit("warn", event, fields),
  error: (event, fields) => emit("error", event, fields),
  /** Bind the request id once, so every line for that request carries it. */
  withRequest: withRequestId,
};
