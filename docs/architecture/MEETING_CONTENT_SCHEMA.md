# Meeting Content Schema Documentation

## Overview

Database schema for storing AI-extracted topics and AI-generated marketing content from meeting transcripts. Designed with caching, versioning, cost tracking, and multi-user security.

## Entity Relationship Diagram

```
┌─────────────────────┐
│      meetings       │
│  (existing table)   │
└──────────┬──────────┘
           │
           │ 1:N
           ├──────────────────────────────────┐
           │                                  │
           ▼                                  ▼
┌──────────────────────────┐    ┌────────────────────────────┐
│ meeting_content_topics   │    │ meeting_generated_content  │
├──────────────────────────┤    ├────────────────────────────┤
│ id (PK)                  │    │ id (PK)                    │
│ meeting_id (FK)          │    │ meeting_id (FK)            │
│ user_id (FK)             │    │ user_id (FK)               │
│ topics (JSONB)           │    │ content_type               │
│ model_used               │    │ content_markdown           │
│ tokens_used              │    │ model_used                 │
│ cost_cents               │    │ tokens_used                │
│ extraction_version       │    │ cost_cents                 │
│ created_at               │    │ version                    │
│ updated_at               │    │ parent_version_id (FK)     │
│ deleted_at               │    │ created_at                 │
└──────────┬───────────────┘    │ updated_at                 │
           │                    │ deleted_at                 │
           │                    └──────────┬─────────────────┘
           │                               │
           │                               │ Self-reference (versions)
           │                               └─────┐
           │                                     │
           │ N:M                                 │
           │                                     │
           └──────────────┐                      │
                          │                      │
                          ▼                      ▼
                ┌─────────────────────┐    ┌─────────────┐
                │ content_topic_links │    │   (self)    │
                ├─────────────────────┤    └─────────────┘
                │ id (PK)             │
                │ content_id (FK)     │────────┘
                │ topic_extraction_id │
                │ topic_index         │
                │ created_at          │
                └─────────────────────┘
```

## Table Descriptions

### `meeting_content_topics`

Stores AI-extracted topics from meeting transcripts with caching support.

**Key Features**:
- One extraction per meeting (cached)
- 5-10 topics stored as JSONB array
- Tracks extraction version for re-extraction capability
- Cost tracking for budget monitoring

**JSONB Topic Structure**:
```json
[
  {
    "title": "Product Launch Strategy",
    "description": "Discussion of Q2 product launch timeline and marketing approach",
    "timestamp": "00:05:23",
    "fathom_url": "https://fathom.video/share/abc123?t=323"
  },
  {
    "title": "Budget Allocation",
    "description": "Review of marketing budget distribution across channels",
    "timestamp": "00:12:45",
    "fathom_url": "https://fathom.video/share/abc123?t=765"
  }
]
```

**Caching Strategy**:
- Check if topics exist for meeting: `WHERE meeting_id = ? AND deleted_at IS NULL`
- If transcript updated after extraction: Compare `meetings.updated_at` vs `created_at`
- Re-extraction: Increment `extraction_version`, create new record
- Keep history: Don't delete old extractions (soft delete only)

### `meeting_generated_content`

Stores AI-generated marketing content with version history.

**Content Types**:
- `social` - Social media posts (Twitter, LinkedIn, etc.)
- `blog` - Blog post drafts
- `video` - Video script outlines
- `email` - Email campaign drafts

**Versioning Strategy**:
- Each regeneration creates new record with incremented `version`
- `parent_version_id` links to previous version
- Query latest: `ORDER BY version DESC LIMIT 1`
- Version chain: Follow `parent_version_id` backwards

**Content Format**:
- Stored as markdown text
- Supports rich formatting, links, emphasis
- Frontend renders with markdown parser

### `content_topic_links`

Junction table linking generated content to selected topics.

**Purpose**:
- Track which topics were used to generate each piece of content
- Enable filtering: "Show all content using topic X"
- Analytics: "Which topics generate most content?"

**Topic Reference**:
- `topic_extraction_id`: FK to `meeting_content_topics.id`
- `topic_index`: Index position in the JSONB topics array
- Combined: Exact reference to specific topic

**Example**:
```sql
-- Topic at index 2 in extraction abc-123 used for content xyz-789
INSERT INTO content_topic_links (content_id, topic_extraction_id, topic_index)
VALUES ('xyz-789', 'abc-123', 2);
```

## Design Decisions

### 1. JSONB vs Separate Topics Table

**Decision**: Store topics as JSONB array in single record

**Rationale**:
- ✅ Topics are extracted atomically (all at once)
- ✅ Simpler queries (no joins to get topics)
- ✅ Maintains topic ordering from AI
- ✅ Reduces table size (5-10 topics → 1 record vs 10 records)
- ✅ Topics rarely queried individually
- ❌ Slightly more complex for filtering by topic (acceptable trade-off)

**Alternative Considered**: Separate `meeting_topics` table with one row per topic
- Rejected: More normalized but unnecessary complexity for this use case

### 2. Versioning Strategy

**Decision**: Version chain with `parent_version_id`

**Rationale**:
- ✅ Full version history preserved
- ✅ Can compare versions side-by-side
- ✅ Rollback capability
- ✅ A/B testing support
- ✅ Audit trail for content changes
- ❌ More storage (acceptable for user value)

**Alternative Considered**: Overwrite content on regeneration
- Rejected: Loses history, no comparison capability

### 3. Junction Table vs JSONB Array

**Decision**: Junction table `content_topic_links`

**Rationale**:
- ✅ Referential integrity with foreign keys
- ✅ Better query performance for filtering
- ✅ Standard SQL joins
- ✅ Analytics on topic usage
- ❌ Slightly more complex writes (acceptable trade-off)

**Alternative Considered**: Store topic IDs as JSONB array in `meeting_generated_content`
- Rejected: No referential integrity, harder to query, no cascade delete

### 4. Soft Delete Pattern

**Decision**: Use `deleted_at` timestamp for soft delete

**Rationale**:
- ✅ Consistent with existing codebase pattern (see CLAUDE.md)
- ✅ Data recovery capability
- ✅ Audit trail preservation
- ✅ Prevents accidental data loss
- ❌ Requires filtering in queries (handled by RLS)

**Implementation**: All RLS policies filter `deleted_at IS NULL`

### 5. Cost Tracking as Integer Cents

**Decision**: Store costs as integer cents, not decimal dollars

**Rationale**:
- ✅ Avoids floating-point precision errors
- ✅ PostgreSQL INTEGER is faster than NUMERIC
- ✅ Exact arithmetic (no rounding errors)
- ✅ Industry standard (Stripe, payment systems)
- ❌ Requires division by 100 for display (trivial)

**Example**:
```typescript
// Storage
const costCents = Math.round(tokens * costPer1kTokens / 1000 * 100);

// Display
const costDollars = (costCents / 100).toFixed(2);
```

## Index Strategy

### Performance Goals
- `<50ms` for single meeting topic/content queries
- `<200ms` for user's all meetings aggregation
- `<100ms` for latest version queries

### Index Rationale

**meeting_content_topics**:
```sql
-- Foreign key lookup (JOIN performance)
idx_meeting_content_topics_meeting_id (meeting_id)

-- RLS policy performance
idx_meeting_content_topics_user_id (user_id)

-- Common filtered queries: "Get topics for meeting where not deleted"
idx_meeting_content_topics_meeting_deleted (meeting_id, deleted_at)

-- Recent extractions: "Show latest extractions"
idx_meeting_content_topics_created (created_at DESC)
```

**meeting_generated_content**:
```sql
-- Foreign key lookup
idx_meeting_generated_content_meeting_id (meeting_id)

-- RLS policy performance
idx_meeting_generated_content_user_id (user_id)

-- Common filtered queries
idx_meeting_generated_content_meeting_deleted (meeting_id, deleted_at)

-- Partial index: "Filter by content type" (only active records)
idx_meeting_generated_content_type (content_type) WHERE deleted_at IS NULL

-- "Get latest version": ORDER BY version DESC
idx_meeting_generated_content_version (meeting_id, content_type, version DESC)
```

**content_topic_links**:
```sql
-- JOIN performance
idx_content_topic_links_content_id (content_id)
idx_content_topic_links_topic_id (topic_extraction_id)

-- UNIQUE constraint creates implicit index
(content_id, topic_extraction_id, topic_index)
```

## RLS Security Model

### Authorization Flow

1. **User Authentication**: Supabase Auth provides `auth.uid()`
2. **Ownership Verification**: Check `meetings.owner_user_id = auth.uid()`
3. **Data Access**: RLS policies enforce ownership at query time
4. **Soft Delete Filtering**: Policies automatically filter `deleted_at IS NULL`

### Policy Patterns

**SELECT Policies**:
```sql
-- Pattern: User can view data for meetings they own
USING (
    EXISTS (
        SELECT 1 FROM meetings
        WHERE meetings.id = [table].meeting_id
        AND meetings.owner_user_id = auth.uid()
    )
    AND deleted_at IS NULL
)
```

**INSERT Policies**:
```sql
-- Pattern: User can create data for their meetings
WITH CHECK (
    EXISTS (
        SELECT 1 FROM meetings
        WHERE meetings.id = [table].meeting_id
        AND meetings.owner_user_id = auth.uid()
    )
    AND user_id = auth.uid()
)
```

**UPDATE Policies**:
```sql
-- Pattern: User can update their non-deleted data
USING (
    EXISTS (SELECT 1 FROM meetings WHERE ...)
    AND user_id = auth.uid()
    AND deleted_at IS NULL
)
WITH CHECK (
    EXISTS (SELECT 1 FROM meetings WHERE ...)
    AND user_id = auth.uid()
)
```

### Security Considerations

- ✅ Meeting ownership verified via JOIN (can't bypass by knowing meeting_id)
- ✅ Soft delete respected in all policies
- ✅ User can't impersonate others (user_id must match auth.uid())
- ✅ Cascade deletes maintain referential integrity
- ✅ Junction table policies verify both sides of relationship

## Common Query Examples

### 1. Get Latest Topics for Meeting

```sql
-- Using helper function
SELECT * FROM get_latest_topics('meeting-uuid-here');

-- Manual query
SELECT *
FROM meeting_content_topics
WHERE meeting_id = 'meeting-uuid-here'
  AND deleted_at IS NULL
ORDER BY extraction_version DESC, created_at DESC
LIMIT 1;
```

### 2. Get All Generated Content for Meeting

```sql
-- All content types with latest versions
SELECT DISTINCT ON (content_type)
    id,
    content_type,
    content_markdown,
    version,
    created_at,
    tokens_used,
    cost_cents
FROM meeting_generated_content
WHERE meeting_id = 'meeting-uuid-here'
  AND deleted_at IS NULL
ORDER BY content_type, version DESC, created_at DESC;
```

### 3. Get Latest Version of Specific Content Type

```sql
-- Using helper function
SELECT * FROM get_latest_content('meeting-uuid-here', 'blog');

-- Manual query
SELECT *
FROM meeting_generated_content
WHERE meeting_id = 'meeting-uuid-here'
  AND content_type = 'blog'
  AND deleted_at IS NULL
ORDER BY version DESC, created_at DESC
LIMIT 1;
```

### 4. Get Content with Selected Topics

```sql
-- Content with full topic details
SELECT
    mgc.id,
    mgc.content_type,
    mgc.content_markdown,
    jsonb_agg(
        mct.topics->ctl.topic_index
    ) AS selected_topics
FROM meeting_generated_content mgc
JOIN content_topic_links ctl ON mgc.id = ctl.content_id
JOIN meeting_content_topics mct ON ctl.topic_extraction_id = mct.id
WHERE mgc.id = 'content-uuid-here'
  AND mgc.deleted_at IS NULL
  AND mct.deleted_at IS NULL
GROUP BY mgc.id, mgc.content_type, mgc.content_markdown;
```

### 5. Calculate Total Costs for Meeting

```sql
-- Using helper function
SELECT * FROM get_meeting_ai_costs('meeting-uuid-here');

-- Manual query
SELECT
    COALESCE(SUM(mct.cost_cents), 0) + COALESCE(SUM(mgc.cost_cents), 0) AS total_cost_cents,
    COALESCE(SUM(mct.tokens_used), 0) + COALESCE(SUM(mgc.tokens_used), 0) AS total_tokens,
    COALESCE(SUM(mct.cost_cents), 0) AS topic_cost_cents,
    COALESCE(SUM(mgc.cost_cents), 0) AS content_cost_cents
FROM meetings m
LEFT JOIN meeting_content_topics mct ON m.id = mct.meeting_id AND mct.deleted_at IS NULL
LEFT JOIN meeting_generated_content mgc ON m.id = mgc.meeting_id AND mgc.deleted_at IS NULL
WHERE m.id = 'meeting-uuid-here'
GROUP BY m.id;
```

### 6. Check if Topics Need Re-extraction

```sql
-- Compare meeting update time with latest extraction
SELECT
    m.id,
    m.updated_at AS meeting_updated,
    mct.created_at AS topics_extracted,
    CASE
        WHEN mct.id IS NULL THEN 'needs_extraction'
        WHEN m.updated_at > mct.created_at THEN 'needs_reextraction'
        ELSE 'cached'
    END AS status
FROM meetings m
LEFT JOIN LATERAL (
    SELECT id, created_at
    FROM meeting_content_topics
    WHERE meeting_id = m.id
      AND deleted_at IS NULL
    ORDER BY extraction_version DESC, created_at DESC
    LIMIT 1
) mct ON true
WHERE m.id = 'meeting-uuid-here';
```

### 7. Get Version History for Content

```sql
-- Follow version chain
WITH RECURSIVE version_chain AS (
    -- Start with latest version
    SELECT *
    FROM meeting_generated_content
    WHERE meeting_id = 'meeting-uuid-here'
      AND content_type = 'blog'
      AND deleted_at IS NULL
    ORDER BY version DESC
    LIMIT 1

    UNION ALL

    -- Follow parent_version_id chain
    SELECT mgc.*
    FROM meeting_generated_content mgc
    JOIN version_chain vc ON mgc.id = vc.parent_version_id
    WHERE mgc.deleted_at IS NULL
)
SELECT
    id,
    version,
    created_at,
    length(content_markdown) AS content_length,
    tokens_used,
    cost_cents
FROM version_chain
ORDER BY version DESC;
```

### 8. Find Most Used Topics Across All Content

```sql
-- Analytics: Which topics generate most content?
SELECT
    mct.meeting_id,
    ctl.topic_index,
    mct.topics->ctl.topic_index->>'title' AS topic_title,
    COUNT(*) AS usage_count
FROM content_topic_links ctl
JOIN meeting_content_topics mct ON ctl.topic_extraction_id = mct.id
WHERE mct.deleted_at IS NULL
GROUP BY mct.meeting_id, ctl.topic_index, topic_title
ORDER BY usage_count DESC
LIMIT 10;
```

## Frontend Integration Examples

### TypeScript Types

```typescript
// Topic structure (matches JSONB format)
interface MeetingTopic {
  title: string;
  description: string;
  timestamp: string; // "HH:MM:SS"
  fathom_url: string;
}

// Topic extraction record
interface MeetingContentTopics {
  id: string;
  meeting_id: string;
  user_id: string;
  topics: MeetingTopic[];
  model_used: string;
  tokens_used: number;
  cost_cents: number;
  extraction_version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Generated content record
interface MeetingGeneratedContent {
  id: string;
  meeting_id: string;
  user_id: string;
  content_type: 'social' | 'blog' | 'video' | 'email';
  content_markdown: string;
  model_used: string;
  tokens_used: number;
  cost_cents: number;
  version: number;
  parent_version_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Topic link record
interface ContentTopicLink {
  id: string;
  content_id: string;
  topic_extraction_id: string;
  topic_index: number;
  created_at: string;
}

// Helper type for content with topics
interface ContentWithTopics extends MeetingGeneratedContent {
  selected_topics: MeetingTopic[];
}
```

### Supabase Client Usage

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(url, anonKey);

// Get latest topics for meeting
const { data: topics, error } = await supabase
  .from('meeting_content_topics')
  .select('*')
  .eq('meeting_id', meetingId)
  .is('deleted_at', null)
  .order('extraction_version', { ascending: false })
  .order('created_at', { ascending: false })
  .limit(1)
  .single();

// Get all content for meeting
const { data: content, error } = await supabase
  .from('meeting_generated_content')
  .select('*')
  .eq('meeting_id', meetingId)
  .is('deleted_at', null)
  .order('content_type')
  .order('version', { ascending: false });

// Get content with selected topics
const { data: contentWithTopics, error } = await supabase
  .from('meeting_generated_content')
  .select(`
    *,
    content_topic_links (
      topic_index,
      meeting_content_topics (
        topics
      )
    )
  `)
  .eq('id', contentId)
  .is('deleted_at', null)
  .single();

// Create new content with topic links
const { data: newContent, error } = await supabase
  .from('meeting_generated_content')
  .insert({
    meeting_id: meetingId,
    user_id: userId,
    content_type: 'blog',
    content_markdown: markdown,
    model_used: 'gpt-4-turbo-preview',
    tokens_used: 1500,
    cost_cents: 15,
    version: 1
  })
  .select()
  .single();

// Link topics to content
if (newContent) {
  await supabase
    .from('content_topic_links')
    .insert(
      selectedTopicIndexes.map(index => ({
        content_id: newContent.id,
        topic_extraction_id: topicsRecord.id,
        topic_index: index
      }))
    );
}

// Soft delete content
await supabase
  .from('meeting_generated_content')
  .update({ deleted_at: new Date().toISOString() })
  .eq('id', contentId);

// Get cost summary using RPC
const { data: costs, error } = await supabase
  .rpc('get_meeting_ai_costs', { p_meeting_id: meetingId });
```

## Migration Rollback

If needed, rollback with:

```sql
-- Drop in reverse order of creation
DROP FUNCTION IF EXISTS get_meeting_ai_costs(uuid);
DROP FUNCTION IF EXISTS get_latest_content(uuid, text);
DROP FUNCTION IF EXISTS get_latest_topics(uuid);

DROP TABLE IF EXISTS content_topic_links;
DROP TABLE IF EXISTS meeting_generated_content;
DROP TABLE IF EXISTS meeting_content_topics;

DROP FUNCTION IF EXISTS update_updated_at_column();
```

## Performance Benchmarks (Expected)

Based on schema design and indexes:

| Operation | Expected Time | Notes |
|-----------|---------------|-------|
| Get latest topics | <50ms | Single indexed query |
| Get all content for meeting | <100ms | Multiple rows, indexed |
| Get content with topics | <150ms | JOIN with JSONB access |
| Calculate costs | <200ms | Aggregation across 2 tables |
| Insert new content | <50ms | Single INSERT |
| Create topic links | <100ms | Batch INSERT (5-10 rows) |
| Soft delete | <50ms | Single UPDATE |

## Maintenance Considerations

### Storage Growth
- **Topics**: ~2KB per extraction × extractions per meeting
- **Content**: ~10KB per content version × 4 types × versions
- **Links**: ~100 bytes per link × 5 topics avg × content count

**Example**: 1000 meetings with 2 extractions, 3 versions per content type:
- Topics: 1000 × 2 × 2KB = 4MB
- Content: 1000 × 4 types × 3 versions × 10KB = 120MB
- Links: 1000 × 4 × 3 × 5 × 100 bytes = 6MB
- **Total**: ~130MB (very manageable)

### Cleanup Strategies

```sql
-- Hard delete old soft-deleted records (after 90 days)
DELETE FROM meeting_content_topics
WHERE deleted_at < NOW() - INTERVAL '90 days';

DELETE FROM meeting_generated_content
WHERE deleted_at < NOW() - INTERVAL '90 days';

-- Archive old versions (keep latest 3 per content type)
WITH ranked_versions AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY meeting_id, content_type
      ORDER BY version DESC
    ) AS rn
  FROM meeting_generated_content
  WHERE deleted_at IS NULL
)
UPDATE meeting_generated_content
SET deleted_at = NOW()
WHERE id IN (
  SELECT id FROM ranked_versions WHERE rn > 3
);
```

## Monitoring Queries

```sql
-- Storage usage by table
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
  pg_total_relation_size(schemaname||'.'||tablename) AS bytes
FROM pg_tables
WHERE tablename IN (
  'meeting_content_topics',
  'meeting_generated_content',
  'content_topic_links'
)
ORDER BY bytes DESC;

-- Active vs soft-deleted records
SELECT
  'meeting_content_topics' AS table_name,
  COUNT(*) FILTER (WHERE deleted_at IS NULL) AS active,
  COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) AS deleted
FROM meeting_content_topics
UNION ALL
SELECT
  'meeting_generated_content',
  COUNT(*) FILTER (WHERE deleted_at IS NULL),
  COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)
FROM meeting_generated_content;

-- Cost analytics
SELECT
  DATE_TRUNC('day', created_at) AS date,
  COUNT(*) AS extractions,
  SUM(tokens_used) AS total_tokens,
  SUM(cost_cents) / 100.0 AS total_cost_dollars
FROM meeting_content_topics
WHERE deleted_at IS NULL
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY date DESC;
```

---

**Schema Version**: 1.0
**Last Updated**: 2025-01-28
**Migration File**: `20250128_create_meeting_content_tables.sql`
