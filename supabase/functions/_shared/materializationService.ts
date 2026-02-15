/**
 * CRM Materialization Service
 *
 * Pulls full CRM records from HubSpot/Attio APIs and creates local contacts/companies.
 * Called when copilot needs full context beyond the lightweight CRM index.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { HubSpotClient } from './hubspot.ts';
import { AttioClient, fromAttioValues, type AttioRecord } from './attio.ts';
import { syncToStandardTable, type CrmSource } from './standardTableSync.ts';

type SupabaseClient = ReturnType<typeof createClient>;

// =============================================================================
// Types
// =============================================================================

export interface MaterializationResult {
  success: boolean;
  contact_id?: string;
  company_id?: string;
  error?: string;
  source: string;
}

export interface CrmIndexRecord {
  id: string;
  org_id: string;
  crm_source: 'hubspot' | 'attio';
  crm_record_id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  company_name?: string | null;
  job_title?: string | null;
  materialized_contact_id?: string | null;
  materialized_company_id?: string | null;
  is_materialized: boolean;
}

// =============================================================================
// Credential Helpers
// =============================================================================

/**
 * Get HubSpot access token for an organization
 * Automatically refreshes expired tokens using the refresh_token
 */
async function getHubSpotToken(client: SupabaseClient, orgId: string): Promise<string | null> {
  const { data: creds, error } = await client
    .from('hubspot_org_credentials')
    .select('access_token, refresh_token, token_expires_at')
    .eq('org_id', orgId)
    .maybeSingle();

  if (error || !creds) return null;

  const accessToken = String(creds.access_token || '');
  const refreshToken = String(creds.refresh_token || '');
  const expiresAt = new Date(String(creds.token_expires_at || 0)).getTime();

  // If token is still valid (expires in more than 2 minutes), use it
  if (expiresAt && expiresAt - Date.now() > 2 * 60 * 1000) {
    return accessToken;
  }

  // Token expired - try to refresh it
  if (!refreshToken) {
    console.log(`[materialization] No HubSpot refresh token for org ${orgId}`);
    return null;
  }

  const clientId = Deno.env.get('HUBSPOT_CLIENT_ID') || '';
  const clientSecret = Deno.env.get('HUBSPOT_CLIENT_SECRET') || '';

  if (!clientId || !clientSecret) {
    console.log('[materialization] Missing HUBSPOT_CLIENT_ID or HUBSPOT_CLIENT_SECRET');
    return null;
  }

  try {
    console.log(`[materialization] HubSpot token expired for org ${orgId}, refreshing...`);

    const tokenParams = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    });

    const tokenResp = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    });

    if (!tokenResp.ok) {
      const errorText = await tokenResp.text();
      console.log(`[materialization] HubSpot token refresh failed: ${errorText}`);
      return null;
    }

    const tokenData = await tokenResp.json();
    const newAccessToken = String(tokenData.access_token || '');
    const newRefreshToken = tokenData.refresh_token ? String(tokenData.refresh_token) : refreshToken;
    const expiresIn = Number(tokenData.expires_in || 1800);
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Update credentials in database
    await client
      .from('hubspot_org_credentials')
      .update({
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        token_expires_at: tokenExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', orgId);

    console.log(`[materialization] HubSpot token refreshed for org ${orgId}`);
    return newAccessToken;
  } catch (e) {
    console.log(`[materialization] HubSpot token refresh error: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/**
 * Get Attio access token for an organization
 * Automatically refreshes expired tokens using the refresh_token
 */
async function getAttioToken(client: SupabaseClient, orgId: string): Promise<string | null> {
  const { data: creds, error } = await client
    .from('attio_org_credentials')
    .select('access_token, refresh_token, token_expires_at')
    .eq('org_id', orgId)
    .maybeSingle();

  if (error || !creds) return null;

  const accessToken = String(creds.access_token || '');
  const refreshToken = String(creds.refresh_token || '');
  const expiresAt = new Date(String(creds.token_expires_at || 0)).getTime();

  // If token is still valid (expires in more than 2 minutes), use it
  if (expiresAt && expiresAt - Date.now() > 2 * 60 * 1000) {
    return accessToken;
  }

  // Token expired — try to refresh
  if (!refreshToken) {
    console.log(`[materialization] No Attio refresh token for org ${orgId}`);
    return null;
  }

  const clientId = Deno.env.get('ATTIO_CLIENT_ID') || '';
  const clientSecret = Deno.env.get('ATTIO_CLIENT_SECRET') || '';

  if (!clientId || !clientSecret) {
    console.log('[materialization] Missing ATTIO_CLIENT_ID or ATTIO_CLIENT_SECRET');
    return null;
  }

  try {
    console.log(`[materialization] Attio token expired for org ${orgId}, refreshing...`);

    const tokenParams = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    });

    const tokenResp = await fetch('https://app.attio.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    });

    if (!tokenResp.ok) {
      const errorText = await tokenResp.text();
      console.log(`[materialization] Attio token refresh failed: ${errorText}`);
      return null;
    }

    const tokenData = await tokenResp.json();
    const newAccessToken = String(tokenData.access_token || '');
    const newRefreshToken = tokenData.refresh_token ? String(tokenData.refresh_token) : refreshToken;
    const expiresIn = Number(tokenData.expires_in || 3600);
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Update credentials in database
    await client
      .from('attio_org_credentials')
      .update({
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        token_expires_at: tokenExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', orgId);

    console.log(`[materialization] Attio token refreshed for org ${orgId}`);
    return newAccessToken;
  } catch (e) {
    console.log(`[materialization] Attio token refresh error: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

// =============================================================================
// CRM API Fetching
// =============================================================================

/**
 * Fetch full record from CRM API (HubSpot or Attio)
 * Returns normalized property object
 */
async function fetchFromCrm(
  client: SupabaseClient,
  orgId: string,
  crmSource: CrmSource,
  entityType: 'contact' | 'company',
  crmRecordId: string
): Promise<{ success: true; properties: Record<string, any> } | { success: false; error: string }> {
  try {
    if (crmSource === 'hubspot') {
      const token = await getHubSpotToken(client, orgId);
      if (!token) {
        return { success: false, error: 'HubSpot access token not available' };
      }

      const hubspot = new HubSpotClient({ accessToken: token });

      // Fetch contact or company with all properties
      const objectType = entityType === 'contact' ? 'contacts' : 'companies';
      const response = await hubspot.request<{
        id: string;
        properties: Record<string, any>;
        createdAt: string;
        updatedAt: string;
      }>({
        method: 'GET',
        path: `/crm/v3/objects/${objectType}/${crmRecordId}`,
        query: { properties: 'all' },
      });

      return { success: true, properties: response.properties || {} };
    } else if (crmSource === 'attio') {
      const token = await getAttioToken(client, orgId);
      if (!token) {
        return { success: false, error: 'Attio access token not available' };
      }

      const attio = new AttioClient({ accessToken: token });

      // Fetch person or company record
      const objectSlug = entityType === 'contact' ? 'people' : 'companies';
      const record = await attio.request<AttioRecord>({
        method: 'GET',
        path: `/v2/objects/${objectSlug}/records/${crmRecordId}`,
      });

      // Convert Attio's array-wrapped values to flat object
      const properties = fromAttioValues(record.values);

      return { success: true, properties };
    } else {
      return { success: false, error: `Unknown CRM source: ${crmSource}` };
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[materialization] fetchFromCrm error:`, err);
    return { success: false, error: `Failed to fetch from ${crmSource}: ${errMsg}` };
  }
}

// =============================================================================
// Contact Materialization
// =============================================================================

/**
 * Materialize a contact from CRM index into the full contacts table
 */
export async function materializeContact(
  svc: SupabaseClient,
  orgId: string,
  indexRecord: CrmIndexRecord
): Promise<MaterializationResult> {
  const source = `materializeContact_${indexRecord.crm_source}`;

  try {
    console.log(`[materializeContact] Starting materialization for contact ${indexRecord.crm_record_id} (${indexRecord.crm_source})`);

    // Check if already materialized
    if (indexRecord.is_materialized && indexRecord.materialized_contact_id) {
      console.log(`[materializeContact] Contact already materialized: ${indexRecord.materialized_contact_id}`);
      return {
        success: true,
        contact_id: indexRecord.materialized_contact_id,
        source,
      };
    }

    // Fetch full record from CRM API
    const fetchResult = await fetchFromCrm(
      svc,
      orgId,
      indexRecord.crm_source,
      'contact',
      indexRecord.crm_record_id
    );

    if (!fetchResult.success) {
      return {
        success: false,
        error: fetchResult.error,
        source,
      };
    }

    const properties = fetchResult.properties;

    // Map CRM properties to contacts table fields
    const firstName = indexRecord.crm_source === 'hubspot'
      ? properties.firstname || indexRecord.first_name
      : (properties.first_name || indexRecord.first_name);

    const lastName = indexRecord.crm_source === 'hubspot'
      ? properties.lastname || indexRecord.last_name
      : (properties.last_name || indexRecord.last_name);

    const email = indexRecord.crm_source === 'hubspot'
      ? properties.email || indexRecord.email
      : (properties.email_addresses?.[0]?.email_address || indexRecord.email);

    const phone = indexRecord.crm_source === 'hubspot'
      ? properties.phone
      : properties.phone_numbers?.[0]?.phone_number;

    const title = indexRecord.crm_source === 'hubspot'
      ? properties.jobtitle || indexRecord.job_title
      : (properties.job_title || indexRecord.job_title);

    const linkedinUrl = indexRecord.crm_source === 'hubspot'
      ? properties.hs_linkedinid
      : properties.linkedin;

    // Check if a contact with this email already exists (e.g. created by webhook)
    const { data: existingContact } = await svc
      .from('contacts')
      .select('id')
      .eq('email', (email || '').toLowerCase())
      .maybeSingle();

    if (existingContact) {
      // Contact already exists — link to it instead of creating a duplicate
      const contactId = existingContact.id;
      console.log(`[materializeContact] Contact already exists for email ${email}: ${contactId}`);

      // Update CRM index to mark as materialized (pointing to existing contact)
      await svc
        .from('crm_contact_index')
        .update({
          is_materialized: true,
          materialized_contact_id: contactId,
          materialized_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', indexRecord.id);

      return {
        success: true,
        contact_id: contactId,
        source,
      };
    }

    // Insert into contacts table
    const { data: newContact, error: insertError } = await svc
      .from('contacts')
      .insert({
        clerk_org_id: orgId,
        first_name: firstName || null,
        last_name: lastName || null,
        email: email || null,
        phone: phone || null,
        title: title || null,
        linkedin_url: linkedinUrl || null,
        company: indexRecord.company_name || null,
        source: indexRecord.crm_source,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (insertError || !newContact) {
      console.error(`[materializeContact] Insert failed:`, insertError);
      return {
        success: false,
        error: `Failed to insert contact: ${insertError?.message || 'unknown error'}`,
        source,
      };
    }

    const contactId = newContact.id;
    console.log(`[materializeContact] Created contact ${contactId}`);

    // Update CRM index to mark as materialized
    await svc
      .from('crm_contact_index')
      .update({
        is_materialized: true,
        materialized_contact_id: contactId,
        materialized_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', indexRecord.id);

    // Sync to standard tables (All Contacts, Leads)
    try {
      await syncToStandardTable({
        supabase: svc,
        orgId,
        crmSource: indexRecord.crm_source,
        entityType: 'contact',
        crmRecordId: indexRecord.crm_record_id,
        properties,
        timestamp: new Date().toISOString(),
      });
    } catch (syncErr) {
      console.error(`[materializeContact] Standard table sync failed (non-fatal):`, syncErr);
      // Non-fatal - contact is still materialized
    }

    console.log(`[materializeContact] Successfully materialized contact ${contactId}`);
    return {
      success: true,
      contact_id: contactId,
      source,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[materializeContact] Error:`, err);
    return {
      success: false,
      error: `Materialization failed: ${errMsg}`,
      source,
    };
  }
}

// =============================================================================
// Company Materialization
// =============================================================================

/**
 * Materialize a company from CRM index into the full companies table
 */
export async function materializeCompany(
  svc: SupabaseClient,
  orgId: string,
  indexRecord: CrmIndexRecord
): Promise<MaterializationResult> {
  const source = `materializeCompany_${indexRecord.crm_source}`;

  try {
    console.log(`[materializeCompany] Starting materialization for company ${indexRecord.crm_record_id} (${indexRecord.crm_source})`);

    // Check if already materialized
    if (indexRecord.is_materialized && indexRecord.materialized_company_id) {
      console.log(`[materializeCompany] Company already materialized: ${indexRecord.materialized_company_id}`);
      return {
        success: true,
        company_id: indexRecord.materialized_company_id,
        source,
      };
    }

    // Fetch full record from CRM API
    const fetchResult = await fetchFromCrm(
      svc,
      orgId,
      indexRecord.crm_source,
      'company',
      indexRecord.crm_record_id
    );

    if (!fetchResult.success) {
      return {
        success: false,
        error: fetchResult.error,
        source,
      };
    }

    const properties = fetchResult.properties;

    // Map CRM properties to companies table fields
    const name = properties.name;
    const domain = indexRecord.crm_source === 'hubspot'
      ? properties.domain
      : properties.domains?.[0]?.domain;
    const website = properties.website;
    const industry = properties.industry;
    const employeeCount = indexRecord.crm_source === 'hubspot'
      ? properties.numberofemployees
      : properties.employee_count;
    const description = properties.description;
    const linkedinUrl = indexRecord.crm_source === 'hubspot'
      ? properties.linkedin_company_page
      : properties.linkedin;

    // Check if a company with this domain already exists
    if (domain) {
      const { data: existingCompany } = await svc
        .from('companies')
        .select('id')
        .eq('domain', domain)
        .maybeSingle();

      if (existingCompany) {
        const companyId = existingCompany.id;
        console.log(`[materializeCompany] Company already exists for domain ${domain}: ${companyId}`);

        await svc
          .from('crm_company_index')
          .update({
            is_materialized: true,
            materialized_company_id: companyId,
            materialized_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', indexRecord.id);

        return {
          success: true,
          company_id: companyId,
          source,
        };
      }
    }

    // Map employee count to size enum
    const sizeFromCount = employeeCount
      ? Number(employeeCount) <= 10 ? 'startup'
        : Number(employeeCount) <= 50 ? 'small'
        : Number(employeeCount) <= 200 ? 'medium'
        : Number(employeeCount) <= 1000 ? 'large'
        : 'enterprise'
      : null;

    // companies.owner_id is NOT NULL — find an org admin to assign as default owner
    const { data: orgMember } = await svc
      .from('organization_memberships')
      .select('user_id')
      .eq('org_id', orgId)
      .eq('role', 'admin')
      .limit(1)
      .maybeSingle();

    if (!orgMember?.user_id) {
      return {
        success: false,
        error: 'No org admin found to assign as company owner',
        source,
      };
    }

    // Insert into companies table
    const { data: newCompany, error: insertError } = await svc
      .from('companies')
      .insert({
        clerk_org_id: orgId,
        name: name || 'Unknown Company',
        domain: domain || null,
        website: website || null,
        industry: industry || null,
        size: sizeFromCount,
        owner_id: orgMember.user_id,
        description: description || null,
        linkedin_url: linkedinUrl || null,
        source: indexRecord.crm_source,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (insertError || !newCompany) {
      console.error(`[materializeCompany] Insert failed:`, insertError);
      return {
        success: false,
        error: `Failed to insert company: ${insertError?.message || 'unknown error'}`,
        source,
      };
    }

    const companyId = newCompany.id;
    console.log(`[materializeCompany] Created company ${companyId}`);

    // Update CRM index to mark as materialized
    await svc
      .from('crm_company_index')
      .update({
        is_materialized: true,
        materialized_company_id: companyId,
        materialized_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', indexRecord.id);

    // Sync to standard tables (All Companies)
    try {
      await syncToStandardTable({
        supabase: svc,
        orgId,
        crmSource: indexRecord.crm_source,
        entityType: 'company',
        crmRecordId: indexRecord.crm_record_id,
        properties,
        timestamp: new Date().toISOString(),
      });
    } catch (syncErr) {
      console.error(`[materializeCompany] Standard table sync failed (non-fatal):`, syncErr);
      // Non-fatal - company is still materialized
    }

    console.log(`[materializeCompany] Successfully materialized company ${companyId}`);
    return {
      success: true,
      company_id: companyId,
      source,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[materializeCompany] Error:`, err);
    return {
      success: false,
      error: `Materialization failed: ${errMsg}`,
      source,
    };
  }
}
