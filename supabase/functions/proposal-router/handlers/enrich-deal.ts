// Handler extracted from proposal-enrich-deal/index.ts
// PDR-006 + PDR-007: Async company research enrichment after proposal ready

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
} from '../../_shared/corsHelper.ts'
import { executeAgentSkillWithContract } from '../../_shared/agentSkillExecutor.ts'

const LOG_PREFIX = '[proposal-enrich-deal]'

interface EnrichRequest {
  proposal_id: string
  deal_id: string
  contact_id?: string | null
  org_id: string
  user_id: string
  /** Slack message ts from the briefing post — used for threading enrichment results */
  briefing_slack_ts?: string | null
}

/**
 * Extract the domain from an email address.
 * Returns null for free email providers.
 */
function extractDomain(email: string | null | undefined): string | null {
  if (!email) return null
  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain) return null

  const freeProviders = [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
    'icloud.com', 'aol.com', 'protonmail.com', 'me.com', 'live.com',
  ]
  if (freeProviders.includes(domain)) return null
  return domain
}

/**
 * Derive a company name from a domain.
 * e.g. "aprilking.co.uk" → "April King"
 */
function companyNameFromDomain(domain: string): string {
  return domain
    .split('.')[0]
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export async function handleEnrichDeal(req: Request): Promise<Response> {
  const preflight = handleCorsPreflightRequest(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  const corsHeaders = getCorsHeaders(req)
  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }

  try {
    const body: EnrichRequest = await req.json()
    const { proposal_id, deal_id, contact_id, org_id, user_id, briefing_slack_ts } = body

    if (!proposal_id || !deal_id || !org_id || !user_id) {
      return new Response(
        JSON.stringify({ error: 'proposal_id, deal_id, org_id, user_id required' }),
        { status: 400, headers: jsonHeaders },
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    })

    console.log(`${LOG_PREFIX} Starting enrichment for deal=${deal_id} proposal=${proposal_id}`)

    // -----------------------------------------------------------------------
    // 1. Gather context — contact email + deal company
    // -----------------------------------------------------------------------
    const [dealResult, contactResult] = await Promise.all([
      supabase.from('deals').select('name, company, description').eq('id', deal_id).maybeSingle(),
      contact_id
        ? supabase.from('contacts').select('full_name, first_name, last_name, email, company, title').eq('id', contact_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const deal = dealResult.data as { name: string; company: string; description: string | null } | null
    const contact = contactResult.data as {
      full_name: string | null; first_name: string | null; last_name: string | null;
      email: string | null; company: string | null; title: string | null
    } | null

    // Extract domain for research
    const domain = extractDomain(contact?.email)
    const companyName = deal?.company || (domain ? companyNameFromDomain(domain) : null)

    if (!domain && !companyName) {
      console.log(`${LOG_PREFIX} No domain or company name available — skipping enrichment`)
      return new Response(
        JSON.stringify({ success: false, reason: 'no_domain_or_company' }),
        { status: 200, headers: jsonHeaders },
      )
    }

    console.log(`${LOG_PREFIX} Researching domain=${domain} company="${companyName}"`)

    // -----------------------------------------------------------------------
    // 2. Run company-research skill
    // -----------------------------------------------------------------------
    const skillResult = await executeAgentSkillWithContract(supabase, {
      organizationId: org_id,
      userId: user_id,
      skillKey: 'company-research',
      context: {
        company_name: companyName || domain,
        company_website: domain || undefined,
      },
      dryRun: false,
    })

    if (skillResult.status === 'failed') {
      console.warn(`${LOG_PREFIX} Company research skill failed:`, skillResult.error)
      return new Response(
        JSON.stringify({ success: false, reason: 'skill_failed', error: skillResult.error }),
        { status: 200, headers: jsonHeaders },
      )
    }

    console.log(`${LOG_PREFIX} Company research complete — status=${skillResult.status}`)

    const researchData = skillResult.data as Record<string, unknown> | null
    const overview = researchData?.company_overview as Record<string, unknown> | null
    const leadership = researchData?.leadership as Array<Record<string, unknown>> | null
    const report = typeof researchData?.report === 'string' ? researchData.report : null

    // -----------------------------------------------------------------------
    // 3. Update contact record (if enriched data is better)
    // -----------------------------------------------------------------------
    if (contact_id && contact) {
      const contactUpdates: Record<string, unknown> = {}

      // Update full_name if null
      if (!contact.full_name && leadership && leadership.length > 0) {
        const matchedLeader = leadership.find(
          (l) => typeof l.name === 'string' && contact.email?.includes(String(l.name).split(' ')[0].toLowerCase()),
        )
        if (matchedLeader?.name) {
          contactUpdates.full_name = matchedLeader.name
        }
      }

      // Update title if null
      if (!contact.title && leadership && leadership.length > 0) {
        const matchedLeader = leadership.find(
          (l) => typeof l.name === 'string' && contact.email?.includes(String(l.name).split(' ')[0].toLowerCase()),
        )
        if (matchedLeader?.title || matchedLeader?.role) {
          contactUpdates.title = matchedLeader.title || matchedLeader.role
        }
      }

      // Update company if null
      if (!contact.company && overview?.name) {
        contactUpdates.company = overview.name
      }

      if (Object.keys(contactUpdates).length > 0) {
        contactUpdates.updated_at = new Date().toISOString()
        const { error: contactUpdateErr } = await supabase
          .from('contacts')
          .update(contactUpdates)
          .eq('id', contact_id)
        if (contactUpdateErr) {
          console.warn(`${LOG_PREFIX} Contact update failed:`, contactUpdateErr.message)
        } else {
          console.log(`${LOG_PREFIX} Contact enriched:`, Object.keys(contactUpdates).join(', '))
        }
      }
    }

    // -----------------------------------------------------------------------
    // 4. Update deal record with enriched intel
    // -----------------------------------------------------------------------
    const dealUpdates: Record<string, unknown> = {}

    // Update company name if it was "Unknown Company"
    if (deal?.company === 'Unknown Company' && overview?.name) {
      dealUpdates.company = overview.name
      // Also update deal name
      dealUpdates.name = `${overview.name} — Proposal`
    }

    // Append research summary to deal description
    if (report) {
      const truncatedReport = report.length > 2000 ? report.slice(0, 2000) + '...' : report
      dealUpdates.description = deal?.description
        ? `${deal.description}\n\n---\n\n**Company Research (auto-enriched)**\n${truncatedReport}`
        : `**Company Research (auto-enriched)**\n${truncatedReport}`
    }

    if (Object.keys(dealUpdates).length > 0) {
      dealUpdates.updated_at = new Date().toISOString()
      const { error: dealUpdateErr } = await supabase
        .from('deals')
        .update(dealUpdates)
        .eq('id', deal_id)
      if (dealUpdateErr) {
        console.warn(`${LOG_PREFIX} Deal update failed:`, dealUpdateErr.message)
      } else {
        console.log(`${LOG_PREFIX} Deal enriched:`, Object.keys(dealUpdates).join(', '))
      }
    }

    // -----------------------------------------------------------------------
    // 5. Post enrichment summary to deal room (PDR-007)
    // -----------------------------------------------------------------------
    try {
      // Check if deal room exists
      const { data: dealRoom } = await supabase
        .from('slack_deal_rooms')
        .select('id, slack_channel_id, org_id')
        .eq('deal_id', deal_id)
        .eq('is_archived', false)
        .maybeSingle()

      if (dealRoom?.slack_channel_id) {
        // Build enrichment summary message
        const summaryParts: string[] = []

        if (overview?.name) summaryParts.push(`*Company:* ${overview.name}`)
        if (overview?.industry) summaryParts.push(`*Industry:* ${overview.industry}`)
        if (overview?.size || overview?.employee_count) {
          summaryParts.push(`*Size:* ${overview.size || overview.employee_count}`)
        }
        if (overview?.location || overview?.headquarters) {
          summaryParts.push(`*HQ:* ${overview.location || overview.headquarters}`)
        }

        // Key people
        if (leadership && leadership.length > 0) {
          const people = leadership
            .slice(0, 3)
            .map((l) => `${l.name}${l.title || l.role ? ` — ${l.title || l.role}` : ''}`)
            .join('\n')
          summaryParts.push(`\n*Key People*\n${people}`)
        }

        // Funding / revenue
        const financials = researchData?.financials as Record<string, unknown> | null
        if (financials) {
          if (financials.total_funding || financials.funding) {
            summaryParts.push(`*Funding:* ${financials.total_funding || financials.funding}`)
          }
          if (financials.revenue || financials.annual_revenue) {
            summaryParts.push(`*Revenue:* ${financials.revenue || financials.annual_revenue}`)
          }
        }

        // Tech stack
        const techStack = researchData?.tech_stack as string[] | null
        if (techStack && techStack.length > 0) {
          summaryParts.push(`*Tech Stack:* ${techStack.slice(0, 6).join(', ')}`)
        }

        // Buying signals
        const buyingSignals = researchData?.buying_signals as string[] | null
        if (buyingSignals && buyingSignals.length > 0) {
          const signals = buyingSignals.slice(0, 3).map((s) => `• ${s}`).join('\n')
          summaryParts.push(`\n*Buying Signals*\n${signals}`)
        }

        if (summaryParts.length > 0) {
          // Get bot token
          const { data: slackOrg } = await supabase
            .from('slack_org_settings')
            .select('bot_access_token')
            .eq('org_id', dealRoom.org_id)
            .eq('is_connected', true)
            .maybeSingle()

          const botToken = slackOrg?.bot_access_token as string | null

          if (botToken) {
            const messageText = summaryParts.join('\n')
            const blocks = [
              {
                type: 'header',
                text: { type: 'plain_text', text: 'Company Research', emoji: true },
              },
              {
                type: 'section',
                text: { type: 'mrkdwn', text: messageText.slice(0, 2800) },
              },
              {
                type: 'context',
                elements: [{ type: 'mrkdwn', text: 'Auto-enriched by 60 · ~60s after proposal' }],
              },
            ]

            const postBody: Record<string, unknown> = {
              channel: dealRoom.slack_channel_id,
              blocks,
              text: `Company research: ${overview?.name || companyName}`,
            }

            // Thread under the briefing message if we have the ts
            if (briefing_slack_ts) {
              postBody.thread_ts = briefing_slack_ts
            }

            const slackResponse = await fetch('https://slack.com/api/chat.postMessage', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${botToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(postBody),
            })

            const slackResult = await slackResponse.json()
            if (slackResult.ok) {
              console.log(`${LOG_PREFIX} PDR-007: Enrichment posted to deal room${briefing_slack_ts ? ' (threaded)' : ''}`)
            } else {
              console.warn(`${LOG_PREFIX} PDR-007: Slack post failed:`, slackResult.error)
            }
          } else {
            console.log(`${LOG_PREFIX} PDR-007: No bot token — skipping deal room post`)
          }
        }
      } else {
        console.log(`${LOG_PREFIX} PDR-007: No deal room exists — skipping enrichment post`)
      }
    } catch (slackErr) {
      const msg = slackErr instanceof Error ? slackErr.message : String(slackErr)
      console.warn(`${LOG_PREFIX} PDR-007: Deal room post failed (non-fatal): ${msg}`)
    }

    console.log(`${LOG_PREFIX} Enrichment complete for deal=${deal_id}`)

    return new Response(
      JSON.stringify({
        success: true,
        deal_id,
        contact_id,
        enriched_fields: {
          deal: Object.keys(dealUpdates).filter((k) => k !== 'updated_at'),
          contact: contact_id ? 'attempted' : 'skipped',
        },
        research_status: skillResult.status,
      }),
      { status: 200, headers: jsonHeaders },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`${LOG_PREFIX} Error:`, message)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
    )
  }
}
