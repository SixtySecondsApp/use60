/**
 * Email Handler Orchestrator Adapters
 *
 * CRM contact matching and email context enrichment
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { getServiceClient } from './contextEnrichment.ts';

// =============================================================================
// Adapter: Match Email Sender to CRM Contact
// =============================================================================

const FREE_EMAIL_PROVIDERS = [
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'aol.com',
  'live.com',
  'me.com',
  'protonmail.com',
  'proton.me',
  'mail.com',
  'yandex.com',
  'zoho.com',
];

export const matchToCrmContactAdapter: SkillAdapter = {
  name: 'match-to-crm-contact',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      console.log('[match-to-crm-contact] Starting CRM contact matching...');
      const supabase = getServiceClient();

      // Get email sender from classify-email-intent output or event payload
      const classifyOutput = state.outputs['classify-email-intent'] as any;
      const senderEmail = (
        classifyOutput?.raw?.from ||
        state.event.payload.from ||
        ''
      ) as string;

      if (!senderEmail) {
        console.log('[match-to-crm-contact] No sender email provided');
        return {
          success: true,
          output: {
            contact: null,
            company: null,
            deal: null,
            is_new_contact: true,
          },
          duration_ms: Date.now() - start,
        };
      }

      const emailLower = senderEmail.toLowerCase().trim();
      console.log(`[match-to-crm-contact] Looking up contact by email: ${emailLower}`);

      // Query contacts table by email (exact match)
      const { data: contact } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, full_name, email, title, company, company_id')
        .eq('email', emailLower)
        .maybeSingle();

      // If contact found, get full company and deal info
      if (contact) {
        console.log(`[match-to-crm-contact] Contact found: ${contact.full_name || contact.email}`);

        const contactName = contact.full_name ||
          [contact.first_name, contact.last_name].filter(Boolean).join(' ') ||
          contact.email;

        // Get company details
        let company: any = null;
        if (contact.company_id) {
          const { data: companyData } = await supabase
            .from('companies')
            .select('id, name, domain, industry, size, website')
            .eq('id', contact.company_id)
            .maybeSingle();

          if (companyData) {
            company = {
              id: companyData.id,
              name: companyData.name,
              domain: companyData.domain,
            };
          }
        }

        // Get active deal via primary_contact_id
        let deal: any = null;
        const { data: deals } = await supabase
          .from('deals')
          .select('id, name, stage_id, value, close_date, status')
          .eq('primary_contact_id', contact.id)
          .order('updated_at', { ascending: false })
          .limit(1);

        if (deals && deals.length > 0) {
          const dealData = deals[0];

          // Resolve stage name from deal_stages table
          let stageName: string | null = null;
          if (dealData.stage_id) {
            const { data: stageRow } = await supabase
              .from('deal_stages')
              .select('name')
              .eq('id', dealData.stage_id)
              .maybeSingle();
            stageName = stageRow?.name || null;
          }

          deal = {
            id: dealData.id,
            name: dealData.name,
            stage: stageName,
            value: dealData.value,
          };
        }

        console.log(
          `[match-to-crm-contact] Match complete: contact=${contactName}, ` +
          `company=${company?.name || 'none'}, deal=${deal?.name || 'none'}`
        );

        return {
          success: true,
          output: {
            contact: {
              id: contact.id,
              name: contactName,
              email: contact.email,
              title: contact.title,
              company_id: contact.company_id,
            },
            company,
            deal,
            is_new_contact: false,
          },
          duration_ms: Date.now() - start,
        };
      }

      // No contact found — try domain fallback for company matching
      console.log('[match-to-crm-contact] No contact found, trying domain fallback...');
      const emailDomain = emailLower.split('@')[1];

      if (!emailDomain || FREE_EMAIL_PROVIDERS.includes(emailDomain)) {
        console.log(`[match-to-crm-contact] Free email provider or invalid domain: ${emailDomain || 'none'}`);
        return {
          success: true,
          output: {
            contact: null,
            company: null,
            deal: null,
            is_new_contact: true,
          },
          duration_ms: Date.now() - start,
        };
      }

      // Query companies by domain
      const { data: companyData } = await supabase
        .from('companies')
        .select('id, name, domain')
        .eq('domain', emailDomain)
        .maybeSingle();

      if (companyData) {
        console.log(`[match-to-crm-contact] Company found by domain: ${companyData.name}`);
        return {
          success: true,
          output: {
            contact: null,
            company: {
              id: companyData.id,
              name: companyData.name,
              domain: companyData.domain,
            },
            deal: null,
            is_new_contact: true,
          },
          duration_ms: Date.now() - start,
        };
      }

      console.log('[match-to-crm-contact] No contact or company match found');
      return {
        success: true,
        output: {
          contact: null,
          company: null,
          deal: null,
          is_new_contact: true,
        },
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      console.error('[match-to-crm-contact] Error:', err);
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};
