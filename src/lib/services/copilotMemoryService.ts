/**
 * CopilotMemoryService
 *
 * Manages copilot memory storage and retrieval, including:
 * - Storing extracted memories with entity linking
 * - Retrieving memories by category
 * - Recalling relevant memories for context injection
 * - Memory extraction from conversation segments
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CopilotMemory,
  ExtractedMemory,
  MemoryInput,
  MemoryCategory,
  RelevantMemory,
  RecallOptions,
  CopilotMessage,
} from '@/lib/types/copilot';

// =============================================================================
// Memory Extraction Prompt
// =============================================================================

export const MEMORY_EXTRACTION_PROMPT = `Analyze this conversation segment and extract important memories.

Categories:
- deal: Deal-specific information, next steps, objections, requirements, pricing discussions
- relationship: Information about people, their roles, preferences, communication style, personal details
- preference: User's preferences for reports, communication, working style, formats
- commitment: Promises made, deadlines agreed, action items committed, follow-ups scheduled
- fact: General facts learned that don't fit other categories but are worth remembering

For each memory, provide:
- category: One of the above categories
- subject: Who/what this is about (e.g., "Acme Corp", "John Smith", "Weekly reports")
- content: The actual information to remember (be concise but complete)
- confidence: 0.0-1.0 how confident you are this is accurate and worth storing
- deal_name: If this relates to a specific deal (optional)
- contact_name: If this relates to a specific person (optional)
- company_name: If this relates to a specific company (optional)

Guidelines:
- Only extract genuinely useful information that would help in future conversations
- Avoid extracting trivial or obvious information
- Be specific - "John prefers email over calls" is better than "learned about John"
- Confidence should reflect both accuracy and usefulness
- Skip memories with confidence below 0.5

Return as a JSON array of memory objects. Example:
[
  {
    "category": "relationship",
    "subject": "John Smith",
    "content": "Prefers email communication over phone calls, best reached in mornings",
    "confidence": 0.9,
    "contact_name": "John Smith"
  },
  {
    "category": "deal",
    "subject": "Acme Corp Q1 Deal",
    "content": "Budget approval needed by Feb 15, decision maker is Sarah Chen",
    "confidence": 0.85,
    "deal_name": "Acme Corp",
    "company_name": "Acme Corp"
  }
]

If no meaningful memories can be extracted, return an empty array: []`;

// =============================================================================
// Service Class
// =============================================================================

export class CopilotMemoryService {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  // ===========================================================================
  // Memory Storage
  // ===========================================================================

  /**
   * Store a new memory with optional entity linking
   */
  async storeMemory(memory: MemoryInput): Promise<CopilotMemory> {
    const { data, error } = await this.supabase
      .from('copilot_memories')
      .insert({
        user_id: memory.user_id,
        clerk_org_id: memory.clerk_org_id,
        category: memory.category,
        subject: memory.subject,
        content: memory.content,
        context_summary: memory.context_summary,
        deal_id: memory.deal_id,
        contact_id: memory.contact_id,
        company_id: memory.company_id,
        confidence: memory.confidence ?? 1.0,
        source_message_ids: memory.source_message_ids,
        expires_at: memory.expires_at,
        access_count: 0,
      })
      .select('id, user_id, clerk_org_id, category, subject, content, context_summary, deal_id, contact_id, company_id, confidence, source_message_ids, last_accessed_at, access_count, created_at, updated_at, expires_at')
      .single();

    if (error) {
      console.error('[CopilotMemoryService] Error storing memory:', error);
      throw new Error(`Failed to store memory: ${error.message}`);
    }

    return data as CopilotMemory;
  }

  /**
   * Store multiple memories in batch
   */
  async storeMemories(memories: MemoryInput[]): Promise<CopilotMemory[]> {
    if (memories.length === 0) return [];

    const { data, error } = await this.supabase
      .from('copilot_memories')
      .insert(
        memories.map((m) => ({
          user_id: m.user_id,
          clerk_org_id: m.clerk_org_id,
          category: m.category,
          subject: m.subject,
          content: m.content,
          context_summary: m.context_summary,
          deal_id: m.deal_id,
          contact_id: m.contact_id,
          company_id: m.company_id,
          confidence: m.confidence ?? 1.0,
          source_message_ids: m.source_message_ids,
          expires_at: m.expires_at,
          access_count: 0,
        }))
      )
      .select('id, user_id, clerk_org_id, category, subject, content, context_summary, deal_id, contact_id, company_id, confidence, source_message_ids, last_accessed_at, access_count, created_at, updated_at, expires_at');

    if (error) {
      console.error('[CopilotMemoryService] Error storing memories:', error);
      throw new Error(`Failed to store memories: ${error.message}`);
    }

    return data as CopilotMemory[];
  }

  // ===========================================================================
  // Memory Retrieval
  // ===========================================================================

  /**
   * Get memories by category for a user
   */
  async getMemoriesByCategory(
    userId: string,
    category: MemoryCategory,
    limit: number = 20
  ): Promise<CopilotMemory[]> {
    const { data, error } = await this.supabase
      .from('copilot_memories')
      .select('id, user_id, clerk_org_id, category, subject, content, context_summary, deal_id, contact_id, company_id, confidence, source_message_ids, last_accessed_at, access_count, created_at, updated_at, expires_at')
      .eq('user_id', userId)
      .eq('category', category)
      .or('expires_at.is.null,expires_at.gt.now()')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[CopilotMemoryService] Error fetching memories by category:', error);
      throw new Error(`Failed to fetch memories: ${error.message}`);
    }

    return data as CopilotMemory[];
  }

  /**
   * Get all memories for a user
   */
  async getAllMemories(userId: string, limit: number = 50): Promise<CopilotMemory[]> {
    const { data, error } = await this.supabase
      .from('copilot_memories')
      .select('id, user_id, clerk_org_id, category, subject, content, context_summary, deal_id, contact_id, company_id, confidence, source_message_ids, last_accessed_at, access_count, created_at, updated_at, expires_at')
      .eq('user_id', userId)
      .or('expires_at.is.null,expires_at.gt.now()')
      .order('last_accessed_at', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (error) {
      console.error('[CopilotMemoryService] Error fetching all memories:', error);
      throw new Error(`Failed to fetch memories: ${error.message}`);
    }

    return data as CopilotMemory[];
  }

  /**
   * Get memories linked to a specific deal
   */
  async getMemoriesForDeal(userId: string, dealId: string): Promise<CopilotMemory[]> {
    const { data, error } = await this.supabase
      .from('copilot_memories')
      .select('id, user_id, clerk_org_id, category, subject, content, context_summary, deal_id, contact_id, company_id, confidence, source_message_ids, last_accessed_at, access_count, created_at, updated_at, expires_at')
      .eq('user_id', userId)
      .eq('deal_id', dealId)
      .or('expires_at.is.null,expires_at.gt.now()')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[CopilotMemoryService] Error fetching deal memories:', error);
      throw new Error(`Failed to fetch deal memories: ${error.message}`);
    }

    return data as CopilotMemory[];
  }

  /**
   * Get memories linked to a specific contact
   */
  async getMemoriesForContact(userId: string, contactId: string): Promise<CopilotMemory[]> {
    const { data, error } = await this.supabase
      .from('copilot_memories')
      .select('id, user_id, clerk_org_id, category, subject, content, context_summary, deal_id, contact_id, company_id, confidence, source_message_ids, last_accessed_at, access_count, created_at, updated_at, expires_at')
      .eq('user_id', userId)
      .eq('contact_id', contactId)
      .or('expires_at.is.null,expires_at.gt.now()')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[CopilotMemoryService] Error fetching contact memories:', error);
      throw new Error(`Failed to fetch contact memories: ${error.message}`);
    }

    return data as CopilotMemory[];
  }

  // ===========================================================================
  // Access Tracking
  // ===========================================================================

  /**
   * Record access to a memory (updates last_accessed_at and access_count)
   */
  async recordAccess(memoryId: string): Promise<void> {
    const { error } = await this.supabase
      .from('copilot_memories')
      .update({
        last_accessed_at: new Date().toISOString(),
        access_count: this.supabase.rpc('increment_access_count', { memory_id: memoryId }),
      })
      .eq('id', memoryId);

    if (error) {
      // Non-critical error, just log it
      console.warn('[CopilotMemoryService] Error recording access:', error);
    }
  }

  /**
   * Record access to multiple memories
   */
  async recordAccessBatch(memoryIds: string[]): Promise<void> {
    if (memoryIds.length === 0) return;

    const { error } = await this.supabase
      .from('copilot_memories')
      .update({
        last_accessed_at: new Date().toISOString(),
      })
      .in('id', memoryIds);

    // Also increment access counts (separate query for the increment)
    await this.supabase.rpc('increment_memory_access_counts', { memory_ids: memoryIds });

    if (error) {
      console.warn('[CopilotMemoryService] Error recording batch access:', error);
    }
  }

  // ===========================================================================
  // Memory Recall (Relevance-Based Retrieval)
  // ===========================================================================

  /**
   * Recall relevant memories based on context
   * Uses keyword matching on subject and content fields
   */
  async recallRelevant(options: RecallOptions): Promise<RelevantMemory[]> {
    const { user_id, context, limit = 10, categories } = options;

    // Extract keywords from context (simple word extraction)
    const keywords = this.extractKeywords(context);

    if (keywords.length === 0) {
      return [];
    }

    // Build query
    let query = this.supabase
      .from('copilot_memories')
      .select('id, user_id, clerk_org_id, category, subject, content, context_summary, deal_id, contact_id, company_id, confidence, source_message_ids, last_accessed_at, access_count, created_at, updated_at, expires_at')
      .eq('user_id', user_id)
      .or('expires_at.is.null,expires_at.gt.now()');

    if (categories && categories.length > 0) {
      query = query.in('category', categories);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[CopilotMemoryService] Error recalling memories:', error);
      throw new Error(`Failed to recall memories: ${error.message}`);
    }

    // Score and filter memories by relevance
    const scored = (data as CopilotMemory[])
      .map((memory) => ({
        ...memory,
        relevance_score: this.calculateRelevance(memory, keywords),
      }))
      .filter((m) => m.relevance_score > 0)
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, limit);

    // Record access for returned memories
    if (scored.length > 0) {
      await this.recordAccessBatch(scored.map((m) => m.id));
    }

    return scored;
  }

  /**
   * Extract keywords from text for matching
   */
  private extractKeywords(text: string): string[] {
    // Convert to lowercase and split on non-word characters
    const words = text.toLowerCase().split(/\W+/);

    // Filter out common stop words and short words
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
      'this', 'that', 'these', 'those', 'it', 'its', 'i', 'me', 'my',
      'we', 'our', 'you', 'your', 'he', 'she', 'they', 'them', 'their',
      'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how',
      'about', 'into', 'through', 'during', 'before', 'after', 'above',
      'below', 'between', 'under', 'again', 'further', 'then', 'once',
    ]);

    return words.filter((word) => word.length > 2 && !stopWords.has(word));
  }

  /**
   * Calculate relevance score for a memory based on keywords
   */
  private calculateRelevance(memory: CopilotMemory, keywords: string[]): number {
    let score = 0;
    const subjectLower = memory.subject.toLowerCase();
    const contentLower = memory.content.toLowerCase();

    for (const keyword of keywords) {
      // Subject matches weighted higher
      if (subjectLower.includes(keyword)) {
        score += 3;
      }
      // Content matches
      if (contentLower.includes(keyword)) {
        score += 2;
      }
    }

    // Boost for confidence
    score *= memory.confidence;

    // Boost for recent access
    if (memory.last_accessed_at) {
      const daysSinceAccess =
        (Date.now() - new Date(memory.last_accessed_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceAccess < 7) {
        score *= 1.2;
      } else if (daysSinceAccess < 30) {
        score *= 1.1;
      }
    }

    // Boost for access frequency
    if (memory.access_count > 0) {
      score *= 1 + Math.min(memory.access_count / 20, 0.5);
    }

    return score;
  }

  // ===========================================================================
  // Memory Extraction
  // ===========================================================================

  /**
   * Extract memories from conversation messages
   * This is called by the compaction flow to extract memories before summarizing
   */
  async extractMemories(
    messages: CopilotMessage[],
    anthropicClient: { messages: { create: (params: unknown) => Promise<{ content: Array<{ type: string; text?: string }> }> } },
    model: string = 'claude-sonnet-4-20250514'
  ): Promise<ExtractedMemory[]> {
    if (messages.length === 0) return [];

    // Format messages for extraction
    const conversationText = messages
      .map((m) => `[${m.role}]: ${m.content}`)
      .join('\n\n');

    try {
      const response = await anthropicClient.messages.create({
        model,
        max_tokens: 2048,
        system: MEMORY_EXTRACTION_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Extract memories from this conversation:\n\n${conversationText}`,
          },
        ],
      });

      const textContent = response.content.find((c) => c.type === 'text');
      const responseText = textContent?.text || '';

      // Parse JSON response
      const jsonMatch =
        responseText.match(/```json\n?([\s\S]*?)\n?```/) ||
        responseText.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const extracted = JSON.parse(jsonStr) as ExtractedMemory[];

        // Filter out low confidence memories
        return extracted.filter((m) => m.confidence >= 0.5);
      }

      return [];
    } catch (error) {
      console.error('[CopilotMemoryService] Error extracting memories:', error);
      // Return empty array on error - extraction is not critical
      return [];
    }
  }

  /**
   * Link extracted memories to entities by name matching
   */
  async linkMemoriesToEntities(
    userId: string,
    memories: ExtractedMemory[]
  ): Promise<MemoryInput[]> {
    const linked: MemoryInput[] = [];

    for (const memory of memories) {
      const input: MemoryInput = {
        user_id: userId,
        category: memory.category,
        subject: memory.subject,
        content: memory.content,
        confidence: memory.confidence,
      };

      // Try to link to deal by name
      if (memory.deal_name) {
        const { data: deal } = await this.supabase
          .from('deals')
          .select('id')
          .eq('user_id', userId)
          .ilike('name', `%${memory.deal_name}%`)
          .limit(1)
          .maybeSingle();

        if (deal) {
          input.deal_id = deal.id;
        }
      }

      // Try to link to contact by name
      if (memory.contact_name) {
        const { data: contact } = await this.supabase
          .from('contacts')
          .select('id')
          .eq('user_id', userId)
          .or(`first_name.ilike.%${memory.contact_name}%,last_name.ilike.%${memory.contact_name}%`)
          .limit(1)
          .maybeSingle();

        if (contact) {
          input.contact_id = contact.id;
        }
      }

      // Try to link to company by name
      if (memory.company_name) {
        const { data: company } = await this.supabase
          .from('companies')
          .select('id')
          .eq('user_id', userId)
          .ilike('name', `%${memory.company_name}%`)
          .limit(1)
          .maybeSingle();

        if (company) {
          input.company_id = company.id;
        }
      }

      linked.push(input);
    }

    return linked;
  }

  // ===========================================================================
  // Memory Management
  // ===========================================================================

  /**
   * Delete a memory
   */
  async deleteMemory(memoryId: string): Promise<void> {
    const { error } = await this.supabase
      .from('copilot_memories')
      .delete()
      .eq('id', memoryId);

    if (error) {
      console.error('[CopilotMemoryService] Error deleting memory:', error);
      throw new Error(`Failed to delete memory: ${error.message}`);
    }
  }

  /**
   * Update a memory
   */
  async updateMemory(
    memoryId: string,
    updates: Partial<Pick<CopilotMemory, 'subject' | 'content' | 'category' | 'confidence' | 'expires_at'>>
  ): Promise<CopilotMemory> {
    const { data, error } = await this.supabase
      .from('copilot_memories')
      .update(updates)
      .eq('id', memoryId)
      .select('id, user_id, clerk_org_id, category, subject, content, context_summary, deal_id, contact_id, company_id, confidence, source_message_ids, last_accessed_at, access_count, created_at, updated_at, expires_at')
      .single();

    if (error) {
      console.error('[CopilotMemoryService] Error updating memory:', error);
      throw new Error(`Failed to update memory: ${error.message}`);
    }

    return data as CopilotMemory;
  }
}

export default CopilotMemoryService;
