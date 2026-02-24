# /new-environment — Create a new Supabase branch environment

I want to create a new environment: $ARGUMENTS

Act as an expert DevOps consultant. Ask me meaningful questions, one by one, until you have enough information to set up the environment. Then execute the full workflow.

---

## RULES (Consult-style)

1. Ask **ONE focused question** at a time
2. Wait for my answer before asking the next question
3. Keep questions relevant and purposeful — don't ask what you can infer
4. Stop asking when you have sufficient context (typically 3-5 questions)
5. Before executing, briefly **confirm your understanding** of the goal
6. Execute with precision based on gathered context

---

## Questions to consider asking (pick the most relevant)

- What should this environment be called? (e.g., development, preview, qa)
- Which existing environment should it branch from? (staging or production)
- Should edge functions be deployed to the branch?
- Should integration keys be shared with an existing environment or use separate credentials?
- Should auth users and/or public data be copied from the source environment?
- Should a new git branch be created for this environment?
- Should `npm run dev` default to this new environment?

---

## EXECUTION (after questions answered)

### Step 1: Create Supabase Branch

1. Determine the parent project ref based on the source environment:
   - **staging**: `caerqjzvuerejfrdtygb`
   - **production**: `ygdpgliavpxeugaajgrb`

2. Create the branch using the Supabase CLI:
   ```bash
   supabase branches create <environment-name> --project-ref <parent-project-ref>
   ```

3. Capture the branch project ref, URL, anon key, and service role key from the output.

4. If the CLI branch creation fails or is unavailable, instruct the user to:
   - Go to Supabase Dashboard > Project Settings > Branches
   - Create a new branch manually
   - Provide the branch project ref, URL, anon key, and service role key

### Step 2: Deploy Edge Functions to the Branch

1. Link to the branch project:
   ```bash
   supabase link --project-ref <branch-project-ref>
   ```

2. Deploy all edge functions:
   ```bash
   supabase functions deploy --project-ref <branch-project-ref>
   ```

3. Verify deployment:
   ```bash
   supabase functions list --project-ref <branch-project-ref>
   ```

4. Set required secrets on the branch (copy from source environment):
   - Read the source `.env.<source>` file for secret values
   - Set secrets on the branch:
     ```bash
     supabase secrets set --project-ref <branch-project-ref> \
       SUPABASE_SERVICE_ROLE_KEY=<value> \
       AWS_REGION=<value> \
       AWS_ACCESS_KEY_ID=<value> \
       AWS_SECRET_ACCESS_KEY=<value> \
       AWS_S3_BUCKET=<value> \
       SES_FROM_EMAIL=<value> \
       SES_FROM_NAME=<value> \
       MEETINGBAAS_API_KEY=<value> \
       MEETINGBAAS_WEBHOOK_SECRET=<value> \
       GLADIA_API_KEY=<value> \
       CRON_SECRET=<value> \
       SLACK_CLIENT_ID=<value> \
       SLACK_CLIENT_SECRET=<value> \
       SLACK_SIGNING_SECRET=<value> \
       HUBSPOT_CLIENT_ID=<value> \
       HUBSPOT_CLIENT_SECRET=<value> \
       STRIPE_SECRET_KEY=<value> \
       STRIPE_WEBHOOK_SECRET=<value> \
       SAVVYCAL_API_TOKEN=<value> \
       CLOUDINARY_API_KEY=<value> \
       CLOUDINARY_API_SECRET=<value>
     ```

### Step 3: Create the Environment File

1. Copy the source environment file as a template:
   ```bash
   cp .env.<source> .env.<new-environment>
   ```

2. Update the following values in `.env.<new-environment>`:

   | Variable | New Value |
   |----------|-----------|
   | `VITE_ENVIRONMENT` | `<new-environment-name>` |
   | `VITE_SUPABASE_URL` | `https://<branch-ref>.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | Branch anon key |
   | `SUPABASE_URL` | `https://<branch-ref>.supabase.co` |
   | `SUPABASE_ANON_KEY` | Branch anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Branch service role key |
   | `SUPABASE_PROJECT_ID` | Branch project ref |
   | `SUPABASE_DATABASE_PASSWORD` | Branch database password |
   | `SES_FROM_EMAIL` | `<env>@sixtyseconds.ai` |
   | `SES_FROM_NAME` | `Sixty Seconds (<Env>)` |
   | `HUBSPOT_REDIRECT_URI` | `https://<branch-ref>.supabase.co/functions/v1/hubspot-oauth-callback` |

   All other keys (AI providers, Slack, Google, Fathom, MeetingBaaS, etc.) stay the same as the source environment.

3. Keep local URLs pointing to localhost:
   ```
   VITE_PUBLIC_URL=http://localhost:5175
   PUBLIC_URL=http://localhost:5175
   APP_URL=http://localhost:5175
   SITE_URL=http://localhost:5175
   ```

### Step 4: Update Application Configuration

1. **Add npm script** in `package.json`:
   ```json
   "dev:<env>": "vite --mode <new-environment>"
   ```

2. **If this is the new default dev environment**, update the `dev` script:
   ```json
   "dev": "vite --mode <new-environment>"
   ```

3. **Update `src/lib/config.ts`** — add environment detection for the new branch:
   ```typescript
   const <ENV>_PROJECT_REF = '<branch-ref>';
   export const is<Env> = getSupabaseUrl()?.includes(<ENV>_PROJECT_REF) ?? false;
   ```

4. **Audit and list all files that reference Supabase URLs** that may need awareness of the new environment:

   **Files to check:**
   - `src/lib/config.ts` — environment detection
   - `src/lib/external-project-config.ts` — multi-project config
   - `src/lib/sentry.ts` — Sentry environment tagging
   - `src/vite-env.d.ts` — TypeScript env var declarations
   - `vite.config.ts` — Vite define/env mapping
   - `packages/landing/.env` — landing page config (if applicable)
   - `supabase/config.toml` — Supabase local config
   - `.env.example` — update template with new environment reference
   - `CLAUDE.md` — update project references table

### Step 5: Migrate Auth & Data (if requested)

If the user wants auth users and/or public data copied from the source environment:

#### 5a: Push Schema Migrations

New branches start with an empty public schema. Migrations must be applied first.

1. **Enable citext extension** (required by baseline migration):
   ```bash
   psql "<branch-db-url>" -c "CREATE EXTENSION IF NOT EXISTS citext SCHEMA public;"
   ```

2. **Apply baseline migration directly via psql** (the CLI login role lacks the correct search_path for citext):
   ```bash
   psql "<branch-db-url>" -f supabase/migrations/00000000000000_baseline.sql
   ```

3. **Record baseline in migrations table**:
   ```sql
   INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
   VALUES ('00000000000000', '{}', 'baseline') ON CONFLICT DO NOTHING;
   ```

4. **Re-run baseline with correct search_path** to create any objects that failed due to citext:
   ```bash
   psql "<branch-db-url>" -c "SET search_path TO public, extensions;" \
     -f supabase/migrations/00000000000000_baseline.sql
   ```
   (Existing objects will produce harmless "already exists" errors.)

5. **Push remaining migrations via CLI**:
   ```bash
   echo "Y" | supabase db push --include-all
   ```
   If this fails due to duplicate migration timestamps (two files sharing the same prefix), apply remaining migrations directly via psql with `ON_ERROR_STOP=0` and record each in `supabase_migrations.schema_migrations`.

#### 5b: Copy Auth Users

1. **Dump auth data from source** (must use direct postgres connection, not CLI login role):
   ```bash
   supabase db dump --linked --data-only --schema auth > auth_dump.sql
   ```

2. **Find the branch pooler host** (branches may use a different pooler, e.g. `aws-1` instead of `aws-0`):
   ```bash
   supabase db dump --dry-run 2>&1  # reveals actual connection parameters
   ```

3. **Restore auth data to the branch**:
   ```bash
   psql "postgresql://postgres.<branch-ref>:<db-password>@<branch-pooler-host>:5432/postgres" \
     -f auth_dump.sql
   ```
   Note: The CLI login role doesn't have INSERT permissions on `auth` schema — use the direct `postgres` user connection.

#### 5c: Copy Public Data (optional)

1. **Dump public data from source**:
   ```bash
   pg_dump "<source-db-url>" --data-only --schema=public > public_dump.sql
   ```

2. **Create a wrapper SQL file** to disable triggers during restore:
   ```sql
   SET session_replication_role = replica;
   \i public_dump.sql
   SET session_replication_role = DEFAULT;
   ```

3. **Restore public data** (tolerating errors for duplicate keys from partial loads):
   ```bash
   psql "<branch-db-url>" -v ON_ERROR_STOP=0 -f restore_wrapper.sql
   ```

**Important notes**:
- Large dumps (>100MB) can take 15+ minutes over the network
- Do NOT use `--single-transaction` — if any error occurs the entire restore rolls back
- The dump inserts data in alphabetical table order; partial loads will populate early tables
- `SET session_replication_role = replica` disables triggers/FK checks during restore
- Circular foreign key dependencies require this approach over plain `psql -f`

### Step 6: Create Git Branch (if requested)

1. Create a new git branch from the source:
   ```bash
   git checkout <source-branch>
   git pull origin <source-branch>
   git checkout -b <new-environment>
   ```

2. Stage the new environment file and config changes:
   ```bash
   git add .env.<new-environment> package.json src/lib/config.ts
   ```

3. **Do NOT commit automatically** — wait for user confirmation.

### Step 7: Re-link to Original Project

After deploying to the branch, re-link back to the source project so local CLI commands still work against the expected environment:

```bash
supabase link --project-ref <original-project-ref>
```

### Step 8: Output Summary

Print:
```
New environment "<name>" created successfully!

Supabase Branch:
  Project Ref: <branch-ref>
  URL: https://<branch-ref>.supabase.co
  Parent: <source> (<parent-ref>)

Files Created/Modified:
  .env.<name> — environment configuration
  package.json — added dev:<name> script
  src/lib/config.ts — added environment detection

Edge Functions: <count> deployed
Git Branch: <branch-name> (from <source-branch>)

Files to review for new endpoint awareness:
  - src/lib/config.ts
  - src/lib/external-project-config.ts
  - src/lib/sentry.ts
  - vite.config.ts
  - packages/landing/.env (if landing page needs this env)
  - CLAUDE.md (update project references)

Next: Run `npm run dev` to start developing against the new environment.
```

---

## use60 Environment Reference

| Environment | Project Ref | Git Branch | npm Script |
|-------------|-------------|------------|------------|
| **Production** | `ygdpgliavpxeugaajgrb` | `main` | `npm run build:prod` |
| **Staging** | `caerqjzvuerejfrdtygb` | `staging` | `npm run dev:staging` |

**External Project** (customer-facing): `cregubixyglvfzvtlgit` (production only)

## Critical Reminders

- **Never expose service role keys** to the frontend (no `VITE_` prefix)
- **Edge function secrets** must be set separately on each branch — they are NOT inherited
- **OAuth redirect URIs** (Google, Fathom, HubSpot) may need updating if the new environment has a public URL
- **Webhook URLs** (MeetingBaaS, Stripe, Slack) may need updating to point to the new branch's edge functions
- **The `.env.<name>` file should be in `.gitignore`** if it contains secrets (check before committing)
