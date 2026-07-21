const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

type Bindings = Record<string, unknown>;

// Evaluated per-call (not cached at module load) so tests can flip LOG_LEVEL/NODE_ENV
// without needing to re-import the module.
function threshold(): number {
  const configured = process.env.LOG_LEVEL as Level | undefined;
  if (configured && configured in LEVELS) return LEVELS[configured];
  return process.env.NODE_ENV === "production" ? LEVELS.info : LEVELS.debug;
}

function serializeError(err: unknown): Bindings {
  if (err instanceof Error) return { message: err.message, name: err.name, stack: err.stack };
  return { message: String(err) };
}

function write(level: Level, bindings: Bindings, msg: string): void {
  if (LEVELS[level] < threshold()) return;
  const stream = level === "warn" || level === "error" ? process.stderr : process.stdout;
  if (process.env.NODE_ENV === "production") {
    stream.write(`${JSON.stringify({ level, time: new Date().toISOString(), msg, ...bindings })}\n`);
    return;
  }
  const extra = Object.keys(bindings).length ? ` ${JSON.stringify(bindings)}` : "";
  stream.write(`[${level.toUpperCase()}] ${msg}${extra}\n`);
}

export interface Logger {
  debug(msg: string, meta?: Bindings): void;
  info(msg: string, meta?: Bindings): void;
  warn(msg: string, meta?: Bindings): void;
  error(msg: string, meta?: Bindings & { err?: unknown }): void;
  child(bindings: Bindings): Logger;
}

function createLogger(bindings: Bindings = {}): Logger {
  return {
    debug: (msg, meta) => write("debug", { ...bindings, ...meta }, msg),
    info: (msg, meta) => write("info", { ...bindings, ...meta }, msg),
    warn: (msg, meta) => write("warn", { ...bindings, ...meta }, msg),
    error: (msg, meta) => {
      const { err, ...rest } = meta ?? {};
      write("error", { ...bindings, ...rest, ...(err !== undefined ? { err: serializeError(err) } : {}) }, msg);
    },
    child: (childBindings) => createLogger({ ...bindings, ...childBindings }),
  };
}

// Structured logging, zero dependencies (per AGENTS.md: flag before reaching for a new
// library where Bun/vanilla suffices). JSON lines to stdout/stderr in production for log
// aggregators; readable `[LEVEL] msg {meta}` in development. Level threshold via LOG_LEVEL
// (debug|info|warn|error), defaulting to "info" in production and "debug" otherwise.
export const logger: Logger = createLogger();
