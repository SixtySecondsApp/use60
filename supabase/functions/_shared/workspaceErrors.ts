// supabase/functions/_shared/workspaceErrors.ts
// WS-004: Typed Error Classification for workspace API calls

export type WorkspaceProvider = 'google' | 'microsoft' | 'nylas';

export interface WorkspaceErrorResponse {
  error: string;
  code: string;
  retryable: boolean;
  provider: WorkspaceProvider;
}

export class WorkspaceError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly retryable: boolean;
  readonly provider: WorkspaceProvider;

  constructor(
    message: string,
    opts: { code: string; statusCode: number; retryable: boolean; provider: WorkspaceProvider }
  ) {
    super(message);
    this.name = 'WorkspaceError';
    this.code = opts.code;
    this.statusCode = opts.statusCode;
    this.retryable = opts.retryable;
    this.provider = opts.provider;
  }

  toJSON(): WorkspaceErrorResponse {
    return {
      error: this.message,
      code: this.code,
      retryable: this.retryable,
      provider: this.provider,
    };
  }
}

export class TokenExpiredError extends WorkspaceError {
  constructor(provider: WorkspaceProvider, message = 'Access token expired or revoked') {
    super(message, { code: 'token_expired', statusCode: 401, retryable: false, provider });
    this.name = 'TokenExpiredError';
  }
}

export class InsufficientScopeError extends WorkspaceError {
  constructor(provider: WorkspaceProvider, message = 'Insufficient OAuth scopes') {
    super(message, { code: 'insufficient_scope', statusCode: 403, retryable: false, provider });
    this.name = 'InsufficientScopeError';
  }
}

export class RateLimitError extends WorkspaceError {
  readonly retryAfterMs: number;

  constructor(provider: WorkspaceProvider, retryAfterMs = 60_000, message = 'Rate limit exceeded') {
    super(message, { code: 'rate_limit', statusCode: 429, retryable: true, provider });
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class NotFoundError extends WorkspaceError {
  constructor(provider: WorkspaceProvider, message = 'Resource not found') {
    super(message, { code: 'not_found', statusCode: 404, retryable: false, provider });
    this.name = 'NotFoundError';
  }
}

export class ProviderError extends WorkspaceError {
  constructor(provider: WorkspaceProvider, message = 'Provider API error') {
    super(message, { code: 'provider_error', statusCode: 500, retryable: true, provider });
    this.name = 'ProviderError';
  }
}

/**
 * Classify a raw API response into a typed WorkspaceError.
 * Call this when a fetch() to Google/Microsoft/Nylas returns non-OK.
 */
export function classifyApiError(
  provider: WorkspaceProvider,
  status: number,
  body: Record<string, unknown> | string
): WorkspaceError {
  const msg = typeof body === 'string'
    ? body
    : (body?.error as string) || (body?.message as string) || `${provider} API error (${status})`;

  switch (status) {
    case 401:
      return new TokenExpiredError(provider, msg);
    case 403:
      return new InsufficientScopeError(provider, msg);
    case 404:
      return new NotFoundError(provider, msg);
    case 429: {
      const retryHeader = typeof body === 'object' ? (body?.retry_after as number) : undefined;
      return new RateLimitError(provider, retryHeader ? retryHeader * 1000 : 60_000, msg);
    }
    default:
      return new ProviderError(provider, msg);
  }
}

/**
 * Build a JSON Response from a WorkspaceError for edge function returns.
 */
export function workspaceErrorResponse(
  err: WorkspaceError,
  corsHeaders: Record<string, string>
): Response {
  return new Response(JSON.stringify(err.toJSON()), {
    status: err.statusCode,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
