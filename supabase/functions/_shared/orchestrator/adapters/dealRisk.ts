/**
 * Deal Risk Scan Adapters
 *
 * Wave 1: scan-active-deals — pull deals with engagement signals
 * Wave 2: calculate-risk-scores — compute risk scores using Claude
 * Wave 3: create-risk-signals — store signals in deal_risk_signals table
 * Wave 4: deliver-risk-digest — send Slack digest to deal owners
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { getServiceClient } from './contextEnrichment.ts';

// =============================================================================
// Adapter 1: Scan Active Deals (Wave 1)
// =============================================================================

interface DealEngagement {
  deal_id: string;
  deal_name: string;
  deal_value: number;
  current_stage: string;
  expected_close_date: string | null;
  owner_id: string;
  owner_name: string | null;
  company_name: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  // Engagement metrics
  days_since_last_activity: number | null;
  contact_count: number;
  meetings_last_30d: number;
  emails_last_30d: number;
  last_activity_at: string | null;
}

export const scanActiveDealsAdapter: SkillAdapter = {
  name: 'scan-active-deals',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      console.log('[scan-active-deals] Starting active deal scan...');
      const supabase = getServiceClient();
      const orgId = state.event.org_id;

      if (!orgId) {
        throw new Error('org_id is required in event payload');
      }

      // 1. Get deal stages for the org (to filter out closed stages)
      const { data: stages } = await supabase
        .from('deal_stages')
        .select('id, name, is_final')
        .eq('org_id', orgId);

      if (!stages || stages.length === 0) {
        console.log('[scan-active-deals] No deal stages found for org');
        return { success: true, output: { deals: [] }, duration_ms: Date.now() - start };
      }

      // Find stage IDs for 'Closed Won' and 'Closed Lost' (case-insensitive)
      const closedStageIds = stages
        .filter((s: any) => {
          const nameLower = s.name.toLowerCase();
          return nameLower.includes('closed') || nameLower.includes('lost') || nameLower.includes('won');
        })
        .map((s: any) => s.id);

      // Stage ID -> name lookup
      const stageIdToName: Record<string, string> = {};
      for (const s of stages) {
        stageIdToName[s.id] = s.name;
      }

      // 2. Query active deals (not in closed stages), ordered by value DESC
      let dealsQuery = supabase
        .from('deals')
        .select(`
          id,
          name,
          value,
          stage_id,
          expected_close_date,
          owner_id,
          company_id,
          primary_contact_id,
          last_activity_at,
          org_id
        `)
        .eq('org_id', orgId)
        .eq('status', 'active')
        .order('value', { ascending: false })
        .limit(50);

      // Filter out closed stages if we found any
      if (closedStageIds.length > 0) {
        dealsQuery = dealsQuery.not('stage_id', 'in', `(${closedStageIds.join(',')})`);
      }

      const { data: deals, error: dealsError } = await dealsQuery;

      if (dealsError) {
        throw new Error(`Failed to query deals: ${dealsError.message}`);
      }

      if (!deals || deals.length === 0) {
        console.log('[scan-active-deals] No active deals found for org');
        return { success: true, output: { deals: [] }, duration_ms: Date.now() - start };
      }

      console.log(`[scan-active-deals] Found ${deals.length} active deals, enriching engagement signals...`);

      // 3. Calculate 30-day cutoff for recent activity
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // 4. Batch-fetch owner names
      const ownerIds = [...new Set(deals.map((d: any) => d.owner_id).filter(Boolean))];
      const ownerIdToName: Record<string, string> = {};
      if (ownerIds.length > 0) {
        const { data: owners } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, full_name')
          .in('id', ownerIds);

        if (owners) {
          for (const owner of owners) {
            ownerIdToName[owner.id] = owner.full_name ||
              [owner.first_name, owner.last_name].filter(Boolean).join(' ') ||
              owner.id;
          }
        }
      }

      // 5. Batch-fetch company names
      const companyIds = [...new Set(deals.map((d: any) => d.company_id).filter(Boolean))];
      const companyIdToName: Record<string, string> = {};
      if (companyIds.length > 0) {
        const { data: companies } = await supabase
          .from('companies')
          .select('id, name')
          .in('id', companyIds);

        if (companies) {
          for (const company of companies) {
            companyIdToName[company.id] = company.name;
          }
        }
      }

      // 6. Batch-fetch primary contact details
      const contactIds = [...new Set(deals.map((d: any) => d.primary_contact_id).filter(Boolean))];
      const contactIdToDetails: Record<string, { name: string; email: string }> = {};
      if (contactIds.length > 0) {
        const { data: contacts } = await supabase
          .from('contacts')
          .select('id, full_name, first_name, last_name, email')
          .in('id', contactIds);

        if (contacts) {
          for (const contact of contacts) {
            contactIdToDetails[contact.id] = {
              name: contact.full_name ||
                [contact.first_name, contact.last_name].filter(Boolean).join(' ') ||
                contact.email,
              email: contact.email,
            };
          }
        }
      }

      // 7. Enrich each deal with engagement signals
      const dealIds = deals.map((d: any) => d.id);
      const enrichedDeals: DealEngagement[] = [];

      for (const deal of deals) {
        // Get contact IDs for this deal (single query, reused below)
        const { data: dealContactsData } = await supabase
          .from('deal_contacts')
          .select('contact_id')
          .eq('deal_id', deal.id);

        const contactCount = dealContactsData?.length || 0;
        const dealContactIds = dealContactsData?.map((dc: any) => dc.contact_id) || [];

        // Count recent meetings (meetings linked to deal's contacts)
        let meetingCount = 0;
        if (dealContactIds.length > 0) {
          // Step 1: Get meeting IDs linked to those contacts
          const { data: meetingLinks } = await supabase
            .from('meeting_contacts')
            .select('meeting_id')
            .in('contact_id', dealContactIds);

          if (meetingLinks && meetingLinks.length > 0) {
            const meetingIds = [...new Set(meetingLinks.map((ml: any) => ml.meeting_id))];

            // Step 2: Count meetings in the last 30 days
            const { count } = await supabase
              .from('meetings')
              .select('id', { count: 'exact', head: true })
              .in('id', meetingIds)
              .gte('meeting_start', thirtyDaysAgo);

            meetingCount = count || 0;
          }
        }

        // Count recent emails (all contacts associated with this deal)
        let emailCount = 0;
        if (dealContactIds.length > 0) {
          // Get email addresses for all deal contacts
          const { data: dealContacts } = await supabase
            .from('contacts')
            .select('email')
            .in('id', dealContactIds)
            .not('email', 'is', null);

          if (dealContacts && dealContacts.length > 0) {
            const dealContactEmails = dealContacts.map((c: any) => c.email);

            // Build OR filter for all contact emails
            const emailFilters = dealContactEmails.map(email =>
              `from_email.eq.${email},to_emails.cs.{${email}}`
            ).join(',');

            const { count } = await supabase
              .from('emails')
              .select('id', { count: 'exact', head: true })
              .or(emailFilters)
              .gte('sent_at', thirtyDaysAgo);

            emailCount = count || 0;
          }
        }

        // Calculate days since last activity
        let daysSinceLastActivity: number | null = null;
        if (deal.last_activity_at) {
          const lastActivityDate = new Date(deal.last_activity_at);
          const now = new Date();
          daysSinceLastActivity = Math.floor((now.getTime() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24));
        }

        enrichedDeals.push({
          deal_id: deal.id,
          deal_name: deal.name,
          deal_value: deal.value || 0,
          current_stage: stageIdToName[deal.stage_id] || 'Unknown',
          expected_close_date: deal.expected_close_date || null,
          owner_id: deal.owner_id,
          owner_name: ownerIdToName[deal.owner_id] || null,
          company_name: deal.company_id ? companyIdToName[deal.company_id] : null,
          primary_contact_name: deal.primary_contact_id ? contactIdToDetails[deal.primary_contact_id]?.name : null,
          primary_contact_email: deal.primary_contact_id ? contactIdToDetails[deal.primary_contact_id]?.email : null,
          days_since_last_activity: daysSinceLastActivity,
          contact_count: contactCount || 0,
          meetings_last_30d: meetingCount || 0,
          emails_last_30d: emailCount,
          last_activity_at: deal.last_activity_at || null,
        });
      }

      console.log(
        `[scan-active-deals] Enriched ${enrichedDeals.length} deals with engagement signals: ` +
        `avg contacts=${(enrichedDeals.reduce((s, d) => s + d.contact_count, 0) / enrichedDeals.length).toFixed(1)}, ` +
        `avg meetings=${(enrichedDeals.reduce((s, d) => s + d.meetings_last_30d, 0) / enrichedDeals.length).toFixed(1)}, ` +
        `avg emails=${(enrichedDeals.reduce((s, d) => s + d.emails_last_30d, 0) / enrichedDeals.length).toFixed(1)}`
      );

      return {
        success: true,
        output: { deals: enrichedDeals },
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      console.error('[scan-active-deals] Error:', err);
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};

// =============================================================================
// Adapter 2: Score Deal Risks (Wave 2)
// =============================================================================

interface RiskSignal {
  type: string;
  score: number;
  max_score: number;
  description: string;
}

interface ScoredDeal {
  deal_id: string;
  deal_name: string;
  score: number;
  previous_score: number | null;
  signals: RiskSignal[];
  deal_value: number;
  current_stage: string;
  expected_close_date: string | null;
  owner_id: string;
  owner_name: string | null;
  company_name: string | null;
}

export const scoreDealRisksAdapter: SkillAdapter = {
  name: 'score-deal-risks',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      console.log('[score-deal-risks] Starting risk score calculation...');
      const supabase = getServiceClient();
      const orgId = state.event.org_id;

      if (!orgId) {
        throw new Error('org_id is required in event payload');
      }

      // 1. Get deals from upstream scan-active-deals output
      const scanOutput = state.outputs['scan-active-deals'] as { deals: DealEngagement[] } | undefined;
      if (!scanOutput || !scanOutput.deals || scanOutput.deals.length === 0) {
        console.log('[score-deal-risks] No deals to score from scan output');
        return {
          success: true,
          output: { scored_deals: [], high_risk_count: 0, medium_risk_count: 0 },
          duration_ms: Date.now() - start,
        };
      }

      const deals = scanOutput.deals;
      console.log(`[score-deal-risks] Scoring ${deals.length} deals...`);

      // 2. Score each deal using rule-based V1 signals
      const scoredDeals: ScoredDeal[] = [];
      let highRiskCount = 0;
      let mediumRiskCount = 0;

      for (const deal of deals) {
        const signals: RiskSignal[] = [];
        let totalScore = 0;

        // --- SIGNAL 1: Engagement Drop (25pts max) ---
        const daysSinceActivity = deal.days_since_last_activity || 0;
        const emailsLast30d = deal.emails_last_30d || 0;

        if (daysSinceActivity >= 14) {
          const score = 25;
          signals.push({
            type: 'engagement_drop',
            score,
            max_score: 25,
            description: `No activity in ${daysSinceActivity} days (critical threshold)`,
          });
          totalScore += score;
        } else if (daysSinceActivity >= 7) {
          const score = 15;
          signals.push({
            type: 'engagement_drop',
            score,
            max_score: 25,
            description: `No activity in ${daysSinceActivity} days`,
          });
          totalScore += score;
        } else if (emailsLast30d === 0) {
          const score = 25;
          signals.push({
            type: 'engagement_drop',
            score,
            max_score: 25,
            description: 'Zero emails in last 30 days',
          });
          totalScore += score;
        } else if (emailsLast30d < 3) {
          const score = 10;
          signals.push({
            type: 'engagement_drop',
            score,
            max_score: 25,
            description: `Only ${emailsLast30d} email${emailsLast30d === 1 ? '' : 's'} in last 30 days`,
          });
          totalScore += score;
        }

        // --- SIGNAL 2: Champion Quiet (20pts max) ---
        if (deal.primary_contact_email) {
          if (emailsLast30d === 0) {
            const score = 20;
            signals.push({
              type: 'champion_quiet',
              score,
              max_score: 20,
              description: `Primary contact (${deal.primary_contact_name || deal.primary_contact_email}) has not replied in 30 days`,
            });
            totalScore += score;
          } else if (emailsLast30d === 1) {
            const score = 10;
            signals.push({
              type: 'champion_quiet',
              score,
              max_score: 20,
              description: `Primary contact (${deal.primary_contact_name || deal.primary_contact_email}) only replied once in 30 days`,
            });
            totalScore += score;
          }
        }

        // --- SIGNAL 3: Timeline Slipping (15pts max) ---
        if (deal.expected_close_date) {
          const closeDate = new Date(deal.expected_close_date);
          const now = new Date();
          const daysUntilClose = Math.floor((closeDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

          if (daysUntilClose < 0) {
            const score = 15;
            signals.push({
              type: 'timeline_slipping',
              score,
              max_score: 15,
              description: `Close date passed ${Math.abs(daysUntilClose)} days ago`,
            });
            totalScore += score;
          } else if (daysUntilClose <= 7) {
            // Check if stage is early (not late-stage)
            const lateStageKeywords = ['negotiation', 'proposal', 'contract', 'closing', 'verbal'];
            const isLateStage = lateStageKeywords.some(keyword =>
              deal.current_stage.toLowerCase().includes(keyword)
            );

            if (!isLateStage) {
              const score = 10;
              signals.push({
                type: 'timeline_slipping',
                score,
                max_score: 15,
                description: `Closes in ${daysUntilClose} days but still in early stage (${deal.current_stage})`,
              });
              totalScore += score;
            }
          }
        }

        // --- SIGNAL 4: Single-Threaded (15pts max) ---
        if (deal.contact_count === 1) {
          if (deal.deal_value > 10000) {
            const score = 15;
            signals.push({
              type: 'single_threaded',
              score,
              max_score: 15,
              description: `High-value deal ($${deal.deal_value.toLocaleString()}) with only 1 contact`,
            });
            totalScore += score;
          } else {
            const score = 10;
            signals.push({
              type: 'single_threaded',
              score,
              max_score: 15,
              description: 'Only 1 contact engaged',
            });
            totalScore += score;
          }
        }

        // --- SIGNAL 5: Competitor Mentioned (10pts max) ---
        // V1: Skip this (no data yet)

        // --- SIGNAL 6: Budget Objection (10pts max) ---
        // V1: Skip this (no data yet)

        // --- SIGNAL 7: Ghost Pattern (5pts max) ---
        if (deal.meetings_last_30d === 0 && daysSinceActivity >= 14) {
          const score = 5;
          signals.push({
            type: 'ghost_pattern',
            score,
            max_score: 5,
            description: `No meetings in 30 days and ${daysSinceActivity} days of silence`,
          });
          totalScore += score;
        }

        // Cap total at 100
        const finalScore = Math.min(totalScore, 100);

        // Classify risk level
        if (finalScore >= 60) {
          highRiskCount++;
        } else if (finalScore >= 40) {
          mediumRiskCount++;
        }

        // Fetch previous_score from database for delta tracking
        let previousScore: number | null = null;
        try {
          const { data: existingScore } = await supabase
            .from('deal_risk_scores')
            .select('previous_score')
            .eq('deal_id', deal.deal_id)
            .maybeSingle();

          previousScore = existingScore?.previous_score || null;
        } catch (fetchErr) {
          console.error(`[score-deal-risks] Failed to fetch previous score for deal ${deal.deal_id}:`, fetchErr);
        }

        scoredDeals.push({
          deal_id: deal.deal_id,
          deal_name: deal.deal_name,
          score: finalScore,
          previous_score: previousScore,
          signals,
          deal_value: deal.deal_value,
          current_stage: deal.current_stage,
          expected_close_date: deal.expected_close_date,
          owner_id: deal.owner_id,
          owner_name: deal.owner_name,
          company_name: deal.company_name,
        });

        // 3. Upsert score to database
        try {
          await supabase.rpc('upsert_deal_risk_score', {
            p_org_id: orgId,
            p_deal_id: deal.deal_id,
            p_score: finalScore,
            p_signals: signals,
          });
        } catch (upsertErr) {
          console.error(`[score-deal-risks] Failed to upsert score for deal ${deal.deal_id}:`, upsertErr);
          // Continue processing other deals
        }
      }

      console.log(
        `[score-deal-risks] Scored ${scoredDeals.length} deals: ` +
        `${highRiskCount} high-risk (≥60), ${mediumRiskCount} medium-risk (40-59), ` +
        `${scoredDeals.length - highRiskCount - mediumRiskCount} healthy (<40)`
      );

      return {
        success: true,
        output: {
          scored_deals: scoredDeals,
          high_risk_count: highRiskCount,
          medium_risk_count: mediumRiskCount,
        },
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      console.error('[score-deal-risks] Error:', err);
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};

// =============================================================================
// Adapter 3: Generate Risk Alerts (Wave 3)
// =============================================================================

interface RiskAlert {
  deal_id: string;
  deal_name: string;
  deal_value: number;
  company_name: string | null;
  current_stage: string;
  owner_id: string;
  owner_name: string | null;
  owner_slack_id: string | null;
  score: number;
  previous_score: number | null;
  score_delta: number;
  trend: 'worsening' | 'improving' | 'stable' | 'new';
  top_signals: RiskSignal[];
  suggested_action: string;
}

interface DigestItem {
  deal_id: string;
  deal_name: string;
  score: number;
  top_signal: string;
}

/**
 * Generate AI-powered suggested action for a high-risk deal
 */
async function generateSuggestedAction(
  deal: ScoredDeal,
  topSignals: RiskSignal[]
): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    console.warn('[generate-risk-alerts] ANTHROPIC_API_KEY not set, using fallback suggestions');
    return getFallbackSuggestion(topSignals[0]?.type);
  }

  try {
    const prompt = [
      'You are a sales coach analyzing a high-risk deal. Generate a brief, actionable rescue suggestion (1-2 sentences max).',
      '',
      `Deal: ${deal.deal_name}`,
      `Company: ${deal.company_name || 'Unknown'}`,
      `Stage: ${deal.current_stage}`,
      `Value: $${deal.deal_value.toLocaleString()}`,
      `Risk Score: ${deal.score}/100 (higher = more at risk)`,
      '',
      'Top Risk Signals:',
      ...topSignals.map((s, i) => `${i + 1}. [${s.type}] ${s.description} (${s.score}/${s.max_score} pts)`),
      '',
      'Generate a specific, actionable suggestion for the deal owner to take immediately.',
      'Focus on the highest-impact signal. Be concrete (e.g., "Reach out to X about Y").',
      'Return ONLY the suggestion text, no preamble.',
    ].join('\n');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        temperature: 0.4,
        system:
          'You are a sales coach. Generate brief (1-2 sentences), actionable rescue suggestions for at-risk deals. Be specific and direct.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude API returned ${response.status}`);
    }

    const result = await response.json();
    const suggestion = result.content?.[0]?.text?.trim();

    if (!suggestion) {
      throw new Error('No text content in Claude response');
    }

    return suggestion;
  } catch (err) {
    console.error(`[generate-risk-alerts] Claude API failed for deal ${deal.deal_id}:`, err);
    return getFallbackSuggestion(topSignals[0]?.type);
  }
}

/**
 * Fallback suggestions when Claude is unavailable
 */
function getFallbackSuggestion(signalType: string): string {
  const fallbacks: Record<string, string> = {
    engagement_drop: 'Schedule a check-in call to re-engage and understand current priorities.',
    champion_quiet: 'Reach out to your champion to confirm their continued support and involvement.',
    timeline_slipping: 'Review the close timeline with stakeholders and identify any blockers.',
    single_threaded: 'Request introductions to additional decision-makers to reduce risk.',
    ghost_pattern: 'Send a brief, value-focused email to restart the conversation.',
  };

  return fallbacks[signalType] || 'Review the deal signals and reach out to the key stakeholders.';
}

export const generateRiskAlertsAdapter: SkillAdapter = {
  name: 'generate-risk-alerts',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      console.log('[generate-risk-alerts] Starting alert generation...');
      const supabase = getServiceClient();
      const orgId = state.event.org_id;

      if (!orgId) {
        throw new Error('org_id is required in event payload');
      }

      // 1. Read upstream scored deals
      const scoreOutput = state.outputs['score-deal-risks'] as
        | { scored_deals: ScoredDeal[]; high_risk_count: number; medium_risk_count: number }
        | undefined;

      if (!scoreOutput || !scoreOutput.scored_deals || scoreOutput.scored_deals.length === 0) {
        console.log('[generate-risk-alerts] No scored deals to process');
        return {
          success: true,
          output: {
            alerts: [],
            digest_items: [],
            summary: { high_risk_count: 0, medium_risk_count: 0, total_scanned: 0 },
          },
          duration_ms: Date.now() - start,
        };
      }

      const scoredDeals = scoreOutput.scored_deals;
      console.log(`[generate-risk-alerts] Processing ${scoredDeals.length} scored deals...`);

      // 2. Fetch Slack user IDs for all deal owners
      const ownerIds = [...new Set(scoredDeals.map((d) => d.owner_id).filter(Boolean))];
      const ownerIdToSlackId: Record<string, string | null> = {};

      if (ownerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, slack_user_id')
          .in('id', ownerIds);

        if (profiles) {
          for (const profile of profiles) {
            ownerIdToSlackId[profile.id] = profile.slack_user_id || null;
          }
        }
      }

      // 3. Split deals into categories and generate alerts
      const alerts: RiskAlert[] = [];
      const digestItems: DigestItem[] = [];

      for (const deal of scoredDeals) {
        // Calculate score delta and trend
        const scoreDelta = deal.previous_score !== null ? deal.score - deal.previous_score : 0;
        let trend: RiskAlert['trend'] = 'stable';

        if (deal.previous_score === null) {
          trend = 'new';
        } else if (scoreDelta > 10) {
          trend = 'worsening';
        } else if (scoreDelta < -10) {
          trend = 'improving';
        }

        // Sort signals by score descending
        const sortedSignals = [...deal.signals].sort((a, b) => b.score - a.score);
        const topSignals = sortedSignals.slice(0, 3);

        // High risk: Generate individual alert
        if (deal.score >= 60) {
          console.log(
            `[generate-risk-alerts] Generating alert for high-risk deal: ${deal.deal_name} (score: ${deal.score})`
          );

          const suggestedAction = await generateSuggestedAction(deal, topSignals);

          alerts.push({
            deal_id: deal.deal_id,
            deal_name: deal.deal_name,
            deal_value: deal.deal_value,
            company_name: deal.company_name,
            current_stage: deal.current_stage,
            owner_id: deal.owner_id,
            owner_name: deal.owner_name,
            owner_slack_id: ownerIdToSlackId[deal.owner_id] || null,
            score: deal.score,
            previous_score: deal.previous_score,
            score_delta: scoreDelta,
            trend,
            top_signals: topSignals,
            suggested_action: suggestedAction,
          });

          // Mark alert as pending in database
          try {
            await supabase.rpc('mark_risk_alert_sent', {
              p_deal_id: deal.deal_id,
            });
          } catch (markErr) {
            console.error(
              `[generate-risk-alerts] Failed to mark alert as sent for deal ${deal.deal_id}:`,
              markErr
            );
          }
        }
        // Medium risk: Add to digest
        else if (deal.score >= 40 && deal.score < 60) {
          digestItems.push({
            deal_id: deal.deal_id,
            deal_name: deal.deal_name,
            score: deal.score,
            top_signal: topSignals[0]?.description || 'No specific signals detected',
          });
        }
        // Healthy: Skip
      }

      console.log(
        `[generate-risk-alerts] Generated ${alerts.length} individual alerts, ` +
          `${digestItems.length} digest items`
      );

      return {
        success: true,
        output: {
          alerts,
          digest_items: digestItems,
          summary: {
            high_risk_count: alerts.length,
            medium_risk_count: digestItems.length,
            total_scanned: scoredDeals.length,
          },
        },
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      console.error('[generate-risk-alerts] Error:', err);
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};

// =============================================================================
// Adapter 4: Deliver Risk Alerts to Slack (Wave 4)
// =============================================================================

import { buildDealRiskAlertMessage, type DealRiskAlertData } from '../../slackBlocks.ts';

export const deliverRiskSlackAdapter: SkillAdapter = {
  name: 'deliver-risk-slack',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      console.log('[deliver-risk-slack] Delivering risk alerts to Slack...');
      const supabase = getServiceClient();
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const appUrl = Deno.env.get('APP_URL') || 'https://app.use60.com';

      // 1. Get alerts and digest items from upstream output
      const alertsOutput = state.outputs['generate-risk-alerts'] as {
        alerts: RiskAlert[];
        digest_items: DigestItem[];
        summary: {
          high_risk_count: number;
          medium_risk_count: number;
          total_scanned: number;
        };
      } | undefined;

      if (!alertsOutput) {
        console.log('[deliver-risk-slack] No output from generate-risk-alerts');
        return {
          success: true,
          output: { delivered_count: 0, failed_count: 0, owners_notified: [] },
          duration_ms: Date.now() - start,
        };
      }

      const { alerts, digest_items } = alertsOutput;

      // Early return if nothing to send
      if ((!alerts || alerts.length === 0) && (!digest_items || digest_items.length === 0)) {
        console.log('[deliver-risk-slack] No alerts or digest items to deliver');
        return {
          success: true,
          output: { delivered_count: 0, failed_count: 0, owners_notified: [] },
          duration_ms: Date.now() - start,
        };
      }

      // 2. Group high-risk alerts by owner_id (if any)
      const alertsByOwner = new Map<string, RiskAlert[]>();
      if (alerts && alerts.length > 0) {
        for (const alert of alerts) {
        const ownerId = alert.owner_id;
        if (!alertsByOwner.has(ownerId)) {
          alertsByOwner.set(ownerId, []);
        }
          alertsByOwner.get(ownerId)!.push(alert);
        }

        console.log(
          `[deliver-risk-slack] Grouped ${alerts.length} alerts across ${alertsByOwner.size} owners`
        );
      }

      // 3. Send high-risk alerts to individual owners (if any)
      let deliveredCount = 0;
      let failedCount = 0;
      const ownersNotified: string[] = [];

      if (alertsByOwner.size > 0) {
        // Fetch slack_user_id for all owners in one query
        const ownerIds = Array.from(alertsByOwner.keys());
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, slack_user_id')
          .in('id', ownerIds);

        const ownerIdToSlackUserId = new Map<string, string | null>();
        if (profiles) {
          for (const profile of profiles) {
            ownerIdToSlackUserId.set(profile.id, profile.slack_user_id);
          }
        }

        // 4. Send alerts to each owner
        for (const [ownerId, ownerAlerts] of alertsByOwner.entries()) {
          const slackUserId = ownerIdToSlackUserId.get(ownerId);

          // Send each alert as a separate Slack message
          for (const alert of ownerAlerts) {
            // Map RiskSignal to DealRiskAlertData signals format
            const signals = alert.top_signals.map(s => ({
              type: s.type,
              weight: s.max_score > 0 ? Math.round((s.score / s.max_score) * 10) : s.score,
              description: s.description,
            }));

            const alertData: DealRiskAlertData = {
              dealName: alert.deal_name,
              dealId: alert.deal_id,
              dealValue: alert.deal_value,
              dealStage: alert.current_stage,
              riskScore: alert.score,
              previousScore: alert.previous_score ?? undefined,
              signals,
              suggestedAction: alert.suggested_action,
              ownerName: alert.owner_name ?? undefined,
              ownerSlackUserId: slackUserId ?? undefined,
              appUrl,
            };

            const slackMessage = buildDealRiskAlertMessage(alertData);

            try {
              const response = await fetch(`${supabaseUrl}/functions/v1/send-slack-message`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${serviceKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  org_id: state.event.org_id,
                  user_id: ownerId,
                  message: slackMessage.text,
                  blocks: slackMessage.blocks,
                }),
              });

              const result = await response.json().catch(() => ({ success: false }));

              if (response.ok && result.success) {
                deliveredCount++;
                if (!ownersNotified.includes(ownerId)) {
                  ownersNotified.push(ownerId);
                }
                console.log(
                  `[deliver-risk-slack] Delivered alert for deal ${alert.deal_name} to owner ${ownerId}`
                );
              } else {
                failedCount++;
                console.warn(
                  `[deliver-risk-slack] Failed to deliver alert for deal ${alert.deal_name}: ` +
                  `${result.error || response.status}`
                );
              }
            } catch (err) {
              failedCount++;
              console.error(
                `[deliver-risk-slack] Error delivering alert for deal ${alert.deal_name}:`,
                err
              );
            }
          }
        }
      }

      // 5. Send digest message for medium-risk deals (if any)
      let digestSent = false;
      if (digest_items && digest_items.length > 0) {
        console.log(`[deliver-risk-slack] Building digest message for ${digest_items.length} medium-risk deals...`);

        // Build compact digest using basic Slack blocks
        const digestBlocks = [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `📊 Pipeline Risk Digest — ${digest_items.length} deal${digest_items.length === 1 ? '' : 's'} need attention`,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `The following deals have medium risk scores (40-59) and may need attention:`,
            },
          },
          { type: 'divider' },
        ];

        // Add each digest item as a section
        for (const item of digest_items) {
          digestBlocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: [
                `*${item.deal_name}*`,
                `Risk Score: *${item.score}/100*`,
                `Top Signal: ${item.top_signal}`,
                `<${appUrl}/deals/${item.deal_id}|View Deal →>`,
              ].join('\n'),
            },
          });
        }

        const digestText = `Pipeline Risk Digest — ${digest_items.length} medium-risk deals need attention`;

        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/send-slack-message`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              org_id: state.event.org_id,
              channel: 'deals',
              message: digestText,
              blocks: digestBlocks,
            }),
          });

          const result = await response.json().catch(() => ({ success: false }));

          if (response.ok && result.success) {
            digestSent = true;
            deliveredCount++; // Count digest as one delivery
            console.log('[deliver-risk-slack] Digest message sent successfully');
          } else {
            failedCount++;
            console.warn(
              `[deliver-risk-slack] Failed to send digest message: ${result.error || response.status}`
            );
          }
        } catch (err) {
          failedCount++;
          console.error('[deliver-risk-slack] Error sending digest message:', err);
        }
      }

      console.log(
        `[deliver-risk-slack] Delivery complete: ` +
        `${deliveredCount} delivered (${alerts?.length || 0} alerts + ${digestSent ? '1 digest' : '0 digests'}), ` +
        `${failedCount} failed, ${ownersNotified.length} owners notified`
      );

      return {
        success: true,
        output: {
          delivered_count: deliveredCount,
          failed_count: failedCount,
          owners_notified: ownersNotified,
          digest_sent: digestSent,
          digest_item_count: digest_items?.length || 0,
        },
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      console.error('[deliver-risk-slack] Error:', err);
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};
