/**
 * AutonomyDashboardPage — Integration test (AUT-008)
 *
 * Tests:
 * - Dashboard renders with per-action-type status cards
 * - Confidence score updates reflected in UI (tier badge)
 * - Promotion trigger renders promotion banner
 * - UI correctly shows pending promotion state on card
 * - Empty state renders when no data
 * - History timeline renders when audit log is present
 * - "What can 60 do" card shows active capabilities
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_CONFIDENCE_ROWS = [
  {
    action_type: 'crm.deal_field_update',
    current_tier: 'auto',
    score: 95,
    approval_rate: 97,
    clean_approval_rate: 97,
    total_signals: 45,
    total_approved: 43,
    total_rejected: 2,
    days_active: 30,
    promotion_eligible: false,
    cooldown_until: null,
    never_promote: false,
    extra_required_signals: 0,
    first_signal_at: '2026-01-01T00:00:00Z',
    last_signal_at: '2026-02-28T00:00:00Z',
  },
  {
    action_type: 'email.send',
    current_tier: 'approve',
    score: 78,
    approval_rate: 82,
    clean_approval_rate: 82,
    total_signals: 20,
    total_approved: 16,
    total_rejected: 4,
    days_active: 20,
    promotion_eligible: false,
    cooldown_until: null,
    never_promote: false,
    extra_required_signals: 5,
    first_signal_at: '2026-01-15T00:00:00Z',
    last_signal_at: '2026-02-20T00:00:00Z',
  },
];

const MOCK_PROMOTIONS = [
  {
    id: 'promo-1',
    action_type: 'task.create',
    current_policy: 'approve',
    proposed_policy: 'auto',
    evidence: { approvalCount: 30, rejectionCount: 1, approvalRate: 97, windowDays: 30 },
    status: 'pending',
    created_at: '2026-02-28T00:00:00Z',
  },
];

const MOCK_AUDIT_LOG = [
  {
    id: 'log-1',
    action_type: 'crm.deal_field_update',
    change_type: 'promotion',
    previous_policy: 'approve',
    new_policy: 'auto',
    trigger_reason: 'approval_rate_threshold_met',
    evidence: { approvalRate: 97, windowDays: 30 },
    initiated_by: 'system',
    created_at: '2026-01-20T00:00:00Z',
  },
];

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockFrom = vi.fn((table: string) => {
  if (table === 'autopilot_confidence') {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: MOCK_CONFIDENCE_ROWS, error: null }),
        }),
      }),
    };
  }
  if (table === 'autonomy_promotion_queue') {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: MOCK_PROMOTIONS, error: null }),
          }),
        }),
      }),
    };
  }
  if (table === 'autonomy_audit_log') {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: MOCK_AUDIT_LOG, error: null }),
          }),
        }),
      }),
    };
  }
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
  };
});

vi.mock('@/lib/supabase/clientV2', () => ({
  supabase: {
    from: mockFrom,
  },
}));

vi.mock('@/lib/hooks/useAuthUser', () => ({
  useAuthUser: () => ({ data: { id: 'user-123', email: 'test@example.com' } }),
}));

vi.mock('@/lib/stores/orgStore', () => ({
  useOrgStore: (fn: (s: { activeOrgId: string }) => string) =>
    fn({ activeOrgId: 'org-123' }),
  useActiveOrgId: () => 'org-123',
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

import AutonomyDashboardPage from '../AutonomyDashboardPage';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AutonomyDashboardPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AutonomyDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders page header', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Autonomy Dashboard')).toBeInTheDocument();
    });
  });

  test('renders action type status cards from confidence data', async () => {
    renderPage();
    await waitFor(() => {
      // crm.deal_field_update maps to "Deal Field Updates"
      expect(screen.getByText('Deal Field Updates')).toBeInTheDocument();
      // email.send maps to "Email Sending"
      expect(screen.getByText('Email Sending')).toBeInTheDocument();
    });
  });

  test('shows Auto tier badge for auto-tier action', async () => {
    renderPage();
    await waitFor(() => {
      // The auto tier badge should be present
      const autoBadges = screen.getAllByText('Auto');
      expect(autoBadges.length).toBeGreaterThan(0);
    });
  });

  test('shows Approval Required badge for approve-tier action', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Approval Required')).toBeInTheDocument();
    });
  });

  test('shows approval rates from confidence data', async () => {
    renderPage();
    await waitFor(() => {
      // 97% approval rate for crm.deal_field_update
      expect(screen.getByText('97%')).toBeInTheDocument();
    });
  });

  test('renders promotion proposal banner when promotions exist', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Promotion proposal/i)).toBeInTheDocument();
    });
  });

  test('promotion banner shows approve/snooze buttons', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Approve')).toBeInTheDocument();
      expect(screen.getByText('Snooze')).toBeInTheDocument();
    });
  });

  test('shows history timeline when audit log is present', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Autonomy History')).toBeInTheDocument();
    });
  });

  test('renders What can 60 do card with active capabilities', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/What can 60 do/i)).toBeInTheDocument();
    });
  });

  test('renders "signals to qualify" hint for non-eligible approve-tier action', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/more signals needed/i)).toBeInTheDocument();
    });
  });
});

describe('AutonomyDashboardPage — empty state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation((table: string) => {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      };
    });
  });

  test('shows empty state when no confidence data', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/No autonomy data yet/i)).toBeInTheDocument();
    });
  });
});
