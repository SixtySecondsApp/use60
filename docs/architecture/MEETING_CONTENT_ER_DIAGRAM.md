# Meeting Content Schema - Entity Relationship Diagram

## Visual Schema Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           meetings (EXISTING TABLE)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ id                  uuid PK                                                 │
│ owner_user_id       uuid FK → auth.users(id)                               │
│ transcript_text     text                                                    │
│ fathom_embed_url    text                                                    │
│ share_url           text                                                    │
│ created_at          timestamptz                                             │
│ updated_at          timestamptz                                             │
└───────────────┬────────────────────────────────────┬─────────────────────────┘
                │                                    │
                │ 1:N                                │ 1:N
                │                                    │
                ▼                                    ▼
┌─────────────────────────────────┐    ┌─────────────────────────────────────┐
│   meeting_content_topics        │    │   meeting_generated_content         │
│   (AI-EXTRACTED TOPICS)         │    │   (AI-GENERATED CONTENT)            │
├─────────────────────────────────┤    ├─────────────────────────────────────┤
│ id              uuid PK         │    │ id                  uuid PK         │
│ meeting_id      uuid FK         │───┐│ meeting_id          uuid FK         │
│ user_id         uuid FK         │   ││ user_id             uuid FK         │
│                                 │   ││                                     │
│ ┌─────────────────────────────┐ │   ││ content_type        text            │
│ │ topics          JSONB       │ │   ││   CHECK: social/blog/video/email   │
│ │                             │ │   ││ content_markdown    text            │
│ │ [{                          │ │   ││                                     │
│ │   title: string,            │ │   ││ model_used          text            │
│ │   description: string,      │ │   ││ tokens_used         integer         │
│ │   timestamp: "HH:MM:SS",    │ │   ││ cost_cents          integer         │
│ │   fathom_url: string        │ │   ││                                     │
│ │ }, ...]                     │ │   ││ version             integer         │
│ └─────────────────────────────┘ │   ││ parent_version_id   uuid FK (self)  │
│                                 │   ││                                     │
│ model_used      text            │   ││ created_at          timestamptz     │
│ tokens_used     integer         │   ││ updated_at          timestamptz     │
│ cost_cents      integer         │   ││ deleted_at          timestamptz     │
│                                 │   │└──────────────┬──────────────────────┘
│ extraction_version  integer     │   │               │
│                                 │   │               │ Self-reference
│ created_at      timestamptz     │   │               │ (Version Chain)
│ updated_at      timestamptz     │   │               │
│ deleted_at      timestamptz     │   │               ▼
└──────────────┬──────────────────┘   │        ┌──────────────┐
               │                      │        │    parent    │
               │                      │        │   version    │
               │ N:M                  │        └──────────────┘
               │                      │
               │   ┌──────────────────┘
               │   │
               ▼   ▼
┌─────────────────────────────────────────────────┐
│         content_topic_links                     │
│         (JUNCTION TABLE)                        │
├─────────────────────────────────────────────────┤
│ id                      uuid PK                 │
│ content_id              uuid FK                 │────┐
│ topic_extraction_id     uuid FK                 │────┤
│ topic_index             integer                 │    │
│                                                 │    │
│ created_at              timestamptz             │    │
│                                                 │    │
│ UNIQUE (content_id, topic_extraction_id,        │    │
│         topic_index)                            │    │
└─────────────────────────────────────────────────┘    │
                                                       │
    Resolves to specific topic:                       │
    topics[topic_index] from meeting_content_topics   │
                                                       │
    Example:                                           │
    topic_extraction_id = "abc-123"                   │
    topic_index = 2                                   │
    → meeting_content_topics.topics[2]                │
         ▲                                             │
         │                                             │
         └─────────────────────────────────────────────┘
```

## Relationship Types

### 1. meetings → meeting_content_topics (1:N)
- **Type**: One-to-Many
- **Cardinality**: One meeting can have multiple topic extractions (versioning)
- **Delete Rule**: CASCADE (delete topics when meeting deleted)
- **Purpose**: Track topic extraction history per meeting

### 2. meetings → meeting_generated_content (1:N)
- **Type**: One-to-Many
- **Cardinality**: One meeting can have multiple generated content pieces
- **Delete Rule**: CASCADE (delete content when meeting deleted)
- **Purpose**: Store all generated marketing content for a meeting

### 3. meeting_generated_content → meeting_generated_content (1:1 parent)
- **Type**: Self-Referencing One-to-One
- **Cardinality**: Each version can have one parent version
- **Delete Rule**: SET NULL (preserve version if parent deleted)
- **Purpose**: Track version history chain

### 4. meeting_content_topics ↔ meeting_generated_content (N:M)
- **Type**: Many-to-Many (via junction table)
- **Cardinality**: Many content pieces can use many topics
- **Delete Rule**: CASCADE on both sides
- **Purpose**: Track which topics were used to generate content

## Data Flow Diagrams

### Flow 1: Topic Extraction & Caching

```
User Requests Topics
        ↓
Check Cache (meeting_content_topics)
        ↓
    ┌───┴────┐
    │        │
  Found   Not Found
    │        │
    │        ↓
    │   Call AI API (OpenAI/Claude)
    │        ↓
    │   Parse Response
    │        ↓
    │   Calculate Cost
    │        ↓
    │   INSERT meeting_content_topics
    │        ├─ meeting_id
    │        ├─ topics (JSONB)
    │        ├─ model_used
    │        ├─ tokens_used
    │        └─ cost_cents
    │        ↓
    └────→ Return Topics to User
```

### Flow 2: Content Generation with Topics

```
User Selects Topics (checkboxes)
        ↓
User Selects Content Type
        ↓
Call AI API with:
    - Selected topics
    - Content type
    - Meeting context
        ↓
Parse Generated Markdown
        ↓
Calculate Cost
        ↓
BEGIN TRANSACTION
    ↓
    INSERT meeting_generated_content
        ├─ meeting_id
        ├─ content_type
        ├─ content_markdown
        ├─ model_used
        ├─ tokens_used
        ├─ cost_cents
        └─ version = 1
        ↓
    Get content.id
        ↓
    INSERT content_topic_links (batch)
        └─ For each selected topic:
            ├─ content_id
            ├─ topic_extraction_id
            └─ topic_index
        ↓
COMMIT TRANSACTION
        ↓
Return Generated Content
```

### Flow 3: Content Regeneration (Versioning)

```
User Clicks "Regenerate"
        ↓
Fetch Current Latest Version
    SELECT * WHERE meeting_id = ?
        AND content_type = ?
        ORDER BY version DESC
        LIMIT 1
        ↓
Get current.version & current.id
        ↓
Call AI API with same/different topics
        ↓
Parse New Content
        ↓
INSERT meeting_generated_content
    ├─ meeting_id (same)
    ├─ content_type (same)
    ├─ content_markdown (new)
    ├─ version = current.version + 1
    └─ parent_version_id = current.id
        ↓
INSERT content_topic_links (new selection)
        ↓
Return New Version
        ↓
Frontend shows comparison:
    - Version 2 (new) ↔ Version 1 (old)
```

### Flow 4: RLS Authorization Check

```
User Makes Database Query
        ↓
Supabase Extracts auth.uid()
        ↓
RLS Policy Executes:
    ┌────────────────────────────────┐
    │ EXISTS (                       │
    │   SELECT 1 FROM meetings       │
    │   WHERE meetings.id = ?.id     │
    │   AND owner_user_id = auth.uid()│
    │ )                              │
    │ AND deleted_at IS NULL         │
    └────────────────────────────────┘
        ↓
    ┌───┴────┐
    │        │
  TRUE    FALSE
    │        │
    ↓        ↓
  Return   Return
  Rows     Empty
```

## Index Visualization

### meeting_content_topics Indexes

```
┌─────────────────────────────────────────────────┐
│         meeting_content_topics                  │
├─────────────────────────────────────────────────┤
│                                                 │
│  idx_meeting_content_topics_meeting_id          │
│  ═══════════════════════════════════            │
│  B-tree on meeting_id                           │
│  Purpose: Fast JOIN with meetings               │
│  Query: WHERE meeting_id = ?                    │
│                                                 │
│  idx_meeting_content_topics_user_id             │
│  ═══════════════════════════════════            │
│  B-tree on user_id                              │
│  Purpose: RLS policy performance                │
│  Query: RLS checks                              │
│                                                 │
│  idx_meeting_content_topics_meeting_deleted     │
│  ═══════════════════════════════════════        │
│  Composite (meeting_id, deleted_at)             │
│  Purpose: Filtered queries                      │
│  Query: WHERE meeting_id = ? AND deleted_at IS NULL │
│                                                 │
│  idx_meeting_content_topics_created             │
│  ═══════════════════════════════════            │
│  B-tree on created_at DESC                      │
│  Purpose: Recent extractions                    │
│  Query: ORDER BY created_at DESC                │
│                                                 │
└─────────────────────────────────────────────────┘
```

### meeting_generated_content Indexes

```
┌─────────────────────────────────────────────────┐
│        meeting_generated_content                │
├─────────────────────────────────────────────────┤
│                                                 │
│  idx_meeting_generated_content_meeting_id       │
│  ═══════════════════════════════════════        │
│  B-tree on meeting_id                           │
│                                                 │
│  idx_meeting_generated_content_user_id          │
│  ═══════════════════════════════════            │
│  B-tree on user_id                              │
│                                                 │
│  idx_meeting_generated_content_meeting_deleted  │
│  ═══════════════════════════════════════════    │
│  Composite (meeting_id, deleted_at)             │
│                                                 │
│  idx_meeting_generated_content_type (PARTIAL)   │
│  ═══════════════════════════════════════        │
│  B-tree on content_type                         │
│  WHERE deleted_at IS NULL                       │
│  Purpose: Active content by type                │
│  Benefit: Smaller index size                    │
│                                                 │
│  idx_meeting_generated_content_version          │
│  ═══════════════════════════════════════════    │
│  Composite (meeting_id, content_type, version DESC) │
│  Purpose: Latest version queries                │
│  Query: Get latest version per type             │
│                                                 │
└─────────────────────────────────────────────────┘
```

### content_topic_links Indexes

```
┌─────────────────────────────────────────────────┐
│           content_topic_links                   │
├─────────────────────────────────────────────────┤
│                                                 │
│  idx_content_topic_links_content_id             │
│  ═══════════════════════════════                │
│  B-tree on content_id                           │
│  Purpose: "Which topics for this content?"      │
│                                                 │
│  idx_content_topic_links_topic_id               │
│  ═══════════════════════════════════            │
│  B-tree on topic_extraction_id                  │
│  Purpose: "Which content uses this topic?"      │
│                                                 │
│  UNIQUE (content_id, topic_extraction_id,       │
│          topic_index)                           │
│  ═════════════════════════════════════════      │
│  Composite unique constraint                    │
│  Creates implicit B-tree index                  │
│  Purpose: Prevent duplicate topic links         │
│                                                 │
└─────────────────────────────────────────────────┘
```

## Query Performance Analysis

### Query 1: Get Latest Topics for Meeting

```sql
SELECT * FROM get_latest_topics('meeting-uuid');
```

**Execution Plan**:
```
Index Scan using idx_meeting_content_topics_meeting_deleted
  → Index Cond: (meeting_id = 'meeting-uuid' AND deleted_at IS NULL)
  → Sort: extraction_version DESC, created_at DESC
  → Limit: 1
Expected Time: <50ms
```

### Query 2: Get Latest Content by Type

```sql
SELECT * FROM get_latest_content('meeting-uuid', 'blog');
```

**Execution Plan**:
```
Index Scan using idx_meeting_generated_content_version
  → Index Cond: (meeting_id = 'meeting-uuid' AND content_type = 'blog')
  → Already sorted by version DESC in index
  → Limit: 1
Expected Time: <50ms
```

### Query 3: Get Content with Topics

```sql
SELECT mgc.*, mct.topics
FROM meeting_generated_content mgc
JOIN content_topic_links ctl ON mgc.id = ctl.content_id
JOIN meeting_content_topics mct ON ctl.topic_extraction_id = mct.id
WHERE mgc.id = 'content-uuid';
```

**Execution Plan**:
```
Nested Loop
  → Index Scan on meeting_generated_content (PK)
    Filter: id = 'content-uuid' AND deleted_at IS NULL
  → Index Scan on content_topic_links
    Index: idx_content_topic_links_content_id
  → Index Scan on meeting_content_topics (PK)
    Filter: deleted_at IS NULL
Expected Time: <150ms
```

### Query 4: Calculate Total Costs

```sql
SELECT * FROM get_meeting_ai_costs('meeting-uuid');
```

**Execution Plan**:
```
HashAggregate
  → Nested Loop Left Join (meetings → meeting_content_topics)
    Index: idx_meeting_content_topics_meeting_deleted
  → Nested Loop Left Join (meetings → meeting_generated_content)
    Index: idx_meeting_generated_content_meeting_deleted
Expected Time: <200ms
```

## Storage Estimates

### Per-Record Size Estimates

```
meeting_content_topics:
├─ id                     16 bytes (uuid)
├─ meeting_id             16 bytes (uuid)
├─ user_id                16 bytes (uuid)
├─ topics                 ~2000 bytes (JSONB, 5-10 topics)
├─ model_used             ~20 bytes (text)
├─ tokens_used            4 bytes (integer)
├─ cost_cents             4 bytes (integer)
├─ extraction_version     4 bytes (integer)
├─ created_at             8 bytes (timestamptz)
├─ updated_at             8 bytes (timestamptz)
├─ deleted_at             8 bytes (timestamptz)
└─ TOTAL                  ~2104 bytes (~2KB per record)

meeting_generated_content:
├─ id                     16 bytes (uuid)
├─ meeting_id             16 bytes (uuid)
├─ user_id                16 bytes (uuid)
├─ content_type           ~10 bytes (text)
├─ content_markdown       ~10000 bytes (text, varies)
├─ model_used             ~20 bytes (text)
├─ tokens_used            4 bytes (integer)
├─ cost_cents             4 bytes (integer)
├─ version                4 bytes (integer)
├─ parent_version_id      16 bytes (uuid)
├─ created_at             8 bytes (timestamptz)
├─ updated_at             8 bytes (timestamptz)
├─ deleted_at             8 bytes (timestamptz)
└─ TOTAL                  ~10122 bytes (~10KB per record)

content_topic_links:
├─ id                     16 bytes (uuid)
├─ content_id             16 bytes (uuid)
├─ topic_extraction_id    16 bytes (uuid)
├─ topic_index            4 bytes (integer)
├─ created_at             8 bytes (timestamptz)
└─ TOTAL                  ~60 bytes per record
```

### Growth Projection

```
Scenario: 1000 meetings over 1 year

meeting_content_topics:
  1000 meetings × 1.5 avg extractions × 2KB = 3MB

meeting_generated_content:
  1000 meetings × 4 content types × 2 avg versions × 10KB = 80MB

content_topic_links:
  1000 meetings × 4 types × 2 versions × 5 topics × 60 bytes = 2.4MB

Indexes (estimated 50% of table size):
  (3MB + 80MB + 2.4MB) × 0.5 = 42.7MB

TOTAL STORAGE: ~128MB for 1000 meetings
GROWTH RATE: ~10MB per 100 meetings
```

## Security Visualization

### RLS Policy Flow

```
                    User Request
                         ↓
              ┌──────────────────────┐
              │   Supabase Auth      │
              │   Extract auth.uid() │
              └──────────┬───────────┘
                         ↓
              ┌──────────────────────┐
              │   RLS Policy Check   │
              │                      │
              │   1. Meeting exists? │
              │   2. User owns it?   │
              │   3. Not deleted?    │
              └──────────┬───────────┘
                         ↓
                  ┌──────┴──────┐
                  │             │
             ✅ Pass        ❌ Fail
                  │             │
                  ↓             ↓
          Execute Query    Return Empty
          Return Data      (403 implicit)
```

### Authorization Matrix

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTHORIZATION MATRIX                         │
├─────────────────┬──────────┬──────────┬──────────┬──────────────┤
│ Operation       │ Own      │ Other's  │ No Auth  │ Admin        │
│                 │ Meeting  │ Meeting  │          │ Override?    │
├─────────────────┼──────────┼──────────┼──────────┼──────────────┤
│ Extract Topics  │ ✅ Yes   │ ❌ No    │ ❌ No    │ ❌ No        │
│ View Topics     │ ✅ Yes   │ ❌ No    │ ❌ No    │ ⚠️  Possible │
│ Generate Content│ ✅ Yes   │ ❌ No    │ ❌ No    │ ❌ No        │
│ View Content    │ ✅ Yes   │ ❌ No    │ ❌ No    │ ⚠️  Possible │
│ Regenerate      │ ✅ Yes   │ ❌ No    │ ❌ No    │ ❌ No        │
│ Soft Delete     │ ✅ Yes   │ ❌ No    │ ❌ No    │ ⚠️  Possible │
│ View Costs      │ ✅ Yes   │ ❌ No    │ ❌ No    │ ✅ Yes       │
└─────────────────┴──────────┴──────────┴──────────┴──────────────┘

Note: Admin override requires separate service role policies (not included)
```

---

**Schema Version**: 1.0
**Migration File**: `20250128_create_meeting_content_tables.sql`
**Documentation**: Complete ✅
