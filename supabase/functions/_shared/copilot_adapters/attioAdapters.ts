import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { AttioClient, fromAttioValues } from '../attio.ts'
import type { ActionResult, CRMAdapter } from './types.ts'

type SupabaseClient = ReturnType<typeof createClient>

function ok(data: unknown, source: string): ActionResult {
  return { success: true, data, source }
}

function fail(error: string, source: string, extra?: Partial<ActionResult>): ActionResult {
  return { success: false, data: null, error, source, ...extra }
}

/**
 * Get valid Attio access token for an organization.
 * Automatically refreshes expired tokens using the refresh_token (2-min buffer).
 */
async function getAttioToken(client: SupabaseClient, orgId: string): Promise<string | null> {
  const { data: creds, error } = await client
    .from('attio_org_credentials')
    .select('access_token, refresh_token, token_expires_at')
    .eq('org_id', orgId)
    .maybeSingle()

  if (error || !creds) return null

  const accessToken = String(creds.access_token || '')
  const refreshToken = String(creds.refresh_token || '')
  const expiresAt = new Date(String(creds.token_expires_at || 0)).getTime()

  // If token is still valid (expires in more than 2 minutes), use it
  if (expiresAt && expiresAt - Date.now() > 2 * 60 * 1000) {
    return accessToken
  }

  // Token expired — try to refresh
  if (!refreshToken) {
    console.log(`[Attio] No refresh token for org ${orgId}`)
    return null
  }

  const clientId = Deno.env.get('ATTIO_CLIENT_ID') || ''
  const clientSecret = Deno.env.get('ATTIO_CLIENT_SECRET') || ''

  if (!clientId || !clientSecret) {
    console.log('[Attio] Missing ATTIO_CLIENT_ID or ATTIO_CLIENT_SECRET')
    return null
  }

  try {
    console.log(`[Attio] Token expired for org ${orgId}, refreshing...`)

    const tokenParams = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    })

    const tokenResp = await fetch('https://app.attio.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    })

    if (!tokenResp.ok) {
      const errorText = await tokenResp.text()
      console.log(`[Attio] Token refresh failed: ${errorText}`)
      return null
    }

    const tokenData = await tokenResp.json()
    const newAccessToken = String(tokenData.access_token || '')
    const newRefreshToken = tokenData.refresh_token ? String(tokenData.refresh_token) : refreshToken
    const expiresIn = Number(tokenData.expires_in || 3600)
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

    // Update credentials in database
    await client
      .from('attio_org_credentials')
      .update({
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        token_expires_at: tokenExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', orgId)

    console.log(`[Attio] Token refreshed for org ${orgId}, expires at ${tokenExpiresAt}`)
    return newAccessToken
  } catch (e) {
    console.log(`[Attio] Token refresh error: ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}

/**
 * Check if an organization has Attio connected
 */
export async function hasAttioIntegration(client: SupabaseClient, orgId: string): Promise<boolean> {
  const { data } = await client
    .from('attio_org_integrations')
    .select('is_connected')
    .eq('org_id', orgId)
    .maybeSingle()

  return data?.is_connected === true
}

/**
 * Get or create Attio client for an organization
 */
export async function getAttioClientForOrg(
  client: SupabaseClient,
  orgId: string
): Promise<AttioClient | null> {
  const token = await getAttioToken(client, orgId)
  if (!token) return null
  return new AttioClient({ accessToken: token })
}

/**
 * Attio CRM Adapter
 * Searches Attio API directly for people, companies, and deals
 */
export function createAttioCrmAdapter(
  client: SupabaseClient,
  orgId: string,
  attioClient: AttioClient
): CRMAdapter {
  return {
    source: 'attio_crm',

    async getContact(params) {
      try {
        const email = params.email ? String(params.email).trim().toLowerCase() : null
        const name = params.name ? String(params.name).trim() : null
        const id = params.id ? String(params.id).trim() : null

        // Search by Attio record ID
        if (id) {
          try {
            const record = await attioClient.getRecord('people', id)
            const flat = fromAttioValues(record.values || {})
            return ok({
              contacts: [{
                id: record.id?.record_id,
                email: flat.email_addresses,
                first_name: flat.first_name || flat.name?.split(' ')[0],
                last_name: flat.last_name || flat.name?.split(' ').slice(1).join(' '),
                full_name: flat.name || `${flat.first_name || ''} ${flat.last_name || ''}`.trim(),
                phone: flat.phone_numbers,
                title: flat.job_title,
                company_name: flat.company,
                source: 'attio',
              }],
            }, this.source)
          } catch {
            return ok({ contacts: [] }, this.source)
          }
        }

        // Search by email
        if (email) {
          const result = await attioClient.queryRecords('people', {
            filter: {
              $and: [{
                email_addresses: {
                  email_address: { $eq: email },
                },
              }],
            },
            limit: 10,
          })

          const contacts = (result.data || []).map((r: any) => {
            const flat = fromAttioValues(r.values || {})
            return {
              id: r.id?.record_id,
              email: flat.email_addresses,
              first_name: flat.first_name || flat.name?.split(' ')[0],
              last_name: flat.last_name || flat.name?.split(' ').slice(1).join(' '),
              full_name: flat.name || `${flat.first_name || ''} ${flat.last_name || ''}`.trim(),
              phone: flat.phone_numbers,
              title: flat.job_title,
              company_name: flat.company,
              source: 'attio',
            }
          })

          return ok({ contacts }, this.source)
        }

        // Search by name
        if (name) {
          const result = await attioClient.queryRecords('people', {
            filter: {
              $or: [{
                name: {
                  full_name: { $contains: name },
                },
              }],
            },
            limit: 10,
          })

          const contacts = (result.data || []).map((r: any) => {
            const flat = fromAttioValues(r.values || {})
            return {
              id: r.id?.record_id,
              email: flat.email_addresses,
              first_name: flat.first_name || flat.name?.split(' ')[0],
              last_name: flat.last_name || flat.name?.split(' ').slice(1).join(' '),
              full_name: flat.name || `${flat.first_name || ''} ${flat.last_name || ''}`.trim(),
              phone: flat.phone_numbers,
              title: flat.job_title,
              company_name: flat.company,
              source: 'attio',
            }
          })

          return ok({ contacts }, this.source)
        }

        return ok({ contacts: [] }, this.source)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return fail(msg, this.source)
      }
    },

    async getDeal(params) {
      try {
        const id = params.id ? String(params.id).trim() : null
        const name = params.name ? String(params.name).trim() : null

        // Search by Attio record ID
        if (id) {
          try {
            const record = await attioClient.getRecord('deals', id)
            const flat = fromAttioValues(record.values || {})
            return ok({
              deals: [{
                id: record.id?.record_id,
                name: flat.name,
                value: parseFloat(flat.monetary_value || flat.value || '0'),
                stage: flat.stage || flat.status,
                expected_close_date: flat.expected_close_date || flat.close_date,
                source: 'attio',
              }],
            }, this.source)
          } catch {
            return ok({ deals: [] }, this.source)
          }
        }

        // Search by name
        if (name) {
          const result = await attioClient.queryRecords('deals', {
            filter: {
              $or: [{
                name: {
                  value: { $contains: name },
                },
              }],
            },
            limit: 10,
          })

          const deals = (result.data || []).map((r: any) => {
            const flat = fromAttioValues(r.values || {})
            return {
              id: r.id?.record_id,
              name: flat.name,
              value: parseFloat(flat.monetary_value || flat.value || '0'),
              stage: flat.stage || flat.status,
              expected_close_date: flat.expected_close_date || flat.close_date,
              source: 'attio',
            }
          })

          return ok({ deals }, this.source)
        }

        return ok({ deals: [] }, this.source)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return fail(msg, this.source)
      }
    },

    async updateCRM(_params, _ctx) {
      return fail('Attio CRM updates not yet supported through Copilot', this.source, {
        needs_confirmation: true,
      })
    },

    // Pipeline methods - delegate to DB adapter
    async getPipelineSummary(_params) {
      return { success: false, data: null, delegate: true, source: this.source }
    },

    async getPipelineDeals(_params) {
      return { success: false, data: null, delegate: true, source: this.source }
    },

    async getPipelineForecast(_params) {
      return { success: false, data: null, delegate: true, source: this.source }
    },

    async getContactsNeedingAttention(_params) {
      return { success: false, data: null, delegate: true, source: this.source }
    },

    async getCompanyStatus(_params) {
      return { success: false, data: null, delegate: true, source: this.source }
    },
  }
}
