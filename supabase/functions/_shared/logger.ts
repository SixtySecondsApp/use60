// _shared/logger.ts — Lightweight structured logger for edge functions
// Stub implementation after staging merge cleanup

interface LoggerOptions {
  orgId?: string;
  userId?: string;
  [key: string]: unknown;
}

interface Span {
  end: (meta?: Record<string, unknown>) => void;
}

interface Logger {
  trace_id: string;
  info: (event: string, meta?: Record<string, unknown>) => void;
  warn: (event: string, meta?: Record<string, unknown>) => void;
  error: (event: string, err?: unknown, meta?: Record<string, unknown>) => void;
  createSpan: (name: string, meta?: Record<string, unknown>) => Span;
  flush: () => Promise<void>;
}

export function createLogger(namespace: string, options?: LoggerOptions): Logger {
  const traceId = crypto.randomUUID().slice(0, 8);
  const prefix = `[${namespace}:${traceId}]`;

  return {
    trace_id: traceId,
    info: (event: string, meta?: Record<string, unknown>) => {
      console.log(prefix, event, meta ? JSON.stringify(meta) : '');
    },
    warn: (event: string, meta?: Record<string, unknown>) => {
      console.warn(prefix, event, meta ? JSON.stringify(meta) : '');
    },
    error: (event: string, err?: unknown, meta?: Record<string, unknown>) => {
      console.error(prefix, event, err, meta ? JSON.stringify(meta) : '');
    },
    createSpan: (name: string, _meta?: Record<string, unknown>): Span => {
      const start = Date.now();
      return {
        end: (endMeta?: Record<string, unknown>) => {
          console.log(prefix, `span.${name}`, `${Date.now() - start}ms`, endMeta ? JSON.stringify(endMeta) : '');
        },
      };
    },
    flush: async () => { /* no-op for console logger */ },
  };
}
