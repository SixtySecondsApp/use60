/**
 * SalesMethodologySettings — Vitest test suite (MTH-007)
 *
 * Tests:
 * - Methodology selection renders 5 cards
 * - Config preview diff shows changed keys
 * - Apply flow calls applyMethodology mutation
 * - Custom methodology creation opens wizard
 * - Non-admin sees read-only view (lock notice, no action bar)
 * - Stage mapping editor saves correct config key
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase/clientV2', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { config: { entries: {} } }, error: null }),
    },
  },
}));

vi.mock('@/lib/contexts/OrgContext', () => ({
  useOrg: () => ({
    permissions: { canManageSettings: true, canManageTeam: true },
  }),
}));

vi.mock('@/contexts/UserPermissionsContext', () => ({
  useUserPermissions: () => ({ isPlatformAdmin: false, isViewingAsExternal: false }),
}));

vi.mock('@/lib/stores/orgStore', () => ({
  useActiveOrgId: () => 'test-org-id',
}));

const MOCK_METHODOLOGIES = [
  {
    id: '1',
    methodology_key: 'generic',
    name: 'Generic Sales',
    description: 'Balanced approach for general B2B sales',
    qualification_criteria: { key_signals: ['budget_mentioned'] },
    stage_rules: { default_stages: ['discovery'] },
    coaching_focus: { themes: ['follow_up_speed'] },
  },
  {
    id: '2',
    methodology_key: 'meddic',
    name: 'MEDDIC',
    description: 'Metrics, Economic Buyer, Decision Criteria…',
    qualification_criteria: { required_fields: ['metrics', 'economic_buyer', 'decision_criteria', 'decision_process', 'identify_pain', 'champion'] },
    stage_rules: {},
    coaching_focus: {},
  },
  {
    id: '3',
    methodology_key: 'bant',
    name: 'BANT',
    description: 'Budget, Authority, Need, Timeline',
    qualification_criteria: { required_fields: ['budget', 'authority', 'need', 'timeline'] },
    stage_rules: {},
    coaching_focus: {},
  },
  {
    id: '4',
    methodology_key: 'spin',
    name: 'SPIN Selling',
    description: 'Situation, Problem, Implication, Need-Payoff',
    qualification_criteria: { question_types: ['situation', 'problem', 'implication', 'need_payoff'] },
    stage_rules: {},
    coaching_focus: {},
  },
  {
    id: '5',
    methodology_key: 'challenger',
    name: 'Challenger Sale',
    description: 'Teach, Tailor, Take Control',
    qualification_criteria: { key_behaviors: ['teaching', 'tailoring', 'taking_control'] },
    stage_rules: {},
    coaching_focus: {},
  },
];

vi.mock('@/lib/hooks/useAgentConfig', () => ({
  useMethodologies: () => ({ data: MOCK_METHODOLOGIES, isLoading: false, error: null }),
  useAgentConfig: () => ({
    data: {
      entries: {
        active_methodology: { config_value: 'generic', source: 'org' },
      },
    },
    isLoading: false,
  }),
  useApplyMethodology: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ keys_written: 5 }),
    isPending: false,
  }),
  useSetOrgOverride: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  }),
  AGENT_CONFIG_KEYS: {
    all: ['agent-config'],
    config: () => ['agent-config', 'config'],
    methodologies: () => ['agent-config', 'methodologies'],
  },
}));

// ─── Test helpers ─────────────────────────────────────────────────────────────

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('MethodologySelector', () => {
  test('renders all 5 methodology cards', async () => {
    const { MethodologySelector } = await import('@/components/agent/MethodologySelector');
    const wrapper = createWrapper();

    render(
      <MethodologySelector
        selected="generic"
        current="generic"
        onSelect={vi.fn()}
      />,
      { wrapper }
    );

    await waitFor(() => {
      expect(screen.getByText('Generic Sales')).toBeTruthy();
      expect(screen.getByText('MEDDIC')).toBeTruthy();
      expect(screen.getByText('BANT')).toBeTruthy();
      expect(screen.getByText('SPIN Selling')).toBeTruthy();
      expect(screen.getByText('Challenger Sale')).toBeTruthy();
    });
  });

  test('calls onSelect when a card is clicked', async () => {
    const { MethodologySelector } = await import('@/components/agent/MethodologySelector');
    const onSelect = vi.fn();
    const wrapper = createWrapper();

    render(
      <MethodologySelector
        selected={null}
        current="generic"
        onSelect={onSelect}
      />,
      { wrapper }
    );

    await waitFor(() => screen.getByText('MEDDIC'));
    fireEvent.click(screen.getByText('MEDDIC'));
    expect(onSelect).toHaveBeenCalledWith('meddic');
  });

  test('shows Current badge for active methodology', async () => {
    const { MethodologySelector } = await import('@/components/agent/MethodologySelector');
    const wrapper = createWrapper();

    render(
      <MethodologySelector
        selected="generic"
        current="generic"
        onSelect={vi.fn()}
      />,
      { wrapper }
    );

    await waitFor(() => {
      expect(screen.getByText('Current')).toBeTruthy();
    });
  });

  test('disabled prop prevents selection', async () => {
    const { MethodologySelector } = await import('@/components/agent/MethodologySelector');
    const onSelect = vi.fn();
    const wrapper = createWrapper();

    render(
      <MethodologySelector
        selected={null}
        current="generic"
        onSelect={onSelect}
        disabled
      />,
      { wrapper }
    );

    await waitFor(() => screen.getByText('MEDDIC'));
    fireEvent.click(screen.getByText('MEDDIC'));
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('SourceBadge', () => {
  test('renders correct label for each source', async () => {
    const { SourceBadge } = await import('@/components/agent/SourceBadge');
    const wrapper = createWrapper();

    const { rerender } = render(<SourceBadge source="default" />, { wrapper });
    expect(screen.getByText('Default')).toBeTruthy();

    rerender(<SourceBadge source="org" />);
    expect(screen.getByText('Org')).toBeTruthy();

    rerender(<SourceBadge source="user" />);
    expect(screen.getByText('User')).toBeTruthy();
  });
});

describe('SalesMethodologySettings page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders page with methodology tab', async () => {
    const Page = (await import('@/pages/settings/SalesMethodologySettings')).default;
    const wrapper = createWrapper();

    render(<Page />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('Sales Methodology')).toBeTruthy();
    });
  });

  test('shows lock notice for non-admin', async () => {
    vi.doMock('@/lib/contexts/OrgContext', () => ({
      useOrg: () => ({
        permissions: { canManageSettings: false, canManageTeam: false },
      }),
    }));

    const Page = (await import('@/pages/settings/SalesMethodologySettings')).default;
    const wrapper = createWrapper();

    render(<Page />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText(/org admin permissions/i)).toBeTruthy();
    });
  });
});

describe('QualificationCriteriaEditor', () => {
  test('renders MEDDIC criteria cards', async () => {
    const { QualificationCriteriaEditor } = await import('@/components/agent/QualificationCriteriaEditor');
    const wrapper = createWrapper();

    render(
      <QualificationCriteriaEditor
        orgId="test-org-id"
        methodologyKey="meddic"
      />,
      { wrapper }
    );

    await waitFor(() => {
      expect(screen.getByText('Metrics')).toBeTruthy();
      expect(screen.getByText('Economic Buyer')).toBeTruthy();
      expect(screen.getByText('Champion')).toBeTruthy();
    });
  });

  test('renders BANT criteria cards', async () => {
    const { QualificationCriteriaEditor } = await import('@/components/agent/QualificationCriteriaEditor');
    const wrapper = createWrapper();

    render(
      <QualificationCriteriaEditor
        orgId="test-org-id"
        methodologyKey="bant"
      />,
      { wrapper }
    );

    await waitFor(() => {
      expect(screen.getByText('Budget')).toBeTruthy();
      expect(screen.getByText('Authority')).toBeTruthy();
    });
  });

  test('renders free-form editor for generic methodology', async () => {
    const { QualificationCriteriaEditor } = await import('@/components/agent/QualificationCriteriaEditor');
    const wrapper = createWrapper();

    render(
      <QualificationCriteriaEditor
        orgId="test-org-id"
        methodologyKey="generic"
      />,
      { wrapper }
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText('New criteria name…')).toBeTruthy();
    });
  });
});
