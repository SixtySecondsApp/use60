/// <reference types="https://esm.sh/@supabase/functions-js/edge-runtime.d.ts" />
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
// @ts-ignore: Deno/LSP type resolution issue
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

// Define the expected structure of an activity row (as received in JSON)
interface ActivityInsert {
  id: string;
  user_id: string;
  type?: string | null;
  status?: string | null;
  priority?: string | null;
  client_name?: string | null;
  sales_rep?: string | null;
  details?: string | null;
  amount?: number | null;
  date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  quantity?: number | null;
  contact_identifier?: string | null;
  contact_identifier_type?: string | null;
  // is_processed?: boolean; // Only include if actually needed/present
}

// Remove COLUMN_ORDER and EXPECTED_COLUMNS constants
export default async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests explicitly
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    // 1. Initialize Supabase Admin Client (use service_role key)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        }
      }
    );

    // 2. Check User Authentication and Admin Role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    // Check if the user is an admin (assuming an 'is_admin' column in your 'profiles' table)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.is_admin) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Admin role required.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403, // Forbidden
      });
    }
    // 3. Get JSON data from request body
    let activitiesToInsert: ActivityInsert[];
    try {
      activitiesToInsert = await req.json();
    } catch (e) {
      throw new Error('Invalid JSON data in request body.');
    }

    if (!Array.isArray(activitiesToInsert) || activitiesToInsert.length === 0) {
      throw new Error('Request body must contain a non-empty JSON array of activities.');
    }

    // 4. Validate received data (basic checks - more can be added)
    const validationErrors: string[] = [];
    const validActivities: ActivityInsert[] = [];
    let skippedCount = 0;

    activitiesToInsert.forEach((activity, index) => {
      const errorsForActivity: string[] = [];
      if (!activity || typeof activity !== 'object') {
          errorsForActivity.push(`Item ${index}: Invalid format, expected object.`);
      } else {
          if (!activity.id || typeof activity.id !== 'string') {
             errorsForActivity.push(`Item ${index}: Missing or invalid required field 'id' (string).`);
          }
          if (!activity.user_id || typeof activity.user_id !== 'string') {
             errorsForActivity.push(`Item ${index}: Missing or invalid required field 'user_id' (string).`);
          }
          // Add more specific type/format validations here if needed
          // Example: Check date format, number types, enum values etc.
          if (activity.date && isNaN(new Date(activity.date).getTime())) {
              errorsForActivity.push(`Item ${index}: Invalid date format for field 'date'. Received: ${activity.date}`);
          }
          if (activity.amount !== undefined && activity.amount !== null && typeof activity.amount !== 'number') {
              errorsForActivity.push(`Item ${index}: Invalid type for field 'amount'. Expected number, received: ${typeof activity.amount}`);
          }
          if (activity.quantity !== undefined && activity.quantity !== null && typeof activity.quantity !== 'number') {
              errorsForActivity.push(`Item ${index}: Invalid type for field 'quantity'. Expected number, received: ${typeof activity.quantity}`);
          }
      }

      if (errorsForActivity.length > 0) {
         validationErrors.push(...errorsForActivity);
         skippedCount++;
      } else {
         validActivities.push(activity);
      }
    });
    if (validationErrors.length > 0) {
    }

    // 5. Perform Bulk Insert with validated data
    let insertedCount = 0;
    let dbError = null;
    if (validActivities.length > 0) {
      const { count, error: insertError } = await supabaseAdmin
        .from('activities')
        .insert(validActivities as any); // Insert validated activities

      if (insertError) {
        dbError = insertError; // Store error to return later
      } else {
         insertedCount = count ?? 0;
      }
    }

    // 6. Construct Response
    const status = dbError ? 400 : 200;
    let responseMessage = `Import processed. Successfully inserted: ${insertedCount}. Skipped due to validation: ${skippedCount}.`;
    let databaseErrorMessage: string | null = null;

    if (dbError) {
       // Explicitly type dbError as any here to access properties safely
       const supabaseError: any = dbError;
       responseMessage = `Import failed during database insertion after validation. Successfully inserted: ${insertedCount}. Skipped due to validation: ${skippedCount}.`;
       databaseErrorMessage = supabaseError.code === '23505'
         ? `Failed due to duplicate ID(s). Check input for existing activity IDs. (Code: ${supabaseError.code})`
         : `Database Error: ${supabaseError.message}. (Code: ${supabaseError.code})`;
    }

    return new Response(JSON.stringify({
      message: responseMessage,
      insertedCount: insertedCount,
      skippedLinesCount: skippedCount, // Renamed for clarity
      parsingErrors: validationErrors.slice(0, 10), // Renamed for clarity
      databaseError: databaseErrorMessage
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: status,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
}; 