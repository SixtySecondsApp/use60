// supabase/functions/coupon-admin-router/helpers/auth.ts
// Shared auth helper: verifies JWT and checks is_super_admin on profiles table

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import type { User } from "https://esm.sh/@supabase/supabase-js@2.43.4";

interface AuthResult {
  user: User;
  supabase: SupabaseClient;
}

/**
 * Verifies the request has a valid JWT and the user is a super admin.
 * Returns the authenticated user and a service-role Supabase client.
 * Throws if auth fails or user is not a super admin.
 */
export async function requireSuperAdmin(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    throw new Error("Missing authorization header");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);

  if (userError || !user) {
    throw new Error("Invalid or expired token");
  }

  // Check if user is super admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_super_admin) {
    throw new Error("Only super admins can manage coupons");
  }

  return { user, supabase };
}
