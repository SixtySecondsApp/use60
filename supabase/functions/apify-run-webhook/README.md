# Apify Run Webhook

Receives webhook callbacks from Apify when actor runs change status or make progress.

## Features

- **Real-time Progress**: Publishes progress events to Supabase Realtime for live UI updates
- **Status Tracking**: Handles RUNNING, SUCCEEDED, and FAILED events
- **Dataset Processing**: Fetches and stores raw results on completion
- **Mapping Pipeline**: Applies field mappings and GDPR checks automatically
- **Error Handling**: Gracefully handles missing runs and malformed payloads

## Webhook Events

### ACTOR.RUN.RUNNING
- Updates `apify_runs.status` to `running`
- Updates `apify_runs.progress_percent` based on `stats.outputSeqNo`
- Publishes `actor_progress` event to Realtime

### ACTOR.RUN.SUCCEEDED
- Fetches dataset items from Apify
- Stores raw results in `apify_results`
- Applies mapping template if configured
- Publishes `actor_completed` event to Realtime

### ACTOR.RUN.FAILED
- Updates `apify_runs.status` to `failed`
- Stores error message
- Publishes `actor_failed` event to Realtime

## Progress Event Types

```typescript
type ProgressEvent =
  | { type: 'actor_started'; actor: string; query?: Record<string, unknown> }
  | { type: 'actor_progress'; actor: string; percent: number; current: number; total: number }
  | { type: 'actor_completed'; actor: string; result_count: number; duration_ms: number }
  | { type: 'actor_failed'; actor: string; error: string }
```

## Realtime Channel

Progress events are published to:
```
apify_progress_{organizationId}
```

Frontend can subscribe to this channel to receive real-time updates:

```typescript
const channel = supabase.channel(`apify_progress_${organizationId}`)
  .on('broadcast', { event: 'progress_update' }, (payload) => {
    const event = payload.payload as ProgressEvent
    // Update UI based on event type
  })
  .subscribe()
```

## Apify Webhook Configuration

To enable progress updates, configure Apify webhooks with:

1. **Event Types**:
   - `ACTOR.RUN.CREATED` (optional, for started events)
   - `ACTOR.RUN.RUNNING` (for progress updates)
   - `ACTOR.RUN.SUCCEEDED` (required)
   - `ACTOR.RUN.FAILED` (required)

2. **Webhook URL**:
   ```
   https://{project-ref}.supabase.co/functions/v1/apify-run-webhook
   ```

3. **Request Type**: `HTTP POST`

## Deployment

This function must be deployed with `--no-verify-jwt` since it's called externally by Apify:

```bash
npx supabase functions deploy apify-run-webhook --project-ref {project-ref} --no-verify-jwt
```

## Security

- No JWT verification (external webhook)
- Uses service role client (no user context)
- Returns 200 for unknown runs to prevent Apify retries
- Logs all errors but doesn't expose internal details in response

## Database Schema

Requires:
- `apify_runs` table with `progress_percent` column
- `apify_results` table for raw data
- `mapping_templates` table (optional, for field mapping)
- `mapped_records` table (optional, for processed results)

See: `supabase/migrations/20260212400000_apify_progress_tracking.sql`
