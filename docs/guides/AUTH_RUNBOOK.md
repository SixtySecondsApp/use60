# Authentication Runbook

This runbook documents the canonical setup, event handling, and diagnostics for Supabase authentication in the dashboard. Follow this to prevent regressions like “logged in but no user/data,” “hard refresh logs me out,” or “can’t reach login.”

## 1) Environment and Client Setup

- Required env vars in `.env.local`:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- Supabase stores the session at `localStorage['sb-<project-ref>-auth-token']`. Do not hardcode storage keys.

Client configuration:
```ts
createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce'
  }
});
```

## 2) Auth Events and Cache Invalidation

Treat these events as authenticated: `SIGNED_IN`, `INITIAL_SESSION`, `USER_UPDATED`.

```ts
supabase.auth.onAuthStateChange(async (event, session) => {
  switch (event) {
    case 'SIGNED_IN':
    case 'INITIAL_SESSION':
    case 'USER_UPDATED':
      // Ensure protected data refetches under the new auth context
      queryClient.invalidateQueries();
      break;
    case 'SIGNED_OUT':
      // Clear cached data and auth storage on explicit sign-out
      queryClient.clear();
      authUtils.clearAuthStorage();
      break;
    case 'TOKEN_REFRESHED':
      // Optional: log for monitoring
      break;
  }
});
```

## 3) Per‑Origin Sessions (Ports)

- Sessions are scoped to origin (protocol + host + port).
- `http://localhost:5173` and `http://localhost:5174` do not share sessions.
- Recommendation:
  - Run a single dev server (5173) during testing.
  - If you change ports, re‑login on the new origin.

## 4) Route Guards and Public Routes

- Ensure `/auth/login`, `/auth/signup`, `/auth/forgot-password`, `/auth/reset-password`, and `/debug-auth` are public routes in `ProtectedRoute`.
- Guards must allow these routes even when logged out; redirect authenticated users away from them to `/`.

## 5) Disable Mock‑Auth Fallback in Guards

- Only trust real Supabase sessions:
```ts
authUtils.isAuthenticated = (session) => !!session?.user && !!session?.access_token;
```
- Do not treat “mock users” as authenticated in production or by default in development.

## 6) Profile Loading: Email First

- Always fetch profile by email (primary key for linkage), not by `auth.users.id`.
```ts
const { data: profile } = await supabase
  .from('profiles')
  .select('*')
  .eq('email', user.email)
  .maybeSingle();
```
- Optional fallback: try by `id` if email lookup fails.
- Avoid creating placeholder profiles on the client.

### Caching

- Cache profile for ~5 minutes to reduce queries.
- Invalidate on auth events listed above.

## 7) Sign‑Out Semantics

- On sign‑out: clear React Query cache and auth storage; show a success toast.
- Do not aggressively clear storage at other times unless corruption is detected.

## 8) Diagnostics (Frontend)

Run these when issues are reported:

1) Check `localStorage['sb-<ref>-auth-token']` for a valid `access_token` and future `expires_at`.
2) Console logs from `AuthContext` for `INITIAL_SESSION` / `SIGNED_IN` events.
3) Visit debug tools if available:
   - `/debug-auth` or `/public/debug-auth-state.html`
   - `/public/test-profile-fetch.html`
4) Verify network calls to `/auth/v1/*` and Supabase Function invokes.

## 9) Diagnostics (Backend/Supabase)

- Confirm Google/other Edge Functions CORS allow current origin.
- Ensure redirect URIs include both dev and prod.
- Check RLS policies for `profiles` and integration tables.

## 10) Recovery Procedures

- If session appears corrupted: `authUtils.clearAuthStorage()` then re‑login.
- If profile mismatch: fix row by email; ensure trigger creates new profiles on `auth.users` insert.

Recommended trigger (idempotent):
```sql
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, created_at, updated_at)
  values (new.id, new.email, now(), now())
  on conflict (email) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

## 11) Testing Matrix

- Login, logout, hard refresh
- Incognito window
- Multi‑tab behavior
- Switch ports (expect re‑login)
- Token refresh (long‑lived tab)
- Public vs protected route navigation

## 12) CI/E2E Suggestions

- Add a minimal e2e that logs in, hard refreshes, verifies user data present, and visits a protected route.



