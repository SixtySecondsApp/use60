import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrg } from '@/lib/contexts/OrgContext';
import { toast } from 'sonner';

const SEEDING_STORAGE_KEY = 'sixty_demo_seeding';

export interface SeedingData {
  seeded: boolean;
  company: string;
  contactName: string;
  campaignCode?: string;
  timestamp: number;
}

export interface UseOnboardingSeedingReturn {
  wasSeeded: boolean;
  seedingData: SeedingData | null;
}

/**
 * SEED-002: Detects demo URL params after signup and seeds initial data.
 *
 * Reads demo_company, demo_name, demo_domain, demo_email, campaign_code from
 * URL search params. If present AND the user account was created within the
 * last 5 minutes, it creates a contact + deal so the user lands on a
 * pre-populated dashboard instead of an empty state.
 */
export function useOnboardingSeeding(): UseOnboardingSeedingReturn {
  const { user } = useAuth();
  const { activeOrgId } = useOrg();
  const [seedingData, setSeedingData] = useState<SeedingData | null>(() => {
    try {
      const stored = localStorage.getItem(SEEDING_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    if (!user?.id) return;

    const params = new URLSearchParams(window.location.search);
    const demoCompany = params.get('demo_company');
    const demoName = params.get('demo_name');
    const demoDomain = params.get('demo_domain');
    const demoEmail = params.get('demo_email');
    const campaignCode = params.get('campaign_code');

    // Nothing to seed if no demo params
    if (!demoCompany) return;

    // Check if user was created recently (within 5 min) to avoid re-seeding on revisit
    const createdAt = user.created_at ? new Date(user.created_at).getTime() : 0;
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    if (createdAt < fiveMinAgo) {
      // Not a fresh signup — clear params and bail
      clearDemoParams();
      return;
    }

    // Prevent double-run
    hasRun.current = true;

    seedData({
      userId: user.id,
      orgId: activeOrgId ?? undefined,
      demoCompany,
      demoName: demoName || '',
      demoDomain: demoDomain || undefined,
      demoEmail: demoEmail || undefined,
      campaignCode: campaignCode || undefined,
    }).then((result) => {
      if (result) {
        setSeedingData(result);
      }
    });
  }, [user?.id, user?.created_at, activeOrgId]);

  return {
    wasSeeded: seedingData?.seeded ?? false,
    seedingData,
  };
}

// ---- internal helpers ----

function clearDemoParams() {
  const url = new URL(window.location.href);
  ['demo_company', 'demo_name', 'demo_domain', 'demo_email', 'campaign_code'].forEach((p) =>
    url.searchParams.delete(p)
  );
  window.history.replaceState({}, '', url.toString());
}

interface SeedInput {
  userId: string;
  orgId?: string;
  demoCompany: string;
  demoName: string;
  demoDomain?: string;
  demoEmail?: string;
  campaignCode?: string;
}

async function seedData(input: SeedInput): Promise<SeedingData | null> {
  const { userId, demoCompany, demoName, demoDomain, demoEmail, campaignCode } = input;

  try {
    // 1. Split name into first/last
    const nameParts = demoName.trim().split(/\s+/);
    const firstName = nameParts[0] || demoCompany;
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

    // 2. Create contact
    const contactPayload: Record<string, unknown> = {
      first_name: firstName,
      last_name: lastName || undefined,
      email: demoEmail || `${firstName.toLowerCase()}@${demoDomain || 'example.com'}`,
      owner_id: userId,
    };

    const { data: contact, error: contactErr } = await supabase
      .from('contacts')
      .insert(contactPayload)
      .select('id, first_name, last_name')
      .single();

    if (contactErr) {
      console.error('[onboarding-seeding] Failed to create contact:', contactErr);
      toast.error('Could not seed demo contact');
      clearDemoParams();
      return null;
    }

    // 3. Find the first pipeline stage (lowest order)
    const { data: firstStage } = await supabase
      .from('deal_stages')
      .select('id')
      .order('order_position', { ascending: true })
      .limit(1)
      .maybeSingle();

    // 4. Fetch campaign_link research data if campaign_code provided
    let researchData: Record<string, unknown> | null = null;
    if (campaignCode) {
      const { data: campaignLink } = await supabase
        .from('campaign_links')
        .select('research_data, ai_content')
        .eq('code', campaignCode)
        .maybeSingle();

      if (campaignLink?.research_data) {
        researchData = campaignLink.research_data as Record<string, unknown>;
      }
    }

    // 5. Create deal
    const dealPayload: Record<string, unknown> = {
      name: `${demoCompany} - New Opportunity`,
      company: demoCompany,
      owner_id: userId,
      primary_contact_id: contact.id,
      value: 0,
      status: 'active',
      ...(firstStage?.id ? { stage_id: firstStage.id } : {}),
      ...(researchData ? { notes: `AI Research:\n${JSON.stringify(researchData, null, 2)}` } : {}),
    };

    const { error: dealErr } = await supabase
      .from('deals')
      .insert(dealPayload)
      .select('id')
      .single();

    if (dealErr) {
      console.error('[onboarding-seeding] Failed to create deal:', dealErr);
      toast.error('Could not seed demo deal');
      clearDemoParams();
      return null;
    }

    // 6. Log attribution in user_settings
    if (campaignCode) {
      await supabase
        .from('user_settings')
        .upsert(
          {
            user_id: userId,
            key: 'campaign_attribution',
            value: JSON.stringify({ source: 'campaign', campaign_code: campaignCode }),
          },
          { onConflict: 'user_id,key' }
        )
        .then(({ error }) => {
          if (error) console.warn('[onboarding-seeding] Could not save attribution:', error);
        });
    }

    // 7. Persist seeding metadata to localStorage
    const data: SeedingData = {
      seeded: true,
      company: demoCompany,
      contactName: demoName || firstName,
      campaignCode,
      timestamp: Date.now(),
    };
    localStorage.setItem(SEEDING_STORAGE_KEY, JSON.stringify(data));

    // 8. Clear URL params
    clearDemoParams();

    return data;
  } catch (err) {
    console.error('[onboarding-seeding] Unexpected error:', err);
    toast.error('Something went wrong setting up your demo data');
    clearDemoParams();
    return null;
  }
}
