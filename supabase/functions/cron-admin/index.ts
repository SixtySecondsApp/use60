/**
 * cron-admin - Admin API for managing cron jobs
 *
 * Endpoints:
 * - GET /cron-admin - List all cron jobs with status
 * - GET /cron-admin/history?job_name=xxx - Get run history for a job
 * - POST /cron-admin/toggle - Enable/disable a cron job
 * - POST /cron-admin/run - Manually trigger a cron job
 * - GET /cron-admin/subscribers - List notification subscribers
 * - POST /cron-admin/subscribers - Add/update subscriber
 * - DELETE /cron-admin/subscribers/:id - Remove subscriber
 * - POST /cron-admin/send-pending-notifications - Send pending failure notifications
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { sendEmail, isSESConfigured } from "../_shared/ses.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface CronJob {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
  display_name?: string;
  description?: string;
  category?: string;
  is_monitored?: boolean;
  alert_on_failure?: boolean;
  last_run?: {
    runid: number;
    status: string;
    start_time: string;
    end_time: string;
    return_message: string;
  };
  failures_last_24h: number;
  runs_last_24h: number;
}

async function verifyAdmin(supabase: ReturnType<typeof createClient>, authHeader: string | null): Promise<boolean> {
  if (!authHeader) return false;

  const token = authHeader.replace("Bearer ", "");

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return false;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  return profile?.is_admin === true;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const action = pathParts[pathParts.length - 1];

    // Verify admin access
    const authHeader = req.headers.get("Authorization");
    const isAdmin = await verifyAdmin(supabase, authHeader);

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Admin access required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Route handling
    switch (action) {
      case "cron-admin": {
        // GET - List all cron jobs with status
        if (req.method === "GET") {
          const { data: jobs, error } = await supabase
            .from("cron_jobs_status")
            .select("*");

          if (error) {
            // Fallback to direct query if view doesn't exist
            const { data: cronJobs, error: cronError } = await supabase.rpc("get_cron_jobs_list");

            if (cronError) {
              throw new Error(`Failed to fetch cron jobs: ${cronError.message}`);
            }

            return new Response(
              JSON.stringify({ success: true, jobs: cronJobs || [] }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          return new Response(
            JSON.stringify({ success: true, jobs: jobs || [] }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        break;
      }

      case "history": {
        // GET - Get run history for a job
        if (req.method === "GET") {
          const jobName = url.searchParams.get("job_name");
          const limit = parseInt(url.searchParams.get("limit") || "50", 10);

          const { data: history, error } = await supabase.rpc("get_cron_job_history", {
            p_job_name: jobName,
            p_limit: limit,
          });

          if (error) throw error;

          return new Response(
            JSON.stringify({ success: true, history: history || [] }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        break;
      }

      case "toggle": {
        // POST - Enable/disable a cron job
        if (req.method === "POST") {
          const body = await req.json();
          const { jobname, active } = body;

          if (!jobname || typeof active !== "boolean") {
            return new Response(
              JSON.stringify({ error: "jobname and active (boolean) are required" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          // Use cron.alter_job to enable/disable
          const { error } = await supabase.rpc("toggle_cron_job", {
            p_jobname: jobname,
            p_active: active,
          });

          if (error) {
            // Try direct SQL as fallback
            const sql = active
              ? `UPDATE cron.job SET active = true WHERE jobname = '${jobname}'`
              : `UPDATE cron.job SET active = false WHERE jobname = '${jobname}'`;

            const { error: sqlError } = await supabase.rpc("exec_sql", { sql });
            if (sqlError) throw sqlError;
          }

          return new Response(
            JSON.stringify({ success: true, message: `Job ${jobname} ${active ? "enabled" : "disabled"}` }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        break;
      }

      case "run": {
        // POST - Manually trigger a cron job
        if (req.method === "POST") {
          const body = await req.json();
          const { jobname } = body;

          if (!jobname) {
            return new Response(
              JSON.stringify({ error: "jobname is required" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          // Get the job's command
          const { data: job, error: jobError } = await supabase
            .from("cron_jobs_status")
            .select("*")
            .eq("jobname", jobname)
            .single();

          if (jobError || !job) {
            return new Response(
              JSON.stringify({ error: `Job not found: ${jobname}` }),
              { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          // Trigger via cron.run_job if available, or call the function directly
          // For now, we'll call the associated Edge Function directly based on job name
          const functionMap: Record<string, string> = {
            "sync-savvycal-events-backup": "sync-savvycal-events?since_hours=2",
            "fathom-hourly-sync": "fathom-cron-sync",
            "check-cron-failures": "", // This is a database function, not an edge function
            "compute-engagement-daily": "compute-engagement",
            "process-notification-queue": "process-notification-queue",
            "cancel-stale-notifications": "", // This is a database function
            "send-feedback-requests": "send-feedback-requests",
            "process-reengagement": "process-reengagement",
          };

          const functionPath = functionMap[jobname];
          if (!functionPath) {
            return new Response(
              JSON.stringify({ error: `Cannot manually trigger job: ${jobname}` }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          // Call the Edge Function
          const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionPath}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({}),
          });

          const result = await response.json();

          return new Response(
            JSON.stringify({
              success: response.ok,
              message: response.ok ? `Job ${jobname} triggered successfully` : `Job failed`,
              result,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        break;
      }

      case "subscribers": {
        if (req.method === "GET") {
          // List notification subscribers
          const { data: subscribers, error } = await supabase
            .from("cron_notification_subscribers")
            .select("*")
            .order("created_at", { ascending: false });

          if (error) throw error;

          return new Response(
            JSON.stringify({ success: true, subscribers: subscribers || [] }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (req.method === "POST") {
          // Add/update subscriber
          const body = await req.json();
          const { email, name, is_active, notify_on_failure, notify_on_success } = body;

          if (!email) {
            return new Response(
              JSON.stringify({ error: "email is required" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          const { data: subscriber, error } = await supabase
            .from("cron_notification_subscribers")
            .upsert({
              email,
              name: name || null,
              is_active: is_active ?? true,
              notify_on_failure: notify_on_failure ?? true,
              notify_on_success: notify_on_success ?? false,
            }, { onConflict: "email" })
            .select()
            .single();

          if (error) throw error;

          return new Response(
            JSON.stringify({ success: true, subscriber }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (req.method === "DELETE") {
          // Remove subscriber
          const id = url.searchParams.get("id");
          if (!id) {
            return new Response(
              JSON.stringify({ error: "id is required" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          const { error } = await supabase
            .from("cron_notification_subscribers")
            .delete()
            .eq("id", id);

          if (error) throw error;

          return new Response(
            JSON.stringify({ success: true, message: "Subscriber removed" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        break;
      }

      case "send-pending-notifications": {
        // POST - Send pending failure notifications via email
        if (req.method === "POST") {
          // Get pending notifications
          const { data: pending, error: pendingError } = await supabase
            .from("cron_notifications_log")
            .select("*")
            .eq("status", "pending")
            .order("created_at", { ascending: true })
            .limit(10);

          if (pendingError) throw pendingError;

          if (!pending || pending.length === 0) {
            return new Response(
              JSON.stringify({ success: true, message: "No pending notifications", sent: 0 }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          let sent = 0;
          const errors: string[] = [];

          for (const notification of pending) {
            try {
              // Send via AWS SES
              if (isSESConfigured()) {
                const result = await sendEmail({
                  to: notification.recipients,
                  subject: notification.subject,
                  text: notification.message,
                  from: "noreply@use60.com",
                  fromName: "Sixty",
                });

                if (!result.success) {
                  throw new Error(result.error || "SES send failed");
                }
              } else {
                throw new Error("AWS SES not configured");
              }

              // Mark as sent
              await supabase
                .from("cron_notifications_log")
                .update({ status: "sent", sent_at: new Date().toISOString() })
                .eq("id", notification.id);

              sent++;
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : "Unknown error";
              errors.push(`${notification.id}: ${errorMsg}`);

              // Mark as failed
              await supabase
                .from("cron_notifications_log")
                .update({ status: "failed", error_details: errorMsg })
                .eq("id", notification.id);
            }
          }

          return new Response(
            JSON.stringify({
              success: true,
              sent,
              failed: errors.length,
              errors: errors.length > 0 ? errors : undefined,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        break;
      }

      case "settings": {
        if (req.method === "GET") {
          // Get job settings
          const { data: settings, error } = await supabase
            .from("cron_job_settings")
            .select("*")
            .order("job_name");

          if (error) throw error;

          return new Response(
            JSON.stringify({ success: true, settings: settings || [] }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (req.method === "POST") {
          // Update job settings
          const body = await req.json();
          const { job_name, ...settings } = body;

          if (!job_name) {
            return new Response(
              JSON.stringify({ error: "job_name is required" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          const { data: updated, error } = await supabase
            .from("cron_job_settings")
            .upsert({
              job_name,
              ...settings,
              updated_at: new Date().toISOString(),
            }, { onConflict: "job_name" })
            .select()
            .single();

          if (error) throw error;

          return new Response(
            JSON.stringify({ success: true, settings: updated }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[cron-admin] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
