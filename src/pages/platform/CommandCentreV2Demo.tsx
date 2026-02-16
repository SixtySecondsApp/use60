import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, Circle, Clock, Sparkles, Send, Mail, FileText, Phone,
  Search, ChevronDown, ChevronRight, Building2, CalendarClock, AlertTriangle,
  Bot, Eye, Pencil, X, MoreHorizontal, Filter, Zap, Brain,
  MessageSquare, Target, Loader2, Check,
  RefreshCw, BellRing, Inbox, ListFilter, Calendar,
  ArrowRight, Flame, Lightbulb, FileSearch,
  ThumbsUp, CornerDownLeft, Bold, Italic, Link, List, ListOrdered,
  AtSign, Paperclip, Image, ChevronUp, Hash, Minus, Plus,
  ExternalLink, Copy, Archive, Flag, Tag, UserCircle, Activity,
  MessageCircle, ArrowUp, PanelLeftClose, PanelLeft, PanelRightClose, PanelRight,
  Play, Video, Mic, Users, Globe, Linkedin, TrendingUp,
  Slash, FileEdit, Briefcase, LayoutList, GripVertical, Wand2
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

// ============================================================
// TYPES
// ============================================================

type TaskStatus = 'pending_review' | 'ai_working' | 'draft_ready' | 'in_progress' | 'pending' | 'completed' | 'dismissed';
type TaskType = 'email' | 'follow_up' | 'research' | 'meeting_prep' | 'crm_update' | 'proposal' | 'call' | 'content' | 'alert' | 'insight';
type Priority = 'urgent' | 'high' | 'medium' | 'low';
type RiskLevel = 'low' | 'medium' | 'high' | 'info';
type Source = 'ai_proactive' | 'meeting_transcript' | 'meeting_ai' | 'email_detected' | 'deal_signal' | 'calendar_trigger' | 'copilot' | 'manual';
type ContextTab = 'meeting' | 'contact' | 'activity' | 'related';

interface Comment {
  id: string;
  author: string;
  avatar?: string;
  content: string;
  timestamp: string;
  isAI?: boolean;
}

interface SubTask {
  id: string;
  title: string;
  completed: boolean;
}

interface MeetingContext {
  title: string;
  date: string;
  duration: string;
  recording_url?: string;
  summary: string;
  highlights: string[];
  attendees: { name: string; role: string; company: string }[];
}

interface ContactContext {
  name: string;
  title: string;
  company: string;
  email: string;
  phone?: string;
  linkedin?: string;
  last_contacted: string;
  relationship_score: number;
  notes: string;
}

interface RelatedItem {
  type: 'task' | 'deal' | 'meeting';
  title: string;
  status: string;
  date?: string;
}

interface MockTask {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  task_type: TaskType;
  priority: Priority;
  risk_level: RiskLevel;
  source: Source;
  confidence_score: number;
  reasoning?: string;
  due_date?: string;
  company?: string;
  contact_name?: string;
  contact_email?: string;
  deal_name?: string;
  deal_value?: string;
  deal_stage?: string;
  deliverable_type?: string;
  deliverable_content?: string;
  ai_status: string;
  created_at: string;
  completed_at?: string;
  subtasks?: SubTask[];
  parent_task_id?: string;
  comments?: Comment[];
  activity?: { action: string; timestamp: string; actor: string }[];
  meeting_context?: MeetingContext;
  contact_context?: ContactContext;
  related_items?: RelatedItem[];
}

// ============================================================
// MOCK DATA
// ============================================================

const MOCK_TASKS: MockTask[] = [
  {
    id: '1',
    title: 'Draft follow-up email to Sarah Chen',
    description: 'Post-demo follow-up with pricing details and ROI calculator attached',
    status: 'draft_ready',
    task_type: 'email',
    priority: 'high',
    risk_level: 'high',
    source: 'meeting_ai',
    confidence_score: 0.94,
    reasoning: 'Sarah expressed strong interest in pricing during the demo. She asked about enterprise tiers twice and requested the SOC 2 report.',
    due_date: '2026-02-16',
    company: 'Acme Corp',
    contact_name: 'Sarah Chen',
    contact_email: 'sarah.chen@acmecorp.com',
    deal_name: 'Acme Corp — Enterprise',
    deal_value: '$72K ARR',
    deal_stage: 'Negotiation',
    deliverable_type: 'email_draft',
    deliverable_content: `Hi Sarah,

Thank you for taking the time to see the platform in action today. Based on our conversation about scaling your team's outreach, I wanted to share a few things:

**Enterprise Pricing**
I've attached our enterprise tier breakdown — the plan that includes the AI copilot and unlimited sequences would be the best fit for your 12-person team.

| Plan | Price | Seats | Features |
|------|-------|-------|----------|
| Growth | $49/seat/mo | Up to 10 | Core CRM + Sequences |
| **Enterprise** | **$99/seat/mo** | **Unlimited** | **AI Copilot + Custom Integrations** |
| Custom | Let's talk | Unlimited | White-glove onboarding |

**ROI Projection**
Based on the numbers you shared (450 leads/month, 2.3% current conversion), our model projects:

- **3.4x improvement** in qualified pipeline within 90 days
- **$180K additional revenue** in the first year
- **12 hours/week saved** per rep on manual data entry

**Security**
I know your IT team needs to review our SOC 2 Type II report — I've attached it along with our data processing agreement.

---

Would Thursday at 2pm work for a follow-up call with your VP of Sales? I'd love to walk through the implementation timeline together.

Best,
Alex`,
    ai_status: 'draft_ready',
    created_at: '2026-02-16T10:30:00Z',
    subtasks: [
      { id: 's1', title: 'Attach enterprise pricing PDF', completed: true },
      { id: 's2', title: 'Attach SOC 2 Type II report', completed: true },
      { id: 's3', title: 'Review email tone & accuracy', completed: false },
      { id: 's4', title: 'Send email', completed: false },
    ],
    comments: [
      {
        id: 'c1',
        author: 'AI Copilot',
        content: 'I pulled pricing from the latest rate card and ROI numbers from the meeting transcript. Sarah mentioned the 12-person team size at 14:32 in the recording.',
        timestamp: '2026-02-16T10:30:00Z',
        isAI: true,
      },
      {
        id: 'c2',
        author: 'AI Copilot',
        content: 'Note: Sarah asked about HIPAA compliance but we don\'t have a BAA ready yet. I left that out of the email — you may want to address it separately.',
        timestamp: '2026-02-16T10:30:05Z',
        isAI: true,
      },
    ],
    activity: [
      { action: 'Task created from meeting transcript', timestamp: '2026-02-16T10:30:00Z', actor: 'AI' },
      { action: 'Email draft generated', timestamp: '2026-02-16T10:30:03Z', actor: 'AI' },
      { action: 'Attached: enterprise-pricing.pdf', timestamp: '2026-02-16T10:30:04Z', actor: 'AI' },
      { action: 'Attached: SOC2-Type-II-Report.pdf', timestamp: '2026-02-16T10:30:04Z', actor: 'AI' },
    ],
    meeting_context: {
      title: 'Acme Corp — Product Demo',
      date: '2026-02-16T09:00:00Z',
      duration: '45 min',
      recording_url: '#',
      summary: 'Product demo with Sarah Chen (VP Sales) and team. Strong interest in enterprise features, particularly AI copilot and custom integrations. Sarah asked about pricing twice and requested SOC 2 documentation. Key concern: HIPAA compliance for healthcare vertical clients.',
      highlights: [
        'Sarah asked about enterprise pricing tiers (14:32)',
        'Requested SOC 2 Type II report for IT review (22:15)',
        'Mentioned 12-person SDR team as initial rollout (8:45)',
        'Asked about HIPAA compliance — no BAA available yet (35:10)',
        'Wants to include VP of Sales in next call (41:20)',
      ],
      attendees: [
        { name: 'Sarah Chen', role: 'VP of Sales', company: 'Acme Corp' },
        { name: 'Tom Bradley', role: 'Sales Manager', company: 'Acme Corp' },
        { name: 'Alex (You)', role: 'Account Executive', company: '60' },
      ],
    },
    contact_context: {
      name: 'Sarah Chen',
      title: 'VP of Sales',
      company: 'Acme Corp',
      email: 'sarah.chen@acmecorp.com',
      phone: '+1 (415) 555-0142',
      linkedin: 'linkedin.com/in/sarahchen',
      last_contacted: '2026-02-16',
      relationship_score: 78,
      notes: 'Strong champion. Decision-maker for sales tools. Reports to CRO. Budget approved for Q1.',
    },
    related_items: [
      { type: 'deal', title: 'Acme Corp — Enterprise ($72K ARR)', status: 'Negotiation' },
      { type: 'task', title: 'Update deal stage: Acme Corp → Negotiation', status: 'Pending Review' },
      { type: 'task', title: 'Log Acme Corp demo in CRM', status: 'Completed' },
      { type: 'meeting', title: 'Acme Corp — Product Demo', status: 'Today, 9:00 AM', date: '2026-02-16' },
    ],
  },
  {
    id: '2',
    title: 'Prep brief for GlobalTech strategy call',
    description: 'Compile attendee intel, deal history, and risk assessment before tomorrow\'s call',
    status: 'ai_working',
    task_type: 'meeting_prep',
    priority: 'high',
    risk_level: 'low',
    source: 'calendar_trigger',
    confidence_score: 0.98,
    reasoning: 'Meeting with GlobalTech leadership in 22 hours. 3 attendees identified.',
    due_date: '2026-02-17',
    company: 'GlobalTech',
    contact_name: 'Mike Rodriguez',
    deal_name: 'GlobalTech — Platform Migration',
    deal_value: '$66K ARR',
    deal_stage: 'Proposal',
    deliverable_type: 'meeting_prep',
    deliverable_content: `# Meeting Prep: GlobalTech Strategy Call

**Date:** Monday, Feb 17 at 10:00 AM
**Duration:** 45 minutes
**Location:** Zoom (link in calendar)

---

## Attendees

| Name | Title | Notes |
|------|-------|-------|
| **Mike Rodriguez** | VP of Revenue Ops | Primary champion. Pushed for this internally. |
| **Karen Liu** | CFO | Decision maker. Focused on ROI and payback period. |
| **James Park** | IT Director | Security gatekeeper. Will ask about SSO and data residency. |

## Deal Context

- **Stage:** Proposal (since Feb 3)
- **Value:** $66K ARR (50 seats x $110/mo)
- **Competition:** Evaluating HubSpot Sales Hub and Outreach
- **Timeline:** Decision by end of Q1

## Key Risks

> _Generating risk assessment..._

## Talking Points

> _Compiling from previous meeting notes..._

## Open Questions from Last Meeting

> _Extracting from transcript..._`,
    ai_status: 'working',
    created_at: '2026-02-16T08:00:00Z',
    subtasks: [
      { id: 's5', title: 'Compile attendee profiles', completed: true },
      { id: 's6', title: 'Summarize deal history', completed: true },
      { id: 's7', title: 'Generate risk assessment', completed: false },
      { id: 's8', title: 'Extract open questions from transcripts', completed: false },
      { id: 's9', title: 'Build talking points', completed: false },
      { id: 's10', title: 'Create one-page brief', completed: false },
    ],
    comments: [
      {
        id: 'c3',
        author: 'AI Copilot',
        content: 'I\'m pulling data from 3 previous meetings with GlobalTech, their LinkedIn profiles, and recent news. The risk assessment and talking points sections are still generating.',
        timestamp: '2026-02-16T08:00:10Z',
        isAI: true,
      },
    ],
    activity: [
      { action: 'Task auto-created from calendar event', timestamp: '2026-02-16T08:00:00Z', actor: 'AI' },
      { action: 'Attendee profiles compiled', timestamp: '2026-02-16T08:00:05Z', actor: 'AI' },
      { action: 'Deal context assembled', timestamp: '2026-02-16T08:00:08Z', actor: 'AI' },
      { action: 'Generating risk assessment...', timestamp: '2026-02-16T08:00:10Z', actor: 'AI' },
    ],
    contact_context: {
      name: 'Mike Rodriguez',
      title: 'VP of Revenue Ops',
      company: 'GlobalTech',
      email: 'mike.rodriguez@globaltech.io',
      phone: '+1 (312) 555-0198',
      linkedin: 'linkedin.com/in/mikerodriguez',
      last_contacted: '2026-02-10',
      relationship_score: 65,
      notes: 'Internal champion. Pushing for our platform over HubSpot. Needs help building the business case for Karen (CFO).',
    },
    related_items: [
      { type: 'deal', title: 'GlobalTech — Platform Migration ($66K ARR)', status: 'Proposal' },
      { type: 'task', title: 'Send pricing document to Mike at GlobalTech', status: 'Draft Ready' },
      { type: 'meeting', title: 'GlobalTech Strategy Call', status: 'Tomorrow, 10:00 AM', date: '2026-02-17' },
    ],
  },
  {
    id: '3',
    title: 'Update deal stage: Acme Corp → Negotiation',
    description: 'Deal signals indicate progression — demo completed, pricing requested, security review initiated',
    status: 'pending_review',
    task_type: 'crm_update',
    priority: 'medium',
    risk_level: 'low',
    source: 'deal_signal',
    confidence_score: 0.91,
    reasoning: '3 buying signals detected: pricing request, security doc request, VP meeting invite.',
    company: 'Acme Corp',
    deal_name: 'Acme Corp — Enterprise',
    deal_value: '$72K ARR',
    deal_stage: 'Proposal → Negotiation',
    deliverable_type: 'crm_update',
    deliverable_content: `# CRM Update: Deal Stage Change

**Deal:** Acme Corp — Enterprise
**Change:** Proposal → **Negotiation**

---

## Signals Detected

1. **Pricing Requested** — Sarah asked for enterprise tier breakdown during demo (Feb 16)
2. **Security Review Initiated** — SOC 2 Type II report requested for IT team review
3. **VP Meeting Requested** — Sarah wants to include VP of Sales in next call

## Impact

- Pipeline stage distribution will update
- Forecast confidence for this deal increases to **75%**
- Next stage-appropriate tasks will be triggered (send contract template, schedule legal review)

## Confidence: 91%

This is a standard progression pattern. All three signals align with your historical win data for deals moving to Negotiation.`,
    ai_status: 'draft_ready',
    created_at: '2026-02-16T10:45:00Z',
    parent_task_id: '1',
    comments: [],
    activity: [
      { action: 'Stage change detected from 3 signals', timestamp: '2026-02-16T10:45:00Z', actor: 'AI' },
    ],
    related_items: [
      { type: 'deal', title: 'Acme Corp — Enterprise ($72K ARR)', status: 'Proposal → Negotiation' },
      { type: 'task', title: 'Draft follow-up email to Sarah Chen', status: 'Draft Ready' },
    ],
  },
  {
    id: '4',
    title: 'Send pricing document to Mike at GlobalTech',
    description: 'Mike requested updated pricing with volume discounts during last call',
    status: 'draft_ready',
    task_type: 'email',
    priority: 'high',
    risk_level: 'high',
    source: 'meeting_transcript',
    confidence_score: 0.88,
    reasoning: 'Commitment detected: "Can you send over the updated pricing with volume discounts?"',
    due_date: '2026-02-16',
    company: 'GlobalTech',
    contact_name: 'Mike Rodriguez',
    contact_email: 'mike.rodriguez@globaltech.io',
    deal_name: 'GlobalTech — Platform Migration',
    deal_value: '$66K ARR',
    deal_stage: 'Proposal',
    deliverable_type: 'email_draft',
    deliverable_content: `Hi Mike,

As promised, here's the updated pricing with the volume discounts we discussed for your 50-seat rollout:

## Volume Pricing

| Plan | Standard | 50+ Seats (Your Price) | Savings |
|------|----------|----------------------|---------|
| Growth | $89/seat/mo | **$79/seat/mo** | 15% off |
| Enterprise | $149/seat/mo | **$129/seat/mo** | 20% off |
| Custom | Custom | **Let's discuss** | — |

The **Enterprise plan** includes the dedicated CSM and custom Salesforce integration your team needs for the migration.

## What's Included at Enterprise

- Unlimited AI sequences
- Custom API integrations (Salesforce, HubSpot)
- Dedicated Customer Success Manager
- SSO / SAML authentication
- Priority support (4-hour SLA)
- Custom onboarding for your team

I've also attached a comparison matrix showing how we stack up against the other tools you're evaluating.

Let me know if you have any questions before Thursday's call with Karen and James.

Best,
Alex`,
    ai_status: 'draft_ready',
    created_at: '2026-02-16T09:15:00Z',
    comments: [
      {
        id: 'c4',
        author: 'AI Copilot',
        content: 'I used the latest volume pricing from the rate card. The 20% enterprise discount matches what was approved for deals over 40 seats. Karen (CFO) will be on Thursday\'s call — she\'ll likely focus on the per-seat cost.',
        timestamp: '2026-02-16T09:15:05Z',
        isAI: true,
      },
    ],
    activity: [
      { action: 'Commitment detected in meeting transcript', timestamp: '2026-02-16T09:15:00Z', actor: 'AI' },
      { action: 'Email draft generated with volume pricing', timestamp: '2026-02-16T09:15:03Z', actor: 'AI' },
    ],
    contact_context: {
      name: 'Mike Rodriguez',
      title: 'VP of Revenue Ops',
      company: 'GlobalTech',
      email: 'mike.rodriguez@globaltech.io',
      phone: '+1 (312) 555-0198',
      linkedin: 'linkedin.com/in/mikerodriguez',
      last_contacted: '2026-02-10',
      relationship_score: 65,
      notes: 'Internal champion. Pushing for our platform over HubSpot.',
    },
  },
  {
    id: '5',
    title: 'Research BrightWave Inc before Friday call',
    description: 'New inbound lead — VP of Revenue Ops requested a demo',
    status: 'ai_working',
    task_type: 'research',
    priority: 'medium',
    risk_level: 'low',
    source: 'calendar_trigger',
    confidence_score: 0.96,
    due_date: '2026-02-20',
    company: 'BrightWave Inc',
    contact_name: 'Lisa Park',
    deal_name: 'BrightWave — New Opportunity',
    deal_value: 'TBD',
    deal_stage: 'Discovery',
    deliverable_type: 'research_brief',
    deliverable_content: `# Company Intel: BrightWave Inc

> _Research in progress — 2 of 5 sections complete_

---

## Company Overview

| Field | Value |
|-------|-------|
| **Founded** | 2019 |
| **HQ** | Austin, TX |
| **Employees** | 85-120 (LinkedIn) |
| **Industry** | B2B SaaS — Marketing Automation |
| **Funding** | Series B ($28M, led by Sequoia Scout) |
| **Revenue** | Est. $8-12M ARR |

## Key People

| Name | Title |
|------|-------|
| **Lisa Park** | VP Revenue Ops |
| **Ryan Torres** | CEO & Co-founder |
| **Aisha Patel** | CTO |

## Tech Stack (Detected)

> _Scanning..._

## Recent News

> _Searching..._

## Competitive Landscape

> _Analyzing..._`,
    ai_status: 'working',
    created_at: '2026-02-16T08:00:00Z',
    subtasks: [
      { id: 's11', title: 'Company overview', completed: true },
      { id: 's12', title: 'Key people profiles', completed: true },
      { id: 's13', title: 'Tech stack detection', completed: false },
      { id: 's14', title: 'Recent news & events', completed: false },
      { id: 's15', title: 'Competitive landscape', completed: false },
    ],
    comments: [],
    activity: [
      { action: 'Research initiated for Friday demo call', timestamp: '2026-02-16T08:00:00Z', actor: 'AI' },
      { action: 'Company overview compiled', timestamp: '2026-02-16T08:01:00Z', actor: 'AI' },
      { action: 'Key people identified', timestamp: '2026-02-16T08:01:30Z', actor: 'AI' },
    ],
  },
  {
    id: '6',
    title: 'Re-engage Jen Walker at TechFlow',
    description: 'No activity in 18 days — deal at risk of going cold. $48K ARR at stake.',
    status: 'pending_review',
    task_type: 'follow_up',
    priority: 'urgent',
    risk_level: 'medium',
    source: 'ai_proactive',
    confidence_score: 0.82,
    reasoning: 'Deal has had no activity for 18 days. Last interaction was a positive demo. Historical data shows deals that go 21+ days without contact have a 73% drop-off rate.',
    due_date: '2026-02-14',
    company: 'TechFlow',
    contact_name: 'Jen Walker',
    deal_name: 'TechFlow — Growth Plan',
    deal_value: '$48K ARR',
    deal_stage: 'Demo',
    ai_status: 'none',
    created_at: '2026-02-16T07:00:00Z',
    deliverable_type: 'action_plan',
    deliverable_content: `# Re-engagement Plan: TechFlow

**Deal:** TechFlow — Growth Plan
**Value:** $48K ARR
**Risk Level:** High (18 days stale)

---

## Why This Matters

Your historical win data shows:
- Deals with **<14 days** between touches: **68% win rate**
- Deals with **14-21 days** gap: **41% win rate**
- Deals with **>21 days** gap: **27% win rate**

TechFlow is at **18 days** — we're in the danger zone but still recoverable.

## Recommended Actions

### Option A: Warm Call (Recommended)
Call Jen directly. Your call-to-email response ratio for stale deals is **3.2x higher**.

**Suggested opener:** "Hey Jen, I realized I dropped the ball on following up after our demo — wanted to check in."

### Option B: Value-Add Email
Send a relevant case study or new feature update to re-open the conversation without pressure.

### Option C: Multi-Thread
Reach out to another stakeholder at TechFlow to create a second entry point.`,
    subtasks: [
      { id: 's16', title: 'Choose re-engagement approach', completed: false },
      { id: 's17', title: 'Draft outreach (call script or email)', completed: false },
      { id: 's18', title: 'Execute outreach', completed: false },
    ],
    comments: [
      {
        id: 'c5',
        author: 'AI Copilot',
        content: 'I flagged this because your pipeline data shows TechFlow is approaching the 21-day drop-off cliff. A call is statistically your best move here — want me to draft a call script?',
        timestamp: '2026-02-16T07:00:05Z',
        isAI: true,
      },
    ],
    activity: [
      { action: 'Deal stale alert triggered (18 days)', timestamp: '2026-02-16T07:00:00Z', actor: 'AI' },
      { action: 'Re-engagement plan generated', timestamp: '2026-02-16T07:00:03Z', actor: 'AI' },
    ],
    contact_context: {
      name: 'Jen Walker',
      title: 'Head of Sales Development',
      company: 'TechFlow',
      email: 'jen.walker@techflow.io',
      phone: '+1 (650) 555-0177',
      linkedin: 'linkedin.com/in/jenwalker',
      last_contacted: '2026-01-29',
      relationship_score: 42,
      notes: 'Interested after demo but went silent. Likely evaluating competitors. Budget cycle ends March.',
    },
  },
  {
    id: '7',
    title: 'Draft proposal for NovaStar partnership',
    description: 'Custom integration proposal based on requirements from Tuesday meeting',
    status: 'in_progress',
    task_type: 'proposal',
    priority: 'high',
    risk_level: 'medium',
    source: 'manual',
    confidence_score: 1.0,
    due_date: '2026-02-19',
    company: 'NovaStar',
    contact_name: 'David Kim',
    deal_name: 'NovaStar — Custom Integration',
    deal_value: '$95K ARR',
    deal_stage: 'Proposal',
    ai_status: 'none',
    created_at: '2026-02-15T14:00:00Z',
    subtasks: [
      { id: 's19', title: 'Gather requirements from transcript', completed: true },
      { id: 's20', title: 'Draft technical scope', completed: false },
      { id: 's21', title: 'Build pricing model', completed: false },
    ],
    comments: [],
    activity: [
      { action: 'Task created manually', timestamp: '2026-02-15T14:00:00Z', actor: 'You' },
      { action: 'Subtask completed: Requirements gathered', timestamp: '2026-02-15T16:00:00Z', actor: 'You' },
    ],
  },
  {
    id: '8',
    title: 'Log Acme Corp demo in CRM',
    status: 'completed',
    task_type: 'crm_update',
    priority: 'low',
    risk_level: 'low',
    source: 'meeting_ai',
    confidence_score: 0.99,
    company: 'Acme Corp',
    deal_name: 'Acme Corp — Enterprise',
    ai_status: 'executed',
    created_at: '2026-02-16T10:32:00Z',
    completed_at: '2026-02-16T10:32:05Z',
    parent_task_id: '1',
    comments: [],
    activity: [
      { action: 'Auto-logged: Demo activity recorded', timestamp: '2026-02-16T10:32:05Z', actor: 'AI' },
    ],
  },
  {
    id: '9',
    title: 'Share meeting recording with Sarah Chen',
    status: 'completed',
    task_type: 'email',
    priority: 'low',
    risk_level: 'low',
    source: 'meeting_ai',
    confidence_score: 0.95,
    company: 'Acme Corp',
    contact_name: 'Sarah Chen',
    ai_status: 'executed',
    created_at: '2026-02-16T10:35:00Z',
    completed_at: '2026-02-16T10:36:00Z',
    parent_task_id: '1',
    comments: [],
    activity: [
      { action: 'Recording shared via email', timestamp: '2026-02-16T10:36:00Z', actor: 'AI' },
    ],
  },
  {
    id: '10',
    title: 'Pipeline health: 3 deals closing this month',
    description: 'Combined pipeline value: $186K ARR. Two deals need attention.',
    status: 'pending_review',
    task_type: 'insight',
    priority: 'medium',
    risk_level: 'info',
    source: 'ai_proactive',
    confidence_score: 0.90,
    reasoning: 'Monthly pipeline review.',
    ai_status: 'none',
    created_at: '2026-02-16T07:00:00Z',
    deliverable_type: 'insight',
    deliverable_content: `# Pipeline Health — February 2026

**Total Pipeline Value:** $186K ARR
**Deals Closing This Month:** 3

---

## Deal Breakdown

| Deal | Value | Stage | Health | Risk |
|------|-------|-------|--------|------|
| Acme Corp — Enterprise | $72K | Negotiation | On Track | Low |
| GlobalTech — Migration | $66K | Proposal | Needs Attention | Medium |
| TechFlow — Growth | $48K | Demo | At Risk | High |

## Key Observations

- **Acme Corp** is progressing well — pricing and security docs shared, VP meeting scheduled
- **GlobalTech** needs pricing approval from CFO Karen Liu before Thursday
- **TechFlow** is 18 days stale — immediate re-engagement recommended

## Forecast

Based on current signals:
- **Best case:** $186K (all three close)
- **Expected:** $138K (Acme + GlobalTech)
- **Worst case:** $72K (Acme only)`,
    comments: [],
    activity: [
      { action: 'Daily pipeline analysis completed', timestamp: '2026-02-16T07:00:00Z', actor: 'AI' },
    ],
  },
];

// ============================================================
// SLASH COMMAND DATA
// ============================================================

const SLASH_COMMANDS = [
  { id: 'email', label: '/email', description: 'Draft an email from task context', icon: Mail, color: 'text-blue-500' },
  { id: 'proposal', label: '/proposal', description: 'Generate a proposal or SOW', icon: FileText, color: 'text-amber-500' },
  { id: 'research', label: '/research', description: 'Deep research on a company or contact', icon: FileSearch, color: 'text-cyan-500' },
  { id: 'followup', label: '/follow-up', description: 'Draft a follow-up based on history', icon: RefreshCw, color: 'text-purple-500' },
  { id: 'call-prep', label: '/call-prep', description: 'Generate a call script with objection handling', icon: Phone, color: 'text-green-500' },
  { id: 'summarize', label: '/summarize', description: 'Summarize meeting or activity history', icon: FileEdit, color: 'text-indigo-500' },
];

// ============================================================
// CONFIG
// ============================================================

const priorityConfig: Record<Priority, { color: string; dotColor: string; label: string }> = {
  urgent: { color: 'text-red-600 dark:text-red-400', dotColor: 'bg-red-500', label: 'Urgent' },
  high: { color: 'text-orange-600 dark:text-orange-400', dotColor: 'bg-orange-500', label: 'High' },
  medium: { color: 'text-blue-600 dark:text-blue-400', dotColor: 'bg-blue-500', label: 'Medium' },
  low: { color: 'text-slate-500 dark:text-slate-400', dotColor: 'bg-slate-400', label: 'Low' },
};

const typeConfig: Record<TaskType, { icon: typeof Mail; label: string; color: string; bg: string }> = {
  email: { icon: Mail, label: 'Email', color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-500/10' },
  follow_up: { icon: RefreshCw, label: 'Follow-up', color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-500/10' },
  research: { icon: FileSearch, label: 'Research', color: 'text-cyan-500', bg: 'bg-cyan-50 dark:bg-cyan-500/10' },
  meeting_prep: { icon: CalendarClock, label: 'Meeting Prep', color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-500/10' },
  crm_update: { icon: Target, label: 'CRM Update', color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
  proposal: { icon: FileText, label: 'Proposal', color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10' },
  call: { icon: Phone, label: 'Call', color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-500/10' },
  content: { icon: Pencil, label: 'Content', color: 'text-pink-500', bg: 'bg-pink-50 dark:bg-pink-500/10' },
  alert: { icon: BellRing, label: 'Alert', color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-500/10' },
  insight: { icon: Lightbulb, label: 'Insight', color: 'text-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-500/10' },
};

// ============================================================
// SIDEBAR TASK ITEM
// ============================================================

function SidebarTaskItem({ task, isSelected, onClick, childCount }: {
  task: MockTask;
  isSelected: boolean;
  onClick: () => void;
  childCount?: number;
}) {
  const TypeIcon = typeConfig[task.task_type].icon;
  const isCompleted = task.status === 'completed';
  const isDraftReady = task.ai_status === 'draft_ready';
  const isAIWorking = task.ai_status === 'working';
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && !isCompleted;

  const dueLabel = (() => {
    if (!task.due_date) return null;
    const d = new Date(task.due_date);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = Math.round((dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (isCompleted) return null;
    if (diff < 0) return `${Math.abs(diff)}d overdue`;
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  })();

  return (
    <motion.button
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2.5 rounded-lg transition-all relative group',
        isSelected
          ? 'bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20'
          : 'hover:bg-slate-50 dark:hover:bg-gray-800/40 border border-transparent',
        isCompleted && 'opacity-50',
      )}
      whileTap={{ scale: 0.99 }}
    >
      {/* Priority dot */}
      <div className={cn('absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full transition-opacity',
        priorityConfig[task.priority].dotColor,
        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-50',
      )} />

      <div className="flex items-start gap-2.5">
        {/* Status indicator */}
        <div className="pt-0.5 shrink-0">
          {isCompleted ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : isAIWorking ? (
            <Loader2 className="h-4 w-4 text-violet-500 animate-spin" />
          ) : isDraftReady ? (
            <Sparkles className="h-4 w-4 text-emerald-500" />
          ) : (
            <Circle className="h-4 w-4 text-slate-300 dark:text-slate-600" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Title */}
          <div className={cn(
            'text-[13px] font-medium leading-tight line-clamp-2',
            isSelected ? 'text-blue-900 dark:text-blue-200' : 'text-slate-700 dark:text-gray-300',
            isCompleted && 'line-through text-slate-400 dark:text-gray-500',
          )}>
            {task.title}
          </div>

          {/* Meta */}
          <div className="flex items-center gap-1.5 mt-1">
            <TypeIcon className={cn('h-3 w-3', typeConfig[task.task_type].color)} />
            {task.company && (
              <span className="text-[11px] text-slate-500 dark:text-gray-400 truncate">
                {task.company}
              </span>
            )}
            <span className="text-slate-300 dark:text-gray-600">·</span>
            {dueLabel && (
              <span className={cn('text-[11px]',
                isOverdue ? 'text-red-500 font-medium' : 'text-slate-400 dark:text-gray-500'
              )}>
                {dueLabel}
              </span>
            )}
          </div>

          {/* AI status + child tasks */}
          <div className="flex items-center gap-1.5 mt-1.5">
            {isDraftReady && (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/50 dark:border-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                <Sparkles className="h-2.5 w-2.5" /> Draft ready
              </span>
            )}
            {isAIWorking && (
              <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 dark:bg-violet-500/10 border border-violet-200/50 dark:border-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400">
                <Loader2 className="h-2.5 w-2.5 animate-spin" /> Working
              </span>
            )}
            {childCount && childCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 dark:text-gray-500">
                <LayoutList className="h-2.5 w-2.5" /> {childCount} sub-tasks
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.button>
  );
}

// ============================================================
// SLASH COMMAND DROPDOWN
// ============================================================

function SlashCommandDropdown({ onSelect, onClose, filter }: {
  onSelect: (cmd: typeof SLASH_COMMANDS[0]) => void;
  onClose: () => void;
  filter: string;
}) {
  const filtered = SLASH_COMMANDS.filter(c =>
    c.label.toLowerCase().includes(filter.toLowerCase()) ||
    c.description.toLowerCase().includes(filter.toLowerCase())
  );
  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => {
    setSelectedIdx(0);
  }, [filter]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx(i => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && filtered[selectedIdx]) {
        e.preventDefault();
        onSelect(filtered[selectedIdx]);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [filtered, selectedIdx, onSelect, onClose]);

  if (filtered.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      className="absolute bottom-full left-0 mb-2 w-72 rounded-xl border border-slate-200 dark:border-gray-700/50 bg-white dark:bg-gray-900 shadow-xl z-50 overflow-hidden"
    >
      <div className="px-3 py-2 border-b border-slate-100 dark:border-gray-800">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-gray-500">AI Commands</span>
      </div>
      <div className="py-1">
        {filtered.map((cmd, i) => (
          <button
            key={cmd.id}
            onClick={() => onSelect(cmd)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
              i === selectedIdx ? 'bg-blue-50 dark:bg-blue-500/10' : 'hover:bg-slate-50 dark:hover:bg-gray-800/50'
            )}
          >
            <div className={cn('flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 dark:bg-gray-800', cmd.color)}>
              <cmd.icon className="h-3.5 w-3.5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-700 dark:text-gray-300">{cmd.label}</div>
              <div className="text-[11px] text-slate-400 dark:text-gray-500">{cmd.description}</div>
            </div>
          </button>
        ))}
      </div>
    </motion.div>
  );
}

// ============================================================
// WRITING CANVAS
// ============================================================

function WritingCanvas({ task, onDoThis }: {
  task: MockTask;
  onDoThis: () => void;
}) {
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [isAIDoing, setIsAIDoing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleCanvasKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === '/' && !showSlashMenu) {
      setShowSlashMenu(true);
      setSlashFilter('');
    } else if (showSlashMenu) {
      if (e.key === 'Escape') {
        setShowSlashMenu(false);
      }
    }
  };

  const handleCanvasInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const lastSlashIdx = val.lastIndexOf('/');
    if (showSlashMenu && lastSlashIdx >= 0) {
      setSlashFilter(val.slice(lastSlashIdx));
    }
  };

  const handleSlashSelect = (cmd: typeof SLASH_COMMANDS[0]) => {
    setShowSlashMenu(false);
    // Simulate AI action
    setIsAIDoing(true);
    setTimeout(() => setIsAIDoing(false), 2000);
  };

  const handleDoThis = () => {
    setIsAIDoing(true);
    onDoThis();
    setTimeout(() => setIsAIDoing(false), 3000);
  };

  const isCompleted = task.status === 'completed';
  const hasContent = !!task.deliverable_content;

  return (
    <div className="flex flex-col h-full">
      {/* Canvas toolbar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-gray-700/50 bg-slate-50/50 dark:bg-gray-800/30">
        <div className="flex items-center gap-0.5">
          {[
            { icon: Bold, label: 'Bold' },
            { icon: Italic, label: 'Italic' },
            { icon: Link, label: 'Link' },
            null,
            { icon: List, label: 'Bullet list' },
            { icon: ListOrdered, label: 'Numbered list' },
            null,
            { icon: AtSign, label: 'Mention' },
            { icon: Paperclip, label: 'Attach' },
            { icon: Image, label: 'Image' },
          ].map((item, i) =>
            item === null ? (
              <div key={i} className="w-px h-4 bg-slate-200 dark:bg-gray-700 mx-1" />
            ) : (
              <button
                key={item.label}
                className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-gray-700/50 text-slate-400 hover:text-slate-600 dark:hover:text-gray-300 transition-colors"
                title={item.label}
              >
                <item.icon className="h-3.5 w-3.5" />
              </button>
            )
          )}
        </div>

        {/* "Do this" button */}
        {!isCompleted && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5 border-violet-200 dark:border-violet-500/30 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10"
              onClick={handleDoThis}
              disabled={isAIDoing}
            >
              {isAIDoing ? (
                <><Loader2 className="h-3 w-3 animate-spin" /> AI working...</>
              ) : (
                <><Wand2 className="h-3 w-3" /> Do this</>
              )}
            </Button>
            <span className="text-[10px] text-slate-400 dark:text-gray-500">
              Type <kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-gray-800 text-[9px] font-mono">/</kbd> for commands
            </span>
          </div>
        )}
      </div>

      {/* Canvas content */}
      <div className="flex-1 overflow-y-auto">
        {/* AI working overlay */}
        <AnimatePresence>
          {isAIDoing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="sticky top-0 z-10 mx-4 mt-3"
            >
              <div className="flex items-center gap-3 rounded-lg border border-violet-200 dark:border-violet-500/20 bg-violet-50 dark:bg-violet-500/5 px-4 py-3">
                <Loader2 className="h-4 w-4 text-violet-500 animate-spin" />
                <div>
                  <p className="text-xs font-medium text-violet-700 dark:text-violet-400">AI is drafting content...</p>
                  <p className="text-[11px] text-violet-500 dark:text-violet-400/60">Reading task context, meeting notes, and contact history</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="px-8 py-6 max-w-3xl mx-auto">
          {hasContent ? (
            <div className="prose prose-sm dark:prose-invert max-w-none
              prose-headings:font-semibold prose-headings:text-slate-800 dark:prose-headings:text-gray-200
              prose-h1:text-xl prose-h1:border-b prose-h1:border-slate-200 dark:prose-h1:border-gray-700/50 prose-h1:pb-2
              prose-h2:text-base prose-h2:mt-6
              prose-p:text-slate-600 dark:prose-p:text-gray-400 prose-p:leading-relaxed
              prose-strong:text-slate-800 dark:prose-strong:text-gray-200
              prose-table:text-xs
              prose-th:bg-slate-50 dark:prose-th:bg-gray-800/50 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-semibold prose-th:text-slate-700 dark:prose-th:text-gray-300
              prose-td:px-3 prose-td:py-2 prose-td:border-t prose-td:border-slate-200 dark:prose-td:border-gray-700/50
              prose-blockquote:border-violet-300 dark:prose-blockquote:border-violet-500/30 prose-blockquote:bg-violet-50/50 dark:prose-blockquote:bg-violet-500/5 prose-blockquote:rounded-r-lg prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:not-italic
              prose-hr:border-slate-200 dark:prose-hr:border-gray-700/50
              prose-li:text-slate-600 dark:prose-li:text-gray-400
              prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
            ">
              {task.deliverable_content!.split('\n').map((line, i) => {
                if (line.startsWith('# ')) return <h1 key={i}>{line.slice(2)}</h1>;
                if (line.startsWith('## ')) return <h2 key={i}>{line.slice(3)}</h2>;
                if (line.startsWith('### ')) return <h3 key={i}>{line.slice(4)}</h3>;
                if (line.trim() === '---') return <hr key={i} />;
                if (line.startsWith('> ')) {
                  const text = line.slice(2);
                  if (text.startsWith('_') && text.endsWith('_')) {
                    return (
                      <blockquote key={i}>
                        <p className="flex items-center gap-2 text-violet-600 dark:text-violet-400">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <em>{text.slice(1, -1)}</em>
                        </p>
                      </blockquote>
                    );
                  }
                  return <blockquote key={i}><p>{text}</p></blockquote>;
                }
                if (line.startsWith('|') && line.endsWith('|')) {
                  const tableLines: string[] = [];
                  let j = i;
                  const allLines = task.deliverable_content!.split('\n');
                  while (j < allLines.length && allLines[j].startsWith('|')) {
                    tableLines.push(allLines[j]);
                    j++;
                  }
                  if (i > 0 && allLines[i - 1].startsWith('|')) return null;
                  const headerRow = tableLines[0];
                  const dataRows = tableLines.slice(2);
                  const headers = headerRow.split('|').filter(Boolean).map(h => h.trim());
                  return (
                    <table key={i} className="w-full border border-slate-200 dark:border-gray-700/50 rounded-lg overflow-hidden">
                      <thead>
                        <tr>
                          {headers.map((h, hi) => (
                            <th key={hi} dangerouslySetInnerHTML={{ __html: h.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dataRows.map((row, ri) => {
                          const cells = row.split('|').filter(Boolean).map(c => c.trim());
                          return (
                            <tr key={ri}>
                              {cells.map((cell, ci) => (
                                <td key={ci} dangerouslySetInnerHTML={{ __html: cell.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>') }} />
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  );
                }
                if (line.startsWith('**') && line.includes(':**')) {
                  const parts = line.match(/^\*\*(.*?)\*\*\s*(.*)/);
                  if (parts) {
                    return (
                      <p key={i} className="flex items-baseline gap-2">
                        <strong className="shrink-0">{parts[1]}</strong>
                        <span dangerouslySetInnerHTML={{ __html: parts[2].replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                      </p>
                    );
                  }
                }
                if (line.startsWith('- **') || line.startsWith('- ')) {
                  return (
                    <div key={i} className="flex items-start gap-2 py-0.5">
                      <span className="text-slate-400 mt-1.5">·</span>
                      <span dangerouslySetInnerHTML={{ __html: line.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                    </div>
                  );
                }
                if (line.match(/^\d+\.\s/)) {
                  const num = line.match(/^(\d+)\.\s(.*)/);
                  if (num) {
                    return (
                      <div key={i} className="flex items-start gap-2 py-0.5">
                        <span className="text-slate-400 font-mono text-xs mt-0.5 shrink-0">{num[1]}.</span>
                        <span dangerouslySetInnerHTML={{ __html: num[2].replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                      </div>
                    );
                  }
                }
                if (!line.trim()) return <div key={i} className="h-3" />;
                return (
                  <p key={i} dangerouslySetInnerHTML={{
                    __html: line
                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/\*(.*?)\*/g, '<em>$1</em>')
                      .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
                  }} />
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="w-14 h-14 rounded-xl bg-slate-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
                <FileEdit className="h-6 w-6 text-slate-300 dark:text-gray-600" />
              </div>
              <p className="text-sm font-medium text-slate-500 dark:text-gray-400 mb-1">No content yet</p>
              <p className="text-xs text-slate-400 dark:text-gray-500 mb-4">
                Start writing or let AI generate a draft
              </p>
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700"
                onClick={handleDoThis}
              >
                <Wand2 className="h-3.5 w-3.5" /> Do this for me
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom input area with slash commands */}
      {!isCompleted && (
        <div className="shrink-0 border-t border-slate-200 dark:border-gray-700/50 bg-white dark:bg-gray-900/80 px-4 py-3">
          <div className="relative">
            <AnimatePresence>
              {showSlashMenu && (
                <SlashCommandDropdown
                  filter={slashFilter}
                  onSelect={handleSlashSelect}
                  onClose={() => setShowSlashMenu(false)}
                />
              )}
            </AnimatePresence>
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  placeholder="Type / for AI commands, or add notes..."
                  onKeyDown={handleCanvasKeyDown}
                  onChange={handleCanvasInput}
                  className="w-full resize-none rounded-lg border border-slate-200 dark:border-gray-700/50 bg-slate-50/50 dark:bg-gray-800/50 px-3 py-2 text-xs text-slate-700 dark:text-gray-300 placeholder:text-slate-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
                />
              </div>
              <Button size="sm" variant="ghost" className="h-8 text-xs text-slate-400">
                <CornerDownLeft className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// CONTEXT PANEL
// ============================================================

function ContextPanel({ task }: { task: MockTask }) {
  const [activeTab, setActiveTab] = useState<ContextTab>(task.meeting_context ? 'meeting' : 'contact');

  const tabs: { id: ContextTab; label: string; icon: typeof Video; available: boolean }[] = [
    { id: 'meeting', label: 'Meeting', icon: Video, available: !!task.meeting_context },
    { id: 'contact', label: 'Contact', icon: UserCircle, available: !!task.contact_context },
    { id: 'activity', label: 'Activity', icon: Activity, available: !!(task.activity && task.activity.length > 0) },
    { id: 'related', label: 'Related', icon: LayoutList, available: !!(task.related_items && task.related_items.length > 0) },
  ];

  const availableTabs = tabs.filter(t => t.available);

  // Auto-select first available tab
  useEffect(() => {
    if (!tabs.find(t => t.id === activeTab && t.available)) {
      const first = availableTabs[0];
      if (first) setActiveTab(first.id);
    }
  }, [task.id]);

  if (availableTabs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-2">
            <Inbox className="h-5 w-5 text-slate-300 dark:text-gray-600" />
          </div>
          <p className="text-xs text-slate-400 dark:text-gray-500">No context available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Context tabs */}
      <div className="shrink-0 flex items-center gap-0 px-3 border-b border-slate-200 dark:border-gray-700/50 bg-white dark:bg-gray-900/80">
        {availableTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-2.5 text-[11px] font-medium border-b-2 transition-colors',
              activeTab === tab.id
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-300'
            )}
          >
            <tab.icon className="h-3 w-3" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'meeting' && task.meeting_context && (
            <motion.div key="meeting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-4 space-y-4">
              {/* Recording embed */}
              <div className="rounded-lg border border-slate-200 dark:border-gray-700/50 bg-slate-900 aspect-video flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900" />
                <div className="relative flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-sm">
                    <Play className="h-5 w-5 text-white ml-0.5" />
                  </div>
                  <span className="text-[11px] text-slate-400">{task.meeting_context.duration} recording</span>
                </div>
                <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2">
                  <div className="h-1 flex-1 rounded-full bg-white/10">
                    <div className="h-full w-0 rounded-full bg-blue-500" />
                  </div>
                  <span className="text-[10px] text-slate-500">0:00</span>
                </div>
              </div>

              {/* Meeting info */}
              <div>
                <h4 className="text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1">{task.meeting_context.title}</h4>
                <p className="text-[11px] text-slate-500 dark:text-gray-400">
                  {new Date(task.meeting_context.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {task.meeting_context.duration}
                </p>
              </div>

              {/* Summary */}
              <div>
                <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">AI Summary</h5>
                <p className="text-xs text-slate-600 dark:text-gray-400 leading-relaxed">{task.meeting_context.summary}</p>
              </div>

              {/* Highlights */}
              <div>
                <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">Key Moments</h5>
                <div className="space-y-1.5">
                  {task.meeting_context.highlights.map((h, i) => (
                    <button key={i} className="w-full flex items-start gap-2 text-left rounded-md px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-gray-800/50 transition-colors group">
                      <Clock className="h-3 w-3 text-blue-500 mt-0.5 shrink-0" />
                      <span className="text-[11px] text-slate-600 dark:text-gray-400 group-hover:text-slate-800 dark:group-hover:text-gray-300">{h}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Attendees */}
              <div>
                <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">Attendees</h5>
                <div className="space-y-2">
                  {task.meeting_context.attendees.map((a, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-gray-700 flex items-center justify-center">
                        <span className="text-[10px] font-semibold text-slate-600 dark:text-gray-300">{a.name[0]}</span>
                      </div>
                      <div>
                        <p className="text-[11px] font-medium text-slate-700 dark:text-gray-300">{a.name}</p>
                        <p className="text-[10px] text-slate-400 dark:text-gray-500">{a.role} · {a.company}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'contact' && task.contact_context && (
            <motion.div key="contact" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-4 space-y-4">
              {/* Contact card */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center">
                  <span className="text-sm font-bold text-white">{task.contact_context.name.split(' ').map(n => n[0]).join('')}</span>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-gray-200">{task.contact_context.name}</h4>
                  <p className="text-[11px] text-slate-500 dark:text-gray-400">{task.contact_context.title}</p>
                  <p className="text-[11px] text-slate-400 dark:text-gray-500">{task.contact_context.company}</p>
                </div>
              </div>

              {/* Contact info */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[11px]">
                  <Mail className="h-3 w-3 text-slate-400" />
                  <span className="text-blue-600 dark:text-blue-400">{task.contact_context.email}</span>
                </div>
                {task.contact_context.phone && (
                  <div className="flex items-center gap-2 text-[11px]">
                    <Phone className="h-3 w-3 text-slate-400" />
                    <span className="text-slate-600 dark:text-gray-400">{task.contact_context.phone}</span>
                  </div>
                )}
                {task.contact_context.linkedin && (
                  <div className="flex items-center gap-2 text-[11px]">
                    <Linkedin className="h-3 w-3 text-slate-400" />
                    <span className="text-blue-600 dark:text-blue-400">{task.contact_context.linkedin}</span>
                  </div>
                )}
              </div>

              {/* Relationship score */}
              <div>
                <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-2">Relationship Health</h5>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-gray-800 overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        task.contact_context.relationship_score >= 70 ? 'bg-emerald-500' :
                        task.contact_context.relationship_score >= 40 ? 'bg-amber-500' : 'bg-red-500'
                      )}
                      style={{ width: `${task.contact_context.relationship_score}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 dark:text-gray-300">{task.contact_context.relationship_score}</span>
                </div>
                <p className="text-[10px] text-slate-400 dark:text-gray-500 mt-1">
                  Last contacted {task.contact_context.last_contacted}
                </p>
              </div>

              {/* Notes */}
              <div>
                <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">Notes</h5>
                <p className="text-xs text-slate-600 dark:text-gray-400 leading-relaxed">{task.contact_context.notes}</p>
              </div>

              {/* Deal info */}
              {task.deal_name && (
                <div className="rounded-lg border border-slate-200 dark:border-gray-700/50 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-xs font-semibold text-slate-700 dark:text-gray-300">Active Deal</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-gray-400">{task.deal_name}</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    {task.deal_value && <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{task.deal_value}</span>}
                    {task.deal_stage && <Badge variant="secondary" className="text-[10px]">{task.deal_stage}</Badge>}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'activity' && task.activity && (
            <motion.div key="activity" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-4">
              <div className="space-y-2">
                {task.activity.map((item, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="relative flex flex-col items-center">
                      <div className={cn(
                        'w-5 h-5 rounded-full flex items-center justify-center',
                        item.actor === 'AI' ? 'bg-violet-100 dark:bg-violet-500/20' : 'bg-blue-100 dark:bg-blue-500/20'
                      )}>
                        {item.actor === 'AI' ? (
                          <Bot className="h-2.5 w-2.5 text-violet-500" />
                        ) : (
                          <UserCircle className="h-2.5 w-2.5 text-blue-500" />
                        )}
                      </div>
                      {i < task.activity!.length - 1 && (
                        <div className="w-px h-4 bg-slate-200 dark:bg-gray-700/50 mt-1" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 pb-2">
                      <p className="text-[11px] text-slate-600 dark:text-gray-400">{item.action}</p>
                      <span className="text-[10px] text-slate-400 dark:text-gray-500">
                        {new Date(item.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Comments section */}
              {task.comments && task.comments.length > 0 && (
                <div className="mt-6 pt-4 border-t border-slate-200 dark:border-gray-700/50">
                  <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-3">AI Notes</h5>
                  <div className="space-y-3">
                    {task.comments.map(comment => (
                      <div key={comment.id} className="flex gap-2">
                        <div className={cn(
                          'w-6 h-6 rounded-full flex items-center justify-center shrink-0',
                          comment.isAI ? 'bg-gradient-to-br from-violet-500 to-blue-500' : 'bg-slate-200 dark:bg-gray-700'
                        )}>
                          {comment.isAI ? <Bot className="h-3 w-3 text-white" /> : <span className="text-[10px] font-semibold text-slate-600">{comment.author[0]}</span>}
                        </div>
                        <div>
                          <p className="text-[11px] text-slate-600 dark:text-gray-400 leading-relaxed">{comment.content}</p>
                          <span className="text-[10px] text-slate-400 dark:text-gray-500">
                            {new Date(comment.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'related' && task.related_items && (
            <motion.div key="related" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-4 space-y-2">
              {task.related_items.map((item, i) => (
                <button key={i} className="w-full flex items-center gap-3 rounded-lg border border-slate-200 dark:border-gray-700/50 p-3 hover:bg-slate-50 dark:hover:bg-gray-800/50 transition-colors text-left">
                  <div className={cn(
                    'w-7 h-7 rounded-lg flex items-center justify-center',
                    item.type === 'deal' ? 'bg-emerald-50 dark:bg-emerald-500/10' :
                    item.type === 'meeting' ? 'bg-indigo-50 dark:bg-indigo-500/10' :
                    'bg-blue-50 dark:bg-blue-500/10'
                  )}>
                    {item.type === 'deal' ? <Target className="h-3.5 w-3.5 text-emerald-500" /> :
                     item.type === 'meeting' ? <CalendarClock className="h-3.5 w-3.5 text-indigo-500" /> :
                     <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700 dark:text-gray-300 truncate">{item.title}</p>
                    <p className="text-[10px] text-slate-400 dark:text-gray-500">{item.status}</p>
                  </div>
                  <ExternalLink className="h-3 w-3 text-slate-300 dark:text-gray-600" />
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ============================================================
// TASK DETAIL HEADER
// ============================================================

function TaskDetailHeader({ task, onApprove, onDismiss, contextOpen, onToggleContext }: {
  task: MockTask;
  onApprove: () => void;
  onDismiss: () => void;
  contextOpen: boolean;
  onToggleContext: () => void;
}) {
  const TypeIcon = typeConfig[task.task_type].icon;
  const isCompleted = task.status === 'completed';
  const isDraftReady = task.ai_status === 'draft_ready';
  const isAIWorking = task.ai_status === 'working';
  const completedSubtasks = task.subtasks?.filter(s => s.completed).length ?? 0;
  const totalSubtasks = task.subtasks?.length ?? 0;

  return (
    <div className="shrink-0 border-b border-slate-200 dark:border-gray-700/50 bg-white dark:bg-gray-900/80">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <div className={cn('flex items-center justify-center w-7 h-7 rounded-lg', typeConfig[task.task_type].bg)}>
            <TypeIcon className={cn('h-3.5 w-3.5', typeConfig[task.task_type].color)} />
          </div>
          <span className={cn('text-xs font-medium', typeConfig[task.task_type].color)}>
            {typeConfig[task.task_type].label}
          </span>
          {task.source !== 'manual' && (
            <>
              <span className="text-slate-300 dark:text-gray-600">·</span>
              <span className="inline-flex items-center gap-1 text-[11px] text-violet-600 dark:text-violet-400">
                <Bot className="h-3 w-3" /> AI Generated
              </span>
            </>
          )}
          {task.confidence_score && (
            <>
              <span className="text-slate-300 dark:text-gray-600">·</span>
              <span className="text-[11px] text-slate-400 dark:text-gray-500">
                {Math.round(task.confidence_score * 100)}% confidence
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onToggleContext}
            className={cn(
              'p-1.5 rounded-md transition-colors',
              contextOpen
                ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-500'
                : 'hover:bg-slate-100 dark:hover:bg-gray-800 text-slate-400'
            )}
            title={contextOpen ? 'Hide context' : 'Show context'}
          >
            {contextOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRight className="h-3.5 w-3.5" />}
          </button>
          <button className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-gray-800 text-slate-400 transition-colors" title="Copy link">
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-gray-800 text-slate-400 transition-colors" title="More options">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Title */}
      <div className="px-6 pb-2">
        <h2 className={cn(
          'text-lg font-bold text-slate-900 dark:text-gray-100',
          isCompleted && 'line-through opacity-50'
        )}>
          {task.title}
        </h2>
        {task.description && (
          <p className="text-sm text-slate-500 dark:text-gray-400 mt-0.5">{task.description}</p>
        )}
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-3 px-6 pb-2 flex-wrap">
        {task.company && (
          <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-gray-400">
            <Building2 className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-medium">{task.company}</span>
          </div>
        )}
        {task.contact_name && (
          <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-gray-400">
            <UserCircle className="h-3.5 w-3.5 text-slate-400" />
            <span>{task.contact_name}</span>
          </div>
        )}
        {task.deal_name && (
          <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-gray-400">
            <Target className="h-3.5 w-3.5 text-slate-400" />
            <span>{task.deal_name}</span>
            {task.deal_value && <Badge variant="secondary" className="text-[10px] ml-0.5">{task.deal_value}</Badge>}
          </div>
        )}
        {task.due_date && (
          <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-gray-400">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <span>{new Date(task.due_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <div className={cn('w-2 h-2 rounded-full', priorityConfig[task.priority].dotColor)} />
          <span className={cn('text-xs font-medium', priorityConfig[task.priority].color)}>
            {priorityConfig[task.priority].label}
          </span>
        </div>
      </div>

      {/* Subtasks */}
      {task.subtasks && task.subtasks.length > 0 && (
        <div className="px-6 pb-2">
          <div className="flex items-center gap-3 mb-2">
            <Progress value={totalSubtasks > 0 ? (completedSubtasks / totalSubtasks) * 100 : 0} className="h-1.5 flex-1" />
            <span className="text-xs text-slate-500 dark:text-gray-400">
              {completedSubtasks}/{totalSubtasks}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {task.subtasks.map(st => (
              <span
                key={st.id}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium border',
                  st.completed
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200/50 dark:border-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'bg-slate-50 dark:bg-gray-800/50 border-slate-200 dark:border-gray-700/50 text-slate-500 dark:text-gray-400'
                )}
              >
                {st.completed ? <CheckCircle2 className="h-2.5 w-2.5" /> : <Circle className="h-2.5 w-2.5" />}
                {st.title}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      {!isCompleted && (
        <div className="flex items-center gap-2 px-6 pb-3">
          {isDraftReady && (
            <>
              <Button size="sm" className="h-8 text-xs gap-1.5" onClick={onApprove}>
                {task.task_type === 'email' ? <><Send className="h-3 w-3" /> Approve & Send</> :
                 task.task_type === 'crm_update' ? <><Check className="h-3 w-3" /> Approve Update</> :
                 <><ThumbsUp className="h-3 w-3" /> Approve</>}
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5">
                <Bot className="h-3 w-3" /> Revise with AI
              </Button>
            </>
          )}
          {task.status === 'pending_review' && !isDraftReady && (
            <>
              <Button size="sm" className="h-8 text-xs gap-1.5" onClick={onApprove}>
                <Check className="h-3 w-3" /> Accept
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5">
                <Bot className="h-3 w-3" /> Let AI Draft
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" className="h-8 text-xs gap-1.5 text-slate-400" onClick={onDismiss}>
            <X className="h-3 w-3" /> Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function CommandCentreV2Demo() {
  const [tasks, setTasks] = useState<MockTask[]>(MOCK_TASKS);
  const [selectedTaskId, setSelectedTaskId] = useState<string>('1');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [contextOpen, setContextOpen] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'review' | 'drafts' | 'working' | 'done'>('all');

  const selectedTask = tasks.find(t => t.id === selectedTaskId);

  // Count child tasks per parent
  const childCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    tasks.forEach(t => {
      if (t.parent_task_id) {
        counts[t.parent_task_id] = (counts[t.parent_task_id] || 0) + 1;
      }
    });
    return counts;
  }, [tasks]);

  const handleComplete = (id: string) => {
    setTasks(prev => prev.map(t =>
      t.id === id ? { ...t, status: 'completed' as TaskStatus, completed_at: new Date().toISOString(), ai_status: 'executed' } : t
    ));
  };

  const filteredTasks = useMemo(() => {
    // Hide child tasks from main list (they show as sub-tasks in parent)
    const parentTasks = tasks.filter(t => !t.parent_task_id);
    switch (activeFilter) {
      case 'review': return parentTasks.filter(t => t.status === 'pending_review' || t.ai_status === 'draft_ready');
      case 'drafts': return parentTasks.filter(t => t.ai_status === 'draft_ready');
      case 'working': return parentTasks.filter(t => t.ai_status === 'working');
      case 'done': return parentTasks.filter(t => t.status === 'completed');
      default: return parentTasks;
    }
  }, [tasks, activeFilter]);

  const counts = useMemo(() => {
    const parentTasks = tasks.filter(t => !t.parent_task_id);
    return {
      all: parentTasks.length,
      review: parentTasks.filter(t => t.status === 'pending_review' || t.ai_status === 'draft_ready').length,
      drafts: parentTasks.filter(t => t.ai_status === 'draft_ready').length,
      working: parentTasks.filter(t => t.ai_status === 'working').length,
      done: parentTasks.filter(t => t.status === 'completed').length,
    };
  }, [tasks]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        const idx = filteredTasks.findIndex(t => t.id === selectedTaskId);
        if (idx < filteredTasks.length - 1) setSelectedTaskId(filteredTasks[idx + 1].id);
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        const idx = filteredTasks.findIndex(t => t.id === selectedTaskId);
        if (idx > 0) setSelectedTaskId(filteredTasks[idx - 1].id);
      } else if (e.key === '[') {
        setSidebarCollapsed(prev => !prev);
      } else if (e.key === ']') {
        setContextOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [filteredTasks, selectedTaskId]);

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-white dark:bg-gray-950">
      {/* ====== LEFT SIDEBAR: TASK LIST ====== */}
      <AnimatePresence mode="wait">
        {!sidebarCollapsed && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="shrink-0 border-r border-slate-200 dark:border-gray-700/50 flex flex-col bg-slate-50/30 dark:bg-gray-900/30 overflow-hidden"
          >
            {/* Sidebar header */}
            <div className="shrink-0 px-4 pt-4 pb-3">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600">
                    <Zap className="h-3.5 w-3.5 text-white" />
                  </div>
                  <h1 className="text-sm font-bold text-slate-800 dark:text-gray-200">Command Centre</h1>
                </div>
                <button
                  onClick={() => setSidebarCollapsed(true)}
                  className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-gray-800 text-slate-400 transition-colors"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
              </div>

              {/* Search */}
              <div className="relative mb-3">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search tasks..."
                  className="w-full h-8 rounded-lg border border-slate-200 dark:border-gray-700/50 bg-white dark:bg-gray-800/50 pl-8 pr-3 text-xs text-slate-700 dark:text-gray-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
                />
              </div>

              {/* Filter pills */}
              <div className="flex items-center gap-1 flex-wrap">
                {([
                  { id: 'all' as const, label: 'All', count: counts.all },
                  { id: 'review' as const, label: 'Review', count: counts.review },
                  { id: 'drafts' as const, label: 'Drafts', count: counts.drafts },
                  { id: 'working' as const, label: 'AI Working', count: counts.working },
                  { id: 'done' as const, label: 'Done', count: counts.done },
                ]).map(f => (
                  <button
                    key={f.id}
                    onClick={() => setActiveFilter(f.id)}
                    className={cn(
                      'px-2 py-1 rounded-md text-[11px] font-medium transition-all',
                      activeFilter === f.id
                        ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300'
                        : 'text-slate-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-800'
                    )}
                  >
                    {f.label}
                    {f.count > 0 && (
                      <span className="ml-1 opacity-60">{f.count}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Task list */}
            <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
              {filteredTasks.map(task => (
                <SidebarTaskItem
                  key={task.id}
                  task={task}
                  isSelected={task.id === selectedTaskId}
                  onClick={() => setSelectedTaskId(task.id)}
                  childCount={childCounts[task.id]}
                />
              ))}
            </div>

            {/* Quick add */}
            <div className="shrink-0 px-3 py-3 border-t border-slate-200 dark:border-gray-700/50">
              <button className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-dashed border-slate-300 dark:border-gray-600 text-xs text-slate-400 hover:text-blue-500 hover:border-blue-300 dark:hover:border-blue-500/30 hover:bg-blue-50/50 dark:hover:bg-blue-500/5 transition-all">
                <Plus className="h-3.5 w-3.5" />
                New task
                <span className="ml-auto text-[10px] text-slate-300 dark:text-gray-600">N</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collapsed sidebar toggle */}
      {sidebarCollapsed && (
        <div className="shrink-0 w-12 border-r border-slate-200 dark:border-gray-700/50 flex flex-col items-center pt-3 bg-slate-50/30 dark:bg-gray-900/30">
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 text-slate-400 transition-colors"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <div className="mt-3 flex flex-col items-center gap-2">
            {counts.drafts > 0 && (
              <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">{counts.drafts}</span>
              </div>
            )}
            {counts.working > 0 && (
              <div className="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center">
                <Loader2 className="h-3 w-3 text-violet-500 animate-spin" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====== CENTER: DETAIL + CANVAS ====== */}
      <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-gray-900/60">
        {selectedTask ? (
          <>
            <TaskDetailHeader
              task={selectedTask}
              onApprove={() => handleComplete(selectedTask.id)}
              onDismiss={() => {}}
              contextOpen={contextOpen}
              onToggleContext={() => setContextOpen(!contextOpen)}
            />
            <div className="flex-1 flex min-h-0">
              {/* Writing canvas */}
              <div className="flex-1 flex flex-col min-w-0">
                <WritingCanvas
                  task={selectedTask}
                  onDoThis={() => {}}
                />
              </div>

              {/* Context panel */}
              <AnimatePresence mode="wait">
                {contextOpen && (
                  <motion.div
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 320, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="shrink-0 border-l border-slate-200 dark:border-gray-700/50 bg-slate-50/30 dark:bg-gray-900/30 overflow-hidden"
                  >
                    <ContextPanel task={selectedTask} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
                <Inbox className="h-7 w-7 text-slate-300 dark:text-gray-600" />
              </div>
              <p className="text-sm text-slate-500 dark:text-gray-400">Select a task to view details</p>
              <p className="text-xs text-slate-400 dark:text-gray-500 mt-1">Use <kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-gray-800 text-[10px] font-mono">j</kbd>/<kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-gray-800 text-[10px] font-mono">k</kbd> to navigate</p>
            </div>
          </div>
        )}
      </div>

      {/* AI Reasoning footer */}
      {selectedTask?.reasoning && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 dark:border-gray-700/50 bg-violet-50/80 dark:bg-violet-500/5 backdrop-blur-sm px-6 py-2">
          <div className="flex items-center gap-2 max-w-5xl mx-auto">
            <Brain className="h-3.5 w-3.5 text-violet-500 shrink-0" />
            <p className="text-[11px] text-violet-600 dark:text-violet-400 truncate">
              <span className="font-semibold">AI Reasoning:</span> {selectedTask.reasoning}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
