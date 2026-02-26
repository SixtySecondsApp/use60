// supabase/functions/_shared/logger.ts
// Structured logging module with batched writes to the system_logs table.
//
// Usage:
//   const logger = createLogger('copilot-autonomous', { userId, orgId });
//   logger.info('start', { model: 'claude-haiku-4-5' });
//   const span = logger.createSpan('execute_skill', { tool: 'search' });
//   // ... do work ...
//   span.stop({ result_count: 3 }); // emits log entry with duration_ms
//   const child = span.child('sub_step'); // nested span
//   await logger.flush(); // call before returning your edge function Response
//
// Graceful failure: logging errors NEVER crash the host edge function.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LogEvent {
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  timestamp: string;
  service: string;
  action: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  user_id?: string;
  org_id?: string;
  agent_name?: string;
  duration_ms?: number;
  metadata: Record<string, unknown>;
  error_message?: string;
}

export interface Span {
  /** The span's unique ID — pass to child spans or downstream services. */
  spanId: string;
  /** Stop the timer and emit a log entry with duration_ms filled in. */
  stop(additionalMetadata?: Record<string, unknown>): void;
  /** Create a child span that records this span's spanId as its parent_span_id. */
  child(action: string, metadata?: Record<string, unknown>): Span;
}

export interface LoggerOptions {
  /**
   * Supply a pre-existing trace_id to continue a distributed trace.
   * If omitted, a new UUID is auto-generated for this logger instance.
   */
  traceId?: string;
  /** Tie all log entries to a specific user. */
  userId?: string;
  /** Tie all log entries to a specific org. */
  orgId?: string;
  /** Tag entries with an agent name (e.g. 'cc-enrich', 'fleet-router'). */
  agentName?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BATCH_SIZE = 5;
const FLUSH_INTERVAL_MS = 2000;

// ---------------------------------------------------------------------------
// Service-role Supabase client — lazily initialised, module-level singleton.
// Re-creating a client on every flush would be wasteful; one instance is safe
// for concurrent edge function invocations because the client is stateless.
// ---------------------------------------------------------------------------

let _serviceClient: ReturnType<typeof createClient> | null = null;
let _clientReady = false;

function getServiceClient(): ReturnType<typeof createClient> | null {
  if (_clientReady) return _serviceClient;
  _clientReady = true;

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    console.warn('[logger] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — logs will not be persisted');
    return null;
  }

  _serviceClient = createClient(url, key, {
    auth: { persistSession: false },
  });
  return _serviceClient;
}

// ---------------------------------------------------------------------------
// Logger class
// ---------------------------------------------------------------------------

export class Logger {
  private readonly service: string;
  private readonly traceId: string;
  private readonly userId?: string;
  private readonly orgId?: string;
  private readonly agentName?: string;

  private buffer: LogEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(service: string, options: LoggerOptions = {}) {
    this.service = service;
    this.traceId = options.traceId ?? crypto.randomUUID();
    this.userId = options.userId;
    this.orgId = options.orgId;
    this.agentName = options.agentName;
  }

  /** The trace ID for this logger — pass to downstream services for distributed tracing. */
  get trace_id(): string {
    return this.traceId;
  }

  // -------------------------------------------------------------------------
  // Core log methods
  // -------------------------------------------------------------------------

  debug(action: string, metadata: Record<string, unknown> = {}): void {
    this.enqueue(this.buildEvent('debug', action, metadata));
  }

  info(action: string, metadata: Record<string, unknown> = {}): void {
    this.enqueue(this.buildEvent('info', action, metadata));
  }

  warn(action: string, metadata: Record<string, unknown> = {}): void {
    this.enqueue(this.buildEvent('warn', action, metadata));
  }

  /**
   * Log at error level.
   *
   * @param action    Short, dot-namespaced action identifier (e.g. 'skill.execute.failed').
   * @param error     Optional Error object or unknown thrown value — message is extracted automatically.
   * @param metadata  Additional structured context to attach to the log entry.
   */
  error(
    action: string,
    error?: unknown,
    metadata: Record<string, unknown> = {},
  ): void {
    const event = this.buildEvent('error', action, metadata);
    if (error != null) {
      event.error_message = error instanceof Error
        ? error.message
        : String(error);
    }
    this.enqueue(event);
  }

  // -------------------------------------------------------------------------
  // Span helpers
  // -------------------------------------------------------------------------

  /**
   * Create a timing span for `action`.
   * Call `span.stop(additionalMetadata?)` when the work is done — this emits
   * a log entry at 'info' level with `duration_ms` set.
   * Use `span.child(action)` to create nested child spans.
   *
   * @param action    The operation being timed (e.g. 'execute_skill').
   * @param metadata  Static metadata to attach to the completed span entry.
   */
  createSpan(
    action: string,
    metadata: Record<string, unknown> = {},
    parentSpanId?: string,
  ): Span {
    return this.makeSpan(action, metadata, parentSpanId);
  }

  // -------------------------------------------------------------------------
  // Flush
  // -------------------------------------------------------------------------

  /**
   * Force an immediate write of all buffered events to system_logs.
   * Always call this at the end of your edge function before returning a Response.
   * Safe to call even if the buffer is empty.
   */
  async flush(): Promise<void> {
    this.clearTimer();
    const batch = this.buffer.splice(0);
    await this.writeBatch(batch);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private makeSpan(
    action: string,
    metadata: Record<string, unknown>,
    parentSpanId?: string,
  ): Span {
    const spanId = crypto.randomUUID();
    const startMs = Date.now();
    // Capture `this` explicitly so closures inside the returned object can
    // reference the Logger instance even after reassignment.
    const logger = this;

    const span: Span = {
      spanId,

      stop(additionalMetadata: Record<string, unknown> = {}): void {
        const duration_ms = Date.now() - startMs;
        const event = logger.buildEvent('info', action, { ...metadata, ...additionalMetadata });
        event.span_id = spanId;
        event.duration_ms = duration_ms;
        if (parentSpanId !== undefined) event.parent_span_id = parentSpanId;
        logger.enqueue(event);
      },

      child(childAction: string, childMetadata: Record<string, unknown> = {}): Span {
        return logger.makeSpan(childAction, childMetadata, spanId);
      },
    };

    return span;
  }

  private buildEvent(
    level: LogEvent['level'],
    action: string,
    metadata: Record<string, unknown>,
  ): LogEvent {
    const event: LogEvent = {
      trace_id: this.traceId,
      span_id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      service: this.service,
      action,
      level,
      metadata,
    };

    if (this.userId !== undefined) event.user_id = this.userId;
    if (this.orgId !== undefined) event.org_id = this.orgId;
    if (this.agentName !== undefined) event.agent_name = this.agentName;

    return event;
  }

  private enqueue(event: LogEvent): void {
    this.buffer.push(event);

    if (this.buffer.length >= BATCH_SIZE) {
      // Batch is full — flush immediately and cancel any pending timer.
      this.clearTimer();
      const batch = this.buffer.splice(0);
      this.writeBatch(batch).catch(() => {
        // writeBatch is already error-safe; this catch is belt-and-suspenders.
      });
      return;
    }

    // Schedule a time-based flush if one is not already pending.
    if (this.flushTimer === null) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        const batch = this.buffer.splice(0);
        this.writeBatch(batch).catch(() => {});
      }, FLUSH_INTERVAL_MS);
    }
  }

  private clearTimer(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private async writeBatch(events: LogEvent[]): Promise<void> {
    if (events.length === 0) return;

    try {
      const client = getServiceClient();
      if (!client) {
        // No service role key — fall back to console (dev environments).
        for (const ev of events) {
          const extras = ev.error_message ? ` error="${ev.error_message}"` : '';
          console.log(`[${ev.service}][${ev.level.toUpperCase()}] ${ev.action}${extras}`, ev.metadata);
        }
        return;
      }

      const { error } = await client.from('system_logs').insert(events);
      if (error) {
        // Non-fatal: surface to Supabase log drain but never throw.
        // Discard the batch — do not retry.
        console.warn('[logger] system_logs insert failed (batch discarded):', error.message);
      }
    } catch (err) {
      // Unexpected error — log and discard. Must never crash the host function.
      console.warn(
        '[logger] unexpected error in writeBatch (batch discarded):',
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Factory function (preferred entry point)
// ---------------------------------------------------------------------------

/**
 * Create a Logger instance bound to the given service name and optional context.
 *
 * @example
 * const logger = createLogger('copilot-autonomous', { userId, orgId });
 * logger.info('start', { model: 'claude-haiku-4-5' });
 * const span = logger.createSpan('tool_call', { tool: 'execute_action' });
 * // ... do work ...
 * span.stop({ result_count: 3 });
 * await logger.flush(); // always call before returning your Response
 */
export function createLogger(service: string, options?: LoggerOptions): Logger {
  return new Logger(service, options);
}
