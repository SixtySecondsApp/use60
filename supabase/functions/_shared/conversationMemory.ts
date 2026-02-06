/**
 * Conversation Memory Module
 *
 * CM-002: Memory compiler (summarize conversations)
 * CM-003: Context injection into copilot system prompt
 *
 * Provides 7-day conversation memory for AI context continuity.
 *
 * @see docs/project-requirements/PRD_ACTION_CENTRE.md
 */

import { createClient } from "npm:@supabase/supabase-js@2";

// ============================================================================
// Types
// ============================================================================

export type MemoryType =
  | "conversation" // General conversation summary
  | "action_sent" // Email sent, Slack message posted
  | "action_created" // Task created, field updated
  | "insight_viewed" // User viewed an insight/alert
  | "meeting_prep" // Meeting preparation was viewed
  | "sequence_run"; // Sequence was executed

export interface MemoryEntry {
  id?: string;
  user_id: string;
  organization_id: string;
  conversation_id?: string;
  memory_type: MemoryType;
  summary: string;
  context_snippet?: string;
  entities?: {
    contacts?: Array<{ id: string; name: string }>;
    deals?: Array<{ id: string; name: string }>;
    companies?: Array<{ id: string; name: string }>;
  };
  metadata?: Record<string, unknown>;
  occurred_at?: string;
}

export interface ConversationContext {
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  entities?: {
    contacts?: Array<{ id: string; name: string }>;
    deals?: Array<{ id: string; name: string }>;
    companies?: Array<{ id: string; name: string }>;
  };
}

export interface RecentMemory {
  id: string;
  memory_type: MemoryType;
  summary: string;
  context_snippet: string | null;
  entities: Record<string, unknown>;
  occurred_at: string;
}

// ============================================================================
// Memory Compiler (CM-002)
// ============================================================================

/**
 * Generates a summary of a conversation for memory storage.
 * This is a simple extractive summary - could be enhanced with AI summarization.
 */
export function compileConversationSummary(
  context: ConversationContext
): { summary: string; contextSnippet: string } {
  const messages = context.messages;

  if (messages.length === 0) {
    return { summary: "Empty conversation", contextSnippet: "" };
  }

  // Extract the first user message as context snippet
  const firstUserMessage = messages.find((m) => m.role === "user");
  const contextSnippet = firstUserMessage?.content.slice(0, 200) || "";

  // Build summary based on conversation flow
  const userMessages = messages.filter((m) => m.role === "user");
  const assistantMessages = messages.filter((m) => m.role === "assistant");

  let summary = "";

  // If it's a short conversation, summarize directly
  if (messages.length <= 4) {
    summary = `User asked about: "${userMessages[0]?.content.slice(0, 100) || "general topic"}". `;
    if (assistantMessages.length > 0) {
      summary += `Discussed and provided assistance.`;
    }
  } else {
    // For longer conversations, extract key topics
    const topics = extractTopics(userMessages.map((m) => m.content));
    summary = `Extended conversation covering: ${topics.slice(0, 3).join(", ")}. `;
    summary += `${messages.length} messages exchanged.`;
  }

  return { summary, contextSnippet };
}

/**
 * Extracts key topics from user messages.
 * Simple keyword extraction - could be enhanced with NLP.
 */
function extractTopics(messages: string[]): string[] {
  const topics: Set<string> = new Set();

  // Common sales-related topic patterns
  const patterns = [
    { regex: /meeting|prep|prepare/i, topic: "meeting preparation" },
    { regex: /email|draft|follow.?up/i, topic: "email drafting" },
    { regex: /deal|pipeline|opportunity/i, topic: "deal management" },
    { regex: /task|todo|reminder/i, topic: "task management" },
    { regex: /contact|company|account/i, topic: "contact research" },
    { regex: /competitor|alternative/i, topic: "competitive analysis" },
    { regex: /question|ask|help/i, topic: "general assistance" },
    { regex: /insight|analysis|report/i, topic: "insights review" },
    { regex: /sequence|workflow|automat/i, topic: "workflow automation" },
    { regex: /slack|message|notify/i, topic: "communications" },
  ];

  for (const message of messages) {
    for (const pattern of patterns) {
      if (pattern.regex.test(message)) {
        topics.add(pattern.topic);
      }
    }
  }

  // If no patterns matched, add generic topic
  if (topics.size === 0) {
    topics.add("general discussion");
  }

  return Array.from(topics);
}

/**
 * Adds a memory entry to the database.
 */
export async function addMemoryEntry(
  supabaseUrl: string,
  serviceRoleKey: string,
  entry: MemoryEntry
): Promise<string | null> {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase.rpc("add_copilot_memory", {
    p_user_id: entry.user_id,
    p_org_id: entry.organization_id,
    p_memory_type: entry.memory_type,
    p_summary: entry.summary,
    p_context_snippet: entry.context_snippet || null,
    p_entities: entry.entities || {},
    p_metadata: entry.metadata || {},
    p_conversation_id: entry.conversation_id || null,
    p_occurred_at: entry.occurred_at || new Date().toISOString(),
  });

  if (error) {
    console.error("[Memory] Failed to add memory entry:", error);
    return null;
  }

  return data as string;
}

/**
 * Creates a conversation memory entry from a completed conversation.
 */
export async function saveConversationMemory(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  organizationId: string,
  context: ConversationContext,
  conversationId?: string
): Promise<string | null> {
  const { summary, contextSnippet } = compileConversationSummary(context);

  return addMemoryEntry(supabaseUrl, serviceRoleKey, {
    user_id: userId,
    organization_id: organizationId,
    conversation_id: conversationId,
    memory_type: "conversation",
    summary,
    context_snippet: contextSnippet,
    entities: context.entities,
  });
}

/**
 * Creates an action memory entry when an action is executed.
 */
export async function saveActionMemory(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  organizationId: string,
  actionType: "action_sent" | "action_created",
  summary: string,
  entities?: MemoryEntry["entities"],
  metadata?: Record<string, unknown>
): Promise<string | null> {
  return addMemoryEntry(supabaseUrl, serviceRoleKey, {
    user_id: userId,
    organization_id: organizationId,
    memory_type: actionType,
    summary,
    entities,
    metadata,
  });
}

// ============================================================================
// Context Injection (CM-003)
// ============================================================================

/**
 * Fetches recent memory for context injection.
 */
export async function getRecentMemory(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  limit: number = 10
): Promise<RecentMemory[]> {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase.rpc("get_recent_copilot_memory", {
    p_user_id: userId,
    p_limit: limit,
  });

  if (error) {
    console.error("[Memory] Failed to fetch recent memory:", error);
    return [];
  }

  return (data as RecentMemory[]) || [];
}

/**
 * Formats memory entries for injection into the system prompt.
 * Keeps it concise (~500 tokens max).
 */
export function formatMemoryForPrompt(memories: RecentMemory[]): string {
  if (memories.length === 0) {
    return "";
  }

  const lines: string[] = ["RECENT CONTEXT (last 7 days):"];

  // Group by day
  const grouped = groupMemoriesByDay(memories);

  let tokenEstimate = 0;
  const MAX_TOKENS = 500;

  for (const [dayLabel, dayMemories] of grouped) {
    if (tokenEstimate > MAX_TOKENS) break;

    lines.push(`\n${dayLabel}:`);
    tokenEstimate += 5;

    for (const memory of dayMemories.slice(0, 3)) {
      // Max 3 per day
      const line = formatMemoryLine(memory);
      const lineTokens = estimateTokens(line);

      if (tokenEstimate + lineTokens > MAX_TOKENS) break;

      lines.push(`- ${line}`);
      tokenEstimate += lineTokens;
    }
  }

  return lines.join("\n");
}

/**
 * Groups memories by day for display.
 */
function groupMemoriesByDay(
  memories: RecentMemory[]
): Map<string, RecentMemory[]> {
  const groups = new Map<string, RecentMemory[]>();

  for (const memory of memories) {
    const date = new Date(memory.occurred_at);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let dayLabel: string;
    if (date.toDateString() === today.toDateString()) {
      dayLabel = "Today";
    } else if (date.toDateString() === yesterday.toDateString()) {
      dayLabel = "Yesterday";
    } else {
      dayLabel = date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    }

    if (!groups.has(dayLabel)) {
      groups.set(dayLabel, []);
    }
    groups.get(dayLabel)!.push(memory);
  }

  return groups;
}

/**
 * Formats a single memory entry for the prompt.
 */
function formatMemoryLine(memory: RecentMemory): string {
  const typeLabels: Record<MemoryType, string> = {
    conversation: "Discussed",
    action_sent: "Sent",
    action_created: "Created",
    insight_viewed: "Viewed",
    meeting_prep: "Prepared for",
    sequence_run: "Ran",
  };

  const prefix = typeLabels[memory.memory_type] || "Did";
  let line = `${prefix}: ${memory.summary}`;

  // Add entity references if present
  const entities = memory.entities as MemoryEntry["entities"];
  const entityRefs: string[] = [];

  if (entities?.contacts?.length) {
    entityRefs.push(`re: ${entities.contacts.map((c) => c.name).join(", ")}`);
  }
  if (entities?.deals?.length) {
    entityRefs.push(`deal: ${entities.deals.map((d) => d.name).join(", ")}`);
  }

  if (entityRefs.length > 0) {
    line += ` (${entityRefs.join("; ")})`;
  }

  return line.slice(0, 150); // Truncate to keep tokens reasonable
}

/**
 * Simple token estimation (4 chars = ~1 token).
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Builds the complete memory context section for injection into the persona.
 */
export async function buildMemoryContextSection(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string
): Promise<string> {
  const memories = await getRecentMemory(supabaseUrl, serviceRoleKey, userId);
  return formatMemoryForPrompt(memories);
}
