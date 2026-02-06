# Apply Documentation CMS Migrations

## Quick Start

1. Open Supabase Studio SQL Editor:
   **Development**: https://supabase.com/dashboard/project/wbgmnyekgqklggilgqag/sql/new

2. Copy and paste the SQL from each file below (in order):

### Step 1: Create Tables (Schema)

Copy from: `supabase/migrations/20260206100000_docs_cms_schema.sql`

Or run this command to see the SQL:
```bash
cat supabase/migrations/20260206100000_docs_cms_schema.sql
```

### Step 2: Seed Articles

Copy from: `supabase/migrations/20260206100001_seed_ops_intelligence_docs.sql`

Or run this command:
```bash
cat supabase/migrations/20260206100001_seed_ops_intelligence_docs.sql
```

## Verify It Worked

After running both migrations, visit:
- **Docs Page**: http://localhost:5175/docs
- **Admin Page**: http://localhost:5175/platform/docs-admin

You should see 6 articles in the navigation sidebar!

## What You'll Get

1. **Getting Started with Ops Intelligence**
2. **AI Query Bar - All Tools** (15 query tools documented)
3. **Conversations - Multi-Turn Context**
4. **Workflows - Automation**
5. **Recipes - Saved Queries**
6. **Cross-Table Queries & Enrichment**
7. **Proactive Insights & Predictions**

All articles include beginner/intermediate/advanced examples!
