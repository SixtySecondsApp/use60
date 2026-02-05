# Sales Assistant Enhancement Research
**Learnings from NanoClaw Architecture**

Date: 2026-02-03
Source: [gavrielc/nanoclaw](https://github.com/gavrielc/nanoclaw)

---

## Executive Summary

NanoClaw is a minimal, containerized personal Claude assistant built as a deliberate counter to OpenClaw's complexity. It delivers WhatsApp-integrated AI agents in ~8 source files, using Apple Container (or Docker) isolation as its primary security layer instead of application-level permission checks. The philosophy is radical: **no new features in source code** — all capabilities arrive as Claude Code skills that modify the user's fork.

**Key Learnings for Sixty:**
1. **Container-First Security**: Agent isolation via Linux containers rather than permission logic
2. **Skills-as-Forks Architecture**: Contributions are transformation instructions, not code merges
3. **IPC-Based Agent Communication**: File-based inter-process communication for decoupled agent execution
4. **Hierarchical Memory via CLAUDE.md**: Global + group-specific memory using plain markdown files
5. **Pre-Compaction Transcript Archival**: Full conversation archival before context window compaction
6. **Minimal Surface Area**: Single-process design that's auditable and customizable

---

## Competitive Analysis: NanoClaw vs. Sixty's Copilot

| Capability | NanoClaw | Sixty | Notes |
|------------|----------|-------|-------|
| **Container Isolation** | Apple Container / Docker | N/A (Supabase Edge Functions) | Different execution models |
| **Channel Integration** | WhatsApp (primary) | In-App + Slack | NanoClaw is single-channel by design |
| **Skill-Based Architecture** | Claude Code skills (fork-and-modify) | Platform skills (DB-driven) | Different philosophy entirely |
| **Scheduled Tasks** | Cron + interval + one-shot | Cron only (proactive edge functions) | NanoClaw more flexible |
| **Memory Hierarchy** | Global CLAUDE.md + per-group CLAUDE.md | No persistent memory | **HIGH GAP** |
| **Pre-Compaction Archival** | Full transcript → markdown archive | Not implemented | **HIGH GAP** |
| **IPC Task System** | File-based atomic IPC | Direct function calls | NanoClaw's is more decoupled |
| **Cross-Group Messaging** | Main group can message any group | N/A | Different model |
| **Mount Security** | External allowlist + blocked patterns | N/A (no container mounts) | Not applicable |
| **Agent SDK Usage** | Anthropic Agent SDK (claude-code) | Direct API (anthropic.messages) | NanoClaw leverages full agent loop |
| **Token Streaming** | Via Agent SDK | Implemented (SSE) | Both have this |
| **Multi-Model Routing** | Not implemented (single model) | Not implemented (fixed model) | Gap for both |

---

## 1. Skills-as-Forks: A Radical Contribution Model

### NanoClaw's Approach

NanoClaw's most distinctive architectural decision is its contribution model. Source code PRs for new features are **rejected**. Instead, all capabilities are delivered as "skills" — markdown instruction files that Claude Code follows to transform a user's fork.

```
.claude/skills/
├── add-gmail/SKILL.md          # Instructions to add Gmail integration
├── add-parallel/SKILL.md       # Instructions to add Parallel AI research
├── convert-to-docker/SKILL.md  # Instructions to swap Apple Container for Docker
├── customize/SKILL.md          # Instructions to modify behavior
├── debug/SKILL.md              # Instructions for troubleshooting
├── setup/SKILL.md              # Instructions for initial setup
└── x-integration/              # Full X/Twitter integration with code
    ├── SKILL.md
    ├── agent.ts
    ├── host.ts
    └── scripts/
```

**The philosophy:**
> "Every user should have clean and minimal code that does exactly what they need."
> "Contributors shouldn't add features... Instead, they contribute claude code skills like `/add-telegram`."

**GitHub CI enforces this:**
```yaml
# .github/workflows/skills-only.yml
# PRs can only modify files under .claude/skills/
```

### Relevance to Sixty

This is a fundamentally different model from Sixty's DB-driven platform skills. The key insight isn't the specific mechanism — it's the **separation of capability definition from core runtime**.

**What we can adopt:**
- Skills that are pure instructions (our YAML frontmatter already does this partially)
- A "skill template" system where new integrations follow a cookbook pattern
- CI validation that skill definitions conform to schema

**What doesn't apply:**
- Fork-and-modify doesn't work for a multi-tenant SaaS — our users share one codebase
- We need DB-driven skills, not filesystem-based ones

---

## 2. Hierarchical Memory via Markdown Files

### NanoClaw's Approach

Memory is stored as plain markdown files in a hierarchy:

```
groups/
├── global/
│   └── CLAUDE.md    # Shared memory (all groups read, only main writes)
└── main/
    └── CLAUDE.md    # Main group's private memory
```

- **Global memory** (`groups/global/CLAUDE.md`): Facts shared across all conversations. Only the main (admin) group can write here.
- **Group-specific memory** (`groups/{name}/CLAUDE.md`): Per-conversation context. Each group reads/writes its own.
- The agent naturally reads these as part of its CLAUDE.md context chain.

```typescript
// Volume mounts enforce the hierarchy
buildVolumeMounts(group) {
  // Global memory: read-only for non-main groups
  mounts.push({
    hostPath: 'groups/global',
    containerPath: '/workspace/global',
    readOnly: group !== 'main'  // Only main can write
  });

  // Group-specific: read-write for own group only
  mounts.push({
    hostPath: `groups/${group.folder}`,
    containerPath: '/workspace/group',
    readOnly: false
  });
}
```

### What We Can Learn

This is elegantly simple. The agent doesn't need a separate memory API — it just reads and writes markdown files that persist between sessions. The CLAUDE.md convention means the agent's own context window includes relevant memory on every invocation.

**Applicable pattern for Sixty:**
```typescript
// Instead of complex memory services, consider a simpler approach:
// Store structured memory as markdown/JSON in a persistent location
// that gets injected into the system prompt on each copilot invocation

interface CopilotMemory {
  // Global: org-wide facts (shared preferences, team conventions)
  global: string;
  // User-specific: individual preferences, communication style
  user: string;
  // Entity-specific: deal/contact context
  entity?: string;
}

// Inject into system prompt
const systemPrompt = `
${basePrompt}

## Your Memory
### Organization Context
${memory.global}

### User Preferences
${memory.user}

${memory.entity ? `### Current Entity Context\n${memory.entity}` : ''}
`;
```

**Advantages over our current approach:**
- No separate memory read/write API needed
- Memory is always in context (no need to "recall")
- Natural language storage (agent writes what it thinks is important)
- Simple to debug (just read the markdown)

**Priority: HIGH** — This is simpler than our planned `copilot_memories` table approach and may be more effective.

---

## 3. Pre-Compaction Transcript Archival

### NanoClaw's Approach

When Claude's Agent SDK triggers context compaction (hitting token limits), NanoClaw runs a pre-compaction hook that archives the full transcript before it's pruned:

```typescript
// agent-runner/src/index.ts (simplified)
async function preCompactionHook(transcript: Message[]) {
  // 1. Parse JSONL transcript
  const messages = parseJsonlTranscript(transcript);

  // 2. Generate markdown document
  const markdown = convertToMarkdown(messages);

  // 3. Store with date-stamped filename
  const filename = `${date}-conversation.md`;
  fs.writeFileSync(
    `/workspace/group/conversations/${filename}`,
    markdown
  );

  // 4. Update sessions index for retrieval
  updateSessionsIndex(sessionId, summary);
}
```

The archived conversations are stored in each group's folder, meaning the agent can later reference them via file access. A `sessions-index.json` provides quick lookup without reading full transcripts.

### What We Can Learn

This solves a real problem we have: when copilot conversations get long, we lose context. NanoClaw's approach is pragmatic — archive the full conversation as a searchable markdown file before the LLM compresses it.

**Applicable pattern for Sixty:**
```typescript
// Before hitting token limits, archive the conversation
async function archiveBeforeCompaction(
  sessionId: string,
  transcript: CopilotMessage[],
  userId: string
) {
  // Generate structured summary
  const summary = await generateSummary(transcript);

  // Store in copilot_session_summaries (we already have this table)
  await supabase.from('copilot_session_summaries').insert({
    session_id: sessionId,
    user_id: userId,
    summary_text: summary,
    full_transcript: transcript,  // JSONB for searchability
    message_count: transcript.length,
    created_at: new Date()
  });
}
```

**Priority: MEDIUM** — We already have the `copilot_session_summaries` migration. This validates the approach.

---

## 4. File-Based IPC for Agent Communication

### NanoClaw's Approach

Agents running inside containers communicate with the host process via atomic file writes to an IPC directory:

```typescript
// Inside container: agent writes task to IPC dir
async function scheduleTask(task: ScheduledTask) {
  const filename = `${Date.now()}-${randomId()}.json`;
  const tmpPath = `/workspace/ipc/.tmp-${filename}`;
  const finalPath = `/workspace/ipc/schedule-task-${filename}`;

  // Atomic write: write to tmp, then rename
  fs.writeFileSync(tmpPath, JSON.stringify(task));
  fs.renameSync(tmpPath, finalPath);
}

// Host process: polls IPC directory for new files
async function processIpcMessages(groupFolder: string) {
  const files = fs.readdirSync(`ipc/${groupFolder}`);
  for (const file of files) {
    const action = parseIpcFile(file);
    await executeAction(action);
    fs.unlinkSync(`ipc/${groupFolder}/${file}`);
  }
}
```

**Available IPC actions:**
- `send_message` — Queue a WhatsApp message
- `schedule_task` — Create a scheduled task (cron/interval/one-shot)
- `pause_task` / `resume_task` / `cancel_task` — Task lifecycle
- `register_group` — Add new WhatsApp group (main only)

**Authorization matrix:**
- Main group: Can send to any group, manage any task, register groups
- Non-main groups: Can only operate within their own namespace

### What We Can Learn

The IPC pattern itself isn't directly applicable (we use HTTP/Supabase), but the **authorization matrix** and **task lifecycle management** are relevant.

**Applicable patterns:**
```typescript
// Task lifecycle states (we could adopt for sequence steps)
type TaskStatus = 'active' | 'paused' | 'cancelled' | 'completed';

// Authorization scoping for copilot actions
interface CopilotPermissions {
  canSendEmail: boolean;      // Equivalent to NanoClaw's send_message
  canScheduleTask: boolean;   // Equivalent to schedule_task
  canModifyDeals: boolean;    // Entity-specific permission
  canAccessAllOrg: boolean;   // Equivalent to main group privileges
}
```

**Priority: LOW** — Interesting pattern but our architecture handles this differently.

---

## 5. Container-First Security Model

### NanoClaw's Approach

Security is enforced at the infrastructure level rather than the application level:

```
┌─────────────────────────────┐
│ Host Process (Node.js)      │
│  - WhatsApp connection      │
│  - Message routing          │
│  - Task scheduler           │
│  - IPC monitor              │
└──────────┬──────────────────┘
           │ spawn per invocation
           ▼
┌─────────────────────────────┐
│ Apple Container / Docker    │
│  - Isolated filesystem      │
│  - Non-root user (node)     │
│  - Controlled mounts only   │
│  - Discarded after use      │
│  ┌───────────────────────┐  │
│  │ Claude Agent SDK      │  │
│  │  - Full agent loop    │  │
│  │  - Bash access        │  │
│  │  - File operations    │  │
│  │  - Web access         │  │
│  │  - MCP tools          │  │
│  └───────────────────────┘  │
└─────────────────────────────┘
```

**Key security layers:**
1. **Container isolation**: Process, filesystem, and network boundaries
2. **Mount allowlist**: External config at `~/.config/nanoclaw/mount-allowlist.json` (not accessible from containers)
3. **Default blocked patterns**: `.ssh`, `.aws`, `.gnupg`, `.env`, `id_rsa`, etc.
4. **Symlink resolution**: `fs.realpathSync()` prevents traversal via symlinks
5. **Per-group session isolation**: Separate `.claude/` directories prevent cross-group session access

**Known limitation they acknowledge:**
> "Anthropic credentials are mounted so that Claude Code can authenticate when the agent runs. However, this means the agent itself can discover these credentials via Bash or file operations."

### What We Can Learn

Our architecture is fundamentally different (Supabase Edge Functions provide our isolation), but the **defense-in-depth thinking** is valuable:

1. **Don't trust application-level checks alone** — Our RLS policies are the right foundation, but we should also validate at the service layer
2. **Credential exposure awareness** — We pass `ANTHROPIC_API_KEY` to our edge function; NanoClaw identifies this as a known risk. We should ensure our edge function environment variables aren't exposed through tool outputs
3. **Blocked patterns for user content** — If our copilot ever gains file access, we should maintain a blocklist

**Priority: LOW** — Informational. Our security model is architecturally different.

---

## 6. Single-Process Simplicity

### NanoClaw's Approach

The entire system is ~8 source files in a single Node.js process:

```
src/
├── index.ts            # WhatsApp connection, message routing, main loop
├── config.ts           # Centralized configuration
├── container-runner.ts # Container spawning, mount management, output parsing
├── db.ts               # SQLite schema and queries
├── mount-security.ts   # Mount validation and allowlist enforcement
├── task-scheduler.ts   # Cron/interval/one-shot task execution
├── types.ts            # TypeScript interfaces
├── utils.ts            # Shared utilities
└── whatsapp-auth.ts    # WhatsApp authentication
```

No microservices, no message queues, no complex dependency injection. The code is designed to be **read and understood in 8 minutes**.

### What We Can Learn

Sixty is necessarily more complex (multi-tenant SaaS vs. personal tool), but the principle of **minimal abstraction** is worth internalizing:

- NanoClaw uses SQLite directly — no ORM, no abstraction layer
- Configuration is a single file, not distributed across multiple services
- The scheduler is a polling loop, not a job queue framework

**Applicable principle:** When adding copilot features, prefer the simplest implementation that works. A polling loop is better than a complex event system if it meets the requirements. A markdown file is better than a database table if the data is simple enough.

**Priority: PHILOSOPHY** — Not a specific feature to adopt, but a mindset to apply.

---

## 7. Agent SDK vs. Direct API Usage

### NanoClaw's Approach

NanoClaw uses Anthropic's **Agent SDK** (via `claude-code`) rather than the Messages API directly. The agent gets the full Claude Code tool suite:

```typescript
// The agent runs as a full Claude Code session with:
const allowedTools = [
  'Read', 'Write', 'Edit',     // File operations
  'Bash',                       // Shell commands
  'WebFetch', 'WebSearch',      // Web access
  'mcp__nanoclaw__send_message', // Custom MCP tools
  'mcp__nanoclaw__schedule_task',
  // ... more MCP tools
];
```

This means the agent can:
- Read/write files in its group's workspace
- Execute bash commands (within the container)
- Search the web
- Use custom MCP tools for WhatsApp interaction

### What We Can Learn

We're using the Messages API directly with tool definitions. NanoClaw's Agent SDK approach gives agents significantly more autonomy — they can reason about files, execute code, and self-correct. This is a trade-off:

| | Agent SDK (NanoClaw) | Messages API (Sixty) |
|---|---|---|
| **Autonomy** | High (agent decides what tools to use) | Controlled (we define available tools) |
| **Cost** | Higher (multi-turn agent loop) | Lower (single API call per interaction) |
| **Security** | Relies on container isolation | Relies on tool implementation safety |
| **Predictability** | Lower (agent may take unexpected paths) | Higher (bounded tool set) |
| **Capability** | Agent can self-correct and iterate | Single-shot tool execution |

**Potential adoption:** For complex copilot tasks (deal strategy, multi-step research), consider a hybrid approach where certain skill executions use an agent loop rather than single-shot.

**Priority: MEDIUM** — Worth exploring for complex autonomous sequences.

---

## Priority Recommendations for Sixty

### HIGH PRIORITY (Adopt Now)

1. **Hierarchical Memory via System Prompt Injection** (Section 2)
   - Store memory as structured text (markdown/JSON)
   - Inject into system prompt: global org context + user preferences + entity context
   - Simpler and more effective than a separate memory read/write API
   - Validates our existing `copilot_memories` direction but suggests simplifying

2. **Pre-Compaction Archival** (Section 3)
   - Archive full transcripts before token limit pruning
   - Use `copilot_session_summaries` table (already migrated)
   - Enables long-term conversation continuity

### MEDIUM PRIORITY (Plan For)

3. **Agent Loop for Complex Tasks** (Section 7)
   - Hybrid approach: simple queries use single-shot, complex tasks use agent loop
   - Would enable self-correcting skill execution
   - Higher cost but dramatically better outcomes for multi-step work

4. **Skill Template System** (Section 1)
   - Define a "skill cookbook" format for adding new integrations
   - CI validation of skill schema compliance
   - Not fork-based, but structured templates for our DB-driven skills

### LOW PRIORITY (Backlog)

5. **IPC Authorization Matrix** (Section 4)
   - Formal permission model for copilot actions
   - Role-based action scoping

6. **Credential Exposure Audit** (Section 5)
   - Verify our edge function env vars aren't leaking through tool outputs
   - Add output sanitization for sensitive patterns

---

## Key Architectural Differences

| Aspect | NanoClaw | Sixty |
|--------|----------|-------|
| **Target** | Single user, personal assistant | Multi-tenant SaaS |
| **Channel** | WhatsApp | Web app + Slack |
| **Runtime** | Local Node.js + containers | Supabase Edge Functions |
| **Storage** | SQLite + filesystem | PostgreSQL + Supabase |
| **Auth** | WhatsApp account ownership | Supabase Auth / Clerk |
| **Skills** | Claude Code skills (modify source) | DB-driven platform skills |
| **Security** | Container isolation | RLS + service-layer validation |
| **Complexity** | ~8 files, single process | Full SaaS stack |
| **Philosophy** | "Understandable in 8 minutes" | Enterprise feature-rich |

---

## Conclusion

NanoClaw demonstrates that a powerful AI assistant can be built with radical simplicity. While our multi-tenant SaaS architecture is necessarily more complex, three patterns stand out as directly adoptable:

1. **Memory as context injection** — Don't build a memory API; build a memory *format* and inject it into the system prompt. The agent reads it naturally.
2. **Archive before you lose it** — Pre-compaction archival is cheap insurance against context loss.
3. **Let agents agent** — For complex tasks, an agent loop (multi-turn with tool use) produces dramatically better results than single-shot tool execution.

The "skills-as-forks" philosophy, while not directly applicable to SaaS, is a useful reminder: keep the core minimal and let capabilities compose on top rather than bloating the runtime.
