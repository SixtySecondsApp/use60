# Meeting → Railway Sync Verification

This guide helps verify that meetings with transcripts are syncing correctly from Supabase to Railway PostgreSQL.

## Sync Flow

1. **Trigger**: When a meeting gets `transcript_text` (INSERT or UPDATE), `trigger_sync_meeting_to_railway` fires
2. **Function**: `sync_meeting_to_railway()` uses `pg_net.http_post` to call the meeting-analytics edge function
3. **Endpoint**: `POST {supabase_url}/functions/v1/meeting-analytics/api/sync/meeting`
4. **Edge function**: Receives payload, upserts to Railway PostgreSQL `transcripts` + `transcript_segments` with embeddings

## Prerequisites Checklist

| Component | Location | Required |
|-----------|----------|----------|
| `system_config.supabase_url` | Supabase SQL | `https://<project-ref>.supabase.co` |
| Vault secret `service_role` or `service_role_key` | Supabase Dashboard → Vault | Service role key |
| `RAILWAY_DATABASE_URL` | meeting-analytics Edge Function secrets | Railway PostgreSQL URL |
| `OPENAI_API_KEY` | meeting-analytics Edge Function secrets | For embeddings |
| `pg_net` extension | Supabase | Enabled by default |

## Verification Steps

### 1. Check meeting-analytics health (Railway connectivity)

```bash
# Production
curl -s "https://ygdpgliavpxeugaajgrb.supabase.co/functions/v1/meeting-analytics/health"

# Staging
curl -s "https://caerqjzvuerejfrdtygb.supabase.co/functions/v1/meeting-analytics/health"
```

Expected: `{"status":"healthy","database":"connected","timestamp":"..."}`

If `database: "disconnected"` → `RAILWAY_DATABASE_URL` is missing or invalid in Edge Function secrets.

### 2. Run SQL in Supabase Dashboard (SQL Editor)

**Production project** (ygdpgliavpxeugaajgrb) → SQL Editor:

```sql
-- 1. Check system_config has supabase_url
SELECT key, value, description
FROM public.system_config
WHERE key = 'supabase_url';
-- Expected: 1 row, value = https://ygdpgliavpxeugaajgrb.supabase.co

-- 2. Check vault has service_role (does not expose the key)
SELECT name FROM vault.decrypted_secrets
WHERE name IN ('service_role', 'service_role_key');
-- Expected: 1 row

-- 3. Check trigger exists
SELECT tgname, tgrelid::regclass
FROM pg_trigger
WHERE tgname = 'trigger_sync_meeting_to_railway';
-- Expected: 1 row, tgrelid = meetings

-- 4. Recent pg_net requests (last 24h) - if pg_net is enabled
SELECT id, created, url, status_code, timed_out
FROM net._http_response
ORDER BY created DESC
LIMIT 20;
-- Look for requests to .../meeting-analytics/api/sync/meeting
-- status_code 200 = success
```

### 3. Test sync manually (optional)

Insert or update a meeting with transcript_text and check:

1. **Supabase** `meetings` table: meeting has `transcript_text`
2. **Railway** `transcripts` table: row with `external_id` = meeting id
3. **Railway** `transcript_segments` table: segments with embeddings

### 4. Common failures

| Symptom | Cause | Fix |
|---------|-------|-----|
| `supabase_url not found in system_config` | system_config empty or wrong key | `INSERT INTO system_config (key, value) VALUES ('supabase_url', 'https://ygdpgliavpxeugaajgrb.supabase.co') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value` |
| `service_role not found in vault` | Vault secret missing | Add `service_role` or `service_role_key` in Dashboard → Settings → Vault |
| `pg_net call failed` | pg_net disabled or URL unreachable | Check pg_net extension; verify meeting-analytics is deployed |
| Health returns `disconnected` | RAILWAY_DATABASE_URL not set | Set in Edge Function secrets |
| Sync returns 401 | Wrong service role key in vault | Update vault secret with correct key |

## Environment-specific URLs

| Environment | Supabase URL | Project ref |
|-------------|--------------|-------------|
| Production | https://ygdpgliavpxeugaajgrb.supabase.co | ygdpgliavpxeugaajgrb |
| Staging | https://caerqjzvuerejfrdtygb.supabase.co | caerqjzvuerejfrdtygb |
