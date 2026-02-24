/**
 * useMockAgentRace
 *
 * Client-side simulation hook that drives fake SSE-like events for the
 * multi-agent demo page. Produces the same interface shape as useCopilotChat
 * so the RacePanel can swap between live and mock mode seamlessly.
 */

import { useState, useCallback, useRef } from 'react';
import type { MockAgentState, TimelineEntry } from '@/components/platform/demo/types';

// =============================================================================
// Scenario Data — SMB sales workflows (longer, high-volume processes)
// =============================================================================

interface MockScenarioData {
  singleAgent: {
    tools: { name: string; delayMs: number }[];
    response: string;
  };
  multiAgent: {
    agents: {
      name: string;
      displayName: string;
      icon: string;
      color: string;
      reason: string;
      tools: { name: string; delayMs: number }[];
      delayBeforeStart: number;
    }[];
    response: string;
  };
}

const SCENARIO_DATA: Record<string, MockScenarioData> = {
  // =========================================================================
  // Weekly Pipeline Cleanup — 4 agents, the Friday grind
  // Single-agent: 24 sequential tools (~28s)
  // Multi-agent: 4 parallel agents (~7s)
  // =========================================================================
  'weekly-pipeline-cleanup': {
    singleAgent: {
      tools: [
        { name: 'get_pipeline_deals', delayMs: 1300 },
        { name: 'get_pipeline_summary', delayMs: 1100 },
        { name: 'get_contacts_needing_attention', delayMs: 1000 },
        { name: 'get_deal', delayMs: 800 },
        { name: 'get_deal', delayMs: 800 },
        { name: 'get_deal', delayMs: 800 },
        { name: 'get_deal', delayMs: 800 },
        { name: 'get_deal', delayMs: 800 },
        { name: 'get_deal', delayMs: 800 },
        { name: 'get_deal', delayMs: 800 },
        { name: 'enrich_company', delayMs: 1400 },
        { name: 'enrich_company', delayMs: 1400 },
        { name: 'search_emails', delayMs: 900 },
        { name: 'search_emails', delayMs: 900 },
        { name: 'draft_email', delayMs: 1300 },
        { name: 'draft_email', delayMs: 1300 },
        { name: 'draft_email', delayMs: 1300 },
        { name: 'draft_email', delayMs: 1300 },
        { name: 'update_crm', delayMs: 600 },
        { name: 'update_crm', delayMs: 600 },
        { name: 'update_crm', delayMs: 600 },
        { name: 'create_task', delayMs: 500 },
        { name: 'create_task', delayMs: 500 },
        { name: 'create_task', delayMs: 500 },
      ],
      response:
        'Pipeline audit done (24 tool calls). 32 active deals reviewed — 7 flagged stale (no activity 14+ days). Biggest risk: BrightPath Media ($42k) went dark after the proposal. GreenLeaf Co ($28k) contact left the company — enriched replacement. 4 nudge emails drafted for stuck deals. 3 deal stages updated to match reality. 3 follow-up tasks created for next week.',
    },
    multiAgent: {
      agents: [
        {
          name: 'pipeline',
          displayName: 'Pipeline Manager',
          icon: 'BarChart3',
          color: 'blue',
          reason: 'Auditing 32 deals and flagging stale activity',
          tools: [
            { name: 'get_pipeline_deals', delayMs: 800 },
            { name: 'get_pipeline_summary', delayMs: 700 },
            { name: 'get_contacts_needing_attention', delayMs: 600 },
            { name: 'get_deal', delayMs: 400 },
            { name: 'get_deal', delayMs: 400 },
            { name: 'get_deal', delayMs: 400 },
            { name: 'get_deal', delayMs: 400 },
          ],
          delayBeforeStart: 100,
        },
        {
          name: 'research',
          displayName: 'Research & Enrichment',
          icon: 'Search',
          color: 'emerald',
          reason: 'Checking for contact and company changes',
          tools: [
            { name: 'enrich_company', delayMs: 900 },
            { name: 'enrich_company', delayMs: 900 },
            { name: 'search_emails', delayMs: 600 },
            { name: 'search_emails', delayMs: 600 },
          ],
          delayBeforeStart: 200,
        },
        {
          name: 'outreach',
          displayName: 'Outreach & Follow-up',
          icon: 'Mail',
          color: 'purple',
          reason: 'Drafting nudge emails for 4 stuck deals',
          tools: [
            { name: 'draft_email', delayMs: 900 },
            { name: 'draft_email', delayMs: 900 },
            { name: 'draft_email', delayMs: 900 },
            { name: 'draft_email', delayMs: 900 },
          ],
          delayBeforeStart: 300,
        },
        {
          name: 'crm_ops',
          displayName: 'CRM Operations',
          icon: 'Database',
          color: 'orange',
          reason: 'Updating 3 stages and creating tasks for next week',
          tools: [
            { name: 'update_crm', delayMs: 400 },
            { name: 'update_crm', delayMs: 400 },
            { name: 'update_crm', delayMs: 400 },
            { name: 'create_task', delayMs: 300 },
            { name: 'create_task', delayMs: 300 },
            { name: 'create_task', delayMs: 300 },
          ],
          delayBeforeStart: 350,
        },
      ],
      response:
        'Pipeline cleanup done — 4 agents, 24 tools, all in parallel. 32 deals audited: 7 stale, 3 stages corrected. BrightPath ($42k) flagged critical — dark after proposal. GreenLeaf contact replaced, enriched the new VP. 4 nudge emails ready to send. 3 follow-up tasks queued for Monday.',
    },
  },

  // =========================================================================
  // Inbound Lead Rush — 4 agents, high-volume lead processing
  // Single-agent: 26 sequential tools (~32s)
  // Multi-agent: 4 parallel agents (~8s)
  // =========================================================================
  'inbound-lead-rush': {
    singleAgent: {
      tools: [
        { name: 'search_leads_create_table', delayMs: 2200 },
        { name: 'enrich_contact', delayMs: 1400 },
        { name: 'enrich_contact', delayMs: 1400 },
        { name: 'enrich_contact', delayMs: 1400 },
        { name: 'enrich_contact', delayMs: 1400 },
        { name: 'enrich_contact', delayMs: 1400 },
        { name: 'enrich_company', delayMs: 1300 },
        { name: 'enrich_company', delayMs: 1300 },
        { name: 'enrich_company', delayMs: 1300 },
        { name: 'enrich_company', delayMs: 1300 },
        { name: 'enrich_company', delayMs: 1300 },
        { name: 'get_company_status', delayMs: 800 },
        { name: 'get_company_status', delayMs: 800 },
        { name: 'draft_email', delayMs: 1300 },
        { name: 'draft_email', delayMs: 1300 },
        { name: 'draft_email', delayMs: 1300 },
        { name: 'draft_email', delayMs: 1300 },
        { name: 'draft_email', delayMs: 1300 },
        { name: 'draft_email', delayMs: 1300 },
        { name: 'create_task', delayMs: 500 },
        { name: 'create_task', delayMs: 500 },
        { name: 'create_task', delayMs: 500 },
        { name: 'create_task', delayMs: 500 },
        { name: 'create_task', delayMs: 500 },
        { name: 'create_task', delayMs: 500 },
        { name: 'create_task', delayMs: 500 },
      ],
      response:
        'Webinar leads processed (26 tool calls). 14 leads scored: 5 strong ICP fit (20-150 employees, B2B SaaS), 6 moderate, 3 poor fit. Top leads: Axon Digital (CFO attended, 80 employees, using a competitor), PeakOps (VP Marketing, 45 employees, no current tool), Relay Group (CEO attended, 30 employees, growing fast). All 5 top leads enriched. 6 personalized follow-up emails drafted referencing webinar topics. 3-touch task cadence created for top 7 leads.',
    },
    multiAgent: {
      agents: [
        {
          name: 'prospecting',
          displayName: 'Prospecting',
          icon: 'Target',
          color: 'rose',
          reason: 'Pulling and scoring 14 webinar leads',
          tools: [
            { name: 'search_leads_create_table', delayMs: 1400 },
            { name: 'enrich_table_column', delayMs: 800 },
            { name: 'get_company_status', delayMs: 500 },
            { name: 'get_company_status', delayMs: 500 },
          ],
          delayBeforeStart: 100,
        },
        {
          name: 'research',
          displayName: 'Research & Enrichment',
          icon: 'Search',
          color: 'emerald',
          reason: 'Deep-enriching contacts and companies',
          tools: [
            { name: 'enrich_contact', delayMs: 700 },
            { name: 'enrich_contact', delayMs: 700 },
            { name: 'enrich_contact', delayMs: 700 },
            { name: 'enrich_contact', delayMs: 700 },
            { name: 'enrich_contact', delayMs: 700 },
            { name: 'enrich_company', delayMs: 800 },
            { name: 'enrich_company', delayMs: 800 },
            { name: 'enrich_company', delayMs: 800 },
          ],
          delayBeforeStart: 200,
        },
        {
          name: 'outreach',
          displayName: 'Outreach & Follow-up',
          icon: 'Mail',
          color: 'purple',
          reason: 'Writing personalized webinar follow-up emails',
          tools: [
            { name: 'draft_email', delayMs: 800 },
            { name: 'draft_email', delayMs: 800 },
            { name: 'draft_email', delayMs: 800 },
            { name: 'draft_email', delayMs: 800 },
            { name: 'draft_email', delayMs: 800 },
            { name: 'draft_email', delayMs: 800 },
          ],
          delayBeforeStart: 300,
        },
        {
          name: 'crm_ops',
          displayName: 'CRM Operations',
          icon: 'Database',
          color: 'orange',
          reason: 'Building 3-touch task cadences for top leads',
          tools: [
            { name: 'create_task', delayMs: 300 },
            { name: 'create_task', delayMs: 300 },
            { name: 'create_task', delayMs: 300 },
            { name: 'create_task', delayMs: 300 },
            { name: 'create_task', delayMs: 300 },
            { name: 'create_task', delayMs: 300 },
            { name: 'create_task', delayMs: 300 },
          ],
          delayBeforeStart: 400,
        },
      ],
      response:
        'Webinar leads handled — 4 agents, 26 tools. 14 leads scored: 5 strong ICP, 6 moderate, 3 poor. Top picks: Axon Digital (CFO, competitor user), PeakOps (VP Marketing, no tool), Relay Group (CEO, growing fast). All enriched. 6 personalized emails ready referencing webinar content. 3-touch task cadence built for the top 7.',
    },
  },

  // =========================================================================
  // Monthly Sales Review — 4 agents, manager 1:1 prep
  // Single-agent: 22 sequential tools (~26s)
  // Multi-agent: 4 parallel agents (~7s)
  // =========================================================================
  'monthly-sales-review': {
    singleAgent: {
      tools: [
        { name: 'get_pipeline_deals', delayMs: 1200 },
        { name: 'get_pipeline_forecast', delayMs: 1400 },
        { name: 'get_pipeline_summary', delayMs: 1100 },
        { name: 'get_contacts_needing_attention', delayMs: 1000 },
        { name: 'get_meetings_for_period', delayMs: 1100 },
        { name: 'get_meeting_count', delayMs: 800 },
        { name: 'get_booking_stats', delayMs: 900 },
        { name: 'get_time_breakdown', delayMs: 800 },
        { name: 'get_deal', delayMs: 700 },
        { name: 'get_deal', delayMs: 700 },
        { name: 'get_deal', delayMs: 700 },
        { name: 'get_deal', delayMs: 700 },
        { name: 'get_deal', delayMs: 700 },
        { name: 'enrich_company', delayMs: 1400 },
        { name: 'enrich_company', delayMs: 1400 },
        { name: 'enrich_contact', delayMs: 1300 },
        { name: 'enrich_contact', delayMs: 1300 },
        { name: 'search_emails', delayMs: 900 },
        { name: 'search_emails', delayMs: 900 },
        { name: 'draft_email', delayMs: 1500 },
        { name: 'create_task', delayMs: 500 },
        { name: 'create_task', delayMs: 500 },
      ],
      response:
        'Monthly review prep done (22 tool calls). Numbers: $890k total pipeline, $340k weighted forecast, 58% close rate this month (up from 52%). Meetings: 23 external meetings, 4.2 per week avg, 62% of time in customer-facing calls. Top 5 deals checked: Vertex Labs ($65k, on track), BrightPath ($42k, stalled — needs push), Cascade HR ($38k, verbal yes pending contract), Oakmont Group ($35k, new stakeholder surfaced), TrueNorth ($28k, pricing objection). Talking points drafted covering 2 wins, 3 risks, and an ask for marketing air cover on BrightPath.',
    },
    multiAgent: {
      agents: [
        {
          name: 'pipeline',
          displayName: 'Pipeline Manager',
          icon: 'BarChart3',
          color: 'blue',
          reason: 'Pulling close rates and deal metrics',
          tools: [
            { name: 'get_pipeline_deals', delayMs: 800 },
            { name: 'get_pipeline_forecast', delayMs: 900 },
            { name: 'get_pipeline_summary', delayMs: 700 },
            { name: 'get_contacts_needing_attention', delayMs: 600 },
            { name: 'get_deal', delayMs: 400 },
            { name: 'get_deal', delayMs: 400 },
            { name: 'get_deal', delayMs: 400 },
            { name: 'get_deal', delayMs: 400 },
            { name: 'get_deal', delayMs: 400 },
          ],
          delayBeforeStart: 100,
        },
        {
          name: 'meetings',
          displayName: 'Meeting Intelligence',
          icon: 'Calendar',
          color: 'amber',
          reason: 'Analyzing monthly meeting activity and patterns',
          tools: [
            { name: 'get_meetings_for_period', delayMs: 700 },
            { name: 'get_meeting_count', delayMs: 500 },
            { name: 'get_booking_stats', delayMs: 600 },
            { name: 'get_time_breakdown', delayMs: 500 },
          ],
          delayBeforeStart: 150,
        },
        {
          name: 'research',
          displayName: 'Research & Enrichment',
          icon: 'Search',
          color: 'emerald',
          reason: 'Checking for changes at top accounts',
          tools: [
            { name: 'enrich_company', delayMs: 800 },
            { name: 'enrich_company', delayMs: 800 },
            { name: 'enrich_contact', delayMs: 700 },
            { name: 'enrich_contact', delayMs: 700 },
            { name: 'search_emails', delayMs: 500 },
            { name: 'search_emails', delayMs: 500 },
          ],
          delayBeforeStart: 200,
        },
        {
          name: 'outreach',
          displayName: 'Outreach & Follow-up',
          icon: 'Mail',
          color: 'purple',
          reason: 'Drafting review talking points and action items',
          tools: [
            { name: 'draft_email', delayMs: 1200 },
            { name: 'create_task', delayMs: 300 },
            { name: 'create_task', delayMs: 300 },
          ],
          delayBeforeStart: 300,
        },
      ],
      response:
        'Review prep ready — 4 agents pulled everything. Pipeline: $890k total, $340k weighted, 58% close rate (up from 52%). Meetings: 23 external, 4.2/week, 62% customer-facing. Top 5 deals checked with enrichment. Talking points drafted: 2 wins (Vertex, Cascade), 3 risks (BrightPath stalled, Oakmont new stakeholder, TrueNorth pricing), 1 ask (marketing help on BrightPath).',
    },
  },

  // =========================================================================
  // Cold Outbound Sprint — 4 agents, building a list from scratch
  // Single-agent: 28 sequential tools (~34s)
  // Multi-agent: 4 parallel agents (~8s)
  // =========================================================================
  'cold-outbound-sprint': {
    singleAgent: {
      tools: [
        { name: 'search_leads_create_table', delayMs: 2400 },
        { name: 'enrich_table_column', delayMs: 1600 },
        { name: 'enrich_contact', delayMs: 1400 },
        { name: 'enrich_contact', delayMs: 1400 },
        { name: 'enrich_contact', delayMs: 1400 },
        { name: 'enrich_contact', delayMs: 1400 },
        { name: 'enrich_contact', delayMs: 1400 },
        { name: 'enrich_contact', delayMs: 1400 },
        { name: 'enrich_contact', delayMs: 1400 },
        { name: 'enrich_contact', delayMs: 1400 },
        { name: 'enrich_company', delayMs: 1300 },
        { name: 'enrich_company', delayMs: 1300 },
        { name: 'enrich_company', delayMs: 1300 },
        { name: 'enrich_company', delayMs: 1300 },
        { name: 'draft_email', delayMs: 1400 },
        { name: 'draft_email', delayMs: 1400 },
        { name: 'draft_email', delayMs: 1400 },
        { name: 'draft_email', delayMs: 1400 },
        { name: 'draft_email', delayMs: 1400 },
        { name: 'draft_email', delayMs: 1400 },
        { name: 'draft_email', delayMs: 1400 },
        { name: 'draft_email', delayMs: 1400 },
        { name: 'create_task', delayMs: 500 },
        { name: 'create_task', delayMs: 500 },
        { name: 'create_task', delayMs: 500 },
        { name: 'create_task', delayMs: 500 },
        { name: 'create_task', delayMs: 500 },
        { name: 'create_task', delayMs: 500 },
      ],
      response:
        'Outbound list built from scratch (28 tool calls). Found 25 marketing agencies, 20-100 employees. Enriched all decision-makers — 14 founders, 8 VPs, 3 directors. Top 8 personalized emails drafted: Spark Creative (referenced their recent brand refresh), NorthStar Media (mentioned their HubSpot usage), BlueWave Digital (cited their case study with a SaaS client), Clarity Agency (noted their recent hire of a RevOps lead), plus 4 more. Follow-up task sequence created for all 25 contacts — day 3 bump, day 7 value-add, day 14 breakup.',
    },
    multiAgent: {
      agents: [
        {
          name: 'prospecting',
          displayName: 'Prospecting',
          icon: 'Target',
          color: 'rose',
          reason: 'Finding 25 marketing agencies with 20-100 employees',
          tools: [
            { name: 'search_leads_create_table', delayMs: 1500 },
            { name: 'enrich_table_column', delayMs: 900 },
          ],
          delayBeforeStart: 100,
        },
        {
          name: 'research',
          displayName: 'Research & Enrichment',
          icon: 'Search',
          color: 'emerald',
          reason: 'Deep-enriching 8 decision-makers and their companies',
          tools: [
            { name: 'enrich_contact', delayMs: 600 },
            { name: 'enrich_contact', delayMs: 600 },
            { name: 'enrich_contact', delayMs: 600 },
            { name: 'enrich_contact', delayMs: 600 },
            { name: 'enrich_contact', delayMs: 600 },
            { name: 'enrich_contact', delayMs: 600 },
            { name: 'enrich_contact', delayMs: 600 },
            { name: 'enrich_contact', delayMs: 600 },
            { name: 'enrich_company', delayMs: 700 },
            { name: 'enrich_company', delayMs: 700 },
            { name: 'enrich_company', delayMs: 700 },
            { name: 'enrich_company', delayMs: 700 },
          ],
          delayBeforeStart: 200,
        },
        {
          name: 'outreach',
          displayName: 'Outreach & Follow-up',
          icon: 'Mail',
          color: 'purple',
          reason: 'Writing 8 personalized cold emails',
          tools: [
            { name: 'draft_email', delayMs: 700 },
            { name: 'draft_email', delayMs: 700 },
            { name: 'draft_email', delayMs: 700 },
            { name: 'draft_email', delayMs: 700 },
            { name: 'draft_email', delayMs: 700 },
            { name: 'draft_email', delayMs: 700 },
            { name: 'draft_email', delayMs: 700 },
            { name: 'draft_email', delayMs: 700 },
          ],
          delayBeforeStart: 300,
        },
        {
          name: 'crm_ops',
          displayName: 'CRM Operations',
          icon: 'Database',
          color: 'orange',
          reason: 'Building 3-touch follow-up sequences for all 25',
          tools: [
            { name: 'create_task', delayMs: 250 },
            { name: 'create_task', delayMs: 250 },
            { name: 'create_task', delayMs: 250 },
            { name: 'create_task', delayMs: 250 },
            { name: 'create_task', delayMs: 250 },
            { name: 'create_task', delayMs: 250 },
          ],
          delayBeforeStart: 400,
        },
      ],
      response:
        'Outbound machine built — 4 agents, 28 tools. 25 marketing agencies found and enriched (14 founders, 8 VPs, 3 directors). Top 8 cold emails ready: Spark Creative (brand refresh hook), NorthStar Media (HubSpot angle), BlueWave Digital (SaaS case study reference), Clarity Agency (new RevOps hire), plus 4 more. 3-touch follow-up cadence (day 3, 7, 14) created for all 25.',
    },
  },

  // =========================================================================
  // Stalled Deal Recovery — 4 agents, un-sticking 7 stuck deals
  // Single-agent: 27 sequential tools (~31s)
  // Multi-agent: 4 parallel agents (~8s)
  // =========================================================================
  'stalled-deal-recovery': {
    singleAgent: {
      tools: [
        { name: 'get_pipeline_deals', delayMs: 1200 },
        { name: 'get_contacts_needing_attention', delayMs: 1000 },
        { name: 'get_deal', delayMs: 800 },
        { name: 'get_deal', delayMs: 800 },
        { name: 'get_deal', delayMs: 800 },
        { name: 'get_deal', delayMs: 800 },
        { name: 'get_deal', delayMs: 800 },
        { name: 'get_deal', delayMs: 800 },
        { name: 'get_deal', delayMs: 800 },
        { name: 'search_emails', delayMs: 900 },
        { name: 'search_emails', delayMs: 900 },
        { name: 'search_emails', delayMs: 900 },
        { name: 'enrich_company', delayMs: 1400 },
        { name: 'enrich_company', delayMs: 1400 },
        { name: 'enrich_company', delayMs: 1400 },
        { name: 'enrich_contact', delayMs: 1300 },
        { name: 'enrich_contact', delayMs: 1300 },
        { name: 'draft_email', delayMs: 1400 },
        { name: 'draft_email', delayMs: 1400 },
        { name: 'draft_email', delayMs: 1400 },
        { name: 'draft_email', delayMs: 1400 },
        { name: 'create_activity', delayMs: 600 },
        { name: 'create_activity', delayMs: 600 },
        { name: 'create_activity', delayMs: 600 },
        { name: 'update_crm', delayMs: 600 },
        { name: 'create_task', delayMs: 500 },
        { name: 'create_task', delayMs: 500 },
      ],
      response:
        'Stalled deal analysis done (27 tool calls). 7 deals stuck 3+ weeks ($285k total). Findings: Summit Tech ($52k) — champion went on leave, back next week. Cascade HR ($38k) — they\'re evaluating a cheaper competitor, need to reposition on value. Oakmont Group ($35k) — new VP involved, hasn\'t been looped in. LakeView ($32k) — legal review stuck on data clause. Three others just went quiet. Re-engagement emails drafted for all 7 with deal-specific angles. Status notes logged. Next-step tasks created.',
    },
    multiAgent: {
      agents: [
        {
          name: 'pipeline',
          displayName: 'Pipeline Manager',
          icon: 'BarChart3',
          color: 'blue',
          reason: 'Pulling 7 stalled deals and activity history',
          tools: [
            { name: 'get_pipeline_deals', delayMs: 800 },
            { name: 'get_contacts_needing_attention', delayMs: 700 },
            { name: 'get_deal', delayMs: 400 },
            { name: 'get_deal', delayMs: 400 },
            { name: 'get_deal', delayMs: 400 },
            { name: 'get_deal', delayMs: 400 },
            { name: 'get_deal', delayMs: 400 },
            { name: 'get_deal', delayMs: 400 },
            { name: 'get_deal', delayMs: 400 },
          ],
          delayBeforeStart: 100,
        },
        {
          name: 'research',
          displayName: 'Research & Enrichment',
          icon: 'Search',
          color: 'emerald',
          reason: 'Investigating what changed at stalled accounts',
          tools: [
            { name: 'search_emails', delayMs: 600 },
            { name: 'search_emails', delayMs: 600 },
            { name: 'search_emails', delayMs: 600 },
            { name: 'enrich_company', delayMs: 800 },
            { name: 'enrich_company', delayMs: 800 },
            { name: 'enrich_company', delayMs: 800 },
            { name: 'enrich_contact', delayMs: 700 },
            { name: 'enrich_contact', delayMs: 700 },
          ],
          delayBeforeStart: 200,
        },
        {
          name: 'outreach',
          displayName: 'Outreach & Follow-up',
          icon: 'Mail',
          color: 'purple',
          reason: 'Drafting re-engagement emails for all 7 deals',
          tools: [
            { name: 'draft_email', delayMs: 800 },
            { name: 'draft_email', delayMs: 800 },
            { name: 'draft_email', delayMs: 800 },
            { name: 'draft_email', delayMs: 800 },
          ],
          delayBeforeStart: 300,
        },
        {
          name: 'crm_ops',
          displayName: 'CRM Operations',
          icon: 'Database',
          color: 'orange',
          reason: 'Logging notes and creating next-step tasks',
          tools: [
            { name: 'create_activity', delayMs: 400 },
            { name: 'create_activity', delayMs: 400 },
            { name: 'create_activity', delayMs: 400 },
            { name: 'update_crm', delayMs: 400 },
            { name: 'create_task', delayMs: 300 },
            { name: 'create_task', delayMs: 300 },
          ],
          delayBeforeStart: 350,
        },
      ],
      response:
        'Stalled deals investigated — 4 agents, 27 tools. 7 deals ($285k) analyzed: Summit ($52k, champion on leave — back next week), Cascade ($38k, competitor evaluation — need value pitch), Oakmont ($35k, new VP not looped in), LakeView ($32k, legal stuck on data clause), 3 others gone quiet. Re-engagement emails drafted with deal-specific hooks. Notes logged, tasks created.',
    },
  },

  // =========================================================================
  // End-of-Day Wrap-Up — 4 agents, closing out the day properly
  // Single-agent: 25 sequential tools (~30s)
  // Multi-agent: 4 parallel agents (~7s)
  // =========================================================================
  'end-of-day-wrap': {
    singleAgent: {
      tools: [
        { name: 'get_meetings_for_period', delayMs: 1100 },
        { name: 'get_meetings', delayMs: 1000 },
        { name: 'get_contact', delayMs: 700 },
        { name: 'get_contact', delayMs: 700 },
        { name: 'get_contact', delayMs: 700 },
        { name: 'get_contact', delayMs: 700 },
        { name: 'get_contact', delayMs: 700 },
        { name: 'create_activity', delayMs: 700 },
        { name: 'create_activity', delayMs: 700 },
        { name: 'create_activity', delayMs: 700 },
        { name: 'create_activity', delayMs: 700 },
        { name: 'create_activity', delayMs: 700 },
        { name: 'get_deal', delayMs: 800 },
        { name: 'get_deal', delayMs: 800 },
        { name: 'get_deal', delayMs: 800 },
        { name: 'update_crm', delayMs: 600 },
        { name: 'update_crm', delayMs: 600 },
        { name: 'update_crm', delayMs: 600 },
        { name: 'draft_email', delayMs: 1300 },
        { name: 'draft_email', delayMs: 1300 },
        { name: 'draft_email', delayMs: 1300 },
        { name: 'draft_email', delayMs: 1300 },
        { name: 'draft_email', delayMs: 1300 },
        { name: 'list_tasks', delayMs: 700 },
        { name: 'create_task', delayMs: 500 },
      ],
      response:
        'Day wrapped up (25 tool calls). 5 meetings logged: Vertex Labs discovery call (moved to proposal stage), BrightPath check-in (still stuck on budget — logged note), Cascade HR contract review (verbal yes, sending tonight), new lead intro with FreshBooks Co, internal pipeline review. 3 deal stages updated. 5 follow-up emails drafted: Vertex proposal next steps, BrightPath budget justification doc, Cascade contract + timeline, FreshBooks welcome + next meeting, team recap. Tomorrow\'s priorities: send Cascade contract, BrightPath exec sponsor outreach, Vertex proposal prep.',
    },
    multiAgent: {
      agents: [
        {
          name: 'meetings',
          displayName: 'Meeting Intelligence',
          icon: 'Calendar',
          color: 'amber',
          reason: 'Pulling today\'s 5 meetings and contacts',
          tools: [
            { name: 'get_meetings_for_period', delayMs: 700 },
            { name: 'get_meetings', delayMs: 600 },
            { name: 'get_contact', delayMs: 400 },
            { name: 'get_contact', delayMs: 400 },
            { name: 'get_contact', delayMs: 400 },
            { name: 'get_contact', delayMs: 400 },
            { name: 'get_contact', delayMs: 400 },
          ],
          delayBeforeStart: 100,
        },
        {
          name: 'pipeline',
          displayName: 'Pipeline Manager',
          icon: 'BarChart3',
          color: 'blue',
          reason: 'Checking deal status for today\'s meeting accounts',
          tools: [
            { name: 'get_deal', delayMs: 500 },
            { name: 'get_deal', delayMs: 500 },
            { name: 'get_deal', delayMs: 500 },
          ],
          delayBeforeStart: 150,
        },
        {
          name: 'outreach',
          displayName: 'Outreach & Follow-up',
          icon: 'Mail',
          color: 'purple',
          reason: 'Drafting follow-up emails for all 5 meetings',
          tools: [
            { name: 'draft_email', delayMs: 800 },
            { name: 'draft_email', delayMs: 800 },
            { name: 'draft_email', delayMs: 800 },
            { name: 'draft_email', delayMs: 800 },
            { name: 'draft_email', delayMs: 800 },
          ],
          delayBeforeStart: 250,
        },
        {
          name: 'crm_ops',
          displayName: 'CRM Operations',
          icon: 'Database',
          color: 'orange',
          reason: 'Logging notes, updating stages, and building tomorrow\'s list',
          tools: [
            { name: 'create_activity', delayMs: 350 },
            { name: 'create_activity', delayMs: 350 },
            { name: 'create_activity', delayMs: 350 },
            { name: 'create_activity', delayMs: 350 },
            { name: 'create_activity', delayMs: 350 },
            { name: 'update_crm', delayMs: 400 },
            { name: 'update_crm', delayMs: 400 },
            { name: 'update_crm', delayMs: 400 },
            { name: 'list_tasks', delayMs: 400 },
            { name: 'create_task', delayMs: 300 },
          ],
          delayBeforeStart: 300,
        },
      ],
      response:
        'Day closed out — 4 agents, 25 tools. 5 meetings logged: Vertex (moved to proposal), BrightPath (budget note), Cascade (verbal yes), FreshBooks (new lead intro), internal review. 3 stages updated. 5 follow-up emails drafted. Tomorrow\'s top 3: send Cascade contract, BrightPath exec outreach, Vertex proposal prep.',
    },
  },
};

// =============================================================================
// Jitter helper
// =============================================================================

function jitter(baseMs: number, range = 200): number {
  return baseMs + Math.floor(Math.random() * range * 2) - range;
}

// =============================================================================
// Hook
// =============================================================================

export function useMockAgentRace(mode: 'single' | 'multi') {
  const [state, setState] = useState<MockAgentState>({
    messages: [],
    isThinking: false,
    isStreaming: false,
    activeAgents: [],
    toolsUsed: [],
    timeline: [],
    metrics: null,
  });

  const abortRef = useRef(false);
  const startTimeRef = useRef(0);

  const reset = useCallback(() => {
    abortRef.current = true;
    setState({
      messages: [],
      isThinking: false,
      isStreaming: false,
      activeAgents: [],
      toolsUsed: [],
      timeline: [],
      metrics: null,
    });
  }, []);

  const run = useCallback(
    (scenarioId: string) => {
      abortRef.current = false;
      const data = SCENARIO_DATA[scenarioId];
      if (!data) return;

      const raceStart = Date.now();
      startTimeRef.current = raceStart;
      const scenario = mode === 'single' ? data.singleAgent : data.multiAgent;

      // Initial state: user message + thinking
      setState({
        messages: [{ role: 'user', content: 'prompt' }],
        isThinking: true,
        isStreaming: false,
        activeAgents: [],
        toolsUsed: [],
        timeline: [],
        metrics: null,
      });

      if (mode === 'single') {
        // Single-agent: sequential tool execution
        const tools = data.singleAgent.tools;
        let toolIndex = 0;
        let elapsed = 500; // initial thinking time

        const runNextTool = () => {
          if (abortRef.current) return;
          if (toolIndex >= tools.length) {
            // All tools done — stream response
            const endTime = Date.now();
            setState((prev) => ({
              ...prev,
              isThinking: false,
              isStreaming: true,
              messages: [
                prev.messages[0],
                { role: 'assistant', content: data.singleAgent.response },
              ],
            }));
            setTimeout(() => {
              if (abortRef.current) return;
              setState((prev) => ({
                ...prev,
                isStreaming: false,
                metrics: {
                  startTime: raceStart,
                  endTime,
                  durationMs: endTime - raceStart,
                  toolCount: tools.length,
                  toolsUsed: tools.map((t) => t.name),
                  agentsUsed: [],
                },
              }));
            }, 600);
            return;
          }

          const tool = tools[toolIndex];
          setState((prev) => ({
            ...prev,
            isThinking: true,
            toolsUsed: [...prev.toolsUsed, tool.name],
          }));

          toolIndex++;
          setTimeout(runNextTool, jitter(tool.delayMs));
        };

        setTimeout(runNextTool, jitter(elapsed));
      } else {
        // Multi-agent: parallel agent execution
        const multiData = data.multiAgent;
        const agentCount = multiData.agents.length;
        let doneCount = 0;

        multiData.agents.forEach((agent) => {
          // Start agent after its delay
          setTimeout(() => {
            if (abortRef.current) return;

            const agentStartMs = Date.now() - raceStart;

            setState((prev) => ({
              ...prev,
              isThinking: true,
              activeAgents: [
                ...prev.activeAgents,
                {
                  name: agent.name,
                  displayName: agent.displayName,
                  icon: agent.icon,
                  color: agent.color,
                  reason: agent.reason,
                  status: 'working' as const,
                },
              ],
              timeline: [
                ...prev.timeline,
                {
                  agentName: agent.name,
                  displayName: agent.displayName,
                  color: agent.color,
                  startMs: agentStartMs,
                  endMs: null,
                },
              ],
            }));

            // Run tools sequentially within this agent
            let toolIdx = 0;
            let toolDelay = 300;

            const runAgentTool = () => {
              if (abortRef.current) return;
              if (toolIdx >= agent.tools.length) {
                // Agent done
                const agentEndMs = Date.now() - raceStart;
                doneCount++;

                setState((prev) => ({
                  ...prev,
                  activeAgents: prev.activeAgents.map((a) =>
                    a.name === agent.name ? { ...a, status: 'done' as const } : a
                  ),
                  timeline: prev.timeline.map((t) =>
                    t.agentName === agent.name ? { ...t, endMs: agentEndMs } : t
                  ),
                }));

                // If all agents done, synthesize
                if (doneCount >= agentCount) {
                  setTimeout(() => {
                    if (abortRef.current) return;
                    const endTime = Date.now();
                    setState((prev) => ({
                      ...prev,
                      isThinking: false,
                      isStreaming: true,
                      messages: [
                        prev.messages[0],
                        { role: 'assistant', content: multiData.response },
                      ],
                    }));
                    setTimeout(() => {
                      if (abortRef.current) return;
                      const allTools = multiData.agents.flatMap((a) =>
                        a.tools.map((t) => t.name)
                      );
                      setState((prev) => ({
                        ...prev,
                        isStreaming: false,
                        metrics: {
                          startTime: raceStart,
                          endTime,
                          durationMs: endTime - raceStart,
                          toolCount: allTools.length,
                          toolsUsed: allTools,
                          agentsUsed: multiData.agents.map((a) => a.displayName),
                        },
                      }));
                    }, 600);
                  }, jitter(800));
                }
                return;
              }

              const tool = agent.tools[toolIdx];
              setState((prev) => ({
                ...prev,
                toolsUsed: [...prev.toolsUsed, tool.name],
              }));

              toolIdx++;
              setTimeout(runAgentTool, jitter(tool.delayMs));
            };

            setTimeout(runAgentTool, jitter(toolDelay));
          }, jitter(agent.delayBeforeStart));
        });
      }
    },
    [mode]
  );

  return { state, run, reset };
}
