// Demo timeline data — 30-day agent progression
// Shows the AI copilot becoming increasingly autonomous over time

export type TimelineEventType =
  | 'briefing'
  | 'meeting_prep'
  | 'debrief'
  | 'crm_update'
  | 'risk_alert'
  | 'eod'
  | 'reengagement'
  | 'coaching'
  | 'email_signal'
  | 'config_question'
  | 'autonomy_promotion'
  | 'overnight'
  | 'competitive_intel'
  | 'proposal_generated'
  | 'follow_up_sent'
  | 'relationship_mapped';

export type AgentType = 'copilot' | 'system' | 'user_action';

export interface TimelineEvent {
  day: number;
  time: string;
  type: TimelineEventType;
  title: string;
  description: string;
  agentType: AgentType;
  icon: string; // Lucide icon name
  requiresApproval?: boolean;
  approved?: boolean;
  linkedDealId?: string;
  linkedContactId?: string;
}

export const timeline: TimelineEvent[] = [
  // ── DAY 1 ──────────────────────────────────────────────────────
  { day: 1, time: '07:30', type: 'briefing', title: 'First Morning Briefing Delivered', description: 'Good morning Sarah! I\'m your new AI copilot. Here\'s your day: 4 external meetings, 2 internal. Your pipeline stands at $2.4M across 8 deals. I\'ve prepared meeting briefs for each call. Key focus: DataFlow demo at 10 AM — Jake Torres is your champion.', agentType: 'copilot', icon: 'Sun' },
  { day: 1, time: '09:30', type: 'meeting_prep', title: 'DataFlow Demo Prep Sent', description: 'Pre-meeting brief for DataFlow Systems. Key intel: Jake visited pricing page 3x this week. Lisa Park previously evaluated Intercom. Sophie Wright joined asking about SSO. Competitor alert: Intercom rep spotted at DataFlow office.', agentType: 'copilot', icon: 'FileText', linkedDealId: 'deal-001' },
  { day: 1, time: '11:05', type: 'debrief', title: 'DataFlow Demo Debrief Generated', description: 'Meeting analysis complete. Champion signal STRONG — Jake said "this is a no-brainer" regarding Jira integration. Lisa raised analytics depth concern — need cohort analysis demo. Sophie needs security whitepaper. Next step: Jake wants CTO Marcus in follow-up Wednesday.', agentType: 'copilot', icon: 'MessageSquare', linkedDealId: 'deal-001' },
  { day: 1, time: '11:10', type: 'crm_update', title: 'CRM Update Drafted — DataFlow', description: 'Drafted CRM updates: Deal stage → Demo Completed, Champion confirmed (Jake Torres), Next steps added, Competitor flag (Intercom). Waiting for your approval before updating.', agentType: 'copilot', icon: 'Database', requiresApproval: true, approved: true, linkedDealId: 'deal-001' },
  { day: 1, time: '11:15', type: 'config_question', title: 'Config Question: CRM Auto-Updates', description: 'After your DataFlow meeting, I drafted CRM updates. Which fields should I update automatically vs. ask you first? [Auto all / Partial / Manual]', agentType: 'copilot', icon: 'Settings' },
  { day: 1, time: '12:20', type: 'debrief', title: 'CloudBase Follow-Up Debrief', description: 'Maria Chen is ready to move forward. She\'s focused on pricing (opened proposal 4 times). Recommended: offer 10% multi-year discount, hold on implementation timeline. Her promotion gives her direct budget authority.', agentType: 'copilot', icon: 'MessageSquare', linkedDealId: 'deal-003' },
  { day: 1, time: '14:50', type: 'debrief', title: 'TechVault Discovery Debrief', description: 'Strong discovery call. Key pain: broken health scoring from Zendesk. Rachel Adams previously used Meridian at Signal Corp — warm reference. Zendesk contract ends March 31 — tight timeline. Ben Foster is the internal champion for change.', agentType: 'copilot', icon: 'MessageSquare', linkedDealId: 'deal-005' },
  { day: 1, time: '15:00', type: 'risk_alert', title: 'Risk Alert: Apex Partners', description: 'David Kim (champion at Apex Partners) hasn\'t responded to your last 2 emails (12 days of silence). Deal is in Negotiation stage at $95K. Recommendation: try alternate contact or LinkedIn message.', agentType: 'copilot', icon: 'AlertTriangle', linkedDealId: 'deal-004' },
  { day: 1, time: '17:30', type: 'eod', title: 'End-of-Day Synthesis', description: 'Day 1 complete. 3 external meetings held (all positive). DataFlow: strong demo, CTO meeting next week. CloudBase: negotiation advancing, offer 10% multi-year. TechVault: promising discovery, tight March timeline. Risk: Apex Partners (12 days silent). Tomorrow: follow up on all three, prepare TechVault proposal.', agentType: 'copilot', icon: 'Moon' },
  { day: 1, time: '23:00', type: 'overnight', title: 'Overnight Processing Started', description: 'Scanning email signals, LinkedIn activity, and news mentions for your pipeline accounts. Will have digest ready by 7:30 AM.', agentType: 'copilot', icon: 'Zap' },

  // ── DAY 2 ──────────────────────────────────────────────────────
  { day: 2, time: '07:30', type: 'briefing', title: 'Morning Briefing — Day 2', description: 'Overnight signals: Jake Torres shared your demo recording link with 3 colleagues (email forward detected). Maria Chen\'s calendar shows "Meridian Contract Review" with CFO tomorrow. TechVault posted a job for "Customer Success Platform Admin" — they\'re planning for implementation.', agentType: 'copilot', icon: 'Sun' },
  { day: 2, time: '08:00', type: 'config_question', title: 'Config Question: Briefing Time', description: 'What time should I deliver your morning briefing? I noticed you typically open Slack around 7:45 AM.', agentType: 'copilot', icon: 'Settings' },
  { day: 2, time: '09:15', type: 'email_signal', title: 'Email Signal: DataFlow Proposal Forwarded', description: 'Jake Torres forwarded your follow-up email to marcus.wong@dataflow.io (CTO). Subject line unchanged. This confirms Jake is championing internally. Marcus Wong not yet in your CRM — shall I add him?', agentType: 'copilot', icon: 'Mail', requiresApproval: true, approved: true, linkedDealId: 'deal-001' },
  { day: 2, time: '11:45', type: 'crm_update', title: 'CRM Auto-Update: Meeting Notes', description: 'Auto-updated meeting notes and next steps for DataFlow, CloudBase, and TechVault per your preference (partial auto-update). Stage changes still pending your approval.', agentType: 'copilot', icon: 'Database' },
  { day: 2, time: '14:00', type: 'config_question', title: 'Config Question: Risk Threshold', description: 'I flagged Apex Partners as at-risk because David Kim hasn\'t responded in 12 days. What\'s your threshold for flagging deal risk based on champion silence?', agentType: 'copilot', icon: 'Settings' },
  { day: 2, time: '17:30', type: 'eod', title: 'End-of-Day Synthesis — Day 2', description: 'Strong signals today. DataFlow: CTO loop-in confirmed (Jake forwarded to Marcus Wong). CloudBase: CFO review scheduled tomorrow — deal may accelerate. TechVault: hiring for platform admin — serious intent. Apex: still silent. Tomorrow: prep CloudBase negotiation materials.', agentType: 'copilot', icon: 'Moon' },

  // ── DAY 3 ──────────────────────────────────────────────────────
  { day: 3, time: '07:30', type: 'briefing', title: 'Morning Briefing — Day 3', description: '2 meetings today. CloudBase CFO review happening (not your meeting — Maria presenting internally). Apex Partners: David Kim viewed your LinkedIn profile at 11:47 PM last night — potential re-engagement signal.', agentType: 'copilot', icon: 'Sun' },
  { day: 3, time: '09:30', type: 'config_question', title: 'Config Question: Risk Threshold (answered)', description: 'You chose "stage-dependent" risk thresholds. I\'ll set: Discovery=14 days, Proposal=10 days, Negotiation=7 days. Apex Partners (Negotiation) now flagged at 7-day threshold.', agentType: 'copilot', icon: 'Settings' },
  { day: 3, time: '10:00', type: 'reengagement', title: 'Re-engagement Draft: Apex Partners', description: 'Drafted re-engagement email for David Kim based on his LinkedIn visit signal. Tone: casual check-in, not pushy. Mentions a case study from similar fintech deployment. Waiting for your review.', agentType: 'copilot', icon: 'RefreshCw', requiresApproval: true, approved: true, linkedDealId: 'deal-004' },
  { day: 3, time: '15:00', type: 'competitive_intel', title: 'Competitive Alert: Intercom at DataFlow', description: 'Intercom published a case study featuring a company in DataFlow\'s industry (DevTools). Lisa Park liked the post on LinkedIn. Recommendation: send your own relevant case study to Lisa preemptively.', agentType: 'copilot', icon: 'Shield', linkedDealId: 'deal-001' },
  { day: 3, time: '17:30', type: 'eod', title: 'End-of-Day Synthesis — Day 3', description: 'Apex re-engagement sent. David Kim opened it within 2 hours — promising. Competitive threat: Intercom targeting DataFlow. CloudBase CFO review outcome unknown — Maria hasn\'t responded yet. Pipeline health: stable at $2.4M.', agentType: 'copilot', icon: 'Moon' },

  // ── DAY 5 ──────────────────────────────────────────────────────
  { day: 5, time: '07:30', type: 'briefing', title: 'Morning Briefing — Day 5', description: 'Great news: David Kim (Apex) replied — wants to reschedule negotiation call next week. DataFlow CTO Marcus confirmed Wednesday demo. CloudBase: Maria sent counter-proposal (12% discount ask). 3 meetings today.', agentType: 'copilot', icon: 'Sun' },
  { day: 5, time: '10:00', type: 'meeting_prep', title: 'DataFlow CTO Demo Prep', description: 'Marcus Wong (CTO) background: MIT CS, previously VP Eng at Stripe, technical buyer focused on scalability. Recommended demo flow: API throughput benchmarks → security architecture → enterprise SLA. Jake will be in the room as your champion.', agentType: 'copilot', icon: 'FileText', linkedDealId: 'deal-001' },
  { day: 5, time: '14:00', type: 'config_question', title: 'Config Question: MEDDPICC Framework', description: 'I noticed you use MEDDPICC-style qualification in your discovery notes. Should I structure my deal analysis around MEDDPICC criteria?', agentType: 'copilot', icon: 'Settings' },
  { day: 5, time: '16:00', type: 'coaching', title: 'Weekly Coaching Insight', description: 'This week: 5 meetings, 100% show rate. Your discovery-to-proposal conversion is 85% (team avg 72%). Area for improvement: you tend to delay follow-up emails by 4.2 hours on average — top performers send within 1 hour. Suggestion: let me auto-draft follow-ups immediately after meetings.', agentType: 'copilot', icon: 'GraduationCap' },
  { day: 5, time: '17:30', type: 'eod', title: 'End-of-Day Synthesis — Day 5', description: 'DataFlow CTO demo went well — Marcus asked about enterprise pricing (buying signal). Apex back on track. CloudBase counter-proposal needs response. Weekly pipeline: $2.4M → $2.5M (DataFlow stage advance). MEDDPICC analysis enabled for all deals.', agentType: 'copilot', icon: 'Moon' },

  // ── DAY 7 ──────────────────────────────────────────────────────
  { day: 7, time: '07:30', type: 'briefing', title: 'Morning Briefing — Day 7 (Week 1 Complete)', description: 'Week 1 summary: 12 external meetings, 3 deals advanced, 1 risk mitigated (Apex), 1 new opportunity (TechVault). I\'ve learned your preferences for 5 config areas. My confidence in CRM updates is now 78%. Next week: focus on DataFlow proposal and CloudBase close.', agentType: 'copilot', icon: 'Sun' },
  { day: 7, time: '09:00', type: 'relationship_mapped', title: 'Relationship Map Updated', description: 'I mapped your relationship network: 14 active contacts across 8 deals. Discovered warm intro path: you → Lisa Park (former Zendesk colleague) → Jake Torres. Also found: Priya Sharma (former DataFlow) could intro you to FinanceFirst.', agentType: 'copilot', icon: 'Network' },
  { day: 7, time: '17:30', type: 'eod', title: 'Week 1 EOD Synthesis', description: 'Week 1 complete. Config completeness: 45%. I\'m now auto-updating meeting notes and next steps without approval. Stage changes still require your confirmation. Next week I\'ll start generating competitive battle cards automatically.', agentType: 'copilot', icon: 'Moon' },

  // ── DAY 10 ─────────────────────────────────────────────────────
  { day: 10, time: '07:30', type: 'briefing', title: 'Morning Briefing — Day 10', description: 'DataFlow requesting proposal by Friday. CloudBase: Maria accepted 10% multi-year — contract in legal review. TechVault: Rachel wants ROI analysis before proceeding. Apex: negotiation call rescheduled to tomorrow. Email signals: 3 contacts opened emails overnight.', agentType: 'copilot', icon: 'Sun' },
  { day: 10, time: '10:00', type: 'proposal_generated', title: 'DataFlow Proposal Auto-Generated', description: 'I drafted the DataFlow proposal based on our conversations. Enterprise tier ($150K), 12-month contract, Jira integration highlighted as key differentiator. Includes ROI analysis: 340% over 3 years. Sent to your review queue.', agentType: 'copilot', icon: 'FileEdit', requiresApproval: true, approved: true, linkedDealId: 'deal-001' },
  { day: 10, time: '14:00', type: 'email_signal', title: 'Email Signal: CloudBase Legal', description: 'CloudBase legal team (tom.baker@cloudbase.com) downloaded the MSA attachment twice. Maria forwarded pricing summary to finance@cloudbase.com. Strong close signals — this deal is moving.', agentType: 'copilot', icon: 'Mail', linkedDealId: 'deal-003' },
  { day: 10, time: '17:30', type: 'eod', title: 'End-of-Day Synthesis — Day 10', description: 'Pipeline update: CloudBase likely to close this week ($120K). DataFlow proposal sent — awaiting feedback. Apex negotiation tomorrow. TechVault needs ROI analysis. Total weighted pipeline: $1.35M. Config completeness: 55%.', agentType: 'copilot', icon: 'Moon' },

  // ── DAY 14 ─────────────────────────────────────────────────────
  { day: 14, time: '07:30', type: 'briefing', title: 'Morning Briefing — Day 14 (Week 2 Complete)', description: 'Week 2 highlights: CloudBase CLOSED ($120K). DataFlow in final negotiation. Apex counter-proposed (asking for 90-day payment terms). TechVault proposal sent. New inbound: Quantum Labs ($60K potential). I auto-drafted 8 follow-up emails this week — all approved.', agentType: 'copilot', icon: 'Sun' },
  { day: 14, time: '09:00', type: 'autonomy_promotion', title: 'Autonomy Level Increased: Follow-Up Emails', description: 'Based on 8/8 approved follow-up email drafts, I\'m increasing my autonomy for post-meeting follow-ups. I\'ll now auto-send follow-up emails 1 hour after meetings (you\'ll be CC\'d). You can revert this anytime.', agentType: 'system', icon: 'TrendingUp' },
  { day: 14, time: '16:00', type: 'coaching', title: 'Week 2 Coaching Digest', description: 'You closed CloudBase 3 days ahead of forecast — your negotiation efficiency improved 15% this quarter. Follow-up response time improved from 4.2 hours to 1.8 hours (with my help). Area to watch: multi-threading at TechVault — only 2 contacts engaged, recommend adding a financial stakeholder.', agentType: 'copilot', icon: 'GraduationCap' },

  // ── DAY 18 ─────────────────────────────────────────────────────
  { day: 18, time: '07:30', type: 'briefing', title: 'Morning Briefing — Day 18', description: 'DataFlow: Jake requesting implementation timeline and customer references. I\'ve pre-selected 3 references from similar companies. Apex: David Kim accepted revised terms. TechVault: ROI analysis sent, Rachel engaged. Auto-sent 2 follow-ups yesterday (both opened).', agentType: 'copilot', icon: 'Sun' },
  { day: 18, time: '10:00', type: 'follow_up_sent', title: 'Auto Follow-Up: DataFlow References', description: 'Auto-sent reference packet to Jake Torres: 3 case studies (DevTools companies, similar scale). Included implementation timeline and success metrics. You\'re CC\'d.', agentType: 'copilot', icon: 'Send', linkedDealId: 'deal-001' },
  { day: 18, time: '14:30', type: 'crm_update', title: 'Auto CRM Update: Apex Partners', description: 'Auto-updated: Apex deal stage → Negotiation (Final), added revised payment terms, updated close date to March 15. Contact sentiment: David Kim → Positive (was Neutral).', agentType: 'copilot', icon: 'Database', linkedDealId: 'deal-004' },

  // ── DAY 21 ─────────────────────────────────────────────────────
  { day: 21, time: '07:30', type: 'briefing', title: 'Morning Briefing — Day 21 (Week 3)', description: 'Pipeline at $2.1M weighted. DataFlow in final negotiation ($180K). Apex contract out for signature ($95K). TechVault advancing to Proposal ($65K). Quantum Labs discovery scheduled. I handled 12 routine tasks autonomously this week. Config completeness: 80%.', agentType: 'copilot', icon: 'Sun' },
  { day: 21, time: '11:00', type: 'autonomy_promotion', title: 'Autonomy Level Increased: CRM Stage Updates', description: 'Based on 15 consecutive approved CRM stage updates, I\'m now auto-updating deal stages when clear evidence supports it (meeting outcomes, signed documents, verbal confirmations in transcripts). I\'ll notify you of each change.', agentType: 'system', icon: 'TrendingUp' },
  { day: 21, time: '15:00', type: 'risk_alert', title: 'Risk Alert: TechVault Timeline', description: 'TechVault\'s Zendesk contract ends in 10 days (March 31). They haven\'t started legal review yet. At current pace, implementation won\'t complete before Zendesk expires. Recommendation: propose 30-day overlap period and expedited onboarding.', agentType: 'copilot', icon: 'AlertTriangle', linkedDealId: 'deal-005' },

  // ── DAY 25 ─────────────────────────────────────────────────────
  { day: 25, time: '07:30', type: 'briefing', title: 'Morning Briefing — Day 25', description: 'Apex Partners CLOSED ($95K) — signature received last night. DataFlow final redlines in progress. TechVault: accepted overlap proposal. Quantum Labs: strong discovery, demo scheduled. Total closed this month: $215K. Quota attainment: 82%.', agentType: 'copilot', icon: 'Sun' },
  { day: 25, time: '09:00', type: 'crm_update', title: 'Auto CRM Update: Apex Closed-Won', description: 'Auto-updated Apex Partners to Closed-Won. Updated revenue: $95K. Notified your manager James Wright. Added win notes: "Champion re-engagement on Day 3 was the turning point." Updated pipeline forecast.', agentType: 'copilot', icon: 'Database', linkedDealId: 'deal-004' },
  { day: 25, time: '14:00', type: 'reengagement', title: 'Auto Re-engagement: Vertex AI (Ghost Deal)', description: 'Vertex AI has been silent for 25 days. I\'ve auto-sent a re-engagement email referencing their Q2 planning cycle and a new feature release relevant to their use case. You\'re CC\'d.', agentType: 'copilot', icon: 'RefreshCw' },

  // ── DAY 28 ─────────────────────────────────────────────────────
  { day: 28, time: '07:30', type: 'briefing', title: 'Morning Briefing — Day 28', description: 'DataFlow contract signed yesterday ($180K) — your biggest deal this quarter. TechVault in final negotiation. Quantum Labs proposal sent. Pipeline replenishment: identified 3 new accounts from your network that match your ICP. Config completeness: 91%.', agentType: 'copilot', icon: 'Sun' },
  { day: 28, time: '09:00', type: 'autonomy_promotion', title: 'Autonomy Level: Expert Tier Reached', description: 'You\'ve reached Expert tier. I\'m now operating at full autonomy for: follow-up emails, CRM updates (all fields), meeting prep, competitive alerts, re-engagement campaigns, and proposal first drafts. You approve: pricing changes, contract terms, and new account strategy.', agentType: 'system', icon: 'Award' },

  // ── DAY 30 ─────────────────────────────────────────────────────
  { day: 30, time: '07:30', type: 'briefing', title: 'Morning Briefing — Day 30 (Month Complete)', description: 'Month 1 complete. Closed: $395K (DataFlow $180K, CloudBase $120K, Apex $95K). Pipeline: $890K weighted across 6 deals. Quota attainment: 94%. I handled 847 tasks this month — 340 autonomously, 507 with your approval. Response time savings: 23 hours. Config completeness: 94%.', agentType: 'copilot', icon: 'Sun' },
  { day: 30, time: '16:00', type: 'coaching', title: 'Month 1 Coaching Report', description: 'Monthly performance: Close rate improved 18% vs. last quarter. Average deal cycle reduced by 8 days. Multi-threading score: 3.2 contacts per deal (up from 2.1). Areas of excellence: champion identification, competitive positioning. Growth area: executive sponsor engagement — recommend adding VP+ contacts earlier in cycle.', agentType: 'copilot', icon: 'GraduationCap' },
  { day: 30, time: '17:30', type: 'eod', title: 'Month 1 Final Synthesis', description: 'What a month. 3 deals closed, 6 in pipeline, 94% quota attainment. I\'ve gone from asking you about everything to handling 40% of tasks autonomously. Next month: targeting 60% autonomous operations, focusing on proactive pipeline generation and multi-account competitive strategy.', agentType: 'copilot', icon: 'Moon' },
];

// ── Autonomy Progression ─────────────────────────────────────────

export interface AutonomyStep {
  day: number;
  action: string;
  level: 'ask_everything' | 'ask_most' | 'ask_important' | 'auto_routine' | 'full_autonomy';
  approvalCount: number;
  rejectionCount: number;
}

export const autonomyProgression: AutonomyStep[] = [
  { day: 1, action: 'All CRM updates require approval', level: 'ask_everything', approvalCount: 0, rejectionCount: 0 },
  { day: 2, action: 'Meeting notes auto-updated (approved)', level: 'ask_most', approvalCount: 3, rejectionCount: 0 },
  { day: 3, action: 'Re-engagement emails drafted for review', level: 'ask_most', approvalCount: 7, rejectionCount: 1 },
  { day: 5, action: 'MEDDPICC analysis auto-generated', level: 'ask_most', approvalCount: 14, rejectionCount: 1 },
  { day: 7, action: 'Competitive alerts auto-delivered', level: 'ask_important', approvalCount: 22, rejectionCount: 2 },
  { day: 10, action: 'Proposal first drafts auto-generated', level: 'ask_important', approvalCount: 35, rejectionCount: 2 },
  { day: 14, action: 'Follow-up emails auto-sent (1hr delay)', level: 'auto_routine', approvalCount: 52, rejectionCount: 3 },
  { day: 18, action: 'CRM contact records auto-created', level: 'auto_routine', approvalCount: 78, rejectionCount: 3 },
  { day: 21, action: 'Deal stage updates auto-applied', level: 'auto_routine', approvalCount: 112, rejectionCount: 4 },
  { day: 25, action: 'Re-engagement campaigns auto-launched', level: 'auto_routine', approvalCount: 145, rejectionCount: 4 },
  { day: 28, action: 'Expert tier — full routine autonomy', level: 'full_autonomy', approvalCount: 180, rejectionCount: 5 },
  { day: 30, action: 'Month 1 complete: 340 autonomous, 507 approved', level: 'full_autonomy', approvalCount: 507, rejectionCount: 5 },
];

// ── Overnight Work (Day 1, 11PM-7AM) ─────────────────────────────

export interface OvernightWorkItem {
  time: string;
  title: string;
  description: string;
  type: 'email_scan' | 'social_monitor' | 'news_alert' | 'data_enrichment' | 'digest_prep';
  findings: string[];
}

export const overnightWork: OvernightWorkItem[] = [
  {
    time: '23:15',
    title: 'Email Signal Scan',
    type: 'email_scan',
    description: 'Scanned email engagement signals across all pipeline contacts for the last 12 hours.',
    findings: [
      'Jake Torres (DataFlow) forwarded demo recording to 3 internal colleagues at 10:47 PM',
      'Maria Chen (CloudBase) opened proposal PDF for the 5th time at 9:30 PM — focused on pricing page',
      'Unknown contact at TechVault (it-procurement@techvault.io) downloaded security whitepaper',
    ],
  },
  {
    time: '00:30',
    title: 'LinkedIn Activity Monitor',
    type: 'social_monitor',
    description: 'Monitored LinkedIn activity for pipeline contacts and target accounts.',
    findings: [
      'David Kim (Apex Partners) viewed Sarah\'s LinkedIn profile at 11:47 PM — first activity in 12 days',
      'Rachel Adams (TechVault) posted about "evaluating next-gen customer platforms" — public buying signal',
      'DataFlow Systems posted 2 engineering job listings mentioning "customer success tooling" integration',
    ],
  },
  {
    time: '02:00',
    title: 'Industry News Scan',
    type: 'news_alert',
    description: 'Scanned tech news, funding announcements, and industry reports for pipeline relevance.',
    findings: [
      'Intercom announced price increase effective April 1 — potential ammunition for DataFlow deal',
      'TechVault competitor FreshDesk acquired by private equity — may create urgency',
      'G2 published Q1 report: Meridian rated #1 in "Ease of Integration" for 3rd consecutive quarter',
    ],
  },
  {
    time: '04:00',
    title: 'Contact Data Enrichment',
    type: 'data_enrichment',
    description: 'Enriched contact records with latest available data for meeting preparation.',
    findings: [
      'Marcus Wong (DataFlow CTO) — found recent conference talk on "API-first architecture" (relevant to demo)',
      'Maria Chen (CloudBase) promoted from Director to Head of Operations (LinkedIn update)',
      'Sophie Wright (DataFlow IT) — previously worked at Okta, deep SSO/SCIM expertise',
    ],
  },
  {
    time: '06:30',
    title: 'Morning Briefing Preparation',
    type: 'digest_prep',
    description: 'Compiled all overnight findings into structured morning briefing with prioritized action items.',
    findings: [
      'Briefing ready for 7:30 AM delivery via Slack DM',
      'Priority 1: DataFlow internal sharing — champion signal (Jake forwarding to CTO)',
      'Priority 2: Apex Partners — David Kim showing signs of re-engagement',
      'Priority 3: CloudBase — Maria in deep proposal review, likely preparing for CFO conversation',
    ],
  },
];
