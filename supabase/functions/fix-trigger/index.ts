import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

serve(async (req: Request) => {
  console.log("Fix trigger function called");

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Try calling an admin-level RPC to fix the trigger
    const { data, error } = await supabase.from("organizations").select("id").limit(1);

    if (error) {
      console.error("Error accessing organizations table:", error);
      throw error;
    }

    console.log("Successfully accessed database, fix ready to apply");

    return new Response(
      JSON.stringify({
        success: true,
        message: "Fix function deployed. Please run the SQL manually in Supabase Dashboard SQL Editor to apply the trigger fix.",
        instructions: {
          step1: "Go to https://app.supabase.com/projects",
          step2: "Select project: caerqjzvuerejfrdtygb",
          step3: "Click: SQL Editor",
          step4: "Click: New Query",
          step5: "Copy SQL from IMMEDIATE_ACTION_REQUIRED.md or fix-org-settings-trigger.sql",
          step6: "Run the query",
        },
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        error: error.message,
        success: false,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
