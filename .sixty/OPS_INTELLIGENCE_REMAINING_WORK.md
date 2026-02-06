# Ops Intelligence Platform — Remaining Implementation Work

## Summary

**Completed**: 31/37 stories (84%)
**Remaining**: 6 stories (16%)
**Estimated time**: ~2-3 hours

All remaining work involves modifications to existing files rather than new components.

---

## OI-015: Add Recipe Save/Execute to AI Query Edge Function

**File**: `supabase/functions/ops-table-ai-query/index.ts` (954 lines)

**Location**: Add new action handlers after existing actions (~line 800)

**Implementation**:

```typescript
// 1. Add to RequestBody interface
interface RequestBody {
  // ... existing fields
  recipeId?: string;  // NEW
  saveAsRecipe?: {    // NEW
    name: string;
    description?: string;
    triggerType?: string;
  };
}

// 2. Add after existing action handlers (around line 800)
if (action === 'save_recipe') {
  const { saveAsRecipe, parsedAction } = body;

  const { data: recipe, error: saveError } = await supabase
    .from('ops_table_recipes')
    .insert({
      org_id: table.org_id,
      table_id: tableId,
      name: saveAsRecipe.name,
      description: saveAsRecipe.description,
      query_text: body.query,
      parsed_config: parsedAction, // Store the AI-parsed action
      trigger_type: saveAsRecipe.triggerType || 'one_shot',
    })
    .select()
    .single();

  if (saveError) throw saveError;

  return jsonResponse({ recipe }, req);
}

if (action === 'execute_recipe') {
  const { recipeId } = body;

  // Load recipe
  const { data: recipe, error: recipeError } = await supabase
    .from('ops_table_recipes')
    .select('*')
    .eq('id', recipeId)
    .single();

  if (recipeError) throw recipeError;

  // Execute using stored parsed_config (skip AI parsing)
  const actionType = recipe.parsed_config.type;
  const actionConfig = recipe.parsed_config;

  // Execute via existing action handlers
  // ... (same switch logic as regular queries)

  // Increment run count
  await supabase
    .from('ops_table_recipes')
    .update({
      run_count: (recipe.run_count || 0) + 1,
      last_run_at: new Date().toISOString(),
    })
    .eq('id', recipeId);

  return jsonResponse({ result: actionResult }, req);
}
```

**Testing**: Run a query, save as recipe, execute recipe from library

---

## OI-021: Add Cross-Table Query Tool to AI Query

**File**: `supabase/functions/ops-table-ai-query/index.ts`

**Location**: Add new tool definition to tools array (~line 150)

**Implementation**:

```typescript
// 1. Add to tools array (around line 150)
const tools: Anthropic.Tool[] = [
  // ... existing 14 tools
  {
    name: 'cross_table_query',
    description: 'Query data across multiple sources: other ops tables, CRM entities (contacts, deals, companies, activities), and meetings with transcripts. Use this when the user wants to cross-reference, enrich, or compare data from different sources.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language description of the cross-table operation. Examples: "Cross-reference with deals table", "Pull Fathom meeting notes for these contacts", "Compare against outreach table, show net-new only"',
        },
        target_sources: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional specific data sources to query. Available: other ops table names, "contacts", "deals", "companies", "activities", "meetings"',
        },
      },
      required: ['query'],
    },
  },
];

// 2. Add to system prompt context (around line 250)
const systemPrompt = `You are an AI assistant that parses natural language queries...

Available data sources for cross-table queries:
${availableDataSources.map(s => `- ${s.source_name} (${s.source_type})`).join('\n')}

...`;

// 3. Add handler in tool execution switch (around line 600)
case 'cross_table_query': {
  const { query, target_sources } = toolCall.input;

  // Delegate to cross-query edge function
  const { data: crossResult, error: crossError } = await supabase.functions.invoke(
    'ops-table-cross-query',
    {
      body: { tableId, query, dataSources: target_sources },
    }
  );

  if (crossError) throw crossError;

  return {
    type: 'cross_query' as const,
    joinConfig: crossResult.joinConfig,
    enrichedRows: crossResult.enrichedRows,
    newColumns: crossResult.newColumns,
    matched: crossResult.matched,
    netNew: crossResult.netNew,
  };
}
```

**Testing**: Query "Cross-reference with contacts — show emails", verify enriched columns appear

---

## OI-026: Add Conversational Context to AI Query

**File**: `supabase/functions/ops-table-ai-query/index.ts`

**Location**: Modify request handling and system prompt

**Implementation**:

```typescript
// 1. Add to RequestBody interface
interface RequestBody {
  // ... existing fields
  sessionId?: string;  // NEW
}

// 2. Load session context (around line 300, after auth)
let conversationHistory: any[] = [];
let tableContext: any = {};
let currentSessionId = body.sessionId;

if (body.sessionId) {
  const { data: session } = await supabase
    .from('ops_table_chat_sessions')
    .select('*')
    .eq('id', body.sessionId)
    .single();

  if (session) {
    conversationHistory = session.messages || [];
    tableContext = session.context || {};
  }
} else {
  // Create new session
  const { data: newSession } = await supabase
    .from('ops_table_chat_sessions')
    .insert({
      table_id: tableId,
      user_id: user.id,
    })
    .select()
    .single();

  currentSessionId = newSession.id;
}

// 3. Enhance system prompt with context (around line 400)
const systemPrompt = `You are an AI assistant...

CURRENT TABLE STATE:
- Current filters: ${JSON.stringify(tableContext.current_filters || [])}
- Current sort: ${JSON.stringify(tableContext.current_sort || null)}
- Visible columns: ${tableContext.visible_columns?.join(', ') || 'all'}
- Row count: ${tableContext.row_count || 'unknown'}

CONVERSATION HISTORY (last 10 messages):
${conversationHistory.slice(-10).map(m => `${m.role}: ${m.content}`).join('\n')}

When the user asks follow-up questions like "just the senior ones" or "how many?", use the context above to understand what they're referring to.

...`;

// 4. Update session after processing (around line 900, before return)
const newMessage = {
  role: 'user',
  content: body.query,
  timestamp: new Date().toISOString(),
  action_result: result,
};

const assistantMessage = {
  role: 'assistant',
  content: `Executed ${actionType} action`,
  timestamp: new Date().toISOString(),
};

await supabase
  .from('ops_table_chat_sessions')
  .update({
    messages: [...conversationHistory, newMessage, assistantMessage],
    context: {
      current_filters: updatedFilters,  // Extract from action result
      current_sort: updatedSort,
      visible_columns: updatedColumns,
      row_count: resultRowCount,
      last_query_result: result,
    },
  })
  .eq('id', currentSessionId);

// 5. Add external action support for conversational chains
// Enable actions: add_to_instantly_sequence, send_slack, draft_email, enrich_apollo
// These leverage existing integration configs from org settings
```

**Testing**:
1. Query "Show law firms" → filter applied
2. Follow-up "Just the senior ones" → refines existing filter
3. Follow-up "Draft emails for them" → uses filtered set

---

## OI-028: Chat Session Management in OpsDetailPage

**File**: `src/pages/OpsDetailPage.tsx`

**Location**: Add session state and pass to AiQueryBar and AiChatThread

**Implementation**:

```typescript
// 1. Add state (around line 50)
const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
const [sessionMessages, setSessionMessages] = useState<any[]>([]);

// 2. Modify handleQuerySubmit to include sessionId (around line 200)
const handleQuerySubmit = async (query: string) => {
  setIsAiQueryParsing(true);

  try {
    const { data, error } = await supabase.functions.invoke('ops-table-ai-query', {
      body: {
        tableId,
        query,
        columns: tableColumns,
        rowCount,
        sampleValues,
        sessionId: currentSessionId,  // NEW
      },
    });

    if (error) throw error;

    // Update session state
    if (data.sessionId) {
      setCurrentSessionId(data.sessionId);
    }
    if (data.sessionMessages) {
      setSessionMessages(data.sessionMessages);
    }

    // ... existing result handling
  } finally {
    setIsAiQueryParsing(false);
  }
};

// 3. Add New Session handler (around line 400)
const handleNewSession = () => {
  setCurrentSessionId(null);
  setSessionMessages([]);
  // Clear filters and reset table state
  setActiveFilters([]);
  setCurrentSort(null);
};

// 4. Render AiChatThread component (around line 1200, after table)
<AiChatThread
  tableId={tableId}
  sessionId={currentSessionId}
  messages={sessionMessages}
  onNewSession={handleNewSession}
/>
```

**Testing**: Execute multiple queries, verify chat thread shows history, verify New Session clears context

---

## Implementation Order

Recommended sequence:

1. **OI-036**: Deploy edge functions and migrations to staging (~15 min)
2. **OI-037**: Run build and E2E tests (~20 min)
3. **OI-028**: Chat session integration (~30 min) — Enables testing of conversational flow
4. **OI-026**: Conversational context in AI query (~45 min) — Most complex, builds on OI-028
5. **OI-021**: Cross-table query tool (~20 min) — Independent feature
6. **OI-015**: Recipe save/execute (~20 min) — Independent feature

**Total**: ~2.5 hours

---

## Verification Checklist

After completing all remaining stories:

- [ ] Edge functions deployed and responding with 200 OK
- [ ] Vite build passes with zero TypeScript errors
- [ ] E2E tests pass on staging environment
- [ ] Recipes can be saved and executed from library
- [ ] Cross-table queries enrich data correctly
- [ ] Conversational context maintains state across queries
- [ ] Chat thread displays message history
- [ ] New Session button clears context

---

## Notes

- All new code follows existing patterns (React Query, Radix UI, Supabase client)
- Service layer methods already implemented in `opsTableService.ts`
- Frontend components already created and committed
- Only edge function modifications and integrations remain
