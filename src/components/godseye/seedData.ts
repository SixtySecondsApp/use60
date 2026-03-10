/**
 * God's Eye Seed Data Generator
 *
 * Generates realistic mock data for testing the God's Eye visualization
 * when no real ai_cost_events data exists. Toggle on/off from the UI.
 */

import type {
  ActiveUser,
  RecentEvent,
  LLMEndpoint,
  AnomalyRule,
  UsageTotals,
} from '@/lib/hooks/useGodsEyeData';

// ─── Realistic names and emails ─────────────────────────────────────────

const SEED_USERS = [
  { name: 'Andrew Bryce', email: 'andrew@sixtyseconds.com', org: 'Sixty Seconds' },
  { name: 'Sarah Mitchell', email: 'sarah@acmecorp.com', org: 'Acme Corp' },
  { name: 'James Chen', email: 'james@techstart.io', org: 'TechStart' },
  { name: 'Emma Wilson', email: 'emma@growthco.com', org: 'GrowthCo' },
  { name: 'Marcus Johnson', email: 'marcus@velocityai.com', org: 'Velocity AI' },
  { name: 'Lisa Thompson', email: 'lisa@brightpath.co', org: 'BrightPath' },
  { name: 'David Park', email: 'david@novatech.com', org: 'NovaTech' },
  { name: 'Rachel Adams', email: 'rachel@salesforce.com', org: 'Salesforce' },
  { name: 'Tom Hartley', email: 'tom@streamline.io', org: 'Streamline' },
  { name: 'Amy Foster', email: 'amy@hubspot.com', org: 'HubSpot' },
  { name: 'Chris Lee', email: 'chris@datacore.ai', org: 'DataCore AI' },
  { name: 'Nina Patel', email: 'nina@cloudnine.co', org: 'CloudNine' },
  { name: 'Jake Morrison', email: 'jake@pipeline.dev', org: 'Pipeline Dev' },
  { name: 'Sophie Turner', email: 'sophie@revenuelab.com', org: 'RevenueLab' },
  { name: 'Alex Rivera', email: 'alex@closedeal.io', org: 'CloseDeal' },
  { name: 'Kate O\'Brien', email: 'kate@signalstack.com', org: 'SignalStack' },
  { name: 'Ryan Walsh', email: 'ryan@momentum.ai', org: 'Momentum AI' },
  { name: 'Mia Cooper', email: 'mia@outreach.io', org: 'Outreach' },
  { name: 'Ben Taylor', email: 'ben@leadgen.co', org: 'LeadGen' },
  { name: 'Olivia Reed', email: 'olivia@engagehq.com', org: 'EngageHQ' },
];

const SEED_MODELS: Array<{
  provider: string;
  model_id: string;
  display_name: string;
  input_cost: number;
  output_cost: number;
}> = [
  { provider: 'anthropic', model_id: 'claude-sonnet-4-6', display_name: 'Claude Sonnet 4.6', input_cost: 3.0, output_cost: 15.0 },
  { provider: 'anthropic', model_id: 'claude-haiku-4-5', display_name: 'Claude Haiku 4.5', input_cost: 0.8, output_cost: 4.0 },
  { provider: 'google', model_id: 'gemini-2.5-flash', display_name: 'Gemini 2.5 Flash', input_cost: 0.15, output_cost: 0.6 },
  { provider: 'google', model_id: 'gemini-2.5-pro', display_name: 'Gemini 2.5 Pro', input_cost: 1.25, output_cost: 10.0 },
  { provider: 'openrouter', model_id: 'deepseek/deepseek-r1', display_name: 'DeepSeek R1', input_cost: 0.55, output_cost: 2.19 },
  { provider: 'openrouter', model_id: 'meta/llama-3.3-70b', display_name: 'Llama 3.3 70B', input_cost: 0.4, output_cost: 0.4 },
];

const FEATURE_KEYS = [
  'copilot_chat',
  'copilot_autonomous',
  'enrich_crm_record',
  'condense_meeting_summary',
  'extract_action_items',
  'categorize_email',
  'generate_proposal',
  'suggest_next_actions',
  'analyze_writing_style',
  'meeting_scorecard',
];

// ─── Helpers ────────────────────────────────────────────────────────────

function randomId(): string {
  return `seed-${Math.random().toString(36).slice(2, 10)}`;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function minutesAgo(mins: number): string {
  return new Date(Date.now() - mins * 60 * 1000).toISOString();
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

// ─── Generators ─────────────────────────────────────────────────────────

export function generateSeedActiveUsers(count: number = 12): ActiveUser[] {
  const users = SEED_USERS.slice(0, count);
  // First ~40% are currently active (last 5 min), rest are historical (hours/days ago)
  const activeCount = Math.ceil(count * 0.4);
  return users.map((u, i) => {
    const isActive = i < activeCount;
    return {
      user_id: `seed-user-${i}`,
      user_email: u.email,
      user_name: u.name,
      org_name: u.org,
      request_count: randomInt(1, 25),
      total_input_tokens: randomInt(5000, 200000),
      total_output_tokens: randomInt(2000, 80000),
      last_request_at: isActive
        ? minutesAgo(randomInt(0, 4))
        : hoursAgo(randomInt(1, 168)), // 1 hour to 7 days ago
      is_active: isActive,
    };
  });
}

export function generateSeedRecentEvents(
  users: ActiveUser[],
  count: number = 80
): RecentEvent[] {
  const events: RecentEvent[] = [];

  for (let i = 0; i < count; i++) {
    const user = randomChoice(users);
    const model = randomChoice(SEED_MODELS);
    const inputTokens = randomInt(100, 150000);
    const outputTokens = randomInt(50, 60000);
    const cost = (inputTokens * model.input_cost + outputTokens * model.output_cost) / 1_000_000;

    // ~10% of events are flagged
    const isFlagged = inputTokens + outputTokens > 100000;

    events.push({
      id: randomId(),
      user_id: user.user_id,
      user_email: user.user_email,
      user_name: user.user_name,
      provider: model.provider,
      model: model.model_id,
      feature: randomChoice(FEATURE_KEYS),
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost: cost,
      created_at: minutesAgo(randomInt(0, 30)),
      is_flagged: isFlagged,
      flag_reason: isFlagged ? 'High token request' : undefined,
      flag_severity: isFlagged ? (inputTokens > 120000 ? 'critical' : 'warning') : undefined,
    });
  }

  return events.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function generateSeedEndpoints(): LLMEndpoint[] {
  return SEED_MODELS.map((m, i) => ({
    id: `seed-endpoint-${i}`,
    provider: m.provider,
    model_id: m.model_id,
    display_name: m.display_name,
    input_cost_per_million: m.input_cost,
    output_cost_per_million: m.output_cost,
    is_available: true,
    active_request_count: randomInt(0, 30),
  }));
}

export function generateSeedRules(): AnomalyRule[] {
  return [
    {
      id: 'seed-rule-1',
      rule_name: 'High token request',
      rule_type: 'per_request_max',
      description: 'Flag requests exceeding 100K tokens',
      threshold_value: 100000,
      time_window_minutes: null,
      severity: 'warning',
      is_enabled: true,
    },
    {
      id: 'seed-rule-2',
      rule_name: 'Very high token request',
      rule_type: 'per_request_max',
      description: 'Flag requests exceeding 500K tokens',
      threshold_value: 500000,
      time_window_minutes: null,
      severity: 'critical',
      is_enabled: true,
    },
    {
      id: 'seed-rule-3',
      rule_name: 'Usage rate spike',
      rule_type: 'rate_spike',
      description: 'Flag 5x hourly average rate',
      threshold_value: 5,
      time_window_minutes: 60,
      severity: 'warning',
      is_enabled: true,
    },
    {
      id: 'seed-rule-4',
      rule_name: 'Budget threshold 80%',
      rule_type: 'budget_percent',
      description: 'Flag at 80% budget consumption',
      threshold_value: 80,
      time_window_minutes: null,
      severity: 'warning',
      is_enabled: true,
    },
  ];
}

export function generateSeedUsageTotals(): UsageTotals {
  return {
    all_time: { tokensIn: 508_376_071, tokensOut: 338_917_380, cost: 1_247.83 },
    last_30d: { tokensIn: 140_740_734, tokensOut: 93_827_156, cost: 342.19 },
    last_7d: { tokensIn: 40_340_740, tokensOut: 26_893_827, cost: 98.47 },
    last_24h: { tokensIn: 7_474_073, tokensOut: 4_982_716, cost: 18.23 },
  };
}

// ─── Full seed data set ─────────────────────────────────────────────────

export interface SeedDataSet {
  activeUsers: ActiveUser[];
  recentEvents: RecentEvent[];
  llmEndpoints: LLMEndpoint[];
  anomalyRules: AnomalyRule[];
  usageTotals: UsageTotals;
}

export function generateFullSeedData(): SeedDataSet {
  const activeUsers = generateSeedActiveUsers(14);
  const recentEvents = generateSeedRecentEvents(activeUsers, 200);
  const llmEndpoints = generateSeedEndpoints();
  const anomalyRules = generateSeedRules();
  const usageTotals = generateSeedUsageTotals();

  return { activeUsers, recentEvents, llmEndpoints, anomalyRules, usageTotals };
}

/**
 * Continuously refreshes seed events to simulate live traffic.
 * Returns a cleanup function.
 */
export function startSeedEventStream(
  onNewEvents: (events: RecentEvent[], users: ActiveUser[]) => void,
  intervalMs: number = 3000
): () => void {
  const users = generateSeedActiveUsers(14);

  const id = setInterval(() => {
    // Generate 2-6 new events each tick
    const newEvents = generateSeedRecentEvents(users, randomInt(2, 6));

    // Occasionally add/remove active users
    if (Math.random() > 0.8 && users.length < 20) {
      const newUser = randomChoice(SEED_USERS.filter(u => !users.find(eu => eu.user_email === u.email)));
      if (newUser) {
        users.push({
          user_id: `seed-user-${users.length}`,
          user_email: newUser.email,
          user_name: newUser.name,
          org_name: newUser.org,
          request_count: 1,
          total_input_tokens: randomInt(1000, 10000),
          total_output_tokens: randomInt(500, 5000),
          last_request_at: new Date().toISOString(),
          is_active: true,
        });
      }
    }

    onNewEvents(newEvents, [...users]);
  }, intervalMs);

  return () => clearInterval(id);
}
