// Deno global type declarations for Supabase Edge Functions
// These declarations allow TypeScript to recognize Deno globals and modules
// even though the IDE doesn't have Deno runtime types installed.

declare namespace Deno {
  interface Env {
    get(key: string): string | undefined;
  }
  
  const env: Env;
  
  // Additional Deno globals commonly used in Edge Functions
  namespace core {
    function opSync(op: string, ...args: any[]): any;
    function opAsync(op: string, ...args: any[]): Promise<any>;
  }
}

// Declare Deno module imports as valid
declare module 'https://deno.land/std@0.168.0/http/server.ts' {
  export function serve(handler: (req: Request) => Response | Promise<Response>): void;
}

declare module 'https://deno.land/std@0.190.0/http/server.ts' {
  export function serve(handler: (req: Request) => Response | Promise<Response>): void;
}

declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export function createClient(url: string, key: string, options?: any): any;
}

// Declare global web APIs available in Deno runtime
declare var console: Console;
declare var fetch: typeof globalThis.fetch;
declare var Response: typeof globalThis.Response;
declare var Request: typeof globalThis.Request;
declare var URL: typeof globalThis.URL;
declare var URLSearchParams: typeof globalThis.URLSearchParams;
declare var setTimeout: typeof globalThis.setTimeout;
declare var clearTimeout: typeof globalThis.clearTimeout;
declare var setInterval: typeof globalThis.setInterval;
declare var clearInterval: typeof globalThis.clearInterval;
declare var JSON: typeof globalThis.JSON;
declare var Math: typeof globalThis.Math;
declare var Object: typeof globalThis.Object;
declare var Array: typeof globalThis.Array;
declare var String: typeof globalThis.String;
declare var Boolean: typeof globalThis.Boolean;
declare var Number: typeof globalThis.Number;
declare var Date: typeof globalThis.Date;
declare var Error: typeof globalThis.Error;
declare var Promise: typeof globalThis.Promise;
declare var encodeURIComponent: typeof globalThis.encodeURIComponent;
declare var decodeURIComponent: typeof globalThis.decodeURIComponent;
declare var isFinite: typeof globalThis.isFinite;
declare var Record: typeof globalThis.Record;
