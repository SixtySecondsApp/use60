/**
 * ProactiveAgentV2Demo — Interactive showcase for all 7 Proactive Agent v2 workflows
 *
 * Renders simulated Slack Block Kit messages and email previews that demonstrate
 * the full orchestrator pipeline: post-meeting, pre-meeting, calendar, email,
 * proposal, campaign monitoring, and coaching analysis.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Activity, Calendar, Mail, FileText, BarChart3, GraduationCap,
  Brain, Clock, Users, Zap, CheckCircle2,
  ArrowRight, Play, Sparkles, MessageSquare, Send,
  SkipForward, Building2, Loader2, RotateCcw,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { toast } from 'sonner';
import { SlackBlock, SlackMessage, SlackBlockRenderer, renderMrkdwn } from '@/components/agent/SlackBlockKitRenderer';
import { EmailPreview } from '@/components/agent/EmailPreview';
import { StepVisualizer, type SimStep, type DemoScenarioLike } from '@/components/agent/StepVisualizer';
import { LiveStepVisualizer } from '@/components/agent/LiveStepVisualizer';
import { LiveOutputPanel } from '@/components/agent/LiveOutputPanel';
import { useOrchestratorJob } from '@/hooks/useOrchestratorJob';
import { SKILL_DISPLAY_NAMES, SEQUENCE_STEPS } from '@/lib/agent/abilityRegistry';

// =============================================================================
// Demo Scenario Definitions
// =============================================================================

interface DemoScenario {
  id: string;
  title: string;
  subtitle: string;
  icon: typeof Activity;
  gradient: string;
  eventType: string;
  eventSource: string;
  recorderSource?: 'fathom' | 'fireflies' | 'meetingbaas';
  trigger: string;
  callType?: { name: string; confidence: number; isSales: boolean };
  steps: SimStep[];
  slackBlocks: SlackBlock[];
  emailPreview?: { from: string; to: string; subject: string; body: string; timestamp: string };
  botName: string;
  timestamp: string;
}

// =============================================================================
// Simulation Hook
// =============================================================================

interface SimulationState {
  runningStepIndex: number; // -1 = not started, 0-N = running step index
  completedStepIndex: number; // Last completed step index
  stepTimers: Record<number, number>; // Step index → elapsed ms
  visibleBlocks: number; // How many Slack blocks are visible
  totalElapsedMs: number; // Total elapsed time
  isComplete: boolean; // All steps done
}

function useSimulation(
  steps: SimStep[],
  isRunning: boolean,
  scenario: DemoScenario
): SimulationState & { reset: () => void } {
  const [runningStepIndex, setRunningStepIndex] = useState(-1);
  const [completedStepIndex, setCompletedStepIndex] = useState(-1);
  const [stepTimers, setStepTimers] = useState<Record<number, number>>({});
  const [visibleBlocks, setVisibleBlocks] = useState(0);
  const [totalElapsedMs, setTotalElapsedMs] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  const frameRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const stepStartTimeRef = useRef<number>(0);

  // Reset function
  const reset = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    setRunningStepIndex(-1);
    setCompletedStepIndex(-1);
    setStepTimers({});
    setVisibleBlocks(0);
    setTotalElapsedMs(0);
    setIsComplete(false);
    startTimeRef.current = 0;
    stepStartTimeRef.current = 0;
  }, []);

  // Main simulation effect
  useEffect(() => {
    if (!isRunning || isComplete) {
      cancelAnimationFrame(frameRef.current);
      return;
    }

    // Initialize
    if (runningStepIndex === -1) {
      startTimeRef.current = Date.now();
      stepStartTimeRef.current = Date.now();
      setRunningStepIndex(0);
      setVisibleBlocks(0);
      return;
    }

    const currentStep = steps[runningStepIndex];
    if (!currentStep) {
      setIsComplete(true);
      cancelAnimationFrame(frameRef.current);
      return;
    }

    // Check if step should be skipped (gating logic)
    const shouldSkip =
      (currentStep.gated === 'sales-only' && !scenario.callType?.isSales) ||
      (currentStep.gated === 'coaching' && !scenario.callType?.isSales); // Coaching also disabled for non-sales

    if (shouldSkip) {
      // Skip instantly
      setCompletedStepIndex(runningStepIndex);
      setStepTimers(prev => ({ ...prev, [runningStepIndex]: 0 }));
      setRunningStepIndex(runningStepIndex + 1);
      return;
    }

    // Animation frame ticker
    const tick = () => {
      const now = Date.now();
      const stepElapsed = now - stepStartTimeRef.current;
      const totalElapsed = now - startTimeRef.current;

      // Update timers
      setStepTimers(prev => ({ ...prev, [runningStepIndex]: stepElapsed }));
      setTotalElapsedMs(totalElapsed);

      // Check if step is complete
      if (stepElapsed >= currentStep.delayMs) {
        // Step complete
        setCompletedStepIndex(runningStepIndex);
        setVisibleBlocks(currentStep.blocksRevealed);

        // Check if this is an approval step (delayMs === 0 and name includes HITL)
        if (currentStep.delayMs === 0 && currentStep.name.includes('HITL')) {
          // Pause for approval (in simulation mode, we'll auto-proceed after showing the state)
          setTimeout(() => {
            stepStartTimeRef.current = Date.now();
            setRunningStepIndex(runningStepIndex + 1);
          }, 2000); // 2 second pause to show approval state
        } else {
          // Move to next step immediately
          stepStartTimeRef.current = Date.now();
          setRunningStepIndex(runningStepIndex + 1);
        }
      } else {
        // Continue ticking
        frameRef.current = requestAnimationFrame(tick);
      }
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameRef.current);
    };
  }, [isRunning, runningStepIndex, steps, scenario.callType?.isSales, isComplete]);

  return {
    runningStepIndex,
    completedStepIndex,
    stepTimers,
    visibleBlocks,
    totalElapsedMs,
    isComplete,
    reset,
  };
}

const SCENARIOS: DemoScenario[] = [
  // 1. Post-Meeting Sequence (Sales Call via MeetingBaaS)
  {
    id: 'post-meeting',
    title: 'Post-Meeting Follow-up',
    subtitle: 'Triggered when a meeting recording completes',
    icon: Activity,
    gradient: 'from-blue-500 to-indigo-600',
    eventType: 'meeting_ended',
    eventSource: 'edge:process-recording',
    recorderSource: 'meetingbaas',
    trigger: 'MeetingBaaS Recording: "Q1 Planning with Acme Corp" completed',
    callType: { name: 'Discovery', confidence: 0.94, isSales: true },
    steps: [
      { name: 'Classify Call Type', delayMs: 1800, blocksRevealed: 3 }, // Reveals header + context + call type badge
      { name: 'Extract Action Items', delayMs: 3200, blocksRevealed: 3 },
      { name: 'Detect Intents & Buying Signals', delayMs: 4100, blocksRevealed: 3, gated: 'sales-only' },
      { name: 'Generate Next Best Actions', delayMs: 2800, blocksRevealed: 3, gated: 'sales-only' },
      { name: 'Draft Follow-up Email', delayMs: 3500, blocksRevealed: 5, gated: 'sales-only' }, // Reveals email body section
      { name: 'Send Email (HITL)', delayMs: 0, blocksRevealed: 6 }, // Reveals action buttons, pauses for approval
      { name: 'Create CRM Tasks', delayMs: 1200, blocksRevealed: 6 },
    ],
    botName: '60 Agent',
    timestamp: '2:47 PM',
    slackBlocks: [
      { type: 'header', text: { type: 'plain_text', text: '📧 Email Ready to Send', emoji: true } },
      { type: 'divider' },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: '*To:*\nsarah.chen@acmecorp.com' },
          { type: 'mrkdwn', text: '*Subject:*\nGreat meeting today - action items & next steps' },
        ],
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Body:*\nHi Sarah,\n\nThank you for the productive Q1 planning session today. As discussed, here are the key takeaways and next steps:\n\n1. *Budget approval* - You mentioned getting the $85K budget approved by Feb 28. I\'ll send over the updated pricing breakdown by EOD tomorrow.\n\n2. *Technical evaluation* - Your team will run a 2-week POC starting March 3. I\'ll coordinate with your CTO David to set up the sandbox environment.\n\n3. *Stakeholder alignment* - We agreed to schedule a brief executive alignment call with your VP of Sales, Mark.\n\nI\'ve attached the ROI calculator we discussed. Let me know if you need anything else to move this forward.\n\nBest,\nJordan',
        },
      },
      { type: 'divider' },
      {
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: '✅ Send Now', emoji: true }, action_id: 'email_send_now_demo', style: 'primary' },
          { type: 'button', text: { type: 'plain_text', text: '✏️ Edit in use60', emoji: true }, action_id: 'email_edit_demo' },
          { type: 'button', text: { type: 'plain_text', text: '📅 Send Later', emoji: true }, action_id: 'email_send_later_demo' },
          { type: 'button', text: { type: 'plain_text', text: '❌ Cancel', emoji: true }, action_id: 'email_cancel_demo', style: 'danger' },
        ],
      },
    ],
    emailPreview: {
      from: 'Jordan Mitchell <jordan@yourcompany.com>',
      to: 'sarah.chen@acmecorp.com',
      subject: 'Great meeting today - action items & next steps',
      body: `Hi Sarah,

Thank you for the productive Q1 planning session today. As discussed, here are the key takeaways and next steps:

1. Budget approval - You mentioned getting the $85K budget approved by Feb 28. I'll send over the updated pricing breakdown by EOD tomorrow.

2. Technical evaluation - Your team will run a 2-week POC starting March 3. I'll coordinate with your CTO David to set up the sandbox environment.

3. Stakeholder alignment - We agreed to schedule a brief executive alignment call with your VP of Sales, Mark.

I've attached the ROI calculator we discussed. Let me know if you need anything else to move this forward.

Best,
Jordan`,
      timestamp: 'Feb 14, 2026 2:47 PM',
    },
  },

  // 2. Pre-Meeting Briefing
  {
    id: 'pre-meeting',
    title: 'Pre-Meeting Briefing',
    subtitle: 'Delivered 90 minutes before your meeting',
    icon: Brain,
    gradient: 'from-purple-500 to-pink-600',
    eventType: 'pre_meeting_90min',
    eventSource: 'cron:morning',
    trigger: 'Cron: 90-min pre-meeting trigger for "Demo Call - Brightwave Inc" at 3:00 PM',
    steps: [
      { name: 'Load Meeting Context', delayMs: 1100, blocksRevealed: 3 },
      { name: 'Enrich Contact (Apollo)', delayMs: 2300, blocksRevealed: 4 },
      { name: 'Gather Company News', delayMs: 3700, blocksRevealed: 5 },
      { name: 'Analyze Relationship History', delayMs: 1900, blocksRevealed: 6 },
      { name: 'Generate Briefing', delayMs: 4200, blocksRevealed: 9 },
      { name: 'Deliver to Slack', delayMs: 800, blocksRevealed: 10 },
    ],
    botName: '60 Agent',
    timestamp: '1:30 PM',
    slackBlocks: [
      { type: 'header', text: { type: 'plain_text', text: '🎯 Pre-Meeting Brief: Demo Call - Brightwave Inc', emoji: true } },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: 'Meeting in 90 minutes with Alex Torres (VP Engineering)' }],
      },
      { type: 'divider' },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: '*Contact:* Alex Torres' },
          { type: 'mrkdwn', text: '*Title:* VP Engineering' },
          { type: 'mrkdwn', text: '*Company:* Brightwave Inc (Series B, 120 employees)' },
          { type: 'mrkdwn', text: '*Deal:* $65,000 - Negotiation stage' },
        ],
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*🔥 Key Intelligence:*\n• Brightwave just raised $18M Series B (announced 3 days ago)\n• Alex was promoted from Sr. Director to VP last month\n• Their competitor TechNova signed with your competitor last week\n• Last meeting: Alex expressed concern about implementation timeline',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*💡 Talking Points:*\n• Congratulate on Series B - tie to scaling needs\n• Address implementation concerns with accelerated onboarding plan\n• Leverage competitive urgency (TechNova moving fast)\n• Ask about expanded team budget post-funding',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*⚠️ Risk Signals:*\n• Deal has been in Negotiation for 23 days (avg: 14 days)\n• No champion identified beyond Alex\n• Last email from Alex mentioned "evaluating other options"',
        },
      },
      {
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: '📊 Full Brief', emoji: true }, action_id: 'brief_view_full_demo', style: 'primary' },
          { type: 'button', text: { type: 'plain_text', text: '📝 Prep Checklist', emoji: true }, action_id: 'brief_checklist_demo' },
          { type: 'button', text: { type: 'plain_text', text: '👍 Got It', emoji: true }, action_id: 'brief_dismiss_demo' },
        ],
      },
    ],
  },

  // 3. Calendar Availability
  {
    id: 'calendar',
    title: 'Calendar Scheduling',
    subtitle: 'Auto-finds mutual availability and proposes times',
    icon: Calendar,
    gradient: 'from-emerald-500 to-teal-600',
    eventType: 'calendar_find_times',
    eventSource: 'orchestrator:chain',
    trigger: 'Chain: Post-meeting follow-up detected "let\'s schedule a technical review" commitment',
    steps: [
      { name: 'Extract Scheduling Intent', delayMs: 1500, blocksRevealed: 2 },
      { name: 'Query Google Calendar', delayMs: 2100, blocksRevealed: 2 },
      { name: 'Find Mutual Availability', delayMs: 1800, blocksRevealed: 3 },
      { name: 'Present Options (HITL)', delayMs: 0, blocksRevealed: 5 }, // Pauses for selection
      { name: 'Create Calendar Event', delayMs: 1200, blocksRevealed: 5 },
      { name: 'Send Confirmation', delayMs: 800, blocksRevealed: 5 },
    ],
    botName: '60 Agent',
    timestamp: '2:55 PM',
    slackBlocks: [
      { type: 'header', text: { type: 'plain_text', text: '📅 Available Times for Sarah Chen', emoji: true } },
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: 'Select a time slot:' },
        accessory: {
          type: 'radio_buttons',
          action_id: 'cal_select_slot_demo',
          options: [
            { text: { type: 'plain_text', text: 'Mon, Mar 3 at 10:00 AM - 10:30 AM EST' }, value: '0' },
            { text: { type: 'plain_text', text: 'Mon, Mar 3 at 2:00 PM - 2:30 PM EST' }, value: '1' },
            { text: { type: 'plain_text', text: 'Tue, Mar 4 at 9:00 AM - 9:30 AM EST' }, value: '2' },
            { text: { type: 'plain_text', text: 'Wed, Mar 5 at 11:00 AM - 11:30 AM EST' }, value: '3' },
            { text: { type: 'plain_text', text: 'Thu, Mar 6 at 3:00 PM - 3:30 PM EST' }, value: '4' },
          ],
        },
      },
      { type: 'divider' },
      {
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: '📅 Send Invite', emoji: true }, action_id: 'cal_send_invite_demo', style: 'primary' },
          { type: 'button', text: { type: 'plain_text', text: '📧 Send Times via Email', emoji: true }, action_id: 'cal_send_times_demo' },
          { type: 'button', text: { type: 'plain_text', text: '🔍 More Options', emoji: true }, action_id: 'cal_more_demo' },
          { type: 'button', text: { type: 'plain_text', text: 'I\'ll Handle This', emoji: true }, action_id: 'cal_handle_demo' },
        ],
      },
    ],
  },

  // 4. Email Send-as-Rep
  {
    id: 'email-send',
    title: 'Email Send-as-Rep',
    subtitle: 'AI drafts and sends from your real Gmail',
    icon: Send,
    gradient: 'from-orange-500 to-red-500',
    eventType: 'email_received',
    eventSource: 'webhook:meetingbaas',
    trigger: 'Email received: Sarah Chen replied "Can you send the updated pricing?"',
    steps: [
      { name: 'Classify Email Intent', delayMs: 2100, blocksRevealed: 2 },
      { name: 'Load Deal Context', delayMs: 1400, blocksRevealed: 3 },
      { name: 'Draft Reply (Claude)', delayMs: 3800, blocksRevealed: 5 },
      { name: 'Present for Approval (HITL)', delayMs: 0, blocksRevealed: 7 }, // Pauses for approval
      { name: 'Send via Gmail API', delayMs: 1100, blocksRevealed: 7 },
      { name: 'Log to CRM', delayMs: 600, blocksRevealed: 7 },
    ],
    botName: '60 Agent',
    timestamp: '3:22 PM',
    slackBlocks: [
      { type: 'header', text: { type: 'plain_text', text: '📧 Email Ready to Send', emoji: true } },
      { type: 'divider' },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: '*To:*\nsarah.chen@acmecorp.com' },
          { type: 'mrkdwn', text: '*Subject:*\nRe: Updated Pricing for Q1 Implementation' },
        ],
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: '*CC:*\ndavid.martinez@acmecorp.com' },
        ],
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Body:*\nHi Sarah,\n\nAbsolutely! Here\'s the updated pricing breakdown based on our discussion:\n\n- *Growth Plan*: $2,400/mo (10 seats) - $28,800/yr\n- *Implementation*: $12,000 one-time\n- *Total Year 1*: $40,800\n- *Discount Applied*: 15% annual commitment ($6,120 savings)\n\nI\'ve also CC\'d David so he can review the technical requirements. The proposal document is attached with full terms.\n\nHappy to hop on a quick call if you have any questions.\n\nBest,\nJordan',
        },
      },
      { type: 'divider' },
      {
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: '✅ Send Now', emoji: true }, action_id: 'email_send_now_demo', style: 'primary' },
          { type: 'button', text: { type: 'plain_text', text: '✏️ Edit in use60', emoji: true }, action_id: 'email_edit_demo' },
          { type: 'button', text: { type: 'plain_text', text: '📅 Send Later', emoji: true }, action_id: 'email_send_later_demo' },
          { type: 'button', text: { type: 'plain_text', text: '❌ Cancel', emoji: true }, action_id: 'email_cancel_demo', style: 'danger' },
        ],
      },
    ],
    emailPreview: {
      from: 'Jordan Mitchell <jordan@yourcompany.com>',
      to: 'sarah.chen@acmecorp.com',
      subject: 'Re: Updated Pricing for Q1 Implementation',
      body: `Hi Sarah,

Absolutely! Here's the updated pricing breakdown based on our discussion:

- Growth Plan: $2,400/mo (10 seats) - $28,800/yr
- Implementation: $12,000 one-time
- Total Year 1: $40,800
- Discount Applied: 15% annual commitment ($6,120 savings)

I've also CC'd David so he can review the technical requirements. The proposal document is attached with full terms.

Happy to hop on a quick call if you have any questions.

Best,
Jordan`,
      timestamp: 'Feb 14, 2026 3:22 PM',
    },
  },

  // 5. Proposal Pipeline
  {
    id: 'proposal',
    title: 'Proposal Generation',
    subtitle: 'Auto-generates and delivers proposals for review',
    icon: FileText,
    gradient: 'from-cyan-500 to-blue-600',
    eventType: 'proposal_generation',
    eventSource: 'orchestrator:chain',
    trigger: 'Chain: Deal moved to "Proposal" stage + buying signals detected',
    steps: [
      { name: 'Load Deal & Contact Data', delayMs: 1200, blocksRevealed: 3 },
      { name: 'Generate Proposal (Claude)', delayMs: 8500, blocksRevealed: 6 },
      { name: 'Format PDF Document', delayMs: 2100, blocksRevealed: 7 },
      { name: 'Review & Approve (HITL)', delayMs: 0, blocksRevealed: 9 }, // Pauses for approval
      { name: 'Send to Contact', delayMs: 1000, blocksRevealed: 9 },
    ],
    botName: '60 Agent',
    timestamp: '4:15 PM',
    slackBlocks: [
      { type: 'header', text: { type: 'plain_text', text: '📄 Proposal Ready: Enterprise Growth Package - Acme Corp', emoji: true } },
      { type: 'divider' },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: '*Deal:* Acme Corp - Enterprise Growth' },
          { type: 'mrkdwn', text: '*Contact:* Sarah Chen' },
          { type: 'mrkdwn', text: '*Value:* $85,000' },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Summary:*\nComprehensive enterprise growth package including platform license, implementation services, dedicated success manager, and custom integrations. Tailored to Acme Corp\'s Q1 scaling goals with phased rollout plan.',
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '*Executive Summary*\nA customized platform deployment to support Acme Corp\'s growth from 50 to 200 sales reps...' },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '*Scope of Work*\nPhase 1: Core platform deployment (Weeks 1-2), Phase 2: Custom integrations with Salesforce and HubSpot...' },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '*Pricing & Terms*\nAnnual license: $62,000, Implementation: $18,000, Training: $5,000. Net 30 payment terms...' },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: '+2 more sections' }],
      },
      { type: 'divider' },
      {
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: 'Approve & Send', emoji: true }, action_id: 'prop_approve_send_demo', style: 'primary' },
          { type: 'button', text: { type: 'plain_text', text: 'Edit First', emoji: true }, action_id: 'prop_edit_demo' },
          { type: 'button', text: { type: 'plain_text', text: 'Share Link', emoji: true }, action_id: 'prop_share_link_demo' },
          { type: 'button', text: { type: 'plain_text', text: 'Skip', emoji: true }, action_id: 'prop_skip_demo' },
        ],
      },
    ],
  },

  // 6. Campaign Monitoring
  {
    id: 'campaign',
    title: 'Campaign Daily Report',
    subtitle: 'Monitors outreach campaigns and classifies replies',
    icon: BarChart3,
    gradient: 'from-amber-500 to-orange-600',
    eventType: 'campaign_daily_check',
    eventSource: 'cron:morning',
    trigger: 'Cron: Daily campaign check at 8:00 AM',
    steps: [
      { name: 'Pull Campaign Metrics', delayMs: 3200, blocksRevealed: 3 },
      { name: 'Classify New Replies', delayMs: 4700, blocksRevealed: 12 }, // Reveals all reply cards
      { name: 'Generate Optimization Suggestions', delayMs: 3100, blocksRevealed: 16 },
      { name: 'Deliver Report to Slack', delayMs: 900, blocksRevealed: 18 },
    ],
    botName: '60 Agent',
    timestamp: '8:00 AM',
    slackBlocks: [
      { type: 'header', text: { type: 'plain_text', text: '📊 Campaign Report: Q1 Enterprise Outreach', emoji: true } },
      { type: 'divider' },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: '*Status:* 🟢 healthy' },
          { type: 'mrkdwn', text: '*Sent:* 847' },
          { type: 'mrkdwn', text: '*Open Rate:* 42.3%' },
          { type: 'mrkdwn', text: '*Reply Rate:* 8.7%' },
        ],
      },
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '*Recent Replies (4):*' },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Lisa Park* — 🟢 Positive\n>Thanks for reaching out! We\'re actually looking at solutions like this. Can we set up a call next week?',
        },
      },
      {
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: 'Draft Response', emoji: true }, action_id: 'camp_draft_response_demo1' },
          { type: 'button', text: { type: 'plain_text', text: 'View Thread', emoji: true }, action_id: 'camp_view_thread_demo1' },
          { type: 'button', text: { type: 'plain_text', text: 'Mark Closed', emoji: true }, action_id: 'camp_mark_closed_demo1' },
          { type: 'button', text: { type: 'plain_text', text: 'Add to Nurture', emoji: true }, action_id: 'camp_add_nurture_demo1' },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Ryan Cooper* — 🔴 Negative\n>Not interested at this time. Please remove me from your list.',
        },
      },
      {
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: 'Draft Response', emoji: true }, action_id: 'camp_draft_response_demo2' },
          { type: 'button', text: { type: 'plain_text', text: 'View Thread', emoji: true }, action_id: 'camp_view_thread_demo2' },
          { type: 'button', text: { type: 'plain_text', text: 'Mark Closed', emoji: true }, action_id: 'camp_mark_closed_demo2' },
          { type: 'button', text: { type: 'plain_text', text: 'Add to Nurture', emoji: true }, action_id: 'camp_add_nurture_demo2' },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Maya Johnson* — 🟡 OOO\n>I\'m out of office until March 10. Please reach out after that.',
        },
      },
      {
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: 'Draft Response', emoji: true }, action_id: 'camp_draft_response_demo3' },
          { type: 'button', text: { type: 'plain_text', text: 'View Thread', emoji: true }, action_id: 'camp_view_thread_demo3' },
          { type: 'button', text: { type: 'plain_text', text: 'Mark Closed', emoji: true }, action_id: 'camp_mark_closed_demo3' },
          { type: 'button', text: { type: 'plain_text', text: 'Add to Nurture', emoji: true }, action_id: 'camp_add_nurture_demo3' },
        ],
      },
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '*Optimization Suggestions:*' },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '• *Subject Line*: A/B test shows "Quick question about [pain point]" outperforms current subject by 18%' },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '• *Send Time*: Shifting to 9:30 AM could improve open rate by ~5% based on engagement patterns' },
      },
      {
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: 'Apply Suggestions', emoji: true }, action_id: 'camp_apply_suggestion_demo', style: 'primary' },
          { type: 'button', text: { type: 'plain_text', text: 'Keep Testing', emoji: true }, action_id: 'camp_keep_testing_demo' },
        ],
      },
    ],
  },

  // 7. Coaching Analysis
  {
    id: 'coaching',
    title: 'Sales Coaching Digest',
    subtitle: 'Per-meeting micro-feedback and weekly digest',
    icon: GraduationCap,
    gradient: 'from-violet-500 to-purple-600',
    eventType: 'coaching_weekly',
    eventSource: 'cron:weekly',
    trigger: 'Cron: Weekly coaching analysis - 7 meetings analyzed',
    steps: [
      { name: 'Aggregate Weekly Metrics', delayMs: 2400, blocksRevealed: 3 },
      { name: 'Correlate Win/Loss Patterns', delayMs: 5100, blocksRevealed: 5 },
      { name: 'Generate Coaching Insights', delayMs: 4300, blocksRevealed: 7 },
      { name: 'Deliver Digest to Slack', delayMs: 700, blocksRevealed: 9 },
    ],
    botName: '60 Agent',
    timestamp: '9:00 AM (Monday)',
    slackBlocks: [
      { type: 'header', text: { type: 'plain_text', text: '📈 Weekly Coaching Digest', emoji: true } },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: '7 meetings analyzed this week' }],
      },
      { type: 'divider' },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: '*Avg Talk Ratio:* 42% 📉 3.2%' },
          { type: 'mrkdwn', text: '*Avg Question Quality:* 78%' },
          { type: 'mrkdwn', text: '*Avg Objection Handling:* 85%' },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*🎉 Improving:*\n• Talk ratio decreased 3.2% (less talking, more listening)\n• Discovery questions up 15% week-over-week\n• Meeting-to-next-step conversion improved to 71%',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*🎯 Focus Areas:*\n• Ask more open-ended questions in discovery phase\n• Pause 2-3 seconds after prospect speaks before responding\n• Quantify ROI earlier in the conversation',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*🏆 Winning Patterns:*\n• Deals that closed: you mentioned customer success stories 3x more often\n• Won meetings had 38% talk ratio vs 52% in lost meetings\n• Strong correlation between asking about timeline and deal progression',
        },
      },
      {
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: '📊 Full Report', emoji: true }, action_id: 'coach_view_details_weekly', style: 'primary' },
          { type: 'button', text: { type: 'plain_text', text: '⚙️ Adjust Preferences', emoji: true }, action_id: 'coach_adjust_prefs_weekly' },
        ],
      },
    ],
  },

  // 8. Internal Meeting (Non-Sales — demonstrates call type gating)
  {
    id: 'internal-meeting',
    title: 'Internal Meeting',
    subtitle: 'Non-sales call — sales-only steps are skipped',
    icon: Building2,
    gradient: 'from-gray-500 to-slate-600',
    eventType: 'meeting_ended',
    eventSource: 'edge:fathom-sync',
    recorderSource: 'fathom',
    trigger: 'Fathom Sync: "Weekly Team Standup" transcript processed',
    callType: { name: 'Internal Stand Up', confidence: 0.97, isSales: false },
    steps: [
      { name: 'Classify Call Type', delayMs: 300, blocksRevealed: 3 },
      { name: 'Extract Action Items', delayMs: 2900, blocksRevealed: 4 },
      { name: 'Detect Intents & Buying Signals', delayMs: 0, blocksRevealed: 4, gated: 'sales-only' }, // Will be skipped
      { name: 'Generate Next Best Actions', delayMs: 0, blocksRevealed: 4, gated: 'sales-only' }, // Will be skipped
      { name: 'Draft Follow-up Email', delayMs: 0, blocksRevealed: 4, gated: 'sales-only' }, // Will be skipped
      { name: 'Update CRM', delayMs: 1200, blocksRevealed: 5 },
      { name: 'Create Tasks from Actions', delayMs: 1800, blocksRevealed: 6 },
      { name: 'Notify Slack Summary', delayMs: 600, blocksRevealed: 7 },
      { name: 'Coaching Micro-Feedback', delayMs: 0, blocksRevealed: 7, gated: 'coaching' }, // Will be skipped if disabled
    ],
    botName: '60 Agent',
    timestamp: '10:15 AM',
    slackBlocks: [
      { type: 'header', text: { type: 'plain_text', text: '📋 Meeting Summary: Weekly Team Standup', emoji: true } },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: 'Internal Stand Up — 3 sales-only steps skipped' }],
      },
      { type: 'divider' },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: '*Duration:* 22 minutes' },
          { type: 'mrkdwn', text: '*Participants:* Jordan, Alex, Sam, Priya' },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Action Items (4):*\n• Jordan: Send Q1 pipeline report by EOD Friday\n• Alex: Follow up with Brightwave on POC timeline\n• Sam: Update CRM stages for deals moving to Negotiation\n• Priya: Prepare campaign performance deck for Monday review',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Key Decisions:*\n• Moving weekly standups to Tuesdays starting next week\n• Agreed to prioritize Enterprise tier deals over SMB this quarter',
        },
      },
      { type: 'divider' },
      {
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: 'View Tasks', emoji: true }, action_id: 'internal_view_tasks_demo', style: 'primary' },
          { type: 'button', text: { type: 'plain_text', text: 'Full Transcript', emoji: true }, action_id: 'internal_transcript_demo' },
          { type: 'button', text: { type: 'plain_text', text: 'Got It', emoji: true }, action_id: 'internal_dismiss_demo' },
        ],
      },
    ],
  },

  // 9. Re-engagement Trigger
  {
    id: 'reengagement',
    title: 'Re-engagement Trigger',
    subtitle: 'Monitors closed-lost deals for buying signals',
    icon: Clock,
    gradient: 'from-amber-500 to-orange-600',
    eventType: 'stale_deal_revival',
    eventSource: 'cron:daily',
    trigger: 'Cron: Daily re-engagement scan — 3 closed-lost deals checked',
    steps: [
      { name: 'Research Trigger Events', delayMs: 4500, blocksRevealed: 3 },
      { name: 'Analyse Stall Reason', delayMs: 3200, blocksRevealed: 5 },
      { name: 'Draft Re-engagement (HITL)', delayMs: 3800, blocksRevealed: 8 },
    ],
    botName: '60 Agent',
    timestamp: '7:15 AM',
    slackBlocks: [
      { type: 'header', text: { type: 'plain_text', text: '🔄 Re-engagement Opportunity Detected', emoji: true } },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: 'Job Change Signal • Feb 14, 2026 7:15 AM' }],
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Signal:*\nSarah Chen (your former champion at Acme Corp) just started as VP Revenue at TechFlow Inc.',
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: '*Contact:*\nSarah Chen' },
          { type: 'mrkdwn', text: '*New Company:*\nTechFlow Inc.' },
          { type: 'mrkdwn', text: '*Original Deal:*\nAcme Corp — $85,000' },
          { type: 'mrkdwn', text: '*Lost Reason:*\nBudget — closed Sept 2025' },
        ],
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Score:* 78/100 — Strong signal + Budget was the blocker, not fit',
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Draft Outreach:*',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Hey Sarah, congrats on the new role at TechFlow — that\'s a brilliant move. Given what you saw with us at Acme, I\'d love to show you what\'s changed since September. Worth a quick 15 mins?',
        },
      },
      { type: 'divider' },
      {
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: 'Send Email', emoji: true }, action_id: 'reeng_send_email_demo', style: 'primary' },
          { type: 'button', text: { type: 'plain_text', text: 'Edit', emoji: true }, action_id: 'reeng_edit_demo' },
          { type: 'button', text: { type: 'plain_text', text: 'Snooze 2 Weeks', emoji: true }, action_id: 'reeng_snooze_demo' },
          { type: 'button', text: { type: 'plain_text', text: 'Remove from Watchlist', emoji: true }, action_id: 'reeng_remove_demo', style: 'danger' },
        ],
      },
    ],
  },
];

// =============================================================================
// Coaching Per-Meeting Message (shown as secondary tab in coaching scenario)
// =============================================================================

const COACHING_PER_MEETING_BLOCKS: SlackBlock[] = [
  { type: 'header', text: { type: 'plain_text', text: '🎯 Quick Coaching: Demo Call - Brightwave Inc', emoji: true } },
  { type: 'divider' },
  {
    type: 'section',
    fields: [
      { type: 'mrkdwn', text: '*Talk Ratio:* ✅ 38% (you)' },
      { type: 'mrkdwn', text: '*Questions:* ⭐⭐⭐⭐' },
      { type: 'mrkdwn', text: '*Objection Handling:* ⭐⭐⭐⭐⭐' },
    ],
  },
  {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: '✅ Great job letting the prospect lead the conversation - your 38% talk ratio is ideal\n💡 Try asking "What does success look like for your team?" to deepen discovery\nℹ️ You addressed the pricing objection well by anchoring on ROI',
    },
  },
  {
    type: 'actions',
    elements: [
      { type: 'button', text: { type: 'plain_text', text: '📊 View Details', emoji: true }, action_id: 'coach_view_details_demo' },
      { type: 'button', text: { type: 'plain_text', text: '⚙️ Adjust Preferences', emoji: true }, action_id: 'coach_adjust_prefs_demo' },
      { type: 'button', text: { type: 'plain_text', text: '👍 Got It', emoji: true }, action_id: 'coach_dismiss_demo' },
    ],
  },
];

// =============================================================================
// Main Demo Component
// =============================================================================

export default function ProactiveAgentV2Demo() {
  const { userId } = useAuth();
  const [selectedScenario, setSelectedScenario] = useState<string>('post-meeting');
  const [mode, setMode] = useState<'simulate' | 'live'>('simulate');
  const [isPlaying, setIsPlaying] = useState(false);

  // Live mode state
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  // Use the orchestrator job hook for tracking
  const { stepResults: liveStepResults, jobStatus: liveJobStatus, isRunning: isOrchestratorRunning, reset: resetOrchestrator } = useOrchestratorJob(jobId);
  const [isRunningOrchestrator, setIsRunningOrchestrator] = useState(false);

  const scenario = SCENARIOS.find(s => s.id === selectedScenario)!;

  // Fetch recent meetings for live mode
  const { data: recentMeetings, isLoading: loadingMeetings } = useQuery({
    queryKey: ['recent-meetings-with-transcript', userId],
    queryFn: async () => {
      if (!userId) return [];
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error } = await supabase
        .from('meetings')
        .select('id, title, meeting_start, source_type, call_type_id, org_id, transcript_text')
        .eq('owner_user_id', userId)
        .not('transcript_text', 'is', null)
        .gte('meeting_start', thirtyDaysAgo.toISOString())
        .order('meeting_start', { ascending: false })
        .limit(15);

      if (error) throw error;
      return data || [];
    },
    enabled: mode === 'live' && !!userId,
  });

  // Simulation state
  const simulation = useSimulation(scenario.steps, isPlaying, scenario);

  const handlePlay = useCallback(() => {
    simulation.reset();
    setIsPlaying(true);
  }, [simulation]);

  const handleReset = useCallback(() => {
    simulation.reset();
    setIsPlaying(false);
  }, [simulation]);

  const handleRunOrchestrator = useCallback(async () => {
    if (!selectedMeetingId || !userId) {
      toast.error('Please select a meeting first');
      return;
    }

    const meeting = recentMeetings?.find(m => m.id === selectedMeetingId);
    if (!meeting) {
      toast.error('Meeting not found');
      return;
    }

    setIsRunningOrchestrator(true);
    resetOrchestrator();
    setJobId(null);

    try {
      const { data, error } = await supabase.functions.invoke('agent-orchestrator', {
        body: {
          type: scenario.eventType,
          source: scenario.eventSource || 'manual',
          org_id: meeting.org_id,
          user_id: userId,
          payload: {
            meeting_id: meeting.id,
            title: meeting.title,
            transcript_available: true,
          },
        },
      });

      if (error) {
        // Extract real error message from FunctionsHttpError response body
        let errorMsg = error.message || 'Unknown error';
        try {
          if (error.context && typeof error.context.json === 'function') {
            const body = await error.context.json();
            errorMsg = body?.error || errorMsg;
          }
        } catch { /* ignore parse errors */ }
        throw new Error(errorMsg);
      }

      if (data?.error) {
        // Function returned 200 but with error in body
        toast.error('Orchestrator error', { description: data.error });
        return;
      }

      if (data?.job_id) {
        setJobId(data.job_id);
        toast.success('Orchestrator started', {
          description: `Job ID: ${data.job_id.slice(0, 8)}...`,
        });
      } else {
        toast.error('No job ID returned from orchestrator');
      }
    } catch (error: any) {
      console.error('Orchestrator error:', error);
      toast.error('Failed to start orchestrator', {
        description: error.message || 'Unknown error',
      });
    } finally {
      setIsRunningOrchestrator(false);
    }
  }, [selectedMeetingId, userId, recentMeetings, resetOrchestrator, scenario.eventType, scenario.eventSource]);

  // Stop playing when simulation completes
  useEffect(() => {
    if (simulation.isComplete) {
      setIsPlaying(false);
    }
  }, [simulation.isComplete]);

  // Reset simulation when scenario changes
  useEffect(() => {
    simulation.reset();
    setIsPlaying(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedScenario]);

  // Derive live context from selected meeting + step results
  const selectedMeeting = recentMeetings?.find(m => m.id === selectedMeetingId);

  const liveRecorderSource: 'fathom' | 'fireflies' | 'meetingbaas' | null = (() => {
    if (!selectedMeeting?.source_type) return null;
    if (selectedMeeting.source_type === 'fathom') return 'fathom';
    if (selectedMeeting.source_type === 'fireflies') return 'fireflies';
    return 'meetingbaas'; // '60_notetaker', 'voice', etc.
  })();

  const liveEventSource = liveRecorderSource === 'fathom' ? 'fathom-sync'
    : liveRecorderSource === 'fireflies' ? 'fireflies-sync'
    : 'edge:process-recording';

  const liveTrigger = selectedMeeting
    ? `${liveRecorderSource === 'fathom' ? 'Fathom' : liveRecorderSource === 'fireflies' ? 'Fireflies' : '60 Notetaker'} Recording: "${selectedMeeting.title}" completed`
    : scenario.trigger;

  const liveCallTypeResult = liveStepResults.find(
    r => r.skill_key === 'classify-call-type' && r.status === 'completed'
  )?.output;

  const liveCallType = liveCallTypeResult ? {
    name: liveCallTypeResult.call_type_name || 'Unknown',
    confidence: liveCallTypeResult.confidence || 0,
    isSales: liveCallTypeResult.is_sales ?? true,
  } : null;

  // In live mode, use actual meeting data; in simulate mode, use hardcoded scenario data
  const displayRecorderSource = mode === 'live' && selectedMeeting ? liveRecorderSource : scenario.recorderSource;
  const displayEventSource = mode === 'live' && selectedMeeting ? liveEventSource : scenario.eventSource;
  const displayTrigger = mode === 'live' && selectedMeeting ? liveTrigger : scenario.trigger;
  const displayCallType = mode === 'live' ? liveCallType : scenario.callType;

  // Show toast notifications when orchestrator completes/fails
  useEffect(() => {
    if (liveJobStatus === 'completed') {
      setIsRunningOrchestrator(false);
      toast.success('Orchestrator completed!', {
        description: `${liveStepResults.filter(s => s.status === 'completed').length} steps completed`,
      });
    } else if (liveJobStatus === 'failed') {
      setIsRunningOrchestrator(false);
      toast.error('Orchestrator failed');
    }
  }, [liveJobStatus, liveStepResults]);

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Proactive Agent v2</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Event-driven orchestrator with call type gating powering 8 autonomous workflows
            </p>
          </div>
        </div>
      </div>

      {/* Architecture Overview */}
      <Card className="border-dashed">
        <CardContent className="py-4">
          <div className="flex items-center gap-6 justify-center text-[13px] text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span>Fathom | Fireflies | MeetingBaaS</span>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-400" />
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-purple-500" />
              <span>Orchestrator</span>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-400" />
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan-500" />
              <span>Classify Call Type</span>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-400" />
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Skill Adapters</span>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-400" />
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span>HITL</span>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-400" />
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span>Actions</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mode Toggle */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Select a scenario to simulate:
        </div>
        <div className="flex items-center gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
          <button
            onClick={() => setMode('simulate')}
            className={cn(
              'px-3 py-1.5 rounded-md text-sm font-medium transition-all',
              mode === 'simulate'
                ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            )}
          >
            Simulate
          </button>
          <button
            onClick={() => setMode('live')}
            className={cn(
              'px-3 py-1.5 rounded-md text-sm font-medium transition-all',
              mode === 'live'
                ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            )}
          >
            Live
          </button>
        </div>
      </div>

      {/* Scenario Selector */}
      <div className="grid grid-cols-8 gap-3">
        {SCENARIOS.map((s) => {
          const Icon = s.icon;
          const isActive = s.id === selectedScenario;
          return (
            <button
              key={s.id}
              onClick={() => setSelectedScenario(s.id)}
              className={cn(
                'relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all',
                isActive
                  ? 'border-indigo-500 dark:border-indigo-400 bg-indigo-50/50 dark:bg-indigo-500/10 shadow-md'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50'
              )}
            >
              <div className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center bg-gradient-to-br',
                s.gradient,
              )}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <span className={cn(
                'text-[11px] font-medium text-center leading-tight',
                isActive ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-600 dark:text-gray-400'
              )}>
                {s.title}
              </span>
              {isActive && (
                <div className="absolute -bottom-px left-1/2 -translate-x-1/2 w-8 h-0.5 bg-indigo-500 rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* Scenario Detail */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left: Event + Steps */}
        <div className="col-span-4 space-y-4">
          {/* Event Card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                <CardTitle className="text-sm">Trigger Event</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-[10px]">{scenario.eventType}</Badge>
                  <Badge variant="outline" className="text-[10px]">{displayEventSource}</Badge>
                  {displayRecorderSource && (
                    <Badge variant="outline" className={cn(
                      'text-[10px]',
                      displayRecorderSource === 'fathom' ? 'border-violet-300 text-violet-600 dark:border-violet-500 dark:text-violet-400' :
                      displayRecorderSource === 'fireflies' ? 'border-orange-300 text-orange-600 dark:border-orange-500 dark:text-orange-400' :
                      'border-blue-300 text-blue-600 dark:border-blue-500 dark:text-blue-400'
                    )}>
                      {displayRecorderSource === 'meetingbaas' ? '60 Notetaker' :
                       displayRecorderSource.charAt(0).toUpperCase() + displayRecorderSource.slice(1)}
                    </Badge>
                  )}
                </div>
                <p className="text-[13px] text-gray-600 dark:text-gray-400">{displayTrigger}</p>
              </div>

              {/* Call Type Badge — from live step results or hardcoded scenario */}
              {displayCallType && (
                <div className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg border',
                  displayCallType.isSales
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30'
                    : 'bg-gray-50 dark:bg-gray-500/10 border-gray-200 dark:border-gray-500/30'
                )}>
                  <div className={cn(
                    'w-2 h-2 rounded-full',
                    displayCallType.isSales ? 'bg-emerald-500' : 'bg-gray-400'
                  )} />
                  <span className={cn(
                    'text-[12px] font-semibold',
                    displayCallType.isSales
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-gray-600 dark:text-gray-400'
                  )}>
                    {displayCallType.name}
                  </span>
                  <span className="text-[11px] text-gray-400">
                    {(displayCallType.confidence * 100).toFixed(0)}% confident
                  </span>
                  {!displayCallType.isSales && (
                    <Badge variant="secondary" className="text-[9px] ml-auto">Non-sales</Badge>
                  )}
                </div>
              )}

              {mode === 'simulate' ? (
                <div className="flex gap-2">
                  <Button
                    onClick={handlePlay}
                    disabled={isPlaying}
                    size="sm"
                    className="flex-1"
                    variant="default"
                  >
                    {isPlaying ? (
                      <>
                        <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                        Running...
                      </>
                    ) : (
                      <>
                        <Play className="w-3 h-3 mr-2" />
                        Run
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={handleReset}
                    disabled={isPlaying}
                    size="sm"
                    variant="outline"
                  >
                    Reset
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Meeting Picker */}
                  {loadingMeetings ? (
                    <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading meetings...
                    </div>
                  ) : !userId ? (
                    <div className="text-sm text-amber-600 dark:text-amber-400">
                      Please sign in to use live mode
                    </div>
                  ) : recentMeetings && recentMeetings.length > 0 ? (
                    <>
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          Select Meeting
                        </label>
                        <select
                          value={selectedMeetingId || ''}
                          onChange={(e) => setSelectedMeetingId(e.target.value || null)}
                          className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        >
                          <option value="">Select a meeting...</option>
                          {recentMeetings.map((meeting) => (
                            <option key={meeting.id} value={meeting.id}>
                              {meeting.title} - {new Date(meeting.meeting_start).toLocaleDateString()}
                            </option>
                          ))}
                        </select>
                      </div>
                      <Button
                        onClick={handleRunOrchestrator}
                        disabled={!selectedMeetingId || isRunningOrchestrator}
                        size="sm"
                        className="w-full"
                      >
                        {isRunningOrchestrator ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin mr-2" />
                            Starting...
                          </>
                        ) : (
                          <>
                            <Zap className="w-3 h-3 mr-2" />
                            Run Orchestrator
                          </>
                        )}
                      </Button>
                      {jobId && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Job: {jobId.slice(0, 8)}... (watching for updates)
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      No recent meetings with transcripts found
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Execution Steps */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-500" />
                <CardTitle className="text-sm">Execution Pipeline</CardTitle>
              </div>
              <CardDescription className="text-[12px]">
                Sequence steps for {scenario.eventType}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {mode === 'live' && liveStepResults.length > 0 ? (
                <>
                  <LiveStepVisualizer stepResults={liveStepResults} jobStatus={liveJobStatus} eventType={scenario.eventType} />
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="space-y-1">
                        <div className="text-xs text-gray-500 dark:text-gray-400">Status</div>
                        <div className={cn(
                          'text-sm font-bold capitalize',
                          liveJobStatus === 'completed' ? 'text-emerald-600 dark:text-emerald-400'
                            : liveJobStatus === 'failed' ? 'text-red-600 dark:text-red-400'
                            : 'text-blue-600 dark:text-blue-400'
                        )}>
                          {liveJobStatus || 'starting'}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-gray-500 dark:text-gray-400">Steps</div>
                        <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {liveStepResults.filter(r => r.status === 'completed').length}/{(SEQUENCE_STEPS[scenario.eventType] || SEQUENCE_STEPS.meeting_ended).length}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-gray-500 dark:text-gray-400">Results</div>
                        <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                          {liveStepResults.length}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <StepVisualizer
                    steps={scenario.steps}
                    runningStepIndex={simulation.runningStepIndex}
                    completedStepIndex={simulation.completedStepIndex}
                    stepTimers={simulation.stepTimers}
                    scenario={scenario}
                  />

                  {/* Execution Metrics */}
                  {(simulation.runningStepIndex >= 0 || simulation.completedStepIndex >= 0) && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="space-y-1">
                          <div className="text-xs text-gray-500 dark:text-gray-400">Duration</div>
                          <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                            {(simulation.totalElapsedMs / 1000).toFixed(1)}s
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-gray-500 dark:text-gray-400">Steps</div>
                          <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                            {simulation.completedStepIndex + 1}/{scenario.steps.length}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-gray-500 dark:text-gray-400">Approvals</div>
                          <div className="text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                            {scenario.steps.filter(s => s.delayMs === 0 && s.name.includes('HITL')).length}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Stats */}
          <Card>
            <CardContent className="py-3">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-lg font-bold text-gray-900 dark:text-white">
                    {scenario.steps.length}/{scenario.steps.length}
                  </div>
                  <div className="text-[10px] text-gray-500">Steps Done</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    {(scenario.steps.reduce((sum, s) => sum + s.delayMs, 0) / 1000).toFixed(1)}s
                  </div>
                  <div className="text-[10px] text-gray-500">Total Time</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-amber-600 dark:text-amber-400">
                    {scenario.steps.filter(s => s.delayMs === 0 && s.name.includes('HITL')).length}
                  </div>
                  <div className="text-[10px] text-gray-500">Approvals</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Slack / Email Preview */}
        <div className="col-span-8 space-y-4">
          {mode === 'live' ? (
            <LiveOutputPanel
              stepResults={liveStepResults}
              jobStatus={liveJobStatus}
              jobId={jobId}
              eventType={scenario.eventType}
            />
          ) : scenario.id === 'coaching' ? (
            <Tabs defaultValue="weekly">
              <TabsList>
                <TabsTrigger value="weekly">Weekly Digest</TabsTrigger>
                <TabsTrigger value="per-meeting">Per-Meeting Feedback</TabsTrigger>
              </TabsList>
              <TabsContent value="weekly" className="mt-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-[13px] text-gray-500 dark:text-gray-400">
                    <MessageSquare className="w-4 h-4" />
                    <span>Slack: #sales-coaching</span>
                  </div>
                  <SlackMessage
                    blocks={scenario.slackBlocks}
                    botName={scenario.botName}
                    timestamp={scenario.timestamp}
                    visibleBlocks={isPlaying || simulation.completedStepIndex >= 0 ? simulation.visibleBlocks : undefined}
                  />
                </div>
              </TabsContent>
              <TabsContent value="per-meeting" className="mt-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-[13px] text-gray-500 dark:text-gray-400">
                    <MessageSquare className="w-4 h-4" />
                    <span>Slack: DM from 60 Agent</span>
                  </div>
                  <SlackMessage
                    blocks={COACHING_PER_MEETING_BLOCKS}
                    botName="60 Agent"
                    timestamp="2:50 PM"
                    visibleBlocks={isPlaying || simulation.completedStepIndex >= 0 ? simulation.visibleBlocks : undefined}
                  />
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="space-y-4">
              {/* Channel header */}
              <div className="flex items-center gap-2 text-[13px] text-gray-500 dark:text-gray-400">
                <MessageSquare className="w-4 h-4" />
                <span>
                  Slack: {scenario.id === 'campaign' ? '#sales-campaigns' :
                          scenario.id === 'pre-meeting' ? 'DM from 60 Agent' :
                          '#sales-assistant'}
                </span>
              </div>

              {/* Slack message */}
              <SlackMessage
                blocks={scenario.slackBlocks}
                botName={scenario.botName}
                timestamp={scenario.timestamp}
                visibleBlocks={isPlaying || simulation.completedStepIndex >= 0 ? simulation.visibleBlocks : undefined}
              />

              {/* Call Type Confidence Badge (appears after classify-call-type step completes) */}
              {displayCallType && simulation.completedStepIndex >= 0 && (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.2 }}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-lg border',
                    displayCallType.isSales
                      ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30'
                      : 'bg-gray-50 dark:bg-gray-500/10 border-gray-200 dark:border-gray-500/30'
                  )}
                >
                  <span className={cn(
                    'font-semibold text-sm',
                    displayCallType.isSales ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-600 dark:text-gray-400'
                  )}>
                    {displayCallType.name}
                  </span>
                  <div className="flex-1 flex items-center gap-2">
                    <div className={cn(
                      'flex-1 h-2 rounded-full overflow-hidden',
                      displayCallType.isSales ? 'bg-emerald-200 dark:bg-emerald-500/20' : 'bg-gray-200 dark:bg-gray-500/20'
                    )}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${displayCallType.confidence * 100}%` }}
                        transition={{ duration: 1.2, ease: 'easeOut', delay: 0.4 }}
                        className={cn(
                          'h-full rounded-full',
                          displayCallType.isSales ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-gray-400 dark:bg-gray-500'
                        )}
                      />
                    </div>
                    <span className="text-sm text-gray-600 dark:text-gray-400 font-medium tabular-nums">
                      {(displayCallType.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </motion.div>
              )}

              {/* Email preview (if applicable) */}
              {scenario.emailPreview && (
                <>
                  <div className="flex items-center gap-2 text-[13px] text-gray-500 dark:text-gray-400 mt-6">
                    <Mail className="w-4 h-4" />
                    <span>Email that will be sent (after approval)</span>
                  </div>
                  <EmailPreview {...scenario.emailPreview} />
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer: System Architecture */}
      <Card className="bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700">
        <CardContent className="py-4">
          <div className="grid grid-cols-4 gap-6 text-[12px]">
            <div>
              <div className="font-semibold text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                Event Sources
              </div>
              <ul className="space-y-0.5 text-gray-500 dark:text-gray-400">
                <li>Fathom transcript sync</li>
                <li>Fireflies enrichment</li>
                <li>MeetingBaaS (60 Notetaker)</li>
                <li>Cron: morning + weekly</li>
                <li>Slack button actions</li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-blue-500" />
                Edge Functions (8 new)
              </div>
              <ul className="space-y-0.5 text-gray-500 dark:text-gray-400">
                <li>agent-orchestrator</li>
                <li>detect-intents</li>
                <li>find-available-slots</li>
                <li>create-calendar-event</li>
                <li>email-send-as-rep</li>
                <li>monitor-campaigns</li>
                <li>coaching-analysis</li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-purple-500" />
                Skill Adapters (20)
              </div>
              <ul className="space-y-0.5 text-gray-500 dark:text-gray-400">
                <li>Call type classifier</li>
                <li>Action items, next actions</li>
                <li>Intent detection, tasks</li>
                <li>Calendar, email send</li>
                <li>Proposal generation</li>
                <li>Campaign monitoring (4)</li>
                <li>Coaching analysis (5)</li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                HITL Channels
              </div>
              <ul className="space-y-0.5 text-gray-500 dark:text-gray-400">
                <li>Slack interactive messages</li>
                <li>6 handler modules</li>
                <li>30-second send countdown</li>
                <li>Edit-in-app deep links</li>
                <li>Approval/reject/skip flows</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
