/**
 * ProactiveTeammateDemo — Interactive showcase of the 7 Proactive Sales Teammate patterns.
 *
 * Before/After comparisons with live Slack message previews and "Send to Slack" triggers.
 */

import { useState } from 'react';
import {
  Zap,
  HeartPulse,
  Sun,
  Brain,
  Lightbulb,
  GitMerge,
  Sparkles,
  Send,
  CheckCircle2,
  Loader2,
  ArrowRight,
  Clock,
  AlertTriangle,
  ShieldCheck,
  Eye,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { SlackMessagePreview, type SlackBlock } from '@/components/demo/SlackMessagePreview';

// =============================================================================
// Types
// =============================================================================

interface PatternDemo {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  color: string;
  before: { title: string; items: string[] };
  after: { title: string; items: string[] };
  slackPreview: {
    botName: string;
    timestamp: string;
    blocks: SlackBlock[];
  };
  sendAction: string;
}

// =============================================================================
// Demo Data — the 7 Proactive Patterns
// =============================================================================

const PATTERNS: PatternDemo[] = [
  {
    id: 'human-gate',
    title: 'Single Human Gate',
    subtitle: 'One tap to approve. AI drafts, you decide.',
    icon: <ShieldCheck className="w-5 h-5" />,
    color: '#10B981',
    before: {
      title: 'Before: Manual Draft Loop',
      items: [
        'Open CRM, find deal, read context',
        'Open email, draft follow-up from scratch',
        'Cross-reference meeting notes for accuracy',
        'Edit 3-4 times to get the tone right',
        '15-20 min per follow-up email',
      ],
    },
    after: {
      title: 'After: One-Tap Approval',
      items: [
        '60 drafts follow-up using meeting + deal context',
        'Draft appears in morning brief — ready to send',
        'Tap Send, Edit, or Dismiss',
        'Every edit teaches 60 your preferences',
        '10 seconds per follow-up email',
      ],
    },
    slackPreview: {
      botName: '60 Sales Teammate',
      timestamp: '8:02 AM',
      blocks: [
        { type: 'header', text: 'Ready to Send' },
        { type: 'context', text: 'These drafts are based on your recent meetings and deal context.' },
        { type: 'divider' },
        { type: 'section', text: '**Follow-up: Acme Corp — Product Demo Recap**\nHey Sarah, great chatting yesterday about the dashboard migration. I\'ve attached the ROI calculator we discussed...' },
        {
          type: 'actions',
          buttons: [
            { text: 'Send', style: 'primary' },
            { text: 'Edit', style: 'default' },
            { text: 'Dismiss', style: 'danger' },
          ],
        },
      ],
    },
    sendAction: 'morning_brief_drafts',
  },
  {
    id: 'heartbeat',
    title: 'Deal Heartbeat',
    subtitle: 'Always-on deal monitor. Catches what you miss.',
    icon: <HeartPulse className="w-5 h-5" />,
    color: '#EF4444',
    before: {
      title: 'Before: Periodic Pipeline Review',
      items: [
        'Weekly pipeline review — stale deals slip through',
        'Manually check "when did I last touch this deal?"',
        'Ghost deals sit for weeks before anyone notices',
        'Single-threaded deals aren\'t flagged',
        'Stage regression goes undetected',
      ],
    },
    after: {
      title: 'After: Continuous Deal Scanning',
      items: [
        'Nightly scan of all active deals (2am UTC)',
        'Stage changes trigger instant re-scan',
        'Post-meeting heartbeat catches follow-up gaps',
        'Detects: stale deals, missing next steps, single-threading',
        'Auto-resolves when conditions clear',
      ],
    },
    slackPreview: {
      botName: '60 Sales Teammate',
      timestamp: '8:05 AM',
      blocks: [
        { type: 'header', text: 'Overnight Findings' },
        { type: 'context', text: '3 observations from last night\'s deal scan' },
        { type: 'divider' },
        { type: 'section', text: '**Stale Deal: TechFlow Solutions** ($45,000 - Proposal)\n_No activity for 12 days. Last meeting was a pricing discussion._' },
        {
          type: 'actions',
          buttons: [
            { text: 'Draft Email', style: 'primary' },
            { text: 'Create Task', style: 'default' },
            { text: 'Snooze 7d', style: 'default' },
          ],
        },
        { type: 'section', text: '**Single-Threaded: CloudBase Inc** ($72,000 - Discovery)\n_Only 1 contact (Jamie Lee, Product Manager). No executive sponsor._' },
        {
          type: 'actions',
          buttons: [
            { text: 'View Deal', style: 'default' },
            { text: 'Dismiss', style: 'danger' },
          ],
        },
      ],
    },
    sendAction: 'morning_brief_observations',
  },
  {
    id: 'morning-triage',
    title: 'Overnight Work + Morning Triage',
    subtitle: 'Wake up to a prioritized action list, not a to-do list.',
    icon: <Sun className="w-5 h-5" />,
    color: '#F59E0B',
    before: {
      title: 'Before: Morning Chaos',
      items: [
        'Open CRM — 47 notifications, none prioritized',
        'Check calendar — scramble to prep for 10am meeting',
        'Scroll Slack — miss the important message',
        'Realize at 2pm you forgot to follow up on yesterday\'s demo',
        'Context-switching kills the first 90 minutes of the day',
      ],
    },
    after: {
      title: 'After: Briefing at 8am',
      items: [
        'One Slack DM with everything prioritized',
        'Ready-to-send drafts from overnight work',
        'Deal observations sorted by severity',
        'Today\'s meetings with prep status',
        'One-tap actions: Send, Edit, Snooze, Create Task',
      ],
    },
    slackPreview: {
      botName: '60 Sales Teammate',
      timestamp: '8:00 AM',
      blocks: [
        { type: 'header', text: 'Good morning, Andrew' },
        { type: 'context', text: 'Tuesday 11 Mar 2026 — 3 meetings today, 2 drafts ready, 1 deal needs attention' },
        { type: 'divider' },
        { type: 'section', text: '**Today\'s Meetings**', fields: [
          { label: '10:00 AM', value: '**Acme Corp** — Discovery call\nPrep: Ready' },
          { label: '2:30 PM', value: '**DataFlow** — Proposal review\nPrep: Needs brief' },
          { label: '4:00 PM', value: '**NovaTech** — Check-in\nPrep: Ready' },
        ]},
        { type: 'divider' },
        { type: 'section', text: '**2 Drafts Ready to Send**\n1. Follow-up: Acme Corp demo recap\n2. Re-engagement: Zenith Labs (14d silent)' },
        {
          type: 'actions',
          buttons: [
            { text: 'Review Drafts', style: 'primary' },
            { text: 'View Pipeline', style: 'default' },
          ],
        },
      ],
    },
    sendAction: 'morning_brief_full',
  },
  {
    id: 'learning-loop',
    title: 'Sales Learning Loop',
    subtitle: 'Every edit makes the next draft better.',
    icon: <Brain className="w-5 h-5" />,
    color: '#8B5CF6',
    before: {
      title: 'Before: Groundhog Day',
      items: [
        'AI drafts always need the same edits',
        'You shorten every email — AI never learns',
        'You change "Dear" to "Hey" every time',
        'Formal tone on drafts when your style is casual',
        'No memory of your preferences across drafts',
      ],
    },
    after: {
      title: 'After: Adaptive AI',
      items: [
        'Tracks: shorter_emails, casual_greeting, removes_ps_line...',
        'After 5+ consistent edits, preference is stored',
        'Trust Capital score grows with accepted drafts',
        'Confidence calibrates autonomy over time',
        'Command Centre shows acceptance rate + learning progress',
      ],
    },
    slackPreview: {
      botName: '60 Sales Teammate',
      timestamp: '8:00 AM',
      blocks: [
        { type: 'section', text: '**Weekly Learning Update**\nYour agent accepted 87% of follow-ups this week (up from 72% last week).' },
        { type: 'section', text: '', fields: [
          { label: 'Trust Capital', value: '78/100 (+6)' },
          { label: 'Top Preference', value: 'Shorter emails (92% confidence)' },
          { label: 'Drafts This Week', value: '15 sent, 2 edited, 1 dismissed' },
          { label: 'Auto-Approved', value: '4 follow-ups (low-risk)' },
        ]},
        { type: 'context', text: 'Your agent learned: you prefer bullet points over paragraphs, and casual greetings over formal.' },
      ],
    },
    sendAction: 'learning_update',
  },
  {
    id: 'improvement-suggestions',
    title: 'Deal Improvement Suggestions',
    subtitle: 'Proactive coaching for every deal.',
    icon: <Lightbulb className="w-5 h-5" />,
    color: '#06B6D4',
    before: {
      title: 'Before: Guesswork',
      items: [
        'No systematic review of deal health',
        'Miss multi-threading opportunities',
        'Forget to share case studies at proposal stage',
        'No competitive positioning prep',
        'Manager only catches issues in 1:1 review',
      ],
    },
    after: {
      title: 'After: Tagged Suggestions',
      items: [
        'MULTI_THREAD — "Only 1 contact. Add a stakeholder."',
        'URGENCY — "14 days in same stage. Create a compelling event."',
        'PROOF — "Proposal stage, no case studies shared yet."',
        'COMPETITOR — "Competitor mentioned in meeting. Prep battlecard."',
        'EXECUTIVE_SPONSOR — "No C-level contact. Find a sponsor."',
      ],
    },
    slackPreview: {
      botName: '60 Sales Teammate',
      timestamp: '8:07 AM',
      blocks: [
        { type: 'header', text: 'Deal Suggestions: CloudBase Inc ($72K)' },
        { type: 'divider' },
        { type: 'section', text: '`MULTI_THREAD` **Add more stakeholders**\nOnly 1 contact linked. Deals with 3+ contacts close 2x faster.' },
        {
          type: 'actions',
          buttons: [
            { text: 'Find Contacts', style: 'primary' },
            { text: 'Dismiss', style: 'default' },
          ],
        },
        { type: 'section', text: '`EXECUTIVE_SPONSOR` **Find executive sponsor**\nNo C-level or VP contact. Executive sponsorship increases win rate by 40%.' },
        {
          type: 'actions',
          buttons: [
            { text: 'Search Org Chart', style: 'primary' },
            { text: 'Dismiss', style: 'default' },
          ],
        },
        { type: 'section', text: '`URGENCY` **Create a compelling event**\n18 days in Discovery with no timeline. Suggest setting an evaluation deadline.' },
        {
          type: 'actions',
          buttons: [
            { text: 'Draft Email', style: 'default' },
            { text: 'Snooze 7d', style: 'default' },
          ],
        },
      ],
    },
    sendAction: 'deal_suggestions',
  },
  {
    id: 'cross-deal',
    title: 'Cross-Deal Awareness',
    subtitle: 'Catches conflicts before they become problems.',
    icon: <GitMerge className="w-5 h-5" />,
    color: '#EC4899',
    before: {
      title: 'Before: Silos',
      items: [
        'Two reps pursue the same company — nobody knows',
        'Contact appears in 3 deals — no flag',
        'Conflicting proposals sent to same buyer',
        'Pipeline review is the only place overlaps surface',
        'By then the damage is done',
      ],
    },
    after: {
      title: 'After: Conflict Detection',
      items: [
        'Contact overlap: same person in 2+ active deals',
        'Company overlap: different reps, same company',
        'HIGH severity for same-week activity overlap',
        'Dismissible with "this is intentional" flag',
        'Surfaces in morning brief before meetings happen',
      ],
    },
    slackPreview: {
      botName: '60 Sales Teammate',
      timestamp: '8:03 AM',
      blocks: [
        { type: 'header', text: 'Cross-Deal Conflict Detected' },
        { type: 'divider' },
        { type: 'section', text: '**Contact Overlap: Sarah Chen (VP Engineering)**\nAppears in 2 active deals:' },
        { type: 'section', text: '- **Acme Corp** ($120K, Proposal) — owned by Andrew\n- **Acme Labs** ($45K, Discovery) — owned by Mike' },
        { type: 'context', text: 'Both deals had activity in the last 3 days. High risk of conflicting outreach.' },
        {
          type: 'actions',
          buttons: [
            { text: 'View Both Deals', style: 'primary' },
            { text: 'This is intentional', style: 'default' },
          ],
        },
      ],
    },
    sendAction: 'cross_deal_conflict',
  },
  {
    id: 'pipeline-hygiene',
    title: 'Pipeline Hygiene',
    subtitle: 'Weekly cleanup. No more zombie deals.',
    icon: <Sparkles className="w-5 h-5" />,
    color: '#14B8A6',
    before: {
      title: 'Before: Messy Pipeline',
      items: [
        'Deals sit in "Proposal" for 90 days — nobody notices',
        'Overdue tasks pile up, forgotten',
        'Close dates pass — forecast becomes fiction',
        'Ghost deals inflate pipeline value',
        'Quarterly cleanup takes a full day',
      ],
    },
    after: {
      title: 'After: Weekly Monday Digest',
      items: [
        '5 hygiene categories: overdue tasks, stuck in stage, stale, past close, ghost risk',
        'One-tap: Snooze, Re-engage, Draft Follow-up, Close as Lost',
        'Re-engage triggers AI reengagement sequence',
        'Actions feed into learning loop',
        'Runs automatically every Monday 9am',
      ],
    },
    slackPreview: {
      botName: '60 Sales Teammate',
      timestamp: 'Monday 9:00 AM',
      blocks: [
        { type: 'header', text: 'Pipeline Hygiene — 6 deals need attention' },
        { type: 'context', text: 'Mon 10 Mar 2026 — Hey Andrew, these deals need a nudge or a close.' },
        { type: 'divider' },
        { type: 'section', text: '**Overdue Tasks** (2)' },
        { type: 'section', text: '**Zenith Labs** - $28,000 - Proposal\n_3 overdue tasks - 18d since last activity_' },
        {
          type: 'actions',
          buttons: [
            { text: 'Snooze 7d', style: 'default' },
            { text: 'Re-engage', style: 'primary' },
            { text: 'Close as Lost', style: 'danger' },
          ],
        },
        { type: 'section', text: '**Stuck in Stage (30+ days)** (1)' },
        { type: 'section', text: '**MegaCorp** - $95,000 - Negotiation\n_42d in Negotiation stage - 8d since last activity_' },
        {
          type: 'actions',
          buttons: [
            { text: 'Snooze 7d', style: 'default' },
            { text: 'Draft Follow-up', style: 'default' },
            { text: 'Close as Lost', style: 'danger' },
          ],
        },
      ],
    },
    sendAction: 'hygiene_digest',
  },
];

// =============================================================================
// Send-to-Slack handler
// =============================================================================

type SendStatus = 'idle' | 'sending' | 'sent' | 'error';

async function sendDemoToSlack(
  action: string,
  userId: string | undefined,
  orgId: string | null,
): Promise<boolean> {
  if (!userId || !orgId) {
    toast.error('Sign in and select an org to send to Slack');
    return false;
  }

  try {
    const { error } = await supabase.functions.invoke('slack-morning-brief', {
      body: {
        demoMode: true,
        demoAction: action,
        userId,
        orgId,
      },
    });

    if (error) {
      toast.error(`Slack send failed: ${error.message}`);
      return false;
    }

    toast.success('Sent to your Slack DM! Check your messages.');
    return true;
  } catch (err: any) {
    toast.error(`Failed: ${err.message}`);
    return false;
  }
}

// =============================================================================
// Sub-components
// =============================================================================

function BeforeAfterCard({ pattern }: { pattern: PatternDemo }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* BEFORE */}
      <div className="rounded-lg border border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900/40 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-red-500" />
          <span className="text-sm font-semibold text-red-700 dark:text-red-400">{pattern.before.title}</span>
        </div>
        <ul className="space-y-2">
          {pattern.before.items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-red-800/80 dark:text-red-300/80">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-red-400" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* AFTER */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900/40 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-emerald-500" />
          <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{pattern.after.title}</span>
        </div>
        <ul className="space-y-2">
          {pattern.after.items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-emerald-800/80 dark:text-emerald-300/80">
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-500" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PatternCard({ pattern, onSendToSlack, sendStatus }: {
  pattern: PatternDemo;
  onSendToSlack: () => void;
  sendStatus: SendStatus;
}) {
  return (
    <Card className="overflow-hidden border-l-4" style={{ borderLeftColor: pattern.color }}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
              style={{ backgroundColor: pattern.color }}
            >
              {pattern.icon}
            </div>
            <div>
              <CardTitle className="text-lg">{pattern.title}</CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">{pattern.subtitle}</p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs" style={{ borderColor: pattern.color, color: pattern.color }}>
            Live
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Before / After */}
        <BeforeAfterCard pattern={pattern} />

        {/* Slack Preview */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Eye className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Slack Preview</span>
          </div>
          <SlackMessagePreview
            botName={pattern.slackPreview.botName}
            timestamp={pattern.slackPreview.timestamp}
            blocks={pattern.slackPreview.blocks}
          />
        </div>

        {/* Send to Slack */}
        <div className="flex items-center gap-3 pt-2 border-t">
          <Button
            onClick={onSendToSlack}
            disabled={sendStatus === 'sending' || sendStatus === 'sent'}
            className="gap-2"
            style={
              sendStatus === 'sent'
                ? { backgroundColor: '#10B981' }
                : { backgroundColor: pattern.color }
            }
          >
            {sendStatus === 'sending' && <Loader2 className="w-4 h-4 animate-spin" />}
            {sendStatus === 'sent' && <CheckCircle2 className="w-4 h-4" />}
            {sendStatus === 'idle' && <Send className="w-4 h-4" />}
            {sendStatus === 'error' && <Send className="w-4 h-4" />}
            {sendStatus === 'sending'
              ? 'Sending...'
              : sendStatus === 'sent'
                ? 'Sent to Slack!'
                : 'Send to Slack'}
          </Button>
          <span className="text-xs text-muted-foreground">
            Sends a live demo message to your Slack DM
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Main Page
// =============================================================================

export default function ProactiveTeammateDemo() {
  const { user } = useAuth();
  const orgId = useActiveOrgId();
  const [sendStatuses, setSendStatuses] = useState<Record<string, SendStatus>>({});

  const handleSendToSlack = async (pattern: PatternDemo) => {
    setSendStatuses((prev) => ({ ...prev, [pattern.id]: 'sending' }));

    const success = await sendDemoToSlack(pattern.sendAction, user?.id, orgId);

    setSendStatuses((prev) => ({
      ...prev,
      [pattern.id]: success ? 'sent' : 'error',
    }));

    // Reset after 5s
    if (success) {
      setTimeout(() => {
        setSendStatuses((prev) => ({ ...prev, [pattern.id]: 'idle' }));
      }, 5000);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Hero */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-sm font-medium">
          <Zap className="w-4 h-4" />
          Proactive Sales Teammate
        </div>
        <h1 className="text-3xl font-bold tracking-tight">
          Meet your AI Sales Teammate
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          7 patterns that turn 60 from a tool into a teammate. It acts, you approve.
          Every interaction makes it smarter. See each pattern in action below.
        </p>
        <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground pt-2">
          <div className="flex items-center gap-1.5">
            <ArrowRight className="w-4 h-4 text-emerald-500" />
            <span>Before/After comparison</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Eye className="w-4 h-4 text-violet-500" />
            <span>Live Slack preview</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Send className="w-4 h-4 text-blue-500" />
            <span>Send to your Slack</span>
          </div>
        </div>
      </div>

      {/* Pattern Cards */}
      <div className="space-y-6">
        {PATTERNS.map((pattern) => (
          <PatternCard
            key={pattern.id}
            pattern={pattern}
            onSendToSlack={() => handleSendToSlack(pattern)}
            sendStatus={sendStatuses[pattern.id] || 'idle'}
          />
        ))}
      </div>

      {/* Bottom CTA */}
      <Card className="bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950/30 dark:to-indigo-950/30 border-violet-200 dark:border-violet-800">
        <CardContent className="py-8 text-center space-y-4">
          <h2 className="text-xl font-bold">Ready to bring on the teammate?</h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            All 7 patterns are live on your account. The more you use 60, the smarter
            it gets. Start with your morning brief tomorrow.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button
              onClick={() => {
                window.location.href = '/command-centre';
              }}
              className="gap-2 bg-violet-600 hover:bg-violet-700"
            >
              <Zap className="w-4 h-4" />
              Open Command Centre
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
