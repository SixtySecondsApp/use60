/**
 * CopilotSessionService
 *
 * Manages copilot conversation sessions, including:
 * - Main session retrieval/creation
 * - Message persistence and loading
 * - Token estimation and compaction
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CopilotConversation,
  CopilotMessage,
  CopilotSessionSummary,
  AddMessageInput,
  LoadMessagesOptions,
  CompactionResult,
  CompactionConfig,
  KeyPoint,
} from '@/lib/types/copilot';

// =============================================================================
// Constants
// =============================================================================

/** Token threshold to trigger compaction */
export const COMPACTION_THRESHOLD = 80000;

/** Target token count after compaction */
export const TARGET_CONTEXT_SIZE = 20000;

/** Minimum messages to keep uncompacted */
export const MIN_RECENT_MESSAGES = 10;

/** Default compaction configuration */
export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
  compactionThreshold: COMPACTION_THRESHOLD,
  targetContextSize: TARGET_CONTEXT_SIZE,
  minRecentMessages: MIN_RECENT_MESSAGES,
};

// =============================================================================
// Token Estimation
// =============================================================================

/**
 * Estimate token count from text (roughly 4 chars = 1 token)
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Estimate tokens for a message including role and metadata
 */
export function estimateMessageTokens(message: CopilotMessage): number {
  let tokens = estimateTokens(message.content);
  // Add overhead for role and structure
  tokens += 10;
  // Add metadata tokens if present
  if (message.metadata) {
    tokens += estimateTokens(JSON.stringify(message.metadata));
  }
  return tokens;
}

// =============================================================================
// Service Class
// =============================================================================

export class CopilotSessionService {
  private supabase: SupabaseClient;
  private config: CompactionConfig;

  constructor(supabase: SupabaseClient, config?: Partial<CompactionConfig>) {
    this.supabase = supabase;
    this.config = { ...DEFAULT_COMPACTION_CONFIG, ...config };
  }

  // ===========================================================================
  // Main Session Management
  // ===========================================================================

  /**
   * Get or create the main session for a user
   */
  async getMainSession(userId: string, orgId?: string): Promise<CopilotConversation> {
    // Try to get existing main session
    const { data: existing, error: fetchError } = await this.supabase
      .from('copilot_conversations')
      .select('id, user_id, org_id, title, is_main_session, total_tokens_estimate, last_compaction_at, created_at, updated_at')
      .eq('user_id', userId)
      .eq('is_main_session', true)
      .maybeSingle();

    if (fetchError) {
      console.error('[CopilotSessionService] Error fetching main session:', fetchError);
      throw new Error(`Failed to fetch main session: ${fetchError.message}`);
    }

    if (existing) {
      return existing as CopilotConversation;
    }

    // Create new main session
    const { data: created, error: createError } = await this.supabase
      .from('copilot_conversations')
      .insert({
        user_id: userId,
        org_id: orgId,
        title: 'Main Session',
        is_main_session: true,
        total_tokens_estimate: 0,
      })
      .select('id, user_id, org_id, title, is_main_session, total_tokens_estimate, last_compaction_at, created_at, updated_at')
      .single();

    if (createError) {
      console.error('[CopilotSessionService] Error creating main session:', createError);
      throw new Error(`Failed to create main session: ${createError.message}`);
    }

    return created as CopilotConversation;
  }

  /**
   * Get a conversation by ID
   */
  async getConversation(conversationId: string): Promise<CopilotConversation | null> {
    const { data, error } = await this.supabase
      .from('copilot_conversations')
      .select('id, user_id, org_id, title, is_main_session, total_tokens_estimate, last_compaction_at, created_at, updated_at')
      .eq('id', conversationId)
      .maybeSingle();

    if (error) {
      console.error('[CopilotSessionService] Error fetching conversation:', error);
      throw new Error(`Failed to fetch conversation: ${error.message}`);
    }

    return data as CopilotConversation | null;
  }

  // ===========================================================================
  // Message Persistence
  // ===========================================================================

  /**
   * Add a message to a conversation
   */
  async addMessage(input: AddMessageInput): Promise<CopilotMessage> {
    const { data, error } = await this.supabase
      .from('copilot_messages')
      .insert({
        conversation_id: input.conversation_id,
        role: input.role,
        content: input.content,
        metadata: input.metadata || null,
        is_compacted: false,
      })
      .select('id, conversation_id, role, content, metadata, is_compacted, created_at')
      .single();

    if (error) {
      console.error('[CopilotSessionService] Error adding message:', error);
      throw new Error(`Failed to add message: ${error.message}`);
    }

    // Update token estimate
    const tokenDelta = estimateMessageTokens(data as CopilotMessage);
    await this.incrementTokenEstimate(input.conversation_id, tokenDelta);

    return data as CopilotMessage;
  }

  /**
   * Load messages from a conversation with pagination
   */
  async loadMessages(options: LoadMessagesOptions): Promise<CopilotMessage[]> {
    const { conversation_id, limit = 50, before, include_compacted = false } = options;

    let query = this.supabase
      .from('copilot_messages')
      .select('id, conversation_id, role, content, metadata, is_compacted, created_at')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!include_compacted) {
      query = query.eq('is_compacted', false);
    }

    if (before) {
      // Get the created_at of the 'before' message for cursor pagination
      const { data: beforeMsg } = await this.supabase
        .from('copilot_messages')
        .select('created_at')
        .eq('id', before)
        .single();

      if (beforeMsg) {
        query = query.lt('created_at', beforeMsg.created_at);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error('[CopilotSessionService] Error loading messages:', error);
      throw new Error(`Failed to load messages: ${error.message}`);
    }

    // Return in chronological order
    return (data as CopilotMessage[]).reverse();
  }

  /**
   * Load all non-compacted messages (for compaction)
   */
  async loadAllMessages(conversationId: string): Promise<CopilotMessage[]> {
    const { data, error } = await this.supabase
      .from('copilot_messages')
      .select('id, conversation_id, role, content, metadata, is_compacted, created_at')
      .eq('conversation_id', conversationId)
      .eq('is_compacted', false)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[CopilotSessionService] Error loading all messages:', error);
      throw new Error(`Failed to load all messages: ${error.message}`);
    }

    return data as CopilotMessage[];
  }

  // ===========================================================================
  // Token Management
  // ===========================================================================

  /**
   * Update the token estimate for a conversation
   */
  async updateTokenEstimate(conversationId: string): Promise<number> {
    const messages = await this.loadAllMessages(conversationId);
    const totalTokens = messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);

    await this.supabase
      .from('copilot_conversations')
      .update({ total_tokens_estimate: totalTokens })
      .eq('id', conversationId);

    return totalTokens;
  }

  /**
   * Increment token estimate by a delta
   */
  private async incrementTokenEstimate(conversationId: string, delta: number): Promise<void> {
    const { data: conv } = await this.supabase
      .from('copilot_conversations')
      .select('total_tokens_estimate')
      .eq('id', conversationId)
      .single();

    const newEstimate = (conv?.total_tokens_estimate || 0) + delta;

    await this.supabase
      .from('copilot_conversations')
      .update({ total_tokens_estimate: newEstimate })
      .eq('id', conversationId);
  }

  // ===========================================================================
  // Compaction Checks
  // ===========================================================================

  /**
   * Check if a conversation needs compaction
   */
  async needsCompaction(conversationId: string): Promise<boolean> {
    const { data } = await this.supabase
      .from('copilot_conversations')
      .select('total_tokens_estimate')
      .eq('id', conversationId)
      .single();

    if (!data) return false;
    return data.total_tokens_estimate > this.config.compactionThreshold;
  }

  /**
   * Find the split point for compaction (index of first message to keep)
   */
  findSplitPoint(messages: CopilotMessage[], targetSize: number): number {
    if (messages.length <= this.config.minRecentMessages) {
      return 0; // Keep all messages
    }

    // Work backwards from the end, accumulating tokens until we hit target
    let accumulatedTokens = 0;
    let splitIndex = messages.length;

    for (let i = messages.length - 1; i >= 0; i--) {
      accumulatedTokens += estimateMessageTokens(messages[i]);
      if (accumulatedTokens > targetSize) {
        splitIndex = i + 1;
        break;
      }
    }

    // Ensure we keep at least minRecentMessages
    const maxSplitIndex = messages.length - this.config.minRecentMessages;
    return Math.min(splitIndex, Math.max(0, maxSplitIndex));
  }

  // ===========================================================================
  // Summary Storage
  // ===========================================================================

  /**
   * Store a session summary
   */
  async storeSummary(
    conversationId: string,
    userId: string,
    summary: string,
    keyPoints: KeyPoint[],
    messages: CopilotMessage[],
    tokensBefore: number,
    tokensAfter: number
  ): Promise<CopilotSessionSummary> {
    const { data, error } = await this.supabase
      .from('copilot_session_summaries')
      .insert({
        conversation_id: conversationId,
        user_id: userId,
        summary,
        key_points: keyPoints,
        message_range_start: messages[0]?.id,
        message_range_end: messages[messages.length - 1]?.id,
        messages_summarized: messages.length,
        tokens_before: tokensBefore,
        tokens_after: tokensAfter,
      })
      .select('id, user_id, conversation_id, summary, key_points, message_range_start, message_range_end, messages_summarized, tokens_before, tokens_after, created_at')
      .single();

    if (error) {
      console.error('[CopilotSessionService] Error storing summary:', error);
      throw new Error(`Failed to store summary: ${error.message}`);
    }

    return data as CopilotSessionSummary;
  }

  /**
   * Get recent summaries for a conversation
   */
  async getSummaries(conversationId: string, limit: number = 5): Promise<CopilotSessionSummary[]> {
    const { data, error } = await this.supabase
      .from('copilot_session_summaries')
      .select('id, user_id, conversation_id, summary, key_points, message_range_start, message_range_end, messages_summarized, tokens_before, tokens_after, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[CopilotSessionService] Error fetching summaries:', error);
      throw new Error(`Failed to fetch summaries: ${error.message}`);
    }

    return data as CopilotSessionSummary[];
  }

  // ===========================================================================
  // Message Compaction (Soft Delete)
  // ===========================================================================

  /**
   * Mark messages as compacted (soft delete)
   */
  async markCompacted(messageIds: string[]): Promise<void> {
    if (messageIds.length === 0) return;

    const { error } = await this.supabase
      .from('copilot_messages')
      .update({ is_compacted: true })
      .in('id', messageIds);

    if (error) {
      console.error('[CopilotSessionService] Error marking messages as compacted:', error);
      throw new Error(`Failed to mark messages as compacted: ${error.message}`);
    }
  }

  /**
   * Update last compaction timestamp
   */
  async updateLastCompaction(conversationId: string): Promise<void> {
    await this.supabase
      .from('copilot_conversations')
      .update({ last_compaction_at: new Date().toISOString() })
      .eq('id', conversationId);
  }

  // ===========================================================================
  // Full Compaction Flow
  // ===========================================================================

  /**
   * Perform full session compaction:
   * 1. Load all messages
   * 2. Find split point (messages to summarize vs keep)
   * 3. Generate summary via Claude
   * 4. Extract memories via MemoryService
   * 5. Store summary
   * 6. Mark old messages as compacted
   * 7. Update token estimate
   */
  async compactSession(
    conversationId: string,
    userId: string,
    anthropicClient: { messages: { create: (params: unknown) => Promise<{ content: Array<{ type: string; text?: string }> }> } },
    memoryService: { extractMemories: (messages: CopilotMessage[], client: unknown, model: string) => Promise<Array<{ category: string; subject: string; content: string; confidence: number }>>; linkMemoriesToEntities: (userId: string, memories: unknown[]) => Promise<unknown[]>; storeMemories: (memories: unknown[]) => Promise<unknown[]> },
    model: string = 'claude-sonnet-4-20250514'
  ): Promise<CompactionResult> {
    try {
      // 1. Load all messages
      const messages = await this.loadAllMessages(conversationId);

      if (messages.length === 0) {
        return {
          success: true,
          summarizedCount: 0,
          memoriesExtracted: 0,
          tokensBefore: 0,
          tokensAfter: 0,
        };
      }

      // Calculate tokens before
      const tokensBefore = messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);

      // 2. Find split point
      const splitIndex = this.findSplitPoint(messages, this.config.targetContextSize);

      if (splitIndex === 0) {
        // Nothing to compact
        return {
          success: true,
          summarizedCount: 0,
          memoriesExtracted: 0,
          tokensBefore,
          tokensAfter: tokensBefore,
        };
      }

      const toSummarize = messages.slice(0, splitIndex);
      const toKeep = messages.slice(splitIndex);

      // 3. Generate summary via Claude
      const summary = await this.generateSummary(toSummarize, anthropicClient, model);

      // 4. Extract memories from summarized portion
      const extractedMemories = await memoryService.extractMemories(toSummarize, anthropicClient, model);
      const linkedMemories = await memoryService.linkMemoriesToEntities(userId, extractedMemories);
      await memoryService.storeMemories(linkedMemories);

      // 5. Extract key points from summary
      const keyPoints = this.extractKeyPoints(summary);

      // 6. Store summary
      const tokensAfter = toKeep.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
      const summaryRecord = await this.storeSummary(
        conversationId,
        userId,
        summary,
        keyPoints,
        toSummarize,
        tokensBefore - tokensAfter,
        estimateTokens(summary)
      );

      // 7. Mark old messages as compacted
      await this.markCompacted(toSummarize.map((m) => m.id));

      // 8. Update conversation
      await this.updateTokenEstimate(conversationId);
      await this.updateLastCompaction(conversationId);

      return {
        success: true,
        summarizedCount: toSummarize.length,
        memoriesExtracted: extractedMemories.length,
        tokensBefore,
        tokensAfter,
        summaryId: summaryRecord.id,
      };
    } catch (error) {
      console.error('[CopilotSessionService] Compaction error:', error);
      return {
        success: false,
        summarizedCount: 0,
        memoriesExtracted: 0,
        tokensBefore: 0,
        tokensAfter: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate a summary of messages using Claude
   */
  private async generateSummary(
    messages: CopilotMessage[],
    anthropicClient: { messages: { create: (params: unknown) => Promise<{ content: Array<{ type: string; text?: string }> }> } },
    model: string
  ): Promise<string> {
    const conversationText = messages
      .map((m) => `[${m.role}]: ${m.content}`)
      .join('\n\n');

    const response = await anthropicClient.messages.create({
      model,
      max_tokens: 2048,
      system: `You are summarizing a conversation between a user and an AI assistant.
Create a concise summary that captures:
1. The main topics discussed
2. Key decisions or conclusions reached
3. Important context that would be needed to continue the conversation
4. Any action items or commitments mentioned

Keep the summary focused and under 500 words. Structure it clearly.`,
      messages: [
        {
          role: 'user',
          content: `Summarize this conversation:\n\n${conversationText}`,
        },
      ],
    });

    const textContent = response.content.find((c) => c.type === 'text');
    return textContent?.text || '';
  }

  /**
   * Extract key points from a summary
   */
  private extractKeyPoints(summary: string): KeyPoint[] {
    // Simple extraction - look for bullet points or numbered items
    const lines = summary.split('\n');
    const keyPoints: KeyPoint[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      // Match bullet points or numbered items
      const match = trimmed.match(/^[-•*]|\d+[.)]/);
      if (match && trimmed.length > 10) {
        const content = trimmed.replace(/^[-•*]\s*|\d+[.)]\s*/, '');
        keyPoints.push({
          topic: content.slice(0, 50),
          detail: content,
          importance: 'medium',
        });
      }
    }

    return keyPoints.slice(0, 10); // Limit to 10 key points
  }
}

export default CopilotSessionService;
