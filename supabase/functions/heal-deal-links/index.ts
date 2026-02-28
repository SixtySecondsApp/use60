/**
 * heal-deal-links — Batch heal missing contact/company links on deals
 *
 * Processes deals with null primary_contact_id or company_id and attempts
 * to resolve them by matching contacts by company name/email domain and
 * companies by name/domain. Designed to run nightly via pg_cron.
 *
 * Auth: service_role only (called by cron, not user-facing)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders } from '../_shared/corsHelper.ts';

const BATCH_SIZE = 50;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  // Verify this is a service_role call (cron or internal)
  const authHeader = req.headers.get('Authorization') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const cronSecret = req.headers.get('x-cron-secret');
  const expectedCronSecret = Deno.env.get('CRON_SECRET');

  const isServiceRole = authHeader.includes(serviceRoleKey);
  const isCronCall = cronSecret && expectedCronSecret && cronSecret === expectedCronSecret;

  if (!isServiceRole && !isCronCall) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey,
  );

  try {
    // Fetch deals missing primary_contact_id or company_id (active deals only)
    const { data: deals, error: fetchError } = await supabase
      .from('deals')
      .select('id, name, company, owner_id, primary_contact_id, company_id, contact_name, contact_email')
      .or('primary_contact_id.is.null,company_id.is.null')
      .eq('status', 'active')
      .limit(BATCH_SIZE);

    if (fetchError) throw fetchError;
    if (!deals || deals.length === 0) {
      return new Response(JSON.stringify({ healed: 0, message: 'No deals to heal' }), {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    let healedContacts = 0;
    let healedCompanies = 0;

    for (const deal of deals) {
      const updates: Record<string, string> = {};
      const companyName = deal.company || deal.name;

      // Resolve missing primary_contact_id
      if (!deal.primary_contact_id && companyName) {
        const { data: contactMatch } = await supabase
          .from('contacts')
          .select('id, first_name, last_name, email')
          .or(`company.ilike.%${companyName}%,email.ilike.%${companyName.toLowerCase().replace(/\s+/g, '')}%`)
          .eq('owner_id', deal.owner_id)
          .limit(1);

        if (contactMatch && contactMatch.length > 0) {
          updates.primary_contact_id = contactMatch[0].id;
          if (!deal.contact_name) {
            const name = `${contactMatch[0].first_name || ''} ${contactMatch[0].last_name || ''}`.trim();
            if (name) updates.contact_name = name;
          }
          if (!deal.contact_email && contactMatch[0].email) {
            updates.contact_email = contactMatch[0].email;
          }
          healedContacts++;
        }
      }

      // Resolve missing company_id
      if (!deal.company_id && companyName) {
        const { data: companyMatch } = await supabase
          .from('companies')
          .select('id')
          .or(`name.ilike.%${companyName}%,domain.ilike.%${companyName.toLowerCase().replace(/\s+/g, '')}%`)
          .limit(1);

        if (companyMatch && companyMatch.length > 0) {
          updates.company_id = companyMatch[0].id;
          healedCompanies++;
        }
      }

      // Apply updates
      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from('deals')
          .update(updates)
          .eq('id', deal.id);

        if (updateError) {
          console.error(`[heal-deal-links] Failed to update deal ${deal.id}:`, updateError.message);
        }
      }
    }

    const result = {
      processed: deals.length,
      healedContacts,
      healedCompanies,
      totalHealed: healedContacts + healedCompanies,
    };

    console.log('[heal-deal-links] Run complete:', JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[heal-deal-links] Error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
