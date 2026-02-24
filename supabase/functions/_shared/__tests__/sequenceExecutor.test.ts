/**
 * Integration tests for sequenceExecutor
 *
 * Tests the core sequence execution engine including:
 * - Basic step execution flow
 * - Error recovery strategies (stop, continue, fallback)
 * - Retry mechanism with exponential backoff
 * - Timeout handling
 * - Input/output mapping between steps
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

// Mock the dependencies
vi.mock('../agentSkillExecutor.ts', () => ({
  executeAgentSkillWithContract: vi.fn(),
}));

vi.mock('../copilot_adapters/executeAction.ts', () => ({
  executeAction: vi.fn(),
}));

// Import after mocking
import { executeSequence, type SequenceExecuteParams } from '../sequenceExecutor.ts';
import { executeAgentSkillWithContract } from '../agentSkillExecutor.ts';
import { executeAction } from '../copilot_adapters/executeAction.ts';

// Test fixtures
const mockOrgId = 'org-test-001';
const mockUserId = 'user-test-001';

// Create a mock Supabase client
function createMockSupabase(overrides: {
  membershipData?: any;
  skillData?: any;
  executionData?: any;
} = {}) {
  const updateMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'organization_memberships') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: overrides.membershipData ?? { role: 'member' },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      if (table === 'organization_skills') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: overrides.skillData ?? {
                      skill_id: 'seq-test-sequence',
                      is_enabled: true,
                      compiled_frontmatter: {
                        sequence_steps: [
                          { order: 1, action: 'test_action', output_key: 'step1_output' },
                        ],
                      },
                      platform_skills: {
                        category: 'agent-sequence',
                        is_active: true,
                      },
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }

      if (table === 'sequence_executions') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: overrides.executionData ?? { id: 'exec-test-001' },
                error: null,
              }),
            }),
          }),
          update: updateMock,
        };
      }

      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'test-id' }, error: null }),
          }),
        }),
        update: updateMock,
      };
    }),
  };
}

describe('sequenceExecutor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('basic execution', () => {
    it('executes a single-step sequence successfully', async () => {
      const mockSupabase = createMockSupabase();
      const mockActionExecute = executeAction as Mock;

      mockActionExecute.mockResolvedValue({
        success: true,
        data: { result: 'success' },
        error: null,
      });

      const params: SequenceExecuteParams = {
        organizationId: mockOrgId,
        userId: mockUserId,
        sequenceKey: 'seq-test-sequence',
        isSimulation: false,
      };

      // Run the sequence
      const resultPromise = executeSequence(mockSupabase as any, params);

      // Advance timers to handle any async operations
      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.status).toBe('completed');
      expect(result.step_results).toHaveLength(1);
      expect(result.step_results[0].status).toBe('success');
    });

    it('handles multi-step sequences with output mapping', async () => {
      const skillData = {
        skill_id: 'seq-multi-step',
        is_enabled: true,
        compiled_frontmatter: {
          sequence_steps: [
            { order: 1, action: 'get_data', output_key: 'data_result' },
            {
              order: 2,
              action: 'process_data',
              input_mapping: { input: '${outputs.data_result}' },
              output_key: 'processed',
            },
          ],
        },
        platform_skills: { category: 'agent-sequence', is_active: true },
      };

      const mockSupabase = createMockSupabase({ skillData });
      const mockActionExecute = executeAction as Mock;

      mockActionExecute
        .mockResolvedValueOnce({
          success: true,
          data: { value: 42 },
        })
        .mockResolvedValueOnce({
          success: true,
          data: { processed_value: 84 },
        });

      const params: SequenceExecuteParams = {
        organizationId: mockOrgId,
        userId: mockUserId,
        sequenceKey: 'seq-multi-step',
        isSimulation: false,
      };

      const resultPromise = executeSequence(mockSupabase as any, params);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.step_results).toHaveLength(2);
      expect(mockActionExecute).toHaveBeenCalledTimes(2);
    });

    it('runs in simulation mode without side effects', async () => {
      const mockSupabase = createMockSupabase();
      const mockActionExecute = executeAction as Mock;

      mockActionExecute.mockResolvedValue({
        success: true,
        needs_confirmation: true,
        preview: { task: 'Preview task data' },
      });

      const params: SequenceExecuteParams = {
        organizationId: mockOrgId,
        userId: mockUserId,
        sequenceKey: 'seq-test-sequence',
        isSimulation: true,
      };

      const resultPromise = executeSequence(mockSupabase as any, params);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.is_simulation).toBe(true);
      // In simulation, preview data should be used as success result
      expect(result.step_results[0].status).toBe('success');
    });
  });

  describe('error recovery', () => {
    it('stops execution on failure with on_failure=stop (default)', async () => {
      const skillData = {
        skill_id: 'seq-failing',
        is_enabled: true,
        compiled_frontmatter: {
          sequence_steps: [
            { order: 1, action: 'failing_action' },
            { order: 2, action: 'second_action' },
          ],
        },
        platform_skills: { category: 'agent-sequence', is_active: true },
      };

      const mockSupabase = createMockSupabase({ skillData });
      const mockActionExecute = executeAction as Mock;

      mockActionExecute.mockResolvedValue({
        success: false,
        error: 'Action failed',
      });

      const params: SequenceExecuteParams = {
        organizationId: mockOrgId,
        userId: mockUserId,
        sequenceKey: 'seq-failing',
        isSimulation: false,
      };

      const resultPromise = executeSequence(mockSupabase as any, params);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.step_results).toHaveLength(1); // Stopped after first failure
      expect(mockActionExecute).toHaveBeenCalledTimes(1);
    });

    it('continues execution on failure with on_failure=continue', async () => {
      const skillData = {
        skill_id: 'seq-continue',
        is_enabled: true,
        compiled_frontmatter: {
          sequence_steps: [
            { order: 1, action: 'failing_action', on_failure: 'continue' },
            { order: 2, action: 'second_action' },
          ],
        },
        platform_skills: { category: 'agent-sequence', is_active: true },
      };

      const mockSupabase = createMockSupabase({ skillData });
      const mockActionExecute = executeAction as Mock;

      mockActionExecute
        .mockResolvedValueOnce({
          success: false,
          error: 'First action failed',
        })
        .mockResolvedValueOnce({
          success: true,
          data: { result: 'second succeeded' },
        });

      const params: SequenceExecuteParams = {
        organizationId: mockOrgId,
        userId: mockUserId,
        sequenceKey: 'seq-continue',
        isSimulation: false,
      };

      const resultPromise = executeSequence(mockSupabase as any, params);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.status).toBe('completed');
      expect(result.step_results).toHaveLength(2);
      expect(result.step_results[0].status).toBe('failed');
      expect(result.step_results[1].status).toBe('success');
    });

    it('uses fallback skill on failure with on_failure=fallback', async () => {
      const skillData = {
        skill_id: 'seq-fallback',
        is_enabled: true,
        compiled_frontmatter: {
          sequence_steps: [
            {
              order: 1,
              action: 'failing_action',
              on_failure: 'fallback',
              fallback_skill_key: 'fallback-skill',
            },
          ],
        },
        platform_skills: { category: 'agent-sequence', is_active: true },
      };

      const mockSupabase = createMockSupabase({ skillData });
      const mockActionExecute = executeAction as Mock;
      const mockSkillExecute = executeAgentSkillWithContract as Mock;

      mockActionExecute.mockResolvedValue({
        success: false,
        error: 'Action failed',
      });

      mockSkillExecute.mockResolvedValue({
        status: 'success',
        data: { fallback_result: 'recovered' },
        error: null,
        summary: 'Fallback succeeded',
        references: [],
        meta: {},
      });

      const params: SequenceExecuteParams = {
        organizationId: mockOrgId,
        userId: mockUserId,
        sequenceKey: 'seq-fallback',
        isSimulation: false,
      };

      const resultPromise = executeSequence(mockSupabase as any, params);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.status).toBe('completed');
      expect(mockSkillExecute).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          skillKey: 'fallback-skill',
        })
      );
    });
  });

  describe('retry mechanism (REL-001)', () => {
    it('retries on transient network errors', async () => {
      const skillData = {
        skill_id: 'seq-retry',
        is_enabled: true,
        compiled_frontmatter: {
          sequence_steps: [
            { order: 1, action: 'network_action', max_retries: 3 },
          ],
        },
        platform_skills: { category: 'agent-sequence', is_active: true },
      };

      const mockSupabase = createMockSupabase({ skillData });
      const mockActionExecute = executeAction as Mock;

      // Fail twice with network error, then succeed
      mockActionExecute
        .mockResolvedValueOnce({
          success: false,
          error: 'Network timeout',
        })
        .mockResolvedValueOnce({
          success: false,
          error: 'fetch failed',
        })
        .mockResolvedValueOnce({
          success: true,
          data: { result: 'success after retries' },
        });

      const params: SequenceExecuteParams = {
        organizationId: mockOrgId,
        userId: mockUserId,
        sequenceKey: 'seq-retry',
        isSimulation: false,
      };

      const resultPromise = executeSequence(mockSupabase as any, params);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.step_results[0].retry_count).toBe(2);
      expect(result.step_results[0].retry_attempts).toHaveLength(2);
      expect(mockActionExecute).toHaveBeenCalledTimes(3);
    });

    it('uses exponential backoff for retries', async () => {
      const skillData = {
        skill_id: 'seq-backoff',
        is_enabled: true,
        compiled_frontmatter: {
          sequence_steps: [
            { order: 1, action: 'failing_action', max_retries: 3 },
          ],
        },
        platform_skills: { category: 'agent-sequence', is_active: true },
      };

      const mockSupabase = createMockSupabase({ skillData });
      const mockActionExecute = executeAction as Mock;

      mockActionExecute.mockResolvedValue({
        success: false,
        error: 'Network timeout',
      });

      const params: SequenceExecuteParams = {
        organizationId: mockOrgId,
        userId: mockUserId,
        sequenceKey: 'seq-backoff',
        isSimulation: false,
      };

      const resultPromise = executeSequence(mockSupabase as any, params);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      // Should have attempted max_retries + 1 times (initial + retries)
      expect(mockActionExecute).toHaveBeenCalledTimes(4);

      // Check retry delays follow exponential pattern: 100ms, 200ms, 400ms
      const retryAttempts = result.step_results[0].retry_attempts;
      expect(retryAttempts[0].delay_ms).toBe(100);
      expect(retryAttempts[1].delay_ms).toBe(200);
      expect(retryAttempts[2].delay_ms).toBe(400);
    });

    it('does not retry on non-transient errors', async () => {
      const skillData = {
        skill_id: 'seq-no-retry',
        is_enabled: true,
        compiled_frontmatter: {
          sequence_steps: [
            { order: 1, action: 'failing_action', max_retries: 3 },
          ],
        },
        platform_skills: { category: 'agent-sequence', is_active: true },
      };

      const mockSupabase = createMockSupabase({ skillData });
      const mockActionExecute = executeAction as Mock;

      mockActionExecute.mockResolvedValue({
        success: false,
        error: 'Invalid input: missing required field',
      });

      const params: SequenceExecuteParams = {
        organizationId: mockOrgId,
        userId: mockUserId,
        sequenceKey: 'seq-no-retry',
        isSimulation: false,
      };

      const resultPromise = executeSequence(mockSupabase as any, params);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.step_results[0].retry_count).toBe(0);
      expect(mockActionExecute).toHaveBeenCalledTimes(1); // No retries
    });

    it('records retry attempts in step results', async () => {
      const skillData = {
        skill_id: 'seq-retry-record',
        is_enabled: true,
        compiled_frontmatter: {
          sequence_steps: [
            { order: 1, action: 'flaky_action', max_retries: 2 },
          ],
        },
        platform_skills: { category: 'agent-sequence', is_active: true },
      };

      const mockSupabase = createMockSupabase({ skillData });
      const mockActionExecute = executeAction as Mock;

      mockActionExecute
        .mockResolvedValueOnce({ success: false, error: 'ECONNRESET' })
        .mockResolvedValueOnce({ success: true, data: {} });

      const params: SequenceExecuteParams = {
        organizationId: mockOrgId,
        userId: mockUserId,
        sequenceKey: 'seq-retry-record',
        isSimulation: false,
      };

      const resultPromise = executeSequence(mockSupabase as any, params);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.step_results[0].retry_count).toBe(1);
      expect(result.step_results[0].retry_attempts).toEqual([
        { attempt: 1, error: 'ECONNRESET', delay_ms: 100 },
      ]);
    });
  });

  describe('timeout handling (REL-003)', () => {
    it('times out steps that exceed timeout_ms', async () => {
      const skillData = {
        skill_id: 'seq-timeout',
        is_enabled: true,
        compiled_frontmatter: {
          sequence_steps: [
            { order: 1, action: 'slow_action', timeout_ms: 1000 },
          ],
        },
        platform_skills: { category: 'agent-sequence', is_active: true },
      };

      const mockSupabase = createMockSupabase({ skillData });
      const mockActionExecute = executeAction as Mock;

      // Simulate a slow action that takes longer than timeout
      mockActionExecute.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 5000))
      );

      const params: SequenceExecuteParams = {
        organizationId: mockOrgId,
        userId: mockUserId,
        sequenceKey: 'seq-timeout',
        isSimulation: false,
      };

      const resultPromise = executeSequence(mockSupabase as any, params);

      // Advance past the timeout
      await vi.advanceTimersByTimeAsync(2000);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.step_results[0].timed_out).toBe(true);
      expect(result.step_results[0].timeout_ms).toBe(1000);
    });

    it('uses default timeout when not specified', async () => {
      const skillData = {
        skill_id: 'seq-default-timeout',
        is_enabled: true,
        compiled_frontmatter: {
          sequence_steps: [
            { order: 1, action: 'normal_action' }, // No timeout_ms specified
          ],
        },
        platform_skills: { category: 'agent-sequence', is_active: true },
      };

      const mockSupabase = createMockSupabase({ skillData });
      const mockActionExecute = executeAction as Mock;

      mockActionExecute.mockResolvedValue({
        success: true,
        data: { result: 'success' },
      });

      const params: SequenceExecuteParams = {
        organizationId: mockOrgId,
        userId: mockUserId,
        sequenceKey: 'seq-default-timeout',
        isSimulation: false,
      };

      const resultPromise = executeSequence(mockSupabase as any, params);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      // Default timeout is 30000ms
      expect(result.step_results[0].timeout_ms).toBe(30000);
      expect(result.step_results[0].timed_out).toBe(false);
    });

    it('records timeout info in step results', async () => {
      const skillData = {
        skill_id: 'seq-timeout-info',
        is_enabled: true,
        compiled_frontmatter: {
          sequence_steps: [
            { order: 1, action: 'slow_action', timeout_ms: 500 },
          ],
        },
        platform_skills: { category: 'agent-sequence', is_active: true },
      };

      const mockSupabase = createMockSupabase({ skillData });
      const mockActionExecute = executeAction as Mock;

      mockActionExecute.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 2000))
      );

      const params: SequenceExecuteParams = {
        organizationId: mockOrgId,
        userId: mockUserId,
        sequenceKey: 'seq-timeout-info',
        isSimulation: false,
      };

      const resultPromise = executeSequence(mockSupabase as any, params);
      await vi.advanceTimersByTimeAsync(1000);
      const result = await resultPromise;

      expect(result.step_results[0]).toMatchObject({
        status: 'failed',
        timed_out: true,
        timeout_ms: 500,
      });
      expect(result.step_results[0].error).toContain('timed out');
    });
  });

  describe('authorization and validation', () => {
    it('throws error if user is not organization member', async () => {
      const mockSupabase = createMockSupabase({ membershipData: null });

      const params: SequenceExecuteParams = {
        organizationId: mockOrgId,
        userId: mockUserId,
        sequenceKey: 'seq-test',
        isSimulation: false,
      };

      await expect(executeSequence(mockSupabase as any, params)).rejects.toThrow(
        'Access denied to this organization'
      );
    });

    it('throws error if sequence is not found', async () => {
      const mockSupabase = createMockSupabase({ skillData: null });

      const params: SequenceExecuteParams = {
        organizationId: mockOrgId,
        userId: mockUserId,
        sequenceKey: 'seq-nonexistent',
        isSimulation: false,
      };

      await expect(executeSequence(mockSupabase as any, params)).rejects.toThrow(
        'Sequence not found or not enabled'
      );
    });

    it('throws error if sequence has no steps', async () => {
      const skillData = {
        skill_id: 'seq-empty',
        is_enabled: true,
        compiled_frontmatter: {
          sequence_steps: [],
        },
        platform_skills: { category: 'agent-sequence', is_active: true },
      };

      const mockSupabase = createMockSupabase({ skillData });

      const params: SequenceExecuteParams = {
        organizationId: mockOrgId,
        userId: mockUserId,
        sequenceKey: 'seq-empty',
        isSimulation: false,
      };

      await expect(executeSequence(mockSupabase as any, params)).rejects.toThrow(
        'Sequence has no steps configured'
      );
    });

    it('throws error for required parameters', async () => {
      const mockSupabase = createMockSupabase();

      await expect(
        executeSequence(mockSupabase as any, {
          organizationId: '',
          userId: mockUserId,
          sequenceKey: 'seq-test',
        })
      ).rejects.toThrow('organizationId is required');

      await expect(
        executeSequence(mockSupabase as any, {
          organizationId: mockOrgId,
          userId: '',
          sequenceKey: 'seq-test',
        })
      ).rejects.toThrow('userId is required');

      await expect(
        executeSequence(mockSupabase as any, {
          organizationId: mockOrgId,
          userId: mockUserId,
          sequenceKey: '',
        })
      ).rejects.toThrow('sequenceKey is required');
    });
  });

  describe('input mapping and expression resolution', () => {
    it('resolves simple variable paths', async () => {
      const skillData = {
        skill_id: 'seq-mapping',
        is_enabled: true,
        compiled_frontmatter: {
          sequence_steps: [
            { order: 1, action: 'first', output_key: 'first_result' },
            {
              order: 2,
              action: 'second',
              input_mapping: {
                data: '${outputs.first_result}',
              },
            },
          ],
        },
        platform_skills: { category: 'agent-sequence', is_active: true },
      };

      const mockSupabase = createMockSupabase({ skillData });
      const mockActionExecute = executeAction as Mock;

      mockActionExecute
        .mockResolvedValueOnce({
          success: true,
          data: { value: 'first_output' },
        })
        .mockResolvedValueOnce({
          success: true,
          data: { processed: true },
        });

      const params: SequenceExecuteParams = {
        organizationId: mockOrgId,
        userId: mockUserId,
        sequenceKey: 'seq-mapping',
        isSimulation: false,
      };

      const resultPromise = executeSequence(mockSupabase as any, params);
      await vi.runAllTimersAsync();
      await resultPromise;

      // Verify the second action received the output from the first
      const secondCall = mockActionExecute.mock.calls[1];
      expect(secondCall[3]).toMatchObject({
        data: { value: 'first_output' },
      });
    });

    it('resolves nested array paths', async () => {
      const skillData = {
        skill_id: 'seq-array-mapping',
        is_enabled: true,
        compiled_frontmatter: {
          sequence_steps: [
            { order: 1, action: 'get_list', output_key: 'list_result' },
            {
              order: 2,
              action: 'process_first',
              input_mapping: {
                first_item: '${outputs.list_result.items[0].name}',
              },
            },
          ],
        },
        platform_skills: { category: 'agent-sequence', is_active: true },
      };

      const mockSupabase = createMockSupabase({ skillData });
      const mockActionExecute = executeAction as Mock;

      mockActionExecute
        .mockResolvedValueOnce({
          success: true,
          data: {
            items: [
              { name: 'First Item' },
              { name: 'Second Item' },
            ],
          },
        })
        .mockResolvedValueOnce({
          success: true,
          data: {},
        });

      const params: SequenceExecuteParams = {
        organizationId: mockOrgId,
        userId: mockUserId,
        sequenceKey: 'seq-array-mapping',
        isSimulation: false,
      };

      const resultPromise = executeSequence(mockSupabase as any, params);
      await vi.runAllTimersAsync();
      await resultPromise;

      const secondCall = mockActionExecute.mock.calls[1];
      expect(secondCall[3]).toMatchObject({
        first_item: 'First Item',
      });
    });

    it('handles embedded string interpolation', async () => {
      const skillData = {
        skill_id: 'seq-interpolation',
        is_enabled: true,
        compiled_frontmatter: {
          sequence_steps: [
            { order: 1, action: 'get_name', output_key: 'name_result' },
            {
              order: 2,
              action: 'send_greeting',
              input_mapping: {
                message: 'Hello ${outputs.name_result.name}!',
              },
            },
          ],
        },
        platform_skills: { category: 'agent-sequence', is_active: true },
      };

      const mockSupabase = createMockSupabase({ skillData });
      const mockActionExecute = executeAction as Mock;

      mockActionExecute
        .mockResolvedValueOnce({
          success: true,
          data: { name: 'Alice' },
        })
        .mockResolvedValueOnce({
          success: true,
          data: {},
        });

      const params: SequenceExecuteParams = {
        organizationId: mockOrgId,
        userId: mockUserId,
        sequenceKey: 'seq-interpolation',
        isSimulation: false,
      };

      const resultPromise = executeSequence(mockSupabase as any, params);
      await vi.runAllTimersAsync();
      await resultPromise;

      const secondCall = mockActionExecute.mock.calls[1];
      expect(secondCall[3]).toMatchObject({
        message: 'Hello Alice!',
      });
    });
  });
});
