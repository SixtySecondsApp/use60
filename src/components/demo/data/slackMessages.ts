// Demo Slack message data — simplified structures for SlackMessagePreview rendering
// NOT actual Block Kit JSON — these are pre-built message objects

export type SlackMessageType =
  | 'morning_brief'
  | 'meeting_prep'
  | 'post_meeting_debrief'
  | 'crm_update'
  | 'proposal_review'
  | 'internal_prep'
  | 'deal_risk'
  | 'reengagement'
  | 'eod_synthesis'
  | 'coaching_digest'
  | 'config_question'
  | 'email_signal'
  | 'autonomy_promotion'
  | 'conversational_response';

export interface SlackSection {
  type: 'text' | 'fields' | 'divider' | 'context' | 'image' | 'header';
  text?: string;
  fields?: { label: string; value: string }[];
  imageUrl?: string;
  imageAlt?: string;
  emoji?: string;
}

export interface SlackAction {
  label: string;
  style: 'primary' | 'danger' | 'default';
  value: string;
}

export interface SlackMessage {
  id: string;
  type: SlackMessageType;
  timestamp: string;
  header: string;
  sections: SlackSection[];
  actions?: SlackAction[];
  threadReplies?: number;
  channel?: string;
}

export const slackMessages: SlackMessage[] = [
  // ── Morning Briefing ───────────────────────────────────────────
  {
    id: 'slack-001',
    type: 'morning_brief',
    timestamp: '2026-02-22T07:30:00-05:00',
    channel: 'DM',
    header: 'Good morning, Sarah! Here\'s your Day 1 briefing.',
    sections: [
      { type: 'header', text: 'Today\'s Schedule (4 external, 2 internal)' },
      {
        type: 'text',
        text: `*10:00 AM* — DataFlow Systems: Platform Demo & Technical Deep-Dive
  Jake Torres (VP Eng), Lisa Park (Dir Product), Sophie Wright (Head IT)
  _Deal: $180K | Stage: Demo | Prep: Ready_

*11:00 AM* — Team Standup (15 min)

*11:30 AM* — CloudBase Inc: Contract Follow-Up & Negotiation
  Maria Chen (Head of Operations)
  _Deal: $120K | Stage: Negotiation | Prep: Ready_

*12:30 PM* — Pipeline Review with Jennifer Walsh (VP Sales)

*2:00 PM* — TechVault: Discovery Call & Needs Assessment
  Rachel Adams (CTO), Ben Foster (VP CS)
  _Deal: $65K | Stage: Discovery | Prep: Needs attention_

*4:00 PM* — 1:1 with James Wright (Sales Manager)`,
      },
      { type: 'divider' },
      { type: 'header', text: 'Pipeline Snapshot' },
      {
        type: 'fields',
        fields: [
          { label: 'Total Pipeline', value: '$2.4M (8 deals)' },
          { label: 'Weighted Pipeline', value: '$1.2M' },
          { label: 'Q1 Quota Pacing', value: '68% ($680K / $1M)' },
          { label: 'Deals Closing This Month', value: '2 ($215K)' },
        ],
      },
      { type: 'divider' },
      { type: 'header', text: 'Signal Watch' },
      {
        type: 'text',
        text: `*Jake Torres* (DataFlow) visited your pricing page 3 times this week — likely preparing internal budget justification.

*Maria Chen* (CloudBase) opened your proposal PDF 4 times since last meeting — focused on pricing section (pages 7-8). She was recently promoted to Head of Operations — more budget authority now.

*David Kim* (Apex Partners) has not responded in 12 days. Deal is in Negotiation at $95K. Recommend: try alternate contact or LinkedIn message.`,
      },
      { type: 'divider' },
      { type: 'header', text: 'AI Priorities for Today' },
      {
        type: 'text',
        text: `1. *DataFlow demo is your #1 priority.* Jake is your champion — Lisa evaluated Intercom last quarter and found integration depth lacking. Lead with the Jira demo. Sophie will ask about SSO/SCIM — have the security whitepaper ready.

2. *CloudBase is ready to close.* Maria has budget authority and internal urgency ("Need to wrap up before March planning cycle"). Offer 10% multi-year, hold on implementation timeline.

3. *TechVault is time-sensitive.* Zendesk contract ends March 31 — they can\'t afford a slow evaluation. Rachel previously used Meridian at Signal Corp — warm reference.

4. *Apex needs intervention.* David Kim has gone dark. Consider escalating to VP-level outreach or trying a different contact at the company.`,
      },
      { type: 'context', text: 'This is your first morning briefing. I\'ll learn your preferences over time. Reply with feedback anytime.' },
    ],
    actions: [
      { label: 'View Full Dashboard', style: 'primary', value: 'open_dashboard' },
      { label: 'Prep DataFlow', style: 'default', value: 'prep_dataflow' },
      { label: 'Snooze Apex Alert', style: 'default', value: 'snooze_apex' },
    ],
  },

  // ── Meeting Prep ───────────────────────────────────────────────
  {
    id: 'slack-002',
    type: 'meeting_prep',
    timestamp: '2026-02-22T09:30:00-05:00',
    channel: 'DM',
    header: 'Meeting prep: DataFlow Systems Demo in 30 minutes',
    sections: [
      {
        type: 'text',
        text: `*DataFlow Systems — Platform Demo & Technical Deep-Dive*
10:00 AM | 60 min | Google Meet`,
      },
      { type: 'divider' },
      { type: 'header', text: 'Attendees & Intel' },
      {
        type: 'text',
        text: `*Jake Torres* — VP of Engineering (Champion)
  Visited pricing page 3x this week. Looking for Jira integration that "just works."
  _Ask about: His timeline for internal rollout. Who else needs to approve?_

*Lisa Park* — Director of Product
  Previously evaluated Intercom (Q3 2025). Concerned about analytics depth.
  Former Zendesk colleague of yours (2019-2023) — you have rapport.
  _Ask about: What specific analytics did Intercom lack? Cohort analysis needs?_

*Sophie Wright* — Head of IT
  Joined thread last week asking about SSO/SCIM. Previously at Okta.
  _Ask about: Their Okta configuration, user provisioning workflow._`,
      },
      { type: 'divider' },
      { type: 'header', text: 'Competitive Intelligence' },
      {
        type: 'text',
        text: `Intercom rep was spotted at DataFlow office last Tuesday (LinkedIn check-in by their AE). Intercom\'s Jira integration is read-only and batched — ours is bi-directional and real-time. This is your key differentiator.

_Counter-positioning: "How important is it that your support platform talks to your engineering tools in real-time?"_`,
      },
      { type: 'divider' },
      { type: 'header', text: 'Company Context' },
      {
        type: 'fields',
        fields: [
          { label: 'Funding', value: 'Series C ($45M, Nov 2025)' },
          { label: 'Employees', value: '280 (growing 35% YoY)' },
          { label: 'Current Tools', value: 'Jira, Slack, Zendesk (legacy)' },
          { label: 'Evaluation Timeline', value: 'Decision by mid-March' },
        ],
      },
      { type: 'context', text: 'Prep generated from CRM data, email signals, LinkedIn activity, and your previous meeting notes.' },
    ],
    actions: [
      { label: 'Open Deal', style: 'primary', value: 'open_deal_001' },
      { label: 'View Battle Card', style: 'default', value: 'battle_card_intercom' },
    ],
  },

  // ── Post-Meeting Debrief ───────────────────────────────────────
  {
    id: 'slack-003',
    type: 'post_meeting_debrief',
    timestamp: '2026-02-22T11:05:00-05:00',
    channel: 'DM',
    header: 'Debrief: DataFlow Systems Demo (completed)',
    sections: [
      { type: 'header', text: 'Meeting Analysis' },
      {
        type: 'fields',
        fields: [
          { label: 'Duration', value: '58 minutes (of 60 scheduled)' },
          { label: 'Sentiment', value: 'Very positive' },
          { label: 'Champion Signal', value: 'STRONG' },
          { label: 'Next Meeting', value: 'Wednesday (w/ CTO Marcus)' },
        ],
      },
      { type: 'divider' },
      { type: 'header', text: 'Key Moments' },
      {
        type: 'text',
        text: `*Jake Torres (14:10):* _"If you can integrate with our Jira, this is a no-brainer. We\'ve been trying to solve this for eighteen months."_
Champion confirmation. Jake is sold on the technical story.

*Jake Torres (45:20):* _"I\'m going to be honest — we looked at Intercom last quarter and the integration story was... not great. This is significantly better."_
Competitive displacement confirmed. Intercom is the alternative, and we\'re winning.

*Sophie Wright (25:00):* Asked about SCIM provisioning and Okta — security gatekeeper satisfied after your demo.

*Jake Torres (56:10):* _"Wednesday works. And honestly, loop in our CTO Marcus — I think he\'ll want to see this."_
Economic buyer involvement imminent. Jake is actively championing internally.`,
      },
      { type: 'divider' },
      { type: 'header', text: 'Open Items' },
      {
        type: 'text',
        text: `1. Send security whitepaper to Sophie Wright
2. Send analytics deep-dive doc to Lisa Park (cohort analysis capabilities)
3. Set up sandbox environment with DataFlow\'s actual Jira instance
4. Schedule Wednesday follow-up with Jake + CTO Marcus Wong
5. Prepare enterprise pricing proposal`,
      },
      { type: 'divider' },
      { type: 'header', text: 'MEDDPICC Analysis' },
      {
        type: 'fields',
        fields: [
          { label: 'Metrics', value: '18-month integration pain (quantified)' },
          { label: 'Economic Buyer', value: 'Marcus Wong (CTO) — joining Wednesday' },
          { label: 'Decision Criteria', value: 'Jira integration, analytics, security' },
          { label: 'Decision Process', value: 'Jake → Marcus → Board (if >$100K)' },
          { label: 'Paper Process', value: 'TBD — ask Wednesday' },
          { label: 'Identify Pain', value: 'Context-switching, manual sync, adoption risk' },
          { label: 'Champion', value: 'Jake Torres (STRONG)' },
          { label: 'Competition', value: 'Intercom (losing)' },
        ],
      },
      { type: 'context', text: 'Analysis generated from meeting transcript (58 min). Full transcript available in app.' },
    ],
    actions: [
      { label: 'Approve CRM Updates', style: 'primary', value: 'approve_crm' },
      { label: 'Draft Follow-Up Email', style: 'default', value: 'draft_followup' },
      { label: 'View Full Transcript', style: 'default', value: 'view_transcript' },
    ],
    threadReplies: 3,
  },

  // ── CRM Update ─────────────────────────────────────────────────
  {
    id: 'slack-004',
    type: 'crm_update',
    timestamp: '2026-02-22T11:10:00-05:00',
    channel: 'DM',
    header: 'CRM update ready for approval — DataFlow Systems',
    sections: [
      {
        type: 'text',
        text: 'I\'ve drafted the following CRM updates based on today\'s DataFlow demo. Per your preferences, stage changes require approval.',
      },
      { type: 'divider' },
      { type: 'header', text: 'Proposed Updates' },
      {
        type: 'fields',
        fields: [
          { label: 'Deal Stage', value: 'Proposal Sent → Demo Completed' },
          { label: 'Champion', value: 'Jake Torres (confirmed)' },
          { label: 'Economic Buyer', value: 'Marcus Wong, CTO (pending intro)' },
          { label: 'Next Step', value: 'CTO demo Wednesday, proposal by Friday' },
          { label: 'Competitor', value: 'Intercom (disadvantaged)' },
          { label: 'Close Date', value: 'March 14, 2026 (updated)' },
          { label: 'Confidence', value: '75% → 82%' },
        ],
      },
      { type: 'divider' },
      {
        type: 'text',
        text: `*Auto-updated (no approval needed):*
- Meeting notes added (full debrief)
- Contact engagement scores updated
- Activity logged: Demo call, 58 minutes
- Sophie Wright added as stakeholder`,
      },
      { type: 'context', text: 'Your preference: auto-update notes & next steps, ask for stage changes.' },
    ],
    actions: [
      { label: 'Approve All', style: 'primary', value: 'approve_all' },
      { label: 'Edit Before Saving', style: 'default', value: 'edit_crm' },
      { label: 'Reject', style: 'danger', value: 'reject_crm' },
    ],
  },

  // ── Proposal Review ────────────────────────────────────────────
  {
    id: 'slack-005',
    type: 'proposal_review',
    timestamp: '2026-02-22T10:30:00-05:00',
    channel: '#deal-room-dataflow',
    header: 'Proposal ready for review — DataFlow Systems ($180K)',
    sections: [
      {
        type: 'text',
        text: 'I\'ve generated a proposal for DataFlow Systems based on today\'s demo conversation, your deal notes, and our standard Enterprise template.',
      },
      { type: 'divider' },
      { type: 'header', text: 'Proposal Summary' },
      {
        type: 'fields',
        fields: [
          { label: 'Recommended Tier', value: 'Enterprise ($150K/year)' },
          { label: 'Implementation Fee', value: '$15,000 (one-time)' },
          { label: 'Total Year 1', value: '$165,000' },
          { label: 'ROI Projection', value: '340% over 3 years' },
          { label: 'Payback Period', value: '4.2 months' },
        ],
      },
      { type: 'divider' },
      { type: 'header', text: 'Section Review Status' },
      {
        type: 'text',
        text: `Auto-approved: Cover Page, The Challenge, Our Solution, Implementation Approach, Terms & Conditions

*Needs your review:*
- Executive Summary — includes Jake\'s "no-brainer" quote, confirm you want to include
- Project Timeline — dates need validation against DataFlow\'s internal schedule
- Investment — pricing and discount terms are deal-specific`,
      },
      { type: 'context', text: 'Proposal generated in 4 minutes from meeting transcript + deal context + template.' },
    ],
    actions: [
      { label: 'Approve & Send', style: 'primary', value: 'approve_send' },
      { label: 'Edit in App', style: 'default', value: 'edit_in_app' },
      { label: 'Request Changes', style: 'danger', value: 'request_changes' },
    ],
  },

  // ── Internal Prep ──────────────────────────────────────────────
  {
    id: 'slack-006',
    type: 'internal_prep',
    timestamp: '2026-02-22T12:00:00-05:00',
    channel: 'DM',
    header: 'Pipeline Review prep: talking points for Jennifer Walsh meeting',
    sections: [
      {
        type: 'text',
        text: 'Your pipeline review with Jennifer Walsh (VP Sales) is in 30 minutes. Here are your talking points:',
      },
      { type: 'divider' },
      {
        type: 'text',
        text: `*Highlight: DataFlow demo went exceptionally well*
Jake Torres confirmed as champion. CTO joining Wednesday. $180K Enterprise deal. Likely to move to proposal this week.

*Highlight: CloudBase close imminent*
Maria Chen has budget authority (just promoted). CFO review tomorrow. $120K with 10% multi-year discount offered.

*Risk: Apex Partners*
David Kim silent for 12 days. $95K in Negotiation. Re-engagement attempt in progress — LinkedIn profile view detected last night.

*New: TechVault discovery*
$65K opportunity. Churning from Zendesk. Tight March 31 timeline. Need to move fast.

*Forecast:* $680K closed of $1M quota (68%). With DataFlow + CloudBase closing, could reach $980K (98%) by end of March.`,
      },
      { type: 'context', text: 'Prepared from your CRM data and today\'s meeting outcomes.' },
    ],
    actions: [
      { label: 'Open Pipeline View', style: 'primary', value: 'open_pipeline' },
    ],
  },

  // ── Deal Risk Alert ────────────────────────────────────────────
  {
    id: 'slack-007',
    type: 'deal_risk',
    timestamp: '2026-02-22T15:00:00-05:00',
    channel: 'DM',
    header: 'Deal Risk Alert: Apex Partners — Champion Silent (12 days)',
    sections: [
      {
        type: 'fields',
        fields: [
          { label: 'Deal', value: 'Apex Partners' },
          { label: 'Value', value: '$95,000' },
          { label: 'Stage', value: 'Negotiation' },
          { label: 'Risk Level', value: 'HIGH' },
          { label: 'Days Since Last Contact', value: '12' },
          { label: 'Champion', value: 'David Kim (COO)' },
        ],
      },
      { type: 'divider' },
      {
        type: 'text',
        text: `*What I know:*
- David Kim hasn\'t responded to your last 2 emails (Feb 10 and Feb 14)
- No calendar activity detected
- However: David viewed your LinkedIn profile at 11:47 PM last night
- This could indicate renewed interest or a courtesy check before declining

*Recommended actions:*
1. Send a casual re-engagement email (not about the deal — share a relevant industry article)
2. Try an alternate contact at Apex (Sarah Johnson, VP Finance)
3. Ask James Wright (your contact at Nexus Corp) — he serves on the same advisory board as David
4. If no response in 48 hours, escalate to your manager for VP-level outreach`,
      },
      { type: 'context', text: 'Risk threshold: Negotiation-stage deals flagged after 7 days of silence (your preference).' },
    ],
    actions: [
      { label: 'Draft Re-engagement Email', style: 'primary', value: 'draft_reengage' },
      { label: 'Try Alternate Contact', style: 'default', value: 'alt_contact' },
      { label: 'Snooze 48 Hours', style: 'default', value: 'snooze_48h' },
    ],
  },

  // ── Re-engagement ──────────────────────────────────────────────
  {
    id: 'slack-008',
    type: 'reengagement',
    timestamp: '2026-02-25T10:00:00-05:00',
    channel: 'DM',
    header: 'Re-engagement email drafted — David Kim (Apex Partners)',
    sections: [
      {
        type: 'text',
        text: 'Based on David\'s LinkedIn activity and the advisory board connection, I\'ve drafted a casual re-engagement email:',
      },
      { type: 'divider' },
      {
        type: 'text',
        text: `*Subject:* Thought you\'d find this interesting — FinTech ops efficiency report

*Body:*
Hi David,

Came across this report from McKinsey on operational efficiency in fintech firms — reminded me of the scaling challenges you mentioned in our last conversation. The section on automated compliance workflows (page 12) is particularly relevant to what you\'re building at Apex.

[Link to report]

Separately, no rush on our conversation — I know Q1 gets busy. Happy to pick things up whenever timing works on your end.

Best,
Sarah`,
      },
      { type: 'context', text: 'Tone: casual check-in, not pushy. References a real conversation topic. Includes a value-add resource.' },
    ],
    actions: [
      { label: 'Send Now', style: 'primary', value: 'send_reengage' },
      { label: 'Edit Draft', style: 'default', value: 'edit_reengage' },
      { label: 'Don\'t Send', style: 'danger', value: 'cancel_reengage' },
    ],
  },

  // ── EOD Synthesis ──────────────────────────────────────────────
  {
    id: 'slack-009',
    type: 'eod_synthesis',
    timestamp: '2026-02-22T17:30:00-05:00',
    channel: 'DM',
    header: 'End-of-Day Synthesis — Day 1 Complete',
    sections: [
      { type: 'header', text: 'Day 1 Results' },
      {
        type: 'text',
        text: `*3 external meetings completed — all positive outcomes.*

*DataFlow Systems* ($180K) — Demo went exceptionally well. Jake Torres confirmed as champion ("this is a no-brainer"). CTO Marcus Wong joining Wednesday follow-up. Intercom is the competitor — we\'re winning on integration depth. _Action: Send security whitepaper + analytics doc tonight._

*CloudBase Inc* ($120K) — Negotiation advancing. Maria Chen has budget authority and internal urgency. Offered 10% multi-year discount. CFO reviewing tomorrow. _Action: Stand by for counter-offer._

*TechVault* ($65K) — Promising discovery. Churning from Zendesk due to health scoring gaps. Zendesk contract ends March 31 — tight timeline. Rachel Adams previously used Meridian. _Action: Send ROI analysis within 48 hours._`,
      },
      { type: 'divider' },
      { type: 'header', text: 'Risk Monitor' },
      {
        type: 'text',
        text: `*Apex Partners* ($95K) — David Kim silent 12 days, but viewed LinkedIn profile last night. Re-engagement email drafted and ready for your review.

*Vertex AI* ($45K) — No activity in 25 days. Consider this deal at risk of going cold.`,
      },
      { type: 'divider' },
      { type: 'header', text: 'Pipeline Movement' },
      {
        type: 'fields',
        fields: [
          { label: 'Total Pipeline', value: '$2.4M (unchanged)' },
          { label: 'Weighted Pipeline', value: '$1.2M → $1.25M' },
          { label: 'Deals Advanced Today', value: '2 (DataFlow, TechVault)' },
          { label: 'New Contacts Added', value: '3 (Sophie Wright, Rachel Adams, Ben Foster)' },
        ],
      },
      { type: 'divider' },
      { type: 'header', text: 'Tomorrow\'s Focus' },
      {
        type: 'text',
        text: `1. Follow up on DataFlow (security whitepaper + analytics doc)
2. Monitor CloudBase CFO review outcome
3. Send TechVault ROI analysis
4. Review Apex re-engagement email
5. Prep for Wednesday DataFlow CTO demo`,
      },
      { type: 'divider' },
      { type: 'header', text: 'Coaching Insight' },
      {
        type: 'text',
        text: 'Your demo with DataFlow was textbook — you let Jake articulate the pain before showing the solution. One suggestion: when Sophie asked about SCIM, you answered immediately. Next time, try asking "What\'s your current provisioning workflow?" first — it surfaces more pain points you can address in the proposal.',
      },
      { type: 'context', text: 'Day 1 complete. I\'m starting overnight processing now — email signals, LinkedIn activity, and news monitoring. Digest ready by 7:30 AM.' },
    ],
  },

  // ── Coaching Digest ────────────────────────────────────────────
  {
    id: 'slack-010',
    type: 'coaching_digest',
    timestamp: '2026-02-28T16:00:00-05:00',
    channel: 'DM',
    header: 'Weekly Coaching Digest — Week 1 Performance',
    sections: [
      { type: 'header', text: 'Week 1 Performance Summary' },
      {
        type: 'fields',
        fields: [
          { label: 'Meetings Held', value: '12 external, 6 internal' },
          { label: 'Show Rate', value: '100% (team avg: 92%)' },
          { label: 'Avg Meeting Duration', value: '48 min (team avg: 42 min)' },
          { label: 'Follow-Up Speed', value: '2.1 hours (team avg: 4.8 hours)' },
          { label: 'CRM Accuracy', value: '96% (team avg: 78%)' },
          { label: 'Pipeline Added', value: '$65K (TechVault)' },
        ],
      },
      { type: 'divider' },
      { type: 'header', text: 'Strengths' },
      {
        type: 'text',
        text: `*Champion Identification* — You identified and confirmed champions in 3 of 3 active deals within the first meeting. Team average is 2.1 meetings to confirm a champion.

*Discovery-to-Proposal Conversion* — 85% conversion rate (team avg: 72%). You qualify effectively and don\'t waste time on deals that won\'t close.

*Competitive Handling* — When Intercom came up in DataFlow, you redirected to integration depth immediately. Win rate against Intercom: 58% (you\'re above this at 67%).`,
      },
      { type: 'divider' },
      { type: 'header', text: 'Growth Areas' },
      {
        type: 'text',
        text: `*Multi-Threading* — Average 2.3 contacts per deal (top performers: 3.5+). DataFlow is well-threaded (4 contacts). Apply the same approach to TechVault and Apex.

*Discovery Questions* — When Sophie asked about SCIM, you answered immediately instead of probing first. Turning answers into questions surfaces more pain points. Try: "Before I show you that, what\'s your current provisioning workflow?"

*Follow-Up Timing* — Your 2.1 hour average is good, but top performers send within 1 hour. Consider letting me auto-draft follow-ups immediately after meetings for your review.`,
      },
      { type: 'context', text: 'Coaching insights generated from meeting transcripts, CRM data, and peer benchmarking. Updated weekly on Fridays.' },
    ],
    actions: [
      { label: 'View Detailed Analytics', style: 'primary', value: 'view_analytics' },
      { label: 'Enable Auto Follow-Ups', style: 'default', value: 'enable_auto_followup' },
    ],
  },

  // ── Config Question ────────────────────────────────────────────
  {
    id: 'slack-011',
    type: 'config_question',
    timestamp: '2026-02-24T08:00:00-05:00',
    channel: 'DM',
    header: 'Quick question to help me help you better',
    sections: [
      {
        type: 'text',
        text: 'After your DataFlow meeting yesterday, I drafted CRM updates for deal stage, next steps, and contact sentiment. I want to make sure I\'m handling this the way you prefer.',
      },
      { type: 'divider' },
      {
        type: 'text',
        text: '*Which fields should I update automatically vs. ask you first?*',
      },
    ],
    actions: [
      { label: 'Auto-update all fields', style: 'default', value: 'all_auto' },
      { label: 'Auto notes, ask for stages', style: 'primary', value: 'partial' },
      { label: 'Ask me before any update', style: 'default', value: 'all_manual' },
    ],
  },

  // ── Email Signal ───────────────────────────────────────────────
  {
    id: 'slack-012',
    type: 'email_signal',
    timestamp: '2026-02-23T09:15:00-05:00',
    channel: 'DM',
    header: 'Email Signal: DataFlow — Internal Forward Detected',
    sections: [
      {
        type: 'text',
        text: `*Jake Torres* forwarded your follow-up email to *marcus.wong@dataflow.io* (CTO) at 10:47 PM last night.

Subject line unchanged: "DataFlow x Meridian — Demo Follow-Up & Next Steps"

This confirms Jake is actively championing internally. Marcus Wong is not yet in your CRM.`,
      },
      { type: 'divider' },
      {
        type: 'fields',
        fields: [
          { label: 'Signal Type', value: 'Internal email forward' },
          { label: 'Forwarded To', value: 'Marcus Wong, CTO' },
          { label: 'Champion Action', value: 'Internal advocacy (strong signal)' },
          { label: 'Deal Impact', value: 'Economic buyer awareness — positive' },
        ],
      },
      { type: 'context', text: 'Real-time alert triggered by 3+ opens + forward detection (your preference).' },
    ],
    actions: [
      { label: 'Add Marcus to CRM', style: 'primary', value: 'add_marcus_crm' },
      { label: 'Draft Intro to Marcus', style: 'default', value: 'draft_marcus_intro' },
    ],
  },

  // ── Autonomy Promotion ─────────────────────────────────────────
  {
    id: 'slack-013',
    type: 'autonomy_promotion',
    timestamp: '2026-03-08T09:00:00-05:00',
    channel: 'DM',
    header: 'Autonomy Update: I\'m now auto-sending follow-up emails',
    sections: [
      {
        type: 'text',
        text: `Based on the last 2 weeks of working together, I\'ve earned enough trust to increase my autonomy in one area:

*Follow-Up Emails* — I\'ve drafted 8 post-meeting follow-up emails for you, and you approved all 8 without edits.

Starting today, I\'ll auto-send follow-up emails 1 hour after each external meeting. You\'ll be CC\'d on every email so you can review.`,
      },
      { type: 'divider' },
      {
        type: 'fields',
        fields: [
          { label: 'Approval Track Record', value: '8/8 approved (100%)' },
          { label: 'Avg Edit Rate', value: '0% (no edits needed)' },
          { label: 'New Behavior', value: 'Auto-send 1 hour after meetings' },
          { label: 'Override', value: 'Reply "pause follow-ups" anytime to revert' },
        ],
      },
      { type: 'context', text: 'Autonomy levels adjust based on your approval patterns. You can change this setting at any time in your copilot preferences.' },
    ],
    actions: [
      { label: 'Looks Good', style: 'primary', value: 'approve_autonomy' },
      { label: 'Keep Requiring Approval', style: 'default', value: 'revert_autonomy' },
    ],
  },

  // ── Conversational Response ────────────────────────────────────
  {
    id: 'slack-014',
    type: 'conversational_response',
    timestamp: '2026-02-22T16:15:00-05:00',
    channel: 'DM',
    header: 'Re: Quick question about DataFlow',
    sections: [
      {
        type: 'text',
        text: `You asked: "What's our win rate against Intercom in deals over $100K?"

Based on your team\'s data over the last 12 months:

*Win rate vs. Intercom (deals >$100K): 67%* (4 wins, 2 losses)

The 2 losses were both in mid-market companies where Intercom\'s lower initial pricing won out. In enterprise deals (your segment), you\'re actually at *83%* against Intercom — integration depth consistently beats brand recognition at this level.

Your DataFlow deal ($180K) fits the enterprise pattern. Jake\'s comment about Intercom\'s "not great" integration story aligns with the typical winning narrative.

Want me to pull up the specific win/loss details for the Intercom matchups?`,
      },
    ],
  },
];

// ── Helpers ──────────────────────────────────────────────────────

export const getMessagesByType = (type: SlackMessageType) =>
  slackMessages.filter((m) => m.type === type);

export const getMessageById = (id: string) =>
  slackMessages.find((m) => m.id === id);

export const getDayOneMessages = () =>
  slackMessages.filter((m) => m.timestamp.startsWith('2026-02-22'));

export const getMessageTimeline = () =>
  [...slackMessages].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
