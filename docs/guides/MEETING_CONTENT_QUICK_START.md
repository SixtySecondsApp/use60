# Meeting Content Schema - Quick Start Guide

## TL;DR

**What**: Database schema for AI-extracted topics and generated marketing content from meetings
**Why**: Cache AI results, reduce API costs, support versioning and multi-user access
**How**: 3 tables with RLS security, JSONB for topics, junction table for relationships

## Quick Reference

### Tables
```
meetings (existing)
  └─ meeting_content_topics      -- AI-extracted topics (cached)
  └─ meeting_generated_content   -- AI-generated content (versioned)
       └─ content_topic_links    -- Links content ↔ topics
```

### Key Patterns

**Extract Topics (First Time)**:
```typescript
const { data } = await supabase
  .from('meeting_content_topics')
  .insert({
    meeting_id,
    user_id,
    topics: extractedTopics, // Array of {title, description, timestamp, fathom_url}
    model_used: 'gpt-4-turbo-preview',
    tokens_used: 1200,
    cost_cents: 12,
    extraction_version: 1
  })
  .select()
  .single();
```

**Check Cache (Before Re-extracting)**:
```typescript
const { data } = await supabase
  .from('meeting_content_topics')
  .select('*')
  .eq('meeting_id', meetingId)
  .is('deleted_at', null)
  .order('extraction_version', { ascending: false })
  .limit(1)
  .single();

if (data) {
  // Use cached topics
  return data.topics;
} else {
  // Extract new topics
}
```

**Generate Content with Topics**:
```typescript
// 1. Create content
const { data: content } = await supabase
  .from('meeting_generated_content')
  .insert({
    meeting_id,
    user_id,
    content_type: 'blog',
    content_markdown: generatedText,
    model_used: 'gpt-4-turbo-preview',
    tokens_used: 2500,
    cost_cents: 25,
    version: 1
  })
  .select()
  .single();

// 2. Link selected topics
await supabase
  .from('content_topic_links')
  .insert(
    selectedTopicIndexes.map(index => ({
      content_id: content.id,
      topic_extraction_id: topicsRecord.id,
      topic_index: index // Index in the JSONB topics array
    }))
  );
```

**Get Latest Version**:
```typescript
const { data } = await supabase
  .rpc('get_latest_content', {
    p_meeting_id: meetingId,
    p_content_type: 'blog'
  });
```

**Regenerate (Create New Version)**:
```typescript
// Get current latest version
const { data: currentVersion } = await supabase
  .rpc('get_latest_content', {
    p_meeting_id: meetingId,
    p_content_type: 'blog'
  });

// Create new version
const { data: newVersion } = await supabase
  .from('meeting_generated_content')
  .insert({
    meeting_id,
    user_id,
    content_type: 'blog',
    content_markdown: regeneratedText,
    model_used: 'gpt-4-turbo-preview',
    tokens_used: 2700,
    cost_cents: 27,
    version: currentVersion.version + 1,
    parent_version_id: currentVersion.id
  })
  .select()
  .single();
```

## Data Structures

### Topic Format (JSONB)
```typescript
interface MeetingTopic {
  title: string;           // "Product Launch Strategy"
  description: string;     // "Discussion of Q2 product launch..."
  timestamp: string;       // "00:05:23"
  fathom_url: string;      // "https://fathom.video/share/abc?t=323"
}

// Stored as JSONB array
topics: MeetingTopic[]
```

### Content Types
```typescript
type ContentType = 'social' | 'blog' | 'video' | 'email';
```

### Cost Tracking
```typescript
// Storage format (integer cents)
cost_cents: number;  // 123 = $1.23

// Display format
const costDollars = (cost_cents / 100).toFixed(2); // "$1.23"
```

## Security Model

All tables use RLS policies that verify:
1. User is authenticated (`auth.uid()`)
2. User owns the meeting (`meetings.owner_user_id = auth.uid()`)
3. Record is not soft-deleted (`deleted_at IS NULL`)

**Automatic**: No manual permission checks needed in application code!

## Common Workflows

### 1. First-Time Topic Extraction

```typescript
async function extractTopics(meetingId: string, transcript: string) {
  // 1. Call AI API
  const topics = await callAIForTopicExtraction(transcript);

  // 2. Calculate cost
  const costCents = Math.round(tokensUsed * 0.01 * 100);

  // 3. Store in database
  const { data, error } = await supabase
    .from('meeting_content_topics')
    .insert({
      meeting_id: meetingId,
      user_id: currentUser.id,
      topics,
      model_used: 'gpt-4-turbo-preview',
      tokens_used: tokensUsed,
      cost_cents: costCents
    })
    .select()
    .single();

  return data;
}
```

### 2. Cache-First Topic Loading

```typescript
async function getTopics(meetingId: string, forceRefresh = false) {
  // Check cache first
  if (!forceRefresh) {
    const { data: cached } = await supabase
      .rpc('get_latest_topics', { p_meeting_id: meetingId });

    if (cached) {
      return { topics: cached.topics, cached: true };
    }
  }

  // Extract if needed
  const meeting = await getMeeting(meetingId);
  const extracted = await extractTopics(meetingId, meeting.transcript_text);

  return { topics: extracted.topics, cached: false };
}
```

### 3. Generate Content with Topic Selection

```typescript
async function generateContent(
  meetingId: string,
  contentType: ContentType,
  selectedTopicIndexes: number[]
) {
  // 1. Get cached topics
  const topicsRecord = await supabase
    .rpc('get_latest_topics', { p_meeting_id: meetingId });

  // 2. Extract selected topics
  const selectedTopics = selectedTopicIndexes.map(i => topicsRecord.topics[i]);

  // 3. Call AI API
  const markdown = await callAIForContentGeneration(contentType, selectedTopics);

  // 4. Store content
  const { data: content } = await supabase
    .from('meeting_generated_content')
    .insert({
      meeting_id: meetingId,
      user_id: currentUser.id,
      content_type: contentType,
      content_markdown: markdown,
      model_used: 'gpt-4-turbo-preview',
      tokens_used: tokensUsed,
      cost_cents: costCents,
      version: 1
    })
    .select()
    .single();

  // 5. Link topics
  await supabase
    .from('content_topic_links')
    .insert(
      selectedTopicIndexes.map(index => ({
        content_id: content.id,
        topic_extraction_id: topicsRecord.id,
        topic_index: index
      }))
    );

  return content;
}
```

### 4. Load Content with Topics

```typescript
async function getContentWithTopics(contentId: string) {
  const { data, error } = await supabase
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

  // Extract selected topics from joins
  const selectedTopics = data.content_topic_links.map(link => {
    const topicsArray = link.meeting_content_topics.topics;
    return topicsArray[link.topic_index];
  });

  return {
    ...data,
    selected_topics: selectedTopics
  };
}
```

### 5. Version Management

```typescript
async function getVersionHistory(meetingId: string, contentType: ContentType) {
  const { data } = await supabase
    .from('meeting_generated_content')
    .select('id, version, created_at, tokens_used, cost_cents')
    .eq('meeting_id', meetingId)
    .eq('content_type', contentType)
    .is('deleted_at', null)
    .order('version', { ascending: false });

  return data; // [v3, v2, v1]
}

async function regenerateContent(
  meetingId: string,
  contentType: ContentType,
  selectedTopicIndexes: number[]
) {
  // Get current latest
  const current = await supabase
    .rpc('get_latest_content', {
      p_meeting_id: meetingId,
      p_content_type: contentType
    });

  // Generate new version
  const markdown = await callAI(/* ... */);

  // Create new version record
  const { data: newVersion } = await supabase
    .from('meeting_generated_content')
    .insert({
      meeting_id: meetingId,
      user_id: currentUser.id,
      content_type: contentType,
      content_markdown: markdown,
      model_used: 'gpt-4-turbo-preview',
      tokens_used: tokensUsed,
      cost_cents: costCents,
      version: current.version + 1,
      parent_version_id: current.id
    })
    .select()
    .single();

  // Link topics (same pattern as before)
  await linkTopics(newVersion.id, selectedTopicIndexes);

  return newVersion;
}
```

### 6. Cost Tracking Dashboard

```typescript
async function getMeetingCosts(meetingId: string) {
  const { data } = await supabase
    .rpc('get_meeting_ai_costs', { p_meeting_id: meetingId });

  return {
    totalCostDollars: (data.total_cost_cents / 100).toFixed(2),
    totalTokens: data.total_tokens,
    topicCostDollars: (data.topic_cost_cents / 100).toFixed(2),
    contentCostDollars: (data.content_cost_cents / 100).toFixed(2)
  };
}

async function getUserTotalCosts(userId: string) {
  const { data: topics } = await supabase
    .from('meeting_content_topics')
    .select('cost_cents, tokens_used')
    .eq('user_id', userId)
    .is('deleted_at', null);

  const { data: content } = await supabase
    .from('meeting_generated_content')
    .select('cost_cents, tokens_used')
    .eq('user_id', userId)
    .is('deleted_at', null);

  const totalCostCents =
    topics.reduce((sum, t) => sum + t.cost_cents, 0) +
    content.reduce((sum, c) => sum + c.cost_cents, 0);

  const totalTokens =
    topics.reduce((sum, t) => sum + t.tokens_used, 0) +
    content.reduce((sum, c) => sum + c.tokens_used, 0);

  return {
    totalCostDollars: (totalCostCents / 100).toFixed(2),
    totalTokens
  };
}
```

### 7. Soft Delete

```typescript
async function deleteContent(contentId: string) {
  // Soft delete (sets deleted_at)
  await supabase
    .from('meeting_generated_content')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', contentId);

  // Note: content_topic_links remain but won't be queried
  // (RLS policies filter deleted content)
}

async function restoreContent(contentId: string) {
  await supabase
    .from('meeting_generated_content')
    .update({ deleted_at: null })
    .eq('id', contentId);
}
```

## React Component Examples

### Topics Loader with Caching

```typescript
function useTopics(meetingId: string) {
  const [topics, setTopics] = useState<MeetingTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [cached, setCached] = useState(false);

  useEffect(() => {
    loadTopics();
  }, [meetingId]);

  async function loadTopics() {
    setLoading(true);

    // Check cache
    const { data: cached } = await supabase
      .rpc('get_latest_topics', { p_meeting_id: meetingId });

    if (cached) {
      setTopics(cached.topics);
      setCached(true);
      setLoading(false);
      return;
    }

    // Extract new topics
    const meeting = await getMeeting(meetingId);
    const extracted = await extractTopics(meetingId, meeting.transcript_text);
    setTopics(extracted.topics);
    setCached(false);
    setLoading(false);
  }

  async function refresh() {
    const meeting = await getMeeting(meetingId);
    const extracted = await extractTopics(meetingId, meeting.transcript_text);
    setTopics(extracted.topics);
    setCached(false);
  }

  return { topics, loading, cached, refresh };
}
```

### Content Generator with Topic Selection

```typescript
function ContentGenerator({ meetingId }: { meetingId: string }) {
  const { topics } = useTopics(meetingId);
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
  const [contentType, setContentType] = useState<ContentType>('blog');
  const [generating, setGenerating] = useState(false);

  async function generate() {
    setGenerating(true);

    try {
      const content = await generateContent(
        meetingId,
        contentType,
        selectedIndexes
      );

      // Navigate to generated content
      navigate(`/content/${content.id}`);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <h2>Select Topics</h2>
      {topics.map((topic, index) => (
        <label key={index}>
          <input
            type="checkbox"
            checked={selectedIndexes.includes(index)}
            onChange={(e) => {
              if (e.target.checked) {
                setSelectedIndexes([...selectedIndexes, index]);
              } else {
                setSelectedIndexes(selectedIndexes.filter(i => i !== index));
              }
            }}
          />
          {topic.title}
        </label>
      ))}

      <select value={contentType} onChange={e => setContentType(e.target.value)}>
        <option value="social">Social Post</option>
        <option value="blog">Blog Post</option>
        <option value="video">Video Script</option>
        <option value="email">Email Campaign</option>
      </select>

      <button onClick={generate} disabled={generating || selectedIndexes.length === 0}>
        {generating ? 'Generating...' : 'Generate Content'}
      </button>
    </div>
  );
}
```

### Version History Viewer

```typescript
function VersionHistory({ meetingId, contentType }: Props) {
  const [versions, setVersions] = useState<any[]>([]);

  useEffect(() => {
    loadVersions();
  }, [meetingId, contentType]);

  async function loadVersions() {
    const { data } = await supabase
      .from('meeting_generated_content')
      .select('*')
      .eq('meeting_id', meetingId)
      .eq('content_type', contentType)
      .is('deleted_at', null)
      .order('version', { ascending: false });

    setVersions(data || []);
  }

  return (
    <div>
      <h2>Version History</h2>
      {versions.map(v => (
        <div key={v.id}>
          <h3>Version {v.version}</h3>
          <p>Created: {new Date(v.created_at).toLocaleString()}</p>
          <p>Tokens: {v.tokens_used}</p>
          <p>Cost: ${(v.cost_cents / 100).toFixed(2)}</p>
          <button onClick={() => navigate(`/content/${v.id}`)}>
            View
          </button>
        </div>
      ))}
    </div>
  );
}
```

## Debugging Tips

### Check RLS Policies
```typescript
// If queries return empty but data exists, check RLS
// Try with service role key (bypasses RLS) to confirm
const { data } = await supabaseAdmin
  .from('meeting_content_topics')
  .select('*');

console.log('Without RLS:', data); // Should show all data
```

### Verify Foreign Keys
```typescript
// Ensure meeting exists and user owns it
const { data: meeting } = await supabase
  .from('meetings')
  .select('id, owner_user_id')
  .eq('id', meetingId)
  .single();

console.log('Meeting owner:', meeting.owner_user_id);
console.log('Current user:', currentUser.id);
// Must match for INSERT to succeed
```

### Check Soft Delete
```typescript
// Include deleted records in query for debugging
const { data } = await supabase
  .from('meeting_generated_content')
  .select('*, deleted_at')
  .eq('meeting_id', meetingId);

console.log('All records (including deleted):', data);
// Look for non-null deleted_at values
```

## Performance Optimization

### Use Helper Functions
```typescript
// ✅ Good: Use RPC helper (optimized, indexed)
const { data } = await supabase
  .rpc('get_latest_content', { p_meeting_id, p_content_type });

// ❌ Avoid: Manual query with sorting
const { data } = await supabase
  .from('meeting_generated_content')
  .select('*')
  .eq('meeting_id', meetingId)
  .eq('content_type', contentType)
  .order('version', { ascending: false })
  .limit(1);
```

### Batch Operations
```typescript
// ✅ Good: Single batch insert
await supabase
  .from('content_topic_links')
  .insert(selectedIndexes.map(index => ({
    content_id,
    topic_extraction_id,
    topic_index: index
  })));

// ❌ Avoid: Multiple single inserts
for (const index of selectedIndexes) {
  await supabase.from('content_topic_links').insert({...});
}
```

### Cache Aggressively
```typescript
// ✅ Good: Check cache first, extract once
const cached = await getCachedTopics(meetingId);
if (cached) return cached;

const extracted = await extractTopics(meetingId);
return extracted;

// ❌ Avoid: Re-extracting on every page load
const topics = await extractTopics(meetingId); // Wastes API calls!
```

---

**Ready to Use**: Run the migration, import types, start building! 🚀
