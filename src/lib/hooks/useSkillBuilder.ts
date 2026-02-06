/**
 * useSkillBuilder Hook
 *
 * React Query mutations for AI-powered skill generation and testing.
 * Integrates with the api-skill-builder edge function.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

// ============================================================================
// Types
// ============================================================================

export interface GenerateSkillRequest {
  intent: string;
  exampleQueries: string[];
  capabilities: string[];
  type: 'skill' | 'sequence';
  category?: string;
}

export interface GeneratedSkill {
  skillKey: string;
  name: string;
  category: string;
  frontmatter: Record<string, unknown>;
  contentTemplate: string;
  testCases: Array<{
    query: string;
    expectedBehavior: string;
  }>;
  rationale: string;
}

export interface ClassifyIntentRequest {
  query: string;
  skillKeys?: string[];
}

export interface ClassifyIntentResponse {
  intentCategory: string;
  normalizedQuery: string;
  matchedSkillKey: string | null;
  matchConfidence: number;
  suggestedSkillName: string | null;
}

export interface TestSkillRequest {
  skillKey: string;
  frontmatter: Record<string, unknown>;
  contentTemplate: string;
  testQuery: string;
}

export interface TestSkillResponse {
  success: boolean;
  response?: string;
  error?: string;
  executionTimeMs: number;
}

export interface DeploySkillRequest {
  skillKey: string;
  name: string;
  category: string;
  frontmatter: Record<string, unknown>;
  contentTemplate: string;
  isActive?: boolean;
}

// ============================================================================
// API Functions
// ============================================================================

const getSupabaseUrl = () => {
  // Use Supabase URL from client configuration
  return import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL;
};

async function callSkillBuilderApi<T>(
  endpoint: string,
  method: 'GET' | 'POST',
  body?: unknown
): Promise<T> {
  const url = `${getSupabaseUrl()}/functions/v1/api-skill-builder/${endpoint}`;

  // Get session for auth header
  const { data: { session } } = await supabase.auth.getSession();

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token || ''}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `API error: ${response.status}`);
  }

  return response.json();
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Generate a new skill using AI
 */
export function useGenerateSkill() {
  return useMutation({
    mutationFn: async (request: GenerateSkillRequest): Promise<GeneratedSkill> => {
      return callSkillBuilderApi<GeneratedSkill>('generate', 'POST', request);
    },
    onError: (error) => {
      console.error('[useSkillBuilder] Generation error:', error);
      toast.error('Failed to generate skill', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

/**
 * Classify a query into an intent
 */
export function useClassifyIntent() {
  return useMutation({
    mutationFn: async (request: ClassifyIntentRequest): Promise<ClassifyIntentResponse> => {
      return callSkillBuilderApi<ClassifyIntentResponse>('classify', 'POST', request);
    },
    onError: (error) => {
      console.error('[useSkillBuilder] Classification error:', error);
      // Don't show toast for classification errors - it's a background operation
    },
  });
}

/**
 * Test a skill template
 */
export function useTestSkill() {
  return useMutation({
    mutationFn: async (request: TestSkillRequest): Promise<TestSkillResponse> => {
      return callSkillBuilderApi<TestSkillResponse>('test', 'POST', request);
    },
    onError: (error) => {
      console.error('[useSkillBuilder] Test error:', error);
      toast.error('Failed to test skill', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

/**
 * Deploy a skill to the platform
 */
export function useDeploySkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: DeploySkillRequest): Promise<{ id: string; skill_key: string }> => {
      const { data, error } = await supabase
        .from('platform_skills')
        .insert({
          skill_key: request.skillKey,
          category: request.category,
          frontmatter: request.frontmatter,
          content_template: request.contentTemplate,
          is_active: request.isActive ?? false, // Default to inactive for review
        })
        .select('id, skill_key')
        .single();

      if (error) {
        // Check for duplicate key
        if (error.code === '23505') {
          throw new Error(`A skill with key "${request.skillKey}" already exists`);
        }
        throw new Error(error.message);
      }

      return data;
    },
    onSuccess: (data) => {
      toast.success('Skill deployed', {
        description: `Skill "${data.skill_key}" has been created`,
      });
      // Invalidate skills cache
      queryClient.invalidateQueries({ queryKey: ['platform-skills'] });
    },
    onError: (error) => {
      console.error('[useSkillBuilder] Deploy error:', error);
      toast.error('Failed to deploy skill', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

// ============================================================================
// Combined Hook
// ============================================================================

/**
 * Combined hook for skill builder functionality
 */
export function useSkillBuilder() {
  const generateMutation = useGenerateSkill();
  const classifyMutation = useClassifyIntent();
  const testMutation = useTestSkill();
  const deployMutation = useDeploySkill();

  return {
    // Mutations
    generateSkill: generateMutation.mutateAsync,
    classifyIntent: classifyMutation.mutateAsync,
    testSkill: testMutation.mutateAsync,
    deploySkill: deployMutation.mutateAsync,

    // Loading states
    isGenerating: generateMutation.isPending,
    isClassifying: classifyMutation.isPending,
    isTesting: testMutation.isPending,
    isDeploying: deployMutation.isPending,

    // Any operation in progress
    isLoading:
      generateMutation.isPending ||
      classifyMutation.isPending ||
      testMutation.isPending ||
      deployMutation.isPending,

    // Generated skill data
    generatedSkill: generateMutation.data,

    // Test result
    testResult: testMutation.data,

    // Reset functions
    resetGeneration: generateMutation.reset,
    resetTest: testMutation.reset,
  };
}

export default useSkillBuilder;
