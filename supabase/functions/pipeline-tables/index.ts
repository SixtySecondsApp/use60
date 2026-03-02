import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // This is needed if you're planning to invoke your function from a browser.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Required environment variables are missing');
    }

    const supabaseClient = createClient(
      supabaseUrl,
      supabaseServiceKey,
      { auth: { persistSession: false } }
    )
    
    // Use the SQL API to run our queries
    const { error: stagesError } = await supabaseClient.rpc('pgsql', { 
      sql_query: `
        CREATE OR REPLACE FUNCTION public.pgsql(sql_query text) RETURNS void
          LANGUAGE plpgsql
          SECURITY DEFINER
        AS $function$
        BEGIN
          EXECUTE sql_query;
        END;
        $function$;
      ` 
    }, { count: 'exact' });
    
    if (stagesError) {
    }
    
    // Create the tables
    const { data, error } = await supabaseClient.rpc('pgsql', { 
      sql_query: `
        -- Pipeline stages table
        CREATE TABLE IF NOT EXISTS deal_stages (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name TEXT NOT NULL,
          description TEXT,
          color TEXT NOT NULL,
          order_position INTEGER NOT NULL,
          default_probability INTEGER NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        -- Deals table
        CREATE TABLE IF NOT EXISTS deals (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name TEXT NOT NULL,
          company TEXT NOT NULL,
          contact_name TEXT,
          contact_email TEXT,
          contact_phone TEXT,
          value DECIMAL(12,2) NOT NULL,
          description TEXT,
          stage_id UUID REFERENCES deal_stages(id) NOT NULL,
          owner_id UUID REFERENCES auth.users(id) NOT NULL,
          expected_close_date DATE,
          probability INTEGER,
          status TEXT DEFAULT 'active',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          stage_changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        -- Deal activities table
        CREATE TABLE IF NOT EXISTS deal_activities (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          deal_id UUID REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
          user_id UUID REFERENCES auth.users(id) NOT NULL,
          activity_type TEXT NOT NULL,
          notes TEXT,
          due_date TIMESTAMP WITH TIME ZONE,
          completed BOOLEAN DEFAULT false,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        -- Deal stage history table (for time tracking)
        CREATE TABLE IF NOT EXISTS deal_stage_history (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          deal_id UUID REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
          stage_id UUID REFERENCES deal_stages(id) NOT NULL,
          user_id UUID REFERENCES auth.users(id) NOT NULL,
          entered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          exited_at TIMESTAMP WITH TIME ZONE,
          duration_seconds INTEGER
        );

        -- Add RLS policies
        ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Users can view their own deals" ON deals;
        CREATE POLICY "Users can view their own deals" ON deals FOR SELECT USING (owner_id = auth.uid());
        DROP POLICY IF EXISTS "Users can insert their own deals" ON deals;
        CREATE POLICY "Users can insert their own deals" ON deals FOR INSERT WITH CHECK (owner_id = auth.uid());
        DROP POLICY IF EXISTS "Users can update their own deals" ON deals;
        CREATE POLICY "Users can update their own deals" ON deals FOR UPDATE USING (owner_id = auth.uid());

        ALTER TABLE deal_activities ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Users can view their deal activities" ON deal_activities;
        CREATE POLICY "Users can view their deal activities" ON deal_activities FOR SELECT USING (
          deal_id IN (SELECT id FROM deals WHERE owner_id = auth.uid())
        );
        DROP POLICY IF EXISTS "Users can insert deal activities" ON deal_activities;
        CREATE POLICY "Users can insert deal activities" ON deal_activities FOR INSERT WITH CHECK (
          user_id = auth.uid() AND 
          deal_id IN (SELECT id FROM deals WHERE owner_id = auth.uid())
        );

        ALTER TABLE deal_stage_history ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Users can view their deal stage history" ON deal_stage_history;
        CREATE POLICY "Users can view their deal stage history" ON deal_stage_history FOR SELECT USING (
          deal_id IN (SELECT id FROM deals WHERE owner_id = auth.uid())
        );
      ` 
    });
    
    if (error) {
      throw new Error(`Error creating tables: ${error.message}`);
    }
    
    // Create default stages if none exist
    // Wait a bit for tables to be fully created
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check if stages already exist
    const result = await supabaseClient
      .from('deal_stages')
      .select('*');
    
    // If no stages exist and there's no error (table exists), insert default stages
    if (!result.error && result.data && result.data.length === 0) {
      const defaultStages = [
        { name: 'Lead', description: 'New potential opportunity', color: '#3B82F6', order_position: 10, default_probability: 10 },
        { name: 'Qualified', description: 'Qualified opportunity', color: '#8B5CF6', order_position: 20, default_probability: 25 },
        { name: 'Proposal', description: 'Proposal sent', color: '#EAB308', order_position: 30, default_probability: 50 },
        { name: 'Negotiation', description: 'In negotiation', color: '#F97316', order_position: 40, default_probability: 75 },
        { name: 'Signed', description: 'Deal signed', color: '#10B981', order_position: 50, default_probability: 100 },
        { name: 'Lost', description: 'Deal lost', color: '#EF4444', order_position: 60, default_probability: 0 }
      ];
      
      const insertResult = await supabaseClient
        .from('deal_stages')
        .insert(defaultStages);
      
      if (insertResult.error) {
        throw new Error(`Failed to insert default stages: ${insertResult.error.message}`);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Pipeline tables created successfully' 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        error: error.message,
        stack: error.stack 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
}) 