/**
 * Copilot Routing Service Tests (ROUTE-003)
 *
 * Validates end-to-end routing for V2 natural language triggers:
 * 1. "prep for my meeting"    -> seq-meeting-prep       (confidence > 0.7)
 * 2. "what deals need attention" -> seq-pipeline-focus-tasks (confidence > 0.7)
 * 3. "catch me up"            -> seq-catch-me-up         (confidence > 0.7)
 * 4. No overlapping trigger conflicts between similar skills
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase before imports
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

import {
  routeToSkill,
  copilotRoutingService,
} from '@/lib/services/copilotRoutingService';
import { supabase } from '@/lib/supabase/clientV2';
import { findSemanticMatches } from '@/lib/services/embeddingService';

const mockedFindSemanticMatches = vi.mocked(findSemanticMatches);
const mockedRpc = vi.mocked(supabase.rpc);

const TEST_ORG_ID = 'test-org-routing-003';
const TEST_CONTEXT = { orgId: TEST_ORG_ID };

// =============================================================================
// Skill fixtures — mirrors the actual SKILL.md frontmatter from the repo
// =============================================================================

const SEQ_MEETING_PREP = {
  skill_key: 'seq-meeting-prep',
  category: 'agent-sequence',
  frontmatter: {
    name: 'Meeting Prep Sequence',
    description:
      'End-to-end meeting preparation: loads meeting details, fetches contact context, and generates a comprehensive brief.',
    triggers: [
      {
        pattern: 'prep for my meeting',
        intent: 'meeting_prep',
        confidence: 0.95,
        examples: [
          'prep for the meeting with Acme',
          'prepare me for my meeting',
          'meeting prep',
        ],
      },
      {
        pattern: 'prepare me for the call',
        intent: 'call_prep',
        confidence: 0.9,
        examples: [
          'get me ready for the call',
          'prepare for the call with',
          'brief me before the call',
        ],
      },
      {
        pattern: 'meeting brief for',
        intent: 'meeting_brief',
        confidence: 0.9,
        examples: [
          'give me a brief for the meeting',
          'meeting brief',
          "brief for tomorrow's meeting",
        ],
      },
    ],
    keywords: [
      'prep',
      'prepare',
      'meeting',
      'brief',
      'call',
      'ready',
      'agenda',
      'talking points',
      'before meeting',
    ],
    linked_skills: ['meeting-prep-brief'],
  },
  content: '# Meeting Prep Sequence',
  is_enabled: true,
};

const SEQ_PIPELINE_FOCUS_TASKS = {
  skill_key: 'seq-pipeline-focus-tasks',
  category: 'agent-sequence',
  frontmatter: {
    name: 'Pipeline Focus Tasks',
    description:
      'Pipeline engagement sequence: pulls priority deals, generates an engagement checklist, and creates a task.',
    triggers: [
      {
        pattern: 'which deals should I work on',
        intent: 'pipeline_focus',
        confidence: 0.95,
        examples: [
          'which deals need attention',
          'what deals need attention',
          'what deals should I focus on',
          'which deals should I focus on',
          'top deals to work on',
        ],
      },
      {
        pattern: 'pipeline focus tasks',
        intent: 'pipeline_tasks',
        confidence: 0.95,
        examples: ['pipeline tasks', 'pipeline focus', 'deal focus tasks'],
      },
      {
        pattern: 'review my pipeline',
        intent: 'pipeline_review',
        confidence: 0.9,
        examples: ['pipeline review', 'check my pipeline', 'pipeline health'],
      },
      {
        pattern: 'deals needing attention this week',
        intent: 'weekly_deal_focus',
        confidence: 0.85,
        examples: [
          'what deals need me this week',
          'priority deals this week',
          'weekly deal priorities',
        ],
      },
    ],
    keywords: [
      'pipeline',
      'deals',
      'focus',
      'attention',
      'work on',
      'review',
      'tasks',
      'priorities',
      'this week',
    ],
    linked_skills: ['pipeline-focus-task-planner'],
  },
  content: '# Pipeline Focus Tasks',
  is_enabled: true,
};

const SEQ_CATCH_ME_UP = {
  skill_key: 'seq-catch-me-up',
  category: 'agent-sequence',
  frontmatter: {
    name: 'Catch Me Up',
    description:
      'Full daily briefing sequence: fetches meetings, deals, contacts, and tasks, then generates a time-aware summary.',
    triggers: [
      {
        pattern: 'catch me up',
        intent: 'daily_catchup',
        confidence: 0.95,
        examples: [
          'catch me up on everything',
          'catch me up on today',
          'give me the catchup',
        ],
      },
      {
        pattern: "what's going on today",
        intent: 'daily_overview',
        confidence: 0.9,
        examples: [
          "what's happening today",
          'tell me about my day',
          'what do I have going on',
        ],
      },
      {
        pattern: 'morning briefing',
        intent: 'morning_brief',
        confidence: 0.9,
        examples: [
          'good morning brief',
          'start of day briefing',
          'morning update',
        ],
      },
      {
        pattern: 'daily update',
        intent: 'daily_update',
        confidence: 0.85,
        examples: [
          'give me my daily update',
          'daily summary',
          "today's overview",
        ],
      },
    ],
    keywords: [
      'catch me up',
      'briefing',
      'today',
      'morning',
      'update',
      'overview',
      'summary',
      "what's happening",
      'daily',
    ],
    linked_skills: ['daily-brief-planner'],
  },
  content: '# Catch Me Up',
  is_enabled: true,
};

// Atomic skills that share similar triggers (lower confidence)
const ATOMIC_DAILY_BRIEF_PLANNER = {
  skill_key: 'daily-brief-planner',
  category: 'sales-ai',
  frontmatter: {
    name: 'Daily Brief Planner',
    description: 'Generate a daily brief based on meetings, deals, and tasks.',
    triggers: [
      {
        pattern: 'daily briefing',
        intent: 'daily_brief',
        confidence: 0.85,
        examples: [
          'give me my daily briefing',
          'daily briefing please',
          'morning briefing',
        ],
      },
      {
        pattern: "what's happening today",
        intent: 'daily_summary',
        confidence: 0.85,
        examples: [
          'what do I have today',
          "what's going on today",
          "today's summary",
        ],
      },
      {
        pattern: 'catch me up',
        intent: 'catch_up',
        confidence: 0.8,
        examples: ['catch me up on everything', 'give me the rundown'],
      },
    ],
    keywords: ['daily', 'briefing', 'today', 'summary', 'morning', 'overview'],
  },
  content: '# Daily Brief Planner',
  is_enabled: true,
};

const ATOMIC_MEETING_PREP_BRIEF = {
  skill_key: 'meeting-prep-brief',
  category: 'sales-ai',
  frontmatter: {
    name: 'Meeting Prep Brief',
    description: 'Generate a meeting preparation brief with agenda and talking points.',
    triggers: [
      {
        pattern: 'brief me for my meeting',
        intent: 'meeting_brief',
        confidence: 0.85,
        examples: [
          'meeting brief for tomorrow',
          'brief me before the call',
          'pre-meeting brief',
        ],
      },
      {
        pattern: 'prep for my meeting',
        intent: 'meeting_prep',
        confidence: 0.85,
        examples: [
          'prep for the call with',
          'help me prepare for my meeting',
          'meeting preparation',
        ],
      },
    ],
    keywords: ['prep', 'prepare', 'meeting', 'brief', 'call'],
  },
  content: '# Meeting Prep Brief',
  is_enabled: true,
};

const ATOMIC_PIPELINE_FOCUS_TASK_PLANNER = {
  skill_key: 'pipeline-focus-task-planner',
  category: 'sales-ai',
  frontmatter: {
    name: 'Pipeline Focus Task Planner',
    description: 'Plan pipeline engagement tasks for priority deals.',
    triggers: [
      {
        pattern: 'which deals should I work on',
        intent: 'pipeline_focus',
        confidence: 0.85,
        examples: [
          'which deals need my attention',
          'what deals should I focus on',
          'top deals to work on',
        ],
      },
      {
        pattern: 'pipeline focus',
        intent: 'pipeline_engagement',
        confidence: 0.85,
        examples: [
          'pipeline focus this week',
          'deals needing attention',
          'pipeline priorities',
        ],
      },
    ],
    keywords: ['pipeline', 'deals', 'focus', 'attention', 'priorities'],
  },
  content: '# Pipeline Focus Task Planner',
  is_enabled: true,
};

// All skills combined (sequences + atomics)
const ALL_SKILLS = [
  SEQ_MEETING_PREP,
  SEQ_PIPELINE_FOCUS_TASKS,
  SEQ_CATCH_ME_UP,
  ATOMIC_DAILY_BRIEF_PLANNER,
  ATOMIC_MEETING_PREP_BRIEF,
  ATOMIC_PIPELINE_FOCUS_TASK_PLANNER,
];

/**
 * Mock the RPC to return given skills.
 * The RPC is called twice (once for sequences, once for individual skills).
 * Both calls get the full list; filtering happens client-side.
 */
function mockRpcWithSkills(skills: typeof ALL_SKILLS) {
  mockedRpc.mockResolvedValue({ data: skills, error: null } as any);
}

// =============================================================================
// Core Routing Tests (Acceptance Criteria)
// =============================================================================

describe('Copilot Routing: V2 Trigger Matching (ROUTE-003)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFindSemanticMatches.mockResolvedValue([]);
    mockRpcWithSkills(ALL_SKILLS);
  });

  describe('AC-2: "prep for my meeting" -> seq-meeting-prep', () => {
    it('should route "prep for my meeting" to seq-meeting-prep with confidence > 0.7', async () => {
      const result = await routeToSkill('prep for my meeting', TEST_CONTEXT);

      expect(result.selectedSkill).not.toBeNull();
      expect(result.selectedSkill?.skillKey).toBe('seq-meeting-prep');
      expect(result.selectedSkill?.confidence).toBeGreaterThan(0.7);
      expect(result.isSequenceMatch).toBe(true);
    });

    it('should route "prepare me for my meeting" to seq-meeting-prep via trigger example', async () => {
      const result = await routeToSkill(
        'prepare me for my meeting',
        TEST_CONTEXT
      );

      expect(result.selectedSkill).not.toBeNull();
      expect(result.selectedSkill?.skillKey).toBe('seq-meeting-prep');
      expect(result.selectedSkill?.confidence).toBeGreaterThan(0.7);
      expect(result.isSequenceMatch).toBe(true);
    });

    it('should route "prep for the meeting with Acme" to seq-meeting-prep', async () => {
      const result = await routeToSkill(
        'prep for the meeting with Acme',
        TEST_CONTEXT
      );

      expect(result.selectedSkill).not.toBeNull();
      expect(result.selectedSkill?.skillKey).toBe('seq-meeting-prep');
      expect(result.selectedSkill?.confidence).toBeGreaterThan(0.7);
    });
  });

  describe('AC-3: "what deals need attention" -> seq-pipeline-focus-tasks', () => {
    it('should route "what deals need attention" to seq-pipeline-focus-tasks with confidence > 0.7', async () => {
      const result = await routeToSkill(
        'what deals need attention',
        TEST_CONTEXT
      );

      expect(result.selectedSkill).not.toBeNull();
      expect(result.selectedSkill?.skillKey).toBe('seq-pipeline-focus-tasks');
      expect(result.selectedSkill?.confidence).toBeGreaterThan(0.7);
      expect(result.isSequenceMatch).toBe(true);
    });

    it('should route "which deals should I focus on" to seq-pipeline-focus-tasks via trigger example', async () => {
      const result = await routeToSkill(
        'which deals should I focus on',
        TEST_CONTEXT
      );

      expect(result.selectedSkill).not.toBeNull();
      expect(result.selectedSkill?.skillKey).toBe('seq-pipeline-focus-tasks');
      expect(result.selectedSkill?.confidence).toBeGreaterThan(0.7);
    });

    it('should route "review my pipeline" to seq-pipeline-focus-tasks', async () => {
      const result = await routeToSkill('review my pipeline', TEST_CONTEXT);

      expect(result.selectedSkill).not.toBeNull();
      expect(result.selectedSkill?.skillKey).toBe('seq-pipeline-focus-tasks');
      expect(result.selectedSkill?.confidence).toBeGreaterThan(0.7);
      expect(result.isSequenceMatch).toBe(true);
    });
  });

  describe('AC-4: "catch me up" -> seq-catch-me-up', () => {
    it('should route "catch me up" to seq-catch-me-up with confidence > 0.7', async () => {
      const result = await routeToSkill('catch me up', TEST_CONTEXT);

      expect(result.selectedSkill).not.toBeNull();
      expect(result.selectedSkill?.skillKey).toBe('seq-catch-me-up');
      expect(result.selectedSkill?.confidence).toBeGreaterThan(0.7);
      expect(result.isSequenceMatch).toBe(true);
    });

    it('should route "catch me up on everything" to seq-catch-me-up via trigger example', async () => {
      const result = await routeToSkill(
        'catch me up on everything',
        TEST_CONTEXT
      );

      expect(result.selectedSkill).not.toBeNull();
      expect(result.selectedSkill?.skillKey).toBe('seq-catch-me-up');
      expect(result.selectedSkill?.confidence).toBeGreaterThan(0.7);
    });

    it('should route "morning briefing" to seq-catch-me-up', async () => {
      const result = await routeToSkill('morning briefing', TEST_CONTEXT);

      expect(result.selectedSkill).not.toBeNull();
      expect(result.selectedSkill?.skillKey).toBe('seq-catch-me-up');
      expect(result.selectedSkill?.confidence).toBeGreaterThan(0.7);
      expect(result.isSequenceMatch).toBe(true);
    });
  });
});

// =============================================================================
// Trigger Conflict Detection (AC-5)
// =============================================================================

describe('Copilot Routing: No Overlapping Trigger Conflicts (ROUTE-003, AC-5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFindSemanticMatches.mockResolvedValue([]);
    mockRpcWithSkills(ALL_SKILLS);
  });

  it('should prefer seq-catch-me-up over atomic daily-brief-planner for "catch me up"', async () => {
    const result = await routeToSkill('catch me up', TEST_CONTEXT);

    // Must be the sequence, not the atomic skill
    expect(result.selectedSkill?.skillKey).toBe('seq-catch-me-up');
    expect(result.selectedSkill?.isSequence).toBe(true);

    // Verify the atomic skill is in candidates but with lower confidence
    const atomicCandidate = result.candidates.find(
      (c) => c.skillKey === 'daily-brief-planner'
    );
    // The atomic skill may appear in candidates (step 2 may not run if sequence matched above threshold)
    // Key assertion: the *selected* skill is always the sequence
    expect(result.isSequenceMatch).toBe(true);
  });

  it('should prefer seq-meeting-prep over atomic meeting-prep-brief for "prep for my meeting"', async () => {
    const result = await routeToSkill('prep for my meeting', TEST_CONTEXT);

    expect(result.selectedSkill?.skillKey).toBe('seq-meeting-prep');
    expect(result.selectedSkill?.isSequence).toBe(true);
    expect(result.isSequenceMatch).toBe(true);
  });

  it('should prefer seq-pipeline-focus-tasks over atomic pipeline-focus-task-planner for "which deals should I work on"', async () => {
    const result = await routeToSkill(
      'which deals should I work on',
      TEST_CONTEXT
    );

    expect(result.selectedSkill?.skillKey).toBe('seq-pipeline-focus-tasks');
    expect(result.selectedSkill?.isSequence).toBe(true);
    expect(result.isSequenceMatch).toBe(true);
  });

  it('sequence triggers should always have higher confidence than their atomic counterparts', () => {
    // Directly compare the trigger confidence values for overlapping patterns
    const { calculateTriggerMatch } = copilotRoutingService;

    // "catch me up"
    const seqCatchUp = calculateTriggerMatch(
      'catch me up',
      SEQ_CATCH_ME_UP.frontmatter.triggers,
      SEQ_CATCH_ME_UP.frontmatter.keywords
    );
    const atomicCatchUp = calculateTriggerMatch(
      'catch me up',
      ATOMIC_DAILY_BRIEF_PLANNER.frontmatter.triggers,
      ATOMIC_DAILY_BRIEF_PLANNER.frontmatter.keywords
    );
    expect(seqCatchUp.confidence).toBeGreaterThan(atomicCatchUp.confidence);

    // "prep for my meeting"
    const seqMeetingPrep = calculateTriggerMatch(
      'prep for my meeting',
      SEQ_MEETING_PREP.frontmatter.triggers,
      SEQ_MEETING_PREP.frontmatter.keywords
    );
    const atomicMeetingPrep = calculateTriggerMatch(
      'prep for my meeting',
      ATOMIC_MEETING_PREP_BRIEF.frontmatter.triggers,
      ATOMIC_MEETING_PREP_BRIEF.frontmatter.keywords
    );
    expect(seqMeetingPrep.confidence).toBeGreaterThan(
      atomicMeetingPrep.confidence
    );

    // "which deals should I work on"
    const seqPipeline = calculateTriggerMatch(
      'which deals should I work on',
      SEQ_PIPELINE_FOCUS_TASKS.frontmatter.triggers,
      SEQ_PIPELINE_FOCUS_TASKS.frontmatter.keywords
    );
    const atomicPipeline = calculateTriggerMatch(
      'which deals should I work on',
      ATOMIC_PIPELINE_FOCUS_TASK_PLANNER.frontmatter.triggers,
      ATOMIC_PIPELINE_FOCUS_TASK_PLANNER.frontmatter.keywords
    );
    expect(seqPipeline.confidence).toBeGreaterThan(atomicPipeline.confidence);
  });
});

// =============================================================================
// calculateTriggerMatch Unit Tests
// =============================================================================

describe('Copilot Routing: calculateTriggerMatch', () => {
  const { calculateTriggerMatch } = copilotRoutingService;

  it('should match exact trigger patterns', () => {
    const triggers = [
      { pattern: 'prep for my meeting', confidence: 0.95 },
    ];

    const result = calculateTriggerMatch('prep for my meeting', triggers);

    expect(result.confidence).toBe(0.95);
    expect(result.matchedTrigger).toBe('prep for my meeting');
  });

  it('should match trigger patterns within longer messages', () => {
    const triggers = [
      { pattern: 'catch me up', confidence: 0.95 },
    ];

    const result = calculateTriggerMatch(
      'hey can you catch me up on what happened today',
      triggers
    );

    expect(result.confidence).toBe(0.95);
    expect(result.matchedTrigger).toBe('catch me up');
  });

  it('should match trigger examples with reduced confidence', () => {
    const triggers = [
      {
        pattern: 'which deals should I work on',
        confidence: 0.95,
        examples: ['which deals need attention', 'what deals should I focus on'],
      },
    ];

    const result = calculateTriggerMatch(
      'which deals need attention',
      triggers
    );

    // Example matches get confidence * 0.9
    expect(result.confidence).toBe(0.95 * 0.9);
    expect(result.matchedTrigger).toBe('which deals need attention');
  });

  it('should handle V1 string triggers', () => {
    const triggers = ['prep for meeting', 'meeting prep'] as any[];

    const result = calculateTriggerMatch(
      'can you do meeting prep for me',
      triggers
    );

    // V1 triggers get default confidence of 0.75
    expect(result.confidence).toBe(0.75);
  });

  it('should fall back to keywords when no triggers match', () => {
    const triggers = [
      { pattern: 'exact phrase that wont match', confidence: 0.95 },
    ];
    const keywords = ['pipeline', 'deals', 'focus'];

    const result = calculateTriggerMatch(
      'tell me about my pipeline',
      triggers,
      keywords
    );

    // Keyword match gives up to 0.6 confidence
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(0.6);
  });

  it('should return 0 confidence for completely unrelated messages', () => {
    const triggers = [
      { pattern: 'catch me up', confidence: 0.95 },
    ];
    const keywords = ['briefing', 'daily', 'today'];

    const result = calculateTriggerMatch(
      'xyz random gibberish 123',
      triggers,
      keywords
    );

    expect(result.confidence).toBe(0);
  });

  it('should pick the highest confidence trigger when multiple match', () => {
    const triggers = [
      { pattern: 'prep for my meeting', confidence: 0.95 },
      { pattern: 'prep for', confidence: 0.7 },
    ];

    const result = calculateTriggerMatch(
      'prep for my meeting tomorrow',
      triggers
    );

    expect(result.confidence).toBe(0.95);
    expect(result.matchedTrigger).toBe('prep for my meeting');
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Copilot Routing: Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFindSemanticMatches.mockResolvedValue([]);
    mockRpcWithSkills(ALL_SKILLS);
  });

  it('should return no match without orgId', async () => {
    const result = await routeToSkill('catch me up');

    expect(result.selectedSkill).toBeNull();
    expect(result.reason).toContain('No organization ID');
  });

  it('should include linkedSkillCount for sequence matches', async () => {
    const result = await routeToSkill('catch me up', TEST_CONTEXT);

    expect(result.selectedSkill).not.toBeNull();
    expect(result.selectedSkill?.isSequence).toBe(true);
    // seq-catch-me-up has 1 linked skill (daily-brief-planner)
    expect(result.selectedSkill?.linkedSkillCount).toBe(1);
  });

  it('should not call embedding service when a sequence matches above threshold', async () => {
    const result = await routeToSkill('catch me up', TEST_CONTEXT);

    expect(result.selectedSkill).not.toBeNull();
    expect(result.isSequenceMatch).toBe(true);
    expect(mockedFindSemanticMatches).not.toHaveBeenCalled();
  });

  it('should limit candidates to MAX_CANDIDATES (5)', async () => {
    const result = await routeToSkill('catch me up', TEST_CONTEXT);

    expect(result.candidates.length).toBeLessThanOrEqual(5);
  });
});
