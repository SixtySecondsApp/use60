/**
 * import-leads-generic - Edge function for bulk lead import from any CSV
 *
 * Accepts:
 * - rows: Array of parsed CSV rows (Record<string, string>[])
 * - mappings: Column name -> lead field mappings
 * - options: { skipDuplicates, updateExisting }
 *
 * Returns:
 * - success, total, created, updated, skipped, errors[], leadIds[]
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const JSON_HEADERS = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

const BATCH_SIZE = 100;

interface ImportRequest {
  rows: Record<string, string>[];
  mappings: Record<string, string>;
  options: {
    skipDuplicates: boolean;
    updateExisting: boolean;
  };
}

interface ImportResult {
  success: boolean;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; message: string; value?: string }>;
  leadIds: string[];
}

// ============================================================================
// TRANSFORMATION HELPERS
// ============================================================================

function extractDomain(email: string): string | null {
  if (!email) return null;
  const parts = email.split("@");
  if (parts.length !== 2) return null;
  return parts[1].toLowerCase();
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function normalizePhone(phone: string): string {
  if (!phone) return "";
  const hasPlus = phone.startsWith("+");
  const digits = phone.replace(/[^\d]/g, "");
  return hasPlus ? "+" + digits : digits;
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date.toISOString();
  } catch {
    return null;
  }
}

// ============================================================================
// MAIN TRANSFORMATION
// ============================================================================

function transformRow(
  row: Record<string, string>,
  mappings: Record<string, string>,
  userId: string
): Record<string, unknown> {
  const lead: Record<string, unknown> = {
    // Defaults
    external_source: "csv_import",
    status: "new",
    priority: "normal",
    enrichment_status: "pending",
    prep_status: "pending",
    owner_id: userId,
    created_by: userId,
  };

  const metadata: Record<string, string> = {};

  for (const [csvColumn, leadField] of Object.entries(mappings)) {
    const value = row[csvColumn]?.trim();
    if (!value) continue;

    if (leadField === "__skip__") {
      continue;
    } else if (leadField === "__metadata__") {
      metadata[csvColumn] = value;
    } else if (leadField === "tags") {
      lead.tags = value.split(",").map((t) => t.trim()).filter(Boolean);
    } else if (leadField === "contact_email") {
      lead.contact_email = value.toLowerCase();
    } else if (leadField === "contact_phone") {
      lead.contact_phone = normalizePhone(value);
    } else if (leadField.startsWith("meeting_") && leadField.includes("_")) {
      // Date fields
      if (leadField === "meeting_start" || leadField === "meeting_end") {
        const parsed = parseDate(value);
        if (parsed) {
          lead[leadField] = parsed;
        }
      } else {
        lead[leadField] = value;
      }
    } else {
      lead[leadField] = value;
    }
  }

  // Store unmapped data in metadata
  if (Object.keys(metadata).length > 0) {
    lead.metadata = metadata;
  }

  // Auto-compute derived fields
  if (lead.contact_email && !lead.domain) {
    lead.domain = extractDomain(lead.contact_email as string);
  }

  if (
    lead.contact_name &&
    !lead.contact_first_name &&
    !lead.contact_last_name
  ) {
    const { firstName, lastName } = splitName(lead.contact_name as string);
    if (firstName) lead.contact_first_name = firstName;
    if (lastName) lead.contact_last_name = lastName;
  }

  if (
    !lead.contact_name &&
    (lead.contact_first_name || lead.contact_last_name)
  ) {
    lead.contact_name = [lead.contact_first_name, lead.contact_last_name]
      .filter(Boolean)
      .join(" ");
  }

  // Calculate meeting duration if both start and end are present
  if (lead.meeting_start && lead.meeting_end) {
    const startDate = new Date(lead.meeting_start as string);
    const endDate = new Date(lead.meeting_end as string);
    const diffMs = endDate.getTime() - startDate.getTime();
    if (diffMs > 0) {
      lead.meeting_duration_minutes = Math.round(diffMs / 60000);
    }
  }

  return lead;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Parse request
    const body: ImportRequest = await req.json();
    const { rows, mappings, options } = body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No rows to import" }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    if (!mappings || Object.keys(mappings).length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No field mappings provided" }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Get authenticated user from JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "No authorization header" }),
        { status: 401, headers: JSON_HEADERS }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid authentication" }),
        { status: 401, headers: JSON_HEADERS }
      );
    }

    const userId = user.id;

    // Initialize result tracking
    const result: ImportResult = {
      success: true,
      total: rows.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      leadIds: [],
    };

    // Find email column
    const emailColumn = Object.entries(mappings).find(
      ([_, field]) => field === "contact_email"
    )?.[0];

    // Track seen emails for deduplication within file
    const seenEmails = new Set<string>();

    // Process in batches
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const leadsToInsert: Record<string, unknown>[] = [];
      const leadsToUpdate: Array<{ id: string; data: Record<string, unknown> }> = [];

      for (let j = 0; j < batch.length; j++) {
        const row = batch[j];
        const rowIndex = i + j + 2; // +2 for 1-based index and header row

        try {
          // Check for valid email if mapped
          const email = emailColumn
            ? row[emailColumn]?.trim().toLowerCase()
            : null;

          if (emailColumn && email) {
            // Validate email format
            if (!isValidEmail(email)) {
              result.skipped++;
              result.errors.push({
                row: rowIndex,
                message: "Invalid email format",
                value: email,
              });
              continue;
            }

            // Check for duplicates within file
            if (seenEmails.has(email)) {
              result.skipped++;
              continue;
            }
            seenEmails.add(email);

            // Check for existing lead in database
            if (options.skipDuplicates || options.updateExisting) {
              const { data: existingLead } = await supabase
                .from("leads")
                .select("id")
                .eq("contact_email", email)
                .maybeSingle();

              if (existingLead) {
                if (options.updateExisting) {
                  const leadData = transformRow(row, mappings, userId);
                  delete leadData.created_by; // Don't update created_by
                  delete leadData.status; // Don't reset status
                  delete leadData.enrichment_status;
                  delete leadData.prep_status;
                  leadsToUpdate.push({ id: existingLead.id, data: leadData });
                } else {
                  result.skipped++;
                }
                continue;
              }
            }
          }

          // Transform and add to insert batch
          const leadData = transformRow(row, mappings, userId);
          leadsToInsert.push(leadData);
        } catch (err) {
          result.errors.push({
            row: rowIndex,
            message: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }

      // Bulk insert new leads
      if (leadsToInsert.length > 0) {
        const { data: insertedLeads, error: insertError } = await supabase
          .from("leads")
          .insert(leadsToInsert)
          .select("id");

        if (insertError) {
          // If bulk insert fails, the whole batch fails
          result.errors.push({
            row: i + 2,
            message: `Batch insert failed: ${insertError.message}`,
          });
        } else if (insertedLeads) {
          result.created += insertedLeads.length;
          result.leadIds.push(...insertedLeads.map((l) => l.id));
        }
      }

      // Update existing leads (one by one for now)
      for (const leadToUpdate of leadsToUpdate) {
        const { error: updateError } = await supabase
          .from("leads")
          .update(leadToUpdate.data)
          .eq("id", leadToUpdate.id);

        if (updateError) {
          result.errors.push({
            row: 0,
            message: `Failed to update lead: ${updateError.message}`,
          });
        } else {
          result.updated++;
          result.leadIds.push(leadToUpdate.id);
        }
      }
    }

    // Set success based on whether any leads were processed
    result.success = result.created > 0 || result.updated > 0 || result.errors.length === 0;

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (err) {
    console.error("Import error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Internal server error",
      }),
      { status: 500, headers: JSON_HEADERS }
    );
  }
});
