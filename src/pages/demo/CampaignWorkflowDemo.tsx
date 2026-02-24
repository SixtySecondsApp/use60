/**
 * Campaign Workflow Demo
 *
 * Visual test page for the campaign pipeline improvements:
 * 1. Stepped questions (conversational one-at-a-time flow)
 * 2. Enhanced progress (progress bar, timer, sub-progress)
 * 3. Rich completion card (metric tiles, email preview)
 * 4. ICP defaults (auto-fill from active ICP)
 * 5. Recipe cards (quick-start campaign templates)
 * 6. Detection logic: isCampaignPrompt() vs isWorkflowPrompt()
 *
 * All mock data — no backend required.
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Loader2, Circle, XCircle, Send, ExternalLink, ChevronDown, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OpsTableResponse, type OpsTableResponseData } from '@/components/copilot/responses/OpsTableResponse';
import { CampaignWorkflowResponse, type CampaignWorkflowData } from '@/components/copilot/responses/CampaignWorkflowResponse';
import { CampaignRecipeCards } from '@/components/copilot/CampaignRecipeCards';
import type { QuickActionResponse } from '@/components/copilot/types';
import {
  isCampaignPrompt,
  isWorkflowPrompt,
  detectMissingInfo,
  detectCampaignMissingInfo,
  generateCampaignName,
  enrichPromptWithAnswers,
  type ClarifyingQuestion,
} from '@/lib/utils/prospectingDetector';
import type { WorkflowStep } from '@/lib/hooks/useWorkflowOrchestrator';

// ============================================================================
// Mock Data
// ============================================================================

const MOCK_OPS_TABLE_NO_ENRICHMENT: OpsTableResponseData = {
  table_id: 'demo-table-001',
  table_name: 'Bristol Marketing Agencies',
  row_count: 32,
  column_count: 6,
  source_type: 'apollo_search',
  enriched_count: 0,
  preview_columns: ['Company', 'Domain', 'Industry', 'Size', 'Location', 'Score'],
  preview_rows: [
    { Company: 'Aardvark Digital', Domain: 'aardvarkdigital.co.uk', Industry: 'Marketing', Size: '25', Location: 'Bristol, UK', Score: '87' },
    { Company: 'Mighty Giant', Domain: 'mightygiant.co.uk', Industry: 'Marketing', Size: '42', Location: 'Bristol, UK', Score: '82' },
    { Company: 'Enviral', Domain: 'enviral.co.uk', Industry: 'Marketing', Size: '18', Location: 'Bristol, UK', Score: '79' },
    { Company: 'Armadillo', Domain: 'armadillo.co.uk', Industry: 'CRM', Size: '65', Location: 'Bristol, UK', Score: '76' },
    { Company: 'Gravytrain', Domain: 'gravytrain.co.uk', Industry: 'Digital', Size: '30', Location: 'Bristol, UK', Score: '74' },
    { Company: 'Noisy Little Monkey', Domain: 'noisylittlemonkey.com', Industry: 'Marketing', Size: '15', Location: 'Bristol, UK', Score: '72' },
  ],
  query_description: 'Marketing agencies in Bristol, UK with 10-100 employees',
};

const MOCK_OPS_TABLE_WITH_ENRICHMENT: OpsTableResponseData = {
  ...MOCK_OPS_TABLE_NO_ENRICHMENT,
  table_id: 'demo-table-002',
  table_name: 'Bristol Agencies — Enriched',
  enriched_count: 28,
  preview_columns: ['Company', 'Domain', 'Contact', 'Email', 'Title', 'Score'],
  preview_rows: [
    { Company: 'Aardvark Digital', Domain: 'aardvarkdigital.co.uk', Contact: 'James Willis', Email: 'j.willis@aardvark...', Title: 'Managing Director', Score: '87' },
    { Company: 'Mighty Giant', Domain: 'mightygiant.co.uk', Contact: 'Sarah Chen', Email: 's.chen@mighty...', Title: 'CEO', Score: '82' },
    { Company: 'Enviral', Domain: 'enviral.co.uk', Contact: 'Tom Hartley', Email: 't.hartley@enviral...', Title: 'Founder', Score: '79' },
    { Company: 'Armadillo', Domain: 'armadillo.co.uk', Contact: 'Laura King', Email: 'l.king@armadillo...', Title: 'Head of Growth', Score: '76' },
    { Company: 'Gravytrain', Domain: 'gravytrain.co.uk', Contact: 'Mike Brown', Email: 'm.brown@gravy...', Title: 'Director', Score: '74' },
  ],
};

// Scenario A: User says "start a campaign" with no target — gets goal + audience + tactical
const MOCK_CAMPAIGN_BARE: CampaignWorkflowData = {
  original_prompt: 'Start a campaign',
  questions: [
    { type: 'select', question: 'What do you want to achieve from this campaign?', options: ['Book meetings', 'Generate leads', 'Promote content/offer', 'Re-engage cold leads'], key: 'campaign_goal' },
    { type: 'text', question: 'Who are you targeting? (e.g. "SaaS CTOs in London" or "marketing agencies in Bristol")', key: 'target_audience' },
    { type: 'select', question: 'What size companies are you targeting?', options: ['Small (1-50)', 'Medium (51-500)', 'Large (500+)', 'Any size'], key: 'company_size' },
    { type: 'select', question: 'How many results would you like?', options: ['10', '25', '50', '100'], key: 'result_count' },
    { type: 'select', question: 'What should we enrich?', options: ['Email only', 'Email + Phone', 'Skip enrichment'], key: 'enrichment_scope' },
    { type: 'select', question: 'Generate email sequence?', options: ['Yes (3 steps)', 'Yes (5 steps)', 'No, just push contacts'], key: 'email_steps' },
  ],
  suggested_campaign_name: 'Campaign Feb 2026',
};

// Scenario B: User says "start a campaign targeting agencies in Bristol" — skips audience, still asks goal
const MOCK_CAMPAIGN_WITH_TARGET: CampaignWorkflowData = {
  original_prompt: 'Start a campaign targeting marketing agencies in Bristol',
  questions: [
    { type: 'select', question: 'What do you want to achieve from this campaign?', options: ['Book meetings', 'Generate leads', 'Promote content/offer', 'Re-engage cold leads'], key: 'campaign_goal' },
    { type: 'select', question: 'Are you looking for companies or contacts?', options: ['Companies', 'Contacts (people)', 'Both'], key: 'search_type' },
    { type: 'select', question: 'What size companies are you targeting?', options: ['Small (1-50)', 'Medium (51-500)', 'Large (500+)', 'Any size'], key: 'company_size' },
    { type: 'select', question: 'How many results would you like?', options: ['10', '25', '50', '100'], key: 'result_count' },
    { type: 'select', question: 'What should we enrich?', options: ['Email only', 'Email + Phone', 'Skip enrichment'], key: 'enrichment_scope' },
    { type: 'select', question: 'Generate email sequence?', options: ['Yes (3 steps)', 'Yes (5 steps)', 'No, just push contacts'], key: 'email_steps' },
  ],
  suggested_campaign_name: 'Bristol Marketing Feb 2026',
};

// Simulated workflow steps for Phase 2 demo
const MOCK_STEPS: WorkflowStep[] = [
  { step: 'search', label: 'Searching Apollo...', status: 'complete', summary: '32 companies found', duration_ms: 4200 },
  { step: 'create_table', label: 'Creating ops table...', status: 'complete', summary: 'Bristol Marketing Agencies', duration_ms: 800 },
  { step: 'enrich', label: 'Enriching emails...', status: 'running', progress: '18/32 enriched' },
  { step: 'generate_emails', label: 'Generating email steps...', status: 'pending' },
  { step: 'push_instantly', label: 'Pushing to Instantly...', status: 'pending' },
];

const MOCK_STEPS_COMPLETE: WorkflowStep[] = [
  { step: 'search', label: 'Searching Apollo...', status: 'complete', summary: '32 companies found', duration_ms: 4200 },
  { step: 'create_table', label: 'Creating ops table...', status: 'complete', summary: 'Bristol Marketing Agencies', duration_ms: 800 },
  { step: 'enrich', label: 'Enriching emails...', status: 'complete', summary: '28 enriched', duration_ms: 12000 },
  { step: 'generate_emails', label: 'Generating 3-step sequence...', status: 'complete', summary: '3 emails generated', duration_ms: 8500, data: {
    email_subject: 'Quick question about your agency growth',
    email_preview: 'Hi {{first_name}},\n\nI noticed {{company}} has been doing impressive work in the Bristol area. We help agencies like yours streamline their outreach and book more qualified meetings.\n\nWould you be open to a quick 15-minute chat this week?',
  }},
  { step: 'push_instantly', label: 'Pushing to Instantly...', status: 'complete', summary: '28 pushed', duration_ms: 3200, data: {
    campaign_url: 'https://app.instantly.ai/campaigns/demo-123',
  }},
];

const MOCK_STEPS_ERROR: WorkflowStep[] = [
  { step: 'search', label: 'Searching Apollo...', status: 'complete', summary: '32 companies found' },
  { step: 'create_table', label: 'Creating ops table...', status: 'complete', summary: 'Bristol Marketing Agencies' },
  { step: 'enrich', label: 'Enriching emails...', status: 'error', error: 'Apollo rate limit exceeded. Try again in 60 seconds.' },
  { step: 'generate_emails', label: 'Generating email steps...', status: 'skipped' },
  { step: 'push_instantly', label: 'Pushing to Instantly...', status: 'skipped' },
];

// ============================================================================
// Simulated StepRow (mirrors CampaignWorkflowResponse with sub-progress)
// ============================================================================

function parseProgressPercent(progress: string): number | null {
  const match = progress.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return null;
  const t = parseInt(match[2], 10);
  return t > 0 ? Math.round((parseInt(match[1], 10) / t) * 100) : null;
}

function StepRow({ step, index }: { step: WorkflowStep; index: number }) {
  const subProgress = step.status === 'running' && step.progress
    ? parseProgressPercent(step.progress)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: index * 0.05 }}
      className="space-y-1"
    >
      <div className="flex items-start gap-2">
        {step.status === 'complete' && <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />}
        {step.status === 'running' && <Loader2 className="w-4 h-4 text-blue-400 animate-spin mt-0.5 shrink-0" />}
        {step.status === 'pending' && <Circle className="w-4 h-4 text-gray-600 mt-0.5 shrink-0" />}
        {step.status === 'error' && <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />}
        {step.status === 'skipped' && <Circle className="w-4 h-4 text-gray-600 mt-0.5 shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className={cn(
              'text-sm',
              step.status === 'complete' && 'text-gray-200',
              step.status === 'running' && 'text-blue-300',
              step.status === 'pending' && 'text-gray-500',
              step.status === 'error' && 'text-red-300',
              step.status === 'skipped' && 'text-gray-500',
            )}>
              {step.label || step.step}
            </span>
            {step.status === 'complete' && step.summary && (
              <span className="text-xs text-gray-500">{step.summary}</span>
            )}
            {step.status === 'running' && step.progress && (
              <span className="text-xs text-blue-400/70">{step.progress}</span>
            )}
          </div>
          {step.status === 'error' && step.error && (
            <p className="text-xs text-red-400/70 mt-0.5">{step.error}</p>
          )}
        </div>
        {step.status === 'complete' && step.duration_ms != null && (
          <span className="text-xs text-gray-600 shrink-0 tabular-nums">
            {(step.duration_ms / 1000).toFixed(1)}s
          </span>
        )}
      </div>
      {subProgress !== null && (
        <div className="ml-6 h-1 bg-gray-700 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-blue-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${subProgress}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        </div>
      )}
    </motion.div>
  );
}

// ============================================================================
// Demo Components
// ============================================================================

function ActionLog({ actions }: { actions: QuickActionResponse[] }) {
  if (actions.length === 0) return null;
  return (
    <div className="mt-4 bg-gray-950 border border-gray-800 rounded-lg p-3">
      <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2">Action Log</p>
      <div className="space-y-1.5 max-h-40 overflow-y-auto">
        {actions.map((action, i) => (
          <div key={i} className="flex items-center gap-2 text-xs font-mono">
            <span className="text-gray-500">{i + 1}.</span>
            <span className="text-blue-400">{action.callback}</span>
            <span className="text-gray-600">|</span>
            <span className="text-gray-400">{JSON.stringify(action.params)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetectionTester() {
  const [query, setQuery] = useState('');
  const isCampaign = query.trim() ? isCampaignPrompt(query) : false;
  const isWorkflow = query.trim() ? isWorkflowPrompt(query) : false;
  const missingInfo = query.trim() ? (isCampaign ? detectCampaignMissingInfo(query) : detectMissingInfo(query)) : [];
  const campaignName = query.trim() ? generateCampaignName(query) : '';

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 space-y-4">
      <h3 className="text-sm font-semibold text-white">Prompt Detection Tester</h3>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Type a prompt, e.g. 'Start a campaign targeting SaaS CTOs in London'"
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
      />
      {query.trim() && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className={cn('w-2.5 h-2.5 rounded-full', isCampaign ? 'bg-emerald-400' : 'bg-gray-600')} />
              <span className="text-xs text-gray-300">isCampaignPrompt()</span>
              <span className={cn('text-xs font-mono', isCampaign ? 'text-emerald-400' : 'text-gray-500')}>
                {String(isCampaign)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className={cn('w-2.5 h-2.5 rounded-full', isWorkflow ? 'bg-blue-400' : 'bg-gray-600')} />
              <span className="text-xs text-gray-300">isWorkflowPrompt()</span>
              <span className={cn('text-xs font-mono', isWorkflow ? 'text-blue-400' : 'text-gray-500')}>
                {String(isWorkflow)}
              </span>
            </div>
            {campaignName && (
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-purple-400" />
                <span className="text-xs text-gray-300">Campaign name:</span>
                <span className="text-xs font-mono text-purple-400">{campaignName}</span>
              </div>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-[11px] text-gray-500 uppercase tracking-wider">Questions ({missingInfo.length})</p>
            {missingInfo.map((q) => (
              <p key={q.key} className="text-xs text-gray-400 truncate">{q.question}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Extract metrics from step summaries (mirrors CampaignWorkflowResponse) */
function extractDemoMetrics(steps: WorkflowStep[]): Array<{ label: string; value: string }> {
  const metrics: Array<{ label: string; value: string }> = [];
  const patterns: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /(\d+)\s*(?:contacts?|companies|leads?|people|prospects?)\s*(?:found|loaded|imported)/i, label: 'Contacts' },
    { pattern: /(\d+)\s*(?:enriched?|verified)/i, label: 'Enriched' },
    { pattern: /(\d+)\s*(?:emails?|sequences?|steps?)\s*(?:generated|created|written)/i, label: 'Emails' },
    { pattern: /(\d+)\s*(?:pushed|added|uploaded)/i, label: 'Pushed' },
  ];
  const seen = new Set<string>();
  for (const step of steps) {
    if (step.status !== 'complete' || !step.summary) continue;
    for (const { pattern, label } of patterns) {
      if (seen.has(label)) continue;
      const match = step.summary.match(pattern);
      if (match) { seen.add(label); metrics.push({ label, value: match[1] }); }
    }
  }
  return metrics;
}

function PhaseSimulator() {
  const [phase, setPhase] = useState<'running' | 'complete' | 'error'>('running');
  const [elapsed, setElapsed] = useState(0);
  const [emailExpanded, setEmailExpanded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const steps = phase === 'running' ? MOCK_STEPS : phase === 'complete' ? MOCK_STEPS_COMPLETE : MOCK_STEPS_ERROR;

  // Timer for running phase
  useEffect(() => {
    if (phase === 'running') {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  // Progress calculation
  const overallProgress = steps.length > 0
    ? steps.reduce((sum, s) => {
        if (s.status === 'complete') return sum + 100;
        if (s.status === 'running') return sum + 50;
        return sum;
      }, 0) / steps.length
    : 0;

  const elapsedMin = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const elapsedSec = String(elapsed % 60).padStart(2, '0');

  // Metrics and email for complete phase
  const metrics = extractDemoMetrics(MOCK_STEPS_COMPLETE);
  const emailStep = MOCK_STEPS_COMPLETE.find((s) => s.data && (s.data as Record<string, unknown>).email_subject);
  const emailData = emailStep?.data as { email_subject?: string; email_preview?: string } | undefined;
  const instantlyStep = MOCK_STEPS_COMPLETE.find((s) => s.data && (s.data as Record<string, unknown>).campaign_url);
  const instantlyUrl = (instantlyStep?.data as { campaign_url?: string } | undefined)?.campaign_url;

  const totalDuration = MOCK_STEPS_COMPLETE.reduce((sum, s) => sum + (s.duration_ms || 0), 0);
  const durSec = Math.round(totalDuration / 1000);
  const durMin = String(Math.floor(durSec / 60)).padStart(2, '0');
  const durSecStr = String(durSec % 60).padStart(2, '0');

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-white">Phase 2/3 Simulator</h3>
        <div className="flex gap-1 ml-auto">
          {(['running', 'complete', 'error'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => { setPhase(p); setEmailExpanded(false); }}
              className={cn(
                'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                phase === p
                  ? p === 'running' ? 'bg-blue-500/20 text-blue-400' : p === 'complete' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                  : 'bg-gray-800 text-gray-500 hover:text-gray-300'
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Phase 3: Complete */}
      {phase === 'complete' ? (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/20">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="text-sm font-medium text-white flex-1">
              Campaign &ldquo;Bristol Marketing Feb 2026&rdquo; ready!
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-gray-500 tabular-nums">
              <Clock className="w-3 h-3" />
              {durMin}:{durSecStr}
            </span>
          </div>
          <div className="p-4 space-y-4">
            {/* Metric tiles */}
            {metrics.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {metrics.map((m) => (
                  <div key={m.label} className="bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-center">
                    <p className="text-lg font-semibold text-white tabular-nums">{m.value}</p>
                    <p className="text-xs text-gray-400">{m.label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Email preview */}
            {emailData && (
              <div className="border border-gray-700 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setEmailExpanded((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-300 hover:bg-gray-800/50 transition-colors"
                >
                  <span>Preview first email</span>
                  <ChevronDown className={cn('w-3.5 h-3.5 text-gray-500 transition-transform duration-200', emailExpanded && 'rotate-180')} />
                </button>
                <AnimatePresence>
                  {emailExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pb-3 space-y-1.5 border-t border-gray-700/50">
                        <p className="text-xs font-medium text-gray-200 pt-2">Subject: {emailData.email_subject}</p>
                        <p className="text-xs text-gray-400 whitespace-pre-wrap">{emailData.email_preview}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors">
                Open in Ops Table <ExternalLink className="w-3.5 h-3.5" />
              </button>
              {instantlyUrl && (
                <button type="button" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors">
                  View in Instantly <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Phase 2: Running / Error */
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/20">
              {phase === 'running' ? (
                <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
              ) : (
                <XCircle className="w-4 h-4 text-red-400" />
              )}
            </div>
            <span className="text-sm font-medium text-white flex-1">
              {phase === 'running' ? 'Running campaign pipeline...' : 'Pipeline failed'}
            </span>
            {phase === 'running' && (
              <span className="inline-flex items-center gap-1 text-xs text-gray-400 tabular-nums">
                <Clock className="w-3 h-3" />
                {elapsedMin}:{elapsedSec}
              </span>
            )}
          </div>
          <div className="p-4 space-y-3">
            {/* Overall progress bar */}
            {phase === 'running' && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>{steps.filter((s) => s.status === 'complete').length} of {steps.length} steps</span>
                  <span>{Math.round(overallProgress)}%</span>
                </div>
                <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-emerald-500 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${overallProgress}%` }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                  />
                </div>
              </div>
            )}

            {steps.map((step, i) => (
              <StepRow key={step.step} step={step} index={i} />
            ))}
            {phase === 'error' && (
              <div className="mt-3">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30 transition-colors"
                >
                  Try Again
                </button>
              </div>
            )}
            {phase === 'running' && (
              <button
                type="button"
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-700/60 text-gray-400 text-xs font-medium hover:bg-gray-700/80 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Demo Page
// ============================================================================

export default function CampaignWorkflowDemo() {
  const [actionLog, setActionLog] = useState<QuickActionResponse[]>([]);

  const handleAction = (action: QuickActionResponse) => {
    setActionLog((prev) => [...prev, action]);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-10">
        {/* Page Header */}
        <div>
          <h1 className="text-xl font-bold text-white">Campaign Workflow Demo</h1>
          <p className="text-sm text-gray-400 mt-1">
            Visual test for campaign pipeline improvements: stepped questions, progress bars, metric tiles, ICP defaults, and recipe cards
          </p>
        </div>

        {/* Section 1: Detection Tester */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">1. Prompt Detection</h2>
          <DetectionTester />
        </section>

        {/* Section 2: OpsTableResponse — No Enrichment */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            2. OpsTableResponse — No Enrichment (Create Campaign dimmed)
          </h2>
          <OpsTableResponse data={MOCK_OPS_TABLE_NO_ENRICHMENT} onActionClick={handleAction} />
        </section>

        {/* Section 3: OpsTableResponse — With Enrichment */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            3. OpsTableResponse — With Enrichment (Create Campaign active)
          </h2>
          <OpsTableResponse data={MOCK_OPS_TABLE_WITH_ENRICHMENT} onActionClick={handleAction} />
        </section>

        {/* Section 4: Recipe Cards */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            4. Campaign Recipe Cards
          </h2>
          <p className="text-xs text-gray-500">
            Quick-start templates that pre-fill the campaign prompt. Click a card to see the emitted prompt in the action log.
          </p>
          <CampaignRecipeCards onSelectRecipe={(prompt) => {
            handleAction({ id: 'recipe', label: prompt, type: 'primary', callback: 'recipe_selected', params: { prompt } });
          }} />
        </section>

        {/* Section 5a: CampaignWorkflowResponse — Bare prompt "Start a campaign" */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            5a. Stepped Questions — &ldquo;Start a campaign&rdquo;
          </h2>
          <p className="text-xs text-gray-500">
            Conversational flow: one question at a time, chip auto-advance, answered chips collapse. ICP banner appears if active ICP is set.
          </p>
          <CampaignWorkflowResponse data={MOCK_CAMPAIGN_BARE} onActionClick={handleAction} />
        </section>

        {/* Section 5b: CampaignWorkflowResponse — With target specified */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            5b. Stepped Questions — &ldquo;Start a campaign targeting agencies in Bristol&rdquo;
          </h2>
          <p className="text-xs text-gray-500">
            Target in prompt — skips audience question. All-select flow with auto-advance on chip click.
          </p>
          <CampaignWorkflowResponse data={MOCK_CAMPAIGN_WITH_TARGET} onActionClick={handleAction} />
        </section>

        {/* Section 6: Phase 2/3 Simulator */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            6. Phase 2/3 — Progress + Completion Simulator
          </h2>
          <p className="text-xs text-gray-500">
            Toggle between states. Running shows overall progress bar, timer, and sub-progress. Complete shows metric tiles, email preview, and Instantly button.
          </p>
          <PhaseSimulator />
        </section>

        {/* Action Log */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Action Click Log</h2>
          {actionLog.length === 0 ? (
            <p className="text-xs text-gray-600">Click any button above to see emitted actions here...</p>
          ) : (
            <ActionLog actions={actionLog} />
          )}
          {actionLog.length > 0 && (
            <button
              type="button"
              onClick={() => setActionLog([])}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Clear log
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
