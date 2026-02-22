/**
 * Setup file for edge function tests running under Vitest (Node).
 * Provides Deno global shims so edge function modules can be imported.
 */

// Shim the Deno global used by edge functions
if (typeof globalThis.Deno === 'undefined') {
  (globalThis as any).Deno = {
    env: {
      get: (key: string): string | undefined => {
        // Return safe defaults — tests should mock specific env vars if needed
        const defaults: Record<string, string> = {
          SUPABASE_URL: 'http://localhost:54321',
          SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
          APP_URL: 'https://app.use60.com',
        };
        return process.env[key] ?? defaults[key];
      },
      set: () => {},
      delete: () => {},
      toObject: () => ({}),
    },
  };
}
