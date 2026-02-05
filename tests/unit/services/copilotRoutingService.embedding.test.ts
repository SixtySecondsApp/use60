/**
 * Integration test for embedding-based routing fallback
 *
 * Verifies:
 * 1. Embedding fallback works for skills with no triggers
 * 2. Existing trigger-based routing is unaffected
 * 3. Semantic matches include correct metadata
 * 4. Routing requires orgId
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase
vi.mock('@/lib/supabase/clientV2', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    rpc: vi.fn(),
    functions: {
      invoke: vi.fn(),
    },
  },
}));

// Mock embeddingService
vi.mock('@/lib/services/embeddingService', () => ({
  findSemanticMatches: vi.fn(),
}));

import { routeToSkill } from '@/lib/services/copilotRoutingService';
import { supabase } from '@/lib/supabase/clientV2';
import { findSemanticMatches } from '@/lib/services/embeddingService';

const mockedFindSemanticMatches = vi.mocked(findSemanticMatches);
const mockedRpc = vi.mocked(supabase.rpc);

const TEST_ORG_ID = 'test-org-123';
const TEST_CONTEXT = { orgId: TEST_ORG_ID };

/**
 * Mock the RPC to return given skills.
 * The RPC is called twice: once for sequences, once for individual skills.
 * Both calls get the full list; filtering happens client-side.
 */
function mockRpcWithSkills(skills: any[]) {
  mockedRpc.mockResolvedValue({ data: skills, error: null } as any);
}

describe('Copilot Routing: Embedding Fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFindSemanticMatches.mockResolvedValue([]);
    // Default: RPC returns empty
    mockRpcWithSkills([]);
  });

  it('should return early when no orgId is provided', async () => {
    const result = await routeToSkill('prep me for my meeting');

    expect(result.selectedSkill).toBeNull();
    expect(result.reason).toContain('No organization ID');
    expect(mockedRpc).not.toHaveBeenCalled();
  });

  it('should use trigger-based routing when triggers match with high confidence', async () => {
    const skills = [
      {
        skill_key: 'meeting-prep-brief',
        category: 'sales-ai',
        frontmatter: {
          name: 'Meeting Prep Brief',
          description: 'Prepare a meeting brief',
          triggers: [{ pattern: 'prep me for my meeting', confidence: 0.9 }],
        },
        content: '# Meeting Prep',
        is_enabled: true,
      },
    ];

    mockRpcWithSkills(skills);

    const result = await routeToSkill('prep me for my meeting', TEST_CONTEXT);

    expect(result.selectedSkill).not.toBeNull();
    expect(result.selectedSkill?.skillKey).toBe('meeting-prep-brief');
    // Embedding service should NOT be called when triggers match
    expect(mockedFindSemanticMatches).not.toHaveBeenCalled();
  });

  it('should fall back to semantic search when no triggers match', async () => {
    // RPC returns no skills (no triggers to match)
    mockRpcWithSkills([]);

    // Mock: embedding service finds a match
    mockedFindSemanticMatches.mockResolvedValue([
      {
        skillId: 'deal-next-best-actions',
        skillKey: 'deal-next-best-actions',
        category: 'sales-ai',
        frontmatter: {
          name: 'Deal Next Best Actions',
          description: 'Recommend next steps for a deal',
        },
        similarity: 0.72,
      },
    ]);

    const result = await routeToSkill('what should I do next with this opportunity', TEST_CONTEXT);

    expect(result.selectedSkill).not.toBeNull();
    expect(result.selectedSkill?.skillKey).toBe('deal-next-best-actions');
    expect(result.selectedSkill?.confidence).toBe(0.72);
    expect(result.selectedSkill?.matchedTrigger).toBe('semantic similarity');
    expect(result.reason).toContain('Semantic match');
    expect(mockedFindSemanticMatches).toHaveBeenCalledWith(
      'what should I do next with this opportunity',
      0.6,
      3
    );
  });

  it('should return no match when both triggers and embeddings fail', async () => {
    mockRpcWithSkills([]);
    mockedFindSemanticMatches.mockResolvedValue([]);

    const result = await routeToSkill('completely unrelated gibberish xyz123', TEST_CONTEXT);

    expect(result.selectedSkill).toBeNull();
    expect(result.reason).toContain('No matching skills found');
  });

  it('should handle embedding service errors gracefully', async () => {
    mockRpcWithSkills([]);

    // Simulate embedding service failure
    mockedFindSemanticMatches.mockRejectedValue(new Error('OpenAI API rate limited'));

    const result = await routeToSkill('some query', TEST_CONTEXT);

    // Should not throw — returns no match gracefully
    expect(result.selectedSkill).toBeNull();
    expect(result.reason).toContain('No matching skills found');
  });
});
