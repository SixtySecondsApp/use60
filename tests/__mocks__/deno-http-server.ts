/**
 * Mock for Deno's https://deno.land/std@0.168.0/http/server.ts
 * Used by vitest.config.edge.ts when running edge function tests in Node.
 */
export function serve(_handler: (req: Request) => Promise<Response>): void {
  // No-op in test environment — edge function handlers are not invoked via serve()
}
