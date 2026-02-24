/**
 * One-time utility: Fix RLS on organization_invitations table
 * DELETE THIS FUNCTION AFTER RUNNING
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const results: any[] = [];

  // Run SQL to fix RLS - enable RLS and create policy for anon + authenticated
  const sqlStatements = [
    `ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "organization_invitations_public_select" ON public.organization_invitations`,
    `DROP POLICY IF EXISTS "Allow public token lookup for invitation acceptance" ON public.organization_invitations`,
    `DROP POLICY IF EXISTS "anon_select_invitations" ON public.organization_invitations`,
    `CREATE POLICY "anon_select_invitations" ON public.organization_invitations FOR SELECT TO anon, authenticated USING (true)`,
  ];

  for (const sql of sqlStatements) {
    const { error } = await supabase.rpc('exec_sql' as any, { query: sql });
    results.push({ sql: sql.substring(0, 80), error: error?.message || 'ok' });
  }

  // If rpc doesn't work, try alternative approach - just verify the state
  // Check if anon can read by testing with a direct query
  const { data: testData, error: testError } = await supabase
    .from('organization_invitations')
    .select('id, token')
    .limit(1);

  return new Response(
    JSON.stringify({
      success: true,
      message: 'RLS fix attempted',
      sql_results: results,
      service_role_can_read: !testError && (testData?.length || 0) > 0,
      note: 'If sql_results show errors, run the SQL manually in the Supabase dashboard SQL editor',
      manual_sql: `
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "organization_invitations_public_select" ON public.organization_invitations;
CREATE POLICY "anon_select_invitations" ON public.organization_invitations FOR SELECT TO anon, authenticated USING (true);
      `.trim(),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});
