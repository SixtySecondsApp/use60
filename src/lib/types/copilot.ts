/**
 * Copilot Types
 *
 * Type definitions for the copilot memory and session persistence system.
 */

// =============================================================================
// Memory Types
// =============================================================================

/**
 * Memory categories for classification
 */
export type MemoryCategory = 'deal' | 'relationship' | 'preference' | 'commitment' | 'fact';

/**
 * A stored memory from copilot conversations
 */
export interface CopilotMemory {
  id: string;
  user_id: string;
  clerk_org_id?: string | null;

  // Categorization
  category: MemoryCategory;

  // Content
  subject: string;
  content: string;
  context_summary?: string | null;

  // Entity linking
  deal_id?: string | null;
  contact_id?: string | null;
  company_id?: string | null;

  // Metadata
  confidence: number;
  source_message_ids?: string[] | null;
  last_accessed_at?: string | null;
  access_count: number;

  // Timestamps
  created_at: string;
  updated_at: string;
  expires_at?: string | null;
}

/**
 * Memory extracted from conversation by LLM
 */
export interface ExtractedMemory {
  category: MemoryCategory;
  subject: string;
  content: string;
  confidence: number;
  // Optional entity names for linking
  deal_name?: string;
  contact_name?: string;
  company_name?: string;
}

/**
 * Input for storing a new memory
 */
export interface MemoryInput {
  user_id: string;
  clerk_org_id?: string;
  category: MemoryCategory;
  subject: string;
  content: string;
  context_summary?: string;
  deal_id?: string;
  contact_id?: string;
  company_id?: string;
  confidence?: number;
  source_message_ids?: string[];
  expires_at?: string;
}

/**
 * Memory with relevance score from recall
 */
export interface RelevantMemory extends CopilotMemory {
  relevance_score: number;
}

// =============================================================================
// Session Types
// =============================================================================

/**
 * A copilot conversation session
 */
export interface CopilotConversation {
  id: string;
  user_id: string;
  org_id?: string | null;
  title?: string | null;
  is_main_session: boolean;
  total_tokens_estimate: number;
  last_compaction_at?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A message in a copilot conversation
 */
export interface CopilotMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: CopilotMessageMetadata | null;
  is_compacted: boolean;
  created_at: string;
}

/**
 * Metadata stored with copilot messages
 */
export interface CopilotMessageMetadata {
  tool_calls?: ToolCallMetadata[];
  structured_response?: unknown;
  recommendations?: unknown[];
}

/**
 * Tool call information stored in message metadata
 */
export interface ToolCallMetadata {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: 'running' | 'completed' | 'error';
  result?: unknown;
  error?: string;
}

// =============================================================================
// Session Summary Types
// =============================================================================

/**
 * A summary of compacted conversation messages
 */
export interface CopilotSessionSummary {
  id: string;
  user_id: string;
  conversation_id: string;
  summary: string;
  key_points?: KeyPoint[] | null;
  message_range_start?: string | null;
  message_range_end?: string | null;
  messages_summarized: number;
  tokens_before?: number | null;
  tokens_after?: number | null;
  created_at: string;
}

/**
 * A key point extracted during summarization
 */
export interface KeyPoint {
  topic: string;
  detail: string;
  importance: 'high' | 'medium' | 'low';
}

// =============================================================================
// Compaction Types
// =============================================================================

/**
 * Result of a session compaction operation
 */
export interface CompactionResult {
  success: boolean;
  summarizedCount: number;
  memoriesExtracted: number;
  tokensBefore: number;
  tokensAfter: number;
  summaryId?: string;
  error?: string;
}

/**
 * Configuration for compaction thresholds
 */
export interface CompactionConfig {
  /** Token threshold to trigger compaction (default: 80000) */
  compactionThreshold: number;
  /** Target token count after compaction (default: 20000) */
  targetContextSize: number;
  /** Minimum messages to keep uncompacted (default: 10) */
  minRecentMessages: number;
}

// =============================================================================
// Service Input/Output Types
// =============================================================================

/**
 * Input for adding a message to a conversation
 */
export interface AddMessageInput {
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: CopilotMessageMetadata;
}

/**
 * Options for loading messages
 */
export interface LoadMessagesOptions {
  conversation_id: string;
  limit?: number;
  before?: string; // Message ID for pagination
  include_compacted?: boolean;
}

/**
 * Memory recall options
 */
export interface RecallOptions {
  user_id: string;
  context: string;
  limit?: number;
  categories?: MemoryCategory[];
}
