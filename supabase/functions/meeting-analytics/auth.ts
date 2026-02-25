/**
 * Auth module for meeting-analytics: JWT extraction + org_id resolution.
 *
 * Dual auth context:
 * - User requests (frontend): Extract JWT, resolve user -> org via organization_memberships
 * - Server-to-server (pg_net sync): service_role key — trusted, org_id from payload
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';

export interface AuthContext {
  userId: string;
  orgId: string;
  isServiceRole: boolean;
}

/**
 * Extract auth context from request.
 * - service_role key: returns isServiceRole=true, orgId empty (sync handler provides its own)
 * - user JWT: validates user, resolves org_id from organization_memberships
 */
export async function extractAuthContext(req: Request): Promise<AuthContext | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  if (!supabaseUrl || !serviceRoleKey) return null;

  // Service role (server-to-server, e.g. pg_net sync)
  if (token === serviceRoleKey) {
    return {
      userId: '',
      orgId: '',
      isServiceRole: true,
    };
  }

  // User JWT: validate and resolve org_id (use service role client to query)
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) return null;

  // Optional X-Org-Id header: if frontend sends active org, validate membership
  const requestedOrgId = req.headers.get('X-Org-Id')?.trim();

  if (requestedOrgId) {
    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .eq('org_id', requestedOrgId)
      .maybeSingle();

    if (membership) {
      return {
        userId: user.id,
        orgId: membership.org_id as string,
        isServiceRole: false,
      };
    }
  }

  // Fallback: first org from membership
  const { data: firstMembership } = await supabase
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (!firstMembership?.org_id) return null;

  return {
    userId: user.id,
    orgId: firstMembership.org_id as string,
    isServiceRole: false,
  };
}
