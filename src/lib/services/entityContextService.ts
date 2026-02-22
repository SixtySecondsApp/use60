/**
 * Entity Context Service
 *
 * Resolves entity IDs (from @ mention chips) to rich context payloads
 * for injection into the AI prompt. Each entity type gets a structured
 * context block capped at ~2000 tokens.
 */

import { supabase } from '@/lib/supabase/clientV2';
import logger from '@/lib/utils/logger';
import type { EntityReference, ResolvedEntityContext } from '@/lib/types/entitySearch';

const MAX_ENTITIES = 3;

/**
 * Resolve an array of entity references to rich context blocks.
 * Fetches data in parallel and caps output per entity.
 */
export async function resolveEntityContexts(
  entities: EntityReference[],
): Promise<ResolvedEntityContext[]> {
  if (!entities || entities.length === 0) return [];

  // Cap at MAX_ENTITIES
  const capped = entities.slice(0, MAX_ENTITIES);

  const results = await Promise.all(
    capped.map(async (entity) => {
      try {
        switch (entity.type) {
          case 'contact':
            return await resolveContactContext(entity);
          case 'company':
            return await resolveCompanyContext(entity);
          case 'deal':
            return await resolveDealContext(entity);
          default:
            return null;
        }
      } catch (err) {
        logger.error(`[entityContextService] Failed to resolve ${entity.type} ${entity.id}:`, err);
        return null;
      }
    }),
  );

  return results.filter((r): r is ResolvedEntityContext => r !== null);
}

/**
 * Format resolved contexts into a system block for the AI prompt.
 */
export function formatEntityContextForPrompt(contexts: ResolvedEntityContext[]): string {
  if (contexts.length === 0) return '';

  const blocks = contexts.map((ctx) => ctx.contextBlock);
  return `<entity_context>\n${blocks.join('\n\n')}\n</entity_context>`;
}

// ---------------------------------------------------------------------------
// Contact context
// ---------------------------------------------------------------------------

async function resolveContactContext(entity: EntityReference): Promise<ResolvedEntityContext> {
  // Fetch contact with company
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, email, phone, title, linkedin_url, company_id, owner_id, notes, last_interaction_at, created_at')
    .eq('id', entity.id)
    .maybeSingle();

  if (!contact) {
    return { id: entity.id, type: 'contact', name: entity.name, contextBlock: `[Contact: ${entity.name} — record not found]` };
  }

  // Parallel: company name, deals, recent activities
  const [companyResult, dealsResult, activitiesResult] = await Promise.all([
    contact.company_id
      ? supabase.from('companies').select('id, name, domain, industry').eq('id', contact.company_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('deal_contacts')
      .select('deal_id, role, deals:deal_id(id, name, value, status)')
      .eq('contact_id', entity.id)
      .limit(5),
    supabase
      .from('activities')
      .select('id, type, summary, created_at')
      .eq('contact_id', entity.id)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.email;
  const company = companyResult.data as any;
  const deals = (dealsResult.data || []) as any[];
  const activities = (activitiesResult.data || []) as any[];

  const lines: string[] = [
    `## Contact: ${fullName}`,
    `- Email: ${contact.email || 'N/A'}`,
    `- Title: ${contact.title || 'N/A'}`,
    company ? `- Company: ${company.name} (${company.industry || 'N/A'})` : '',
    contact.phone ? `- Phone: ${contact.phone}` : '',
    contact.linkedin_url ? `- LinkedIn: ${contact.linkedin_url}` : '',
    contact.last_interaction_at ? `- Last interaction: ${new Date(contact.last_interaction_at).toLocaleDateString()}` : '',
  ].filter(Boolean);

  if (deals.length > 0) {
    lines.push('', '### Associated Deals');
    for (const dc of deals) {
      const deal = dc.deals;
      if (deal) {
        const val = deal.value ? ` (£${Number(deal.value).toLocaleString()})` : '';
        lines.push(`- ${deal.name}${val} — ${deal.status || 'active'} [role: ${dc.role || 'stakeholder'}]`);
      }
    }
  }

  if (activities.length > 0) {
    lines.push('', '### Recent Activities');
    for (const a of activities) {
      const date = new Date(a.created_at).toLocaleDateString();
      lines.push(`- [${date}] ${a.type}: ${a.summary || 'No summary'}`);
    }
  }

  return {
    id: entity.id,
    type: 'contact',
    name: fullName,
    contextBlock: lines.join('\n'),
  };
}

// ---------------------------------------------------------------------------
// Company context
// ---------------------------------------------------------------------------

async function resolveCompanyContext(entity: EntityReference): Promise<ResolvedEntityContext> {
  const { data: company } = await supabase
    .from('companies')
    .select('id, name, domain, industry, size, website, description, linkedin_url, enrichment_data, created_at, updated_at')
    .eq('id', entity.id)
    .maybeSingle();

  if (!company) {
    return { id: entity.id, type: 'company', name: entity.name, contextBlock: `[Company: ${entity.name} — record not found]` };
  }

  // Parallel: contacts, active deals
  const [contactsResult, dealsResult] = await Promise.all([
    supabase
      .from('contacts')
      .select('id, first_name, last_name, title, email')
      .eq('company_id', entity.id)
      .limit(10),
    supabase
      .from('deals')
      .select('id, name, value, status, expected_close_date')
      .eq('company_id', entity.id)
      .eq('status', 'active')
      .order('value', { ascending: false, nullsFirst: false })
      .limit(5),
  ]);

  const contacts = (contactsResult.data || []) as any[];
  const deals = (dealsResult.data || []) as any[];

  const lines: string[] = [
    `## Company: ${company.name}`,
    company.domain ? `- Domain: ${company.domain}` : '',
    company.industry ? `- Industry: ${company.industry}` : '',
    company.size ? `- Size: ${company.size}` : '',
    company.website ? `- Website: ${company.website}` : '',
    company.description ? `- Description: ${company.description.slice(0, 200)}` : '',
  ].filter(Boolean);

  if (contacts.length > 0) {
    lines.push('', '### Key Contacts');
    for (const c of contacts) {
      const name = [c.first_name, c.last_name].filter(Boolean).join(' ');
      lines.push(`- ${name} — ${c.title || 'N/A'} (${c.email})`);
    }
  }

  if (deals.length > 0) {
    lines.push('', '### Active Deals');
    for (const d of deals) {
      const val = d.value ? `£${Number(d.value).toLocaleString()}` : 'TBD';
      const close = d.expected_close_date ? ` — close: ${d.expected_close_date}` : '';
      lines.push(`- ${d.name} (${val}${close})`);
    }
  }

  // Enrichment data summary (if available)
  if (company.enrichment_data) {
    const enrichment = typeof company.enrichment_data === 'string'
      ? JSON.parse(company.enrichment_data)
      : company.enrichment_data;
    if (enrichment.funding || enrichment.tech_stack || enrichment.employee_count) {
      lines.push('', '### Enrichment Data');
      if (enrichment.employee_count) lines.push(`- Employees: ${enrichment.employee_count}`);
      if (enrichment.funding) lines.push(`- Funding: ${enrichment.funding}`);
      if (enrichment.tech_stack) lines.push(`- Tech stack: ${Array.isArray(enrichment.tech_stack) ? enrichment.tech_stack.slice(0, 10).join(', ') : enrichment.tech_stack}`);
    }
  }

  return {
    id: entity.id,
    type: 'company',
    name: company.name,
    contextBlock: lines.join('\n'),
  };
}

// ---------------------------------------------------------------------------
// Deal context
// ---------------------------------------------------------------------------

async function resolveDealContext(entity: EntityReference): Promise<ResolvedEntityContext> {
  const { data: deal } = await supabase
    .from('deals')
    .select('id, name, value, company, company_id, status, expected_close_date, description, notes, next_steps, priority, health_score, stage_id, one_off_revenue, monthly_mrr, annual_value, first_meeting_date, closed_won_date, closed_lost_date, created_at, updated_at')
    .eq('id', entity.id)
    .maybeSingle();

  if (!deal) {
    return { id: entity.id, type: 'deal', name: entity.name, contextBlock: `[Deal: ${entity.name} — record not found]` };
  }

  // Parallel: contacts, stage name, recent activities
  const [contactsResult, stageResult, activitiesResult] = await Promise.all([
    supabase
      .from('deal_contacts')
      .select('contact_id, role, contacts:contact_id(id, first_name, last_name, title, email)')
      .eq('deal_id', entity.id)
      .limit(10),
    deal.stage_id
      ? supabase.from('deal_stages').select('id, name').eq('id', deal.stage_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('activities')
      .select('id, type, summary, created_at')
      .eq('deal_id', entity.id)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const contacts = (contactsResult.data || []) as any[];
  const stage = stageResult.data as any;
  const activities = (activitiesResult.data || []) as any[];

  const valueStr = deal.value ? `£${Number(deal.value).toLocaleString()}` : 'TBD';
  const lines: string[] = [
    `## Deal: ${deal.name}`,
    `- Value: ${valueStr}`,
    stage ? `- Stage: ${stage.name}` : '',
    `- Status: ${deal.status || 'active'}`,
    deal.company ? `- Company: ${deal.company}` : '',
    deal.expected_close_date ? `- Expected close: ${deal.expected_close_date}` : '',
    deal.priority ? `- Priority: ${deal.priority}` : '',
    deal.health_score != null ? `- Health score: ${deal.health_score}/100` : '',
    deal.next_steps ? `- Next steps: ${deal.next_steps}` : '',
    deal.description ? `- Description: ${deal.description.slice(0, 200)}` : '',
    deal.monthly_mrr ? `- MRR: £${Number(deal.monthly_mrr).toLocaleString()}` : '',
  ].filter(Boolean);

  if (contacts.length > 0) {
    lines.push('', '### Deal Contacts');
    for (const dc of contacts) {
      const c = dc.contacts;
      if (c) {
        const name = [c.first_name, c.last_name].filter(Boolean).join(' ');
        lines.push(`- ${name} — ${c.title || 'N/A'} [${dc.role || 'stakeholder'}]`);
      }
    }
  }

  if (activities.length > 0) {
    lines.push('', '### Recent Activity');
    for (const a of activities) {
      const date = new Date(a.created_at).toLocaleDateString();
      lines.push(`- [${date}] ${a.type}: ${a.summary || 'No summary'}`);
    }
  }

  return {
    id: entity.id,
    type: 'deal',
    name: deal.name,
    contextBlock: lines.join('\n'),
  };
}
