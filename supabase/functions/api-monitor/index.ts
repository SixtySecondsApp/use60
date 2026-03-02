/**
 * api-monitor - API Monitoring and Analysis
 *
 * Fetches and aggregates Supabase REST API logs, identifies errors, bursts, and generates AI review prompts.
 * Platform admin only.
 *
 * Endpoints:
 * - GET /api-monitor?from=...&to=... - Get aggregated metrics for time range
 * - POST /api-monitor/snapshot - Create a snapshot (writes to api_monitor_snapshots)
 * - GET /api-monitor/improvements - List improvements with deltas
 * - POST /api-monitor/improvements - Create/update improvement record
 * - GET /api-monitor/ai-review?from=...&to=... - Generate AI review JSON prompt
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { corsHeaders } from "../_shared/cors.ts";
import { getAuthContext } from "../_shared/edgeAuth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ACCESS_TOKEN = Deno.env.get("SUPABASE_ACCESS_TOKEN") ?? ""; // Management API token (optional)

interface ApiSnapshot {
  snapshot_time: string;
  time_bucket_start: string;
  time_bucket_end: string;
  bucket_type: "5m" | "1h" | "1d";
  total_requests: number;
  total_errors: number;
  error_rate: number;
  top_endpoints: Array<{
    endpoint: string;
    method: string;
    count: number;
    errors: number;
  }>;
  top_errors: Array<{
    status: number;
    endpoint: string;
    count: number;
    sample_message?: string;
  }>;
  top_callers: Array<{
    ip?: string;
    user_agent?: string;
    count: number;
  }>;
  suspected_bursts: Array<{
    endpoint: string;
    requests_per_minute: number;
    time_window: string;
  }>;
}

/**
 * Redact sensitive values from headers/query strings
 */
function redactSensitive(data: any): any {
  if (typeof data !== "object" || data === null) return data;
  if (Array.isArray(data)) return data.map(redactSensitive);

  const sensitiveKeys = ["authorization", "apikey", "api_key", "token", "password", "secret"];
  const redacted: any = {};

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some((sk) => lowerKey.includes(sk))) {
      redacted[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      redacted[key] = redactSensitive(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Fetch Supabase logs via Management API (if available)
 * Falls back to aggregating from audit_logs if Management API is not configured
 */
async function fetchSupabaseLogs(
  from: Date,
  to: Date,
  supabase: ReturnType<typeof createClient>
): Promise<ApiSnapshot> {
  // Try Management API first (requires SUPABASE_ACCESS_TOKEN)
  if (SUPABASE_ACCESS_TOKEN) {
    try {
      const projectRef = SUPABASE_URL.split("//")[1]?.split(".")[0];
      if (projectRef) {
        // Note: Supabase Management API endpoint for logs
        // This is a placeholder - actual endpoint may vary
        const logsUrl = `https://api.supabase.com/v1/projects/${projectRef}/logs?from=${from.toISOString()}&to=${to.toISOString()}`;
        
        const response = await fetch(logsUrl, {
          headers: {
            Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          const logs = await response.json();
          return aggregateLogs(logs, from, to);
        }
      }
    } catch (error) {
      console.warn("[api-monitor] Management API fetch failed, falling back to audit_logs:", error);
    }
  }

  // Fallback: Aggregate from audit_logs (has request metadata)
  return aggregateFromAuditLogs(from, to, supabase);
}

/**
 * Aggregate logs into snapshot format
 */
function aggregateLogs(logs: any[], from: Date, to: Date): ApiSnapshot {
  const endpointCounts: Map<string, { method: string; count: number; errors: number }> = new Map();
  const errorCounts: Map<string, { status: number; count: number; sample?: string }> = new Map();
  const callerCounts: Map<string, number> = new Map();
  const timeSeries: Map<number, number> = new Map(); // timestamp -> request count

  let totalRequests = 0;
  let totalErrors = 0;

  for (const log of logs) {
    const endpoint = log.path || log.endpoint || "unknown";
    const method = log.method || "GET";
    const status = log.status_code || log.status || 200;
    const ip = log.ip || log.client_ip;
    const userAgent = log.user_agent || log.agent;
    const timestamp = new Date(log.timestamp || log.created_at).getTime();

    const key = `${method} ${endpoint}`;
    const existing = endpointCounts.get(key) || { method, count: 0, errors: 0 };
    existing.count++;
    if (status >= 400) existing.errors++;
    endpointCounts.set(key, existing);

    totalRequests++;
    if (status >= 400) {
      totalErrors++;
      const errorKey = `${status}:${endpoint}`;
      const errorExisting = errorCounts.get(errorKey) || { status, count: 0 };
      errorExisting.count++;
      if (!errorExisting.sample && log.error_message) {
        errorExisting.sample = log.error_message.substring(0, 200);
      }
      errorCounts.set(errorKey, errorExisting);
    }

    if (ip || userAgent) {
      const callerKey = `${ip || "unknown"}:${userAgent || "unknown"}`;
      callerCounts.set(callerKey, (callerCounts.get(callerKey) || 0) + 1);
    }

    // Track time series for burst detection (by endpoint and minute)
    const minuteBucket = Math.floor(timestamp / 60000) * 60000;
    const endpointKey = `${method}:${endpoint}`;
    const bucketKey = `${endpointKey}:${minuteBucket}`;
    timeSeries.set(bucketKey, (timeSeries.get(bucketKey) || 0) + 1);
  }

  // Build top endpoints
  const topEndpoints = Array.from(endpointCounts.entries())
    .map(([key, data]) => ({
      endpoint: key.split(" ")[1],
      method: data.method,
      count: data.count,
      errors: data.errors,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // Build top errors
  const topErrors = Array.from(errorCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((e) => ({
      status: e.status,
      endpoint: e.sample?.split(":")[1] || "unknown",
      count: e.count,
      sample_message: e.sample,
    }));

  // Build top callers
  const topCallers = Array.from(callerCounts.entries())
    .map(([key, count]) => {
      const [ip, userAgent] = key.split(":");
      return { ip: ip !== "unknown" ? ip : undefined, user_agent: userAgent !== "unknown" ? userAgent : undefined, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Enhanced burst detection: detect polling loops, retry patterns, and endpoint-specific bursts
  const suspectedBursts: ApiSnapshot["suspected_bursts"] = [];
  const endpointBursts = new Map<string, { count: number; timestamps: number[] }>();
  
  // Group time series by endpoint
  for (const [bucketKey, count] of timeSeries.entries()) {
    const [endpointKey, timestampStr] = bucketKey.split(":");
    const timestamp = parseInt(timestampStr, 10);
    
    if (!endpointBursts.has(endpointKey)) {
      endpointBursts.set(endpointKey, { count: 0, timestamps: [] });
    }
    const burst = endpointBursts.get(endpointKey)!;
    burst.count += count;
    burst.timestamps.push(timestamp);
  }

  // Analyze each endpoint for burst patterns
  for (const [endpointKey, burst] of endpointBursts.entries()) {
    const [method, endpoint] = endpointKey.split(":");
    const requestsPerMinute = burst.count / Math.max(1, (to.getTime() - from.getTime()) / 60000);
    
    // Detect high-frequency polling (consistent requests every few seconds)
    const sortedTimestamps = burst.timestamps.sort((a, b) => a - b);
    let consistentIntervals = 0;
    for (let i = 1; i < sortedTimestamps.length; i++) {
      const interval = sortedTimestamps[i] - sortedTimestamps[i - 1];
      // Check if interval is between 2-30 seconds (likely polling)
      if (interval >= 2000 && interval <= 30000) {
        consistentIntervals++;
      }
    }
    const pollingScore = sortedTimestamps.length > 1 ? consistentIntervals / (sortedTimestamps.length - 1) : 0;

    // Detect bursts: high requests/min OR consistent polling pattern
    if (requestsPerMinute > 60 || (pollingScore > 0.7 && requestsPerMinute > 20)) {
      suspectedBursts.push({
        endpoint: endpoint || "unknown",
        requests_per_minute: Math.round(requestsPerMinute),
        time_window: new Date(Math.min(...sortedTimestamps)).toISOString(),
      });
    }
  }

  const durationMs = to.getTime() - from.getTime();
  const durationMinutes = durationMs / 60000;
  const bucketType: "5m" | "1h" | "1d" = durationMinutes <= 5 ? "5m" : durationMinutes <= 60 ? "1h" : "1d";

  return {
    snapshot_time: new Date().toISOString(),
    time_bucket_start: from.toISOString(),
    time_bucket_end: to.toISOString(),
    bucket_type: bucketType,
    total_requests: totalRequests,
    total_errors: totalErrors,
    error_rate: totalRequests > 0 ? Number(((totalErrors / totalRequests) * 100).toFixed(2)) : 0,
    top_endpoints: topEndpoints,
    top_errors: topErrors,
    top_callers: topCallers,
    suspected_bursts: suspectedBursts,
  };
}

/**
 * Aggregate from audit_logs table (fallback when Management API unavailable)
 */
async function aggregateFromAuditLogs(
  from: Date,
  to: Date,
  supabase: ReturnType<typeof createClient>
): Promise<ApiSnapshot> {
  // Query audit_logs for request metadata
  const { data: auditLogs, error } = await supabase
    .from("audit_logs")
    .select("request_method, request_endpoint, response_status, request_duration, changed_at")
    .gte("changed_at", from.toISOString())
    .lte("changed_at", to.toISOString())
    .not("request_endpoint", "is", null)
    .limit(10000); // Reasonable limit

  if (error) {
    console.error("[api-monitor] Error fetching audit_logs:", error);
    // If no audit logs available, return empty snapshot instead of throwing
    if (error.code === 'PGRST116' || error.message?.includes('not found')) {
      console.warn("[api-monitor] No audit_logs found, returning empty snapshot");
      return {
        snapshot_time: new Date().toISOString(),
        time_bucket_start: from.toISOString(),
        time_bucket_end: to.toISOString(),
        bucket_type: '1h',
        total_requests: 0,
        total_errors: 0,
        error_rate: 0,
        top_endpoints: [],
        top_errors: [],
        top_callers: [],
        suspected_bursts: [],
      };
    }
    throw error;
  }

  // Convert to log format
  const logs = (auditLogs || []).map((log) => ({
    path: log.request_endpoint,
    method: log.request_method || "GET",
    status_code: log.response_status || 200,
    timestamp: log.changed_at,
  }));

  // If no logs, return empty snapshot
  if (logs.length === 0) {
    console.warn("[api-monitor] No audit logs found in time range");
    return {
      snapshot_time: new Date().toISOString(),
      time_bucket_start: from.toISOString(),
      time_bucket_end: to.toISOString(),
      bucket_type: '1h',
      total_requests: 0,
      total_errors: 0,
      error_rate: 0,
      top_endpoints: [],
      top_errors: [],
      top_callers: [],
      suspected_bursts: [],
    };
  }

  return aggregateLogs(logs, from, to);
}

/**
 * Generate AI review JSON prompt with enhanced analysis
 */
function generateAIReview(snapshot: ApiSnapshot, from: Date, to: Date): any {
  const hypotheses: string[] = [];
  const recommendations: string[] = [];
  const codePointers: string[] = [];
  let priority: "high" | "medium" | "low" = "medium";

  // Analyze error patterns in detail
  if (snapshot.error_rate > 10) {
    hypotheses.push(`CRITICAL: Error rate is ${snapshot.error_rate}% (threshold: 5%) - indicates systemic issues requiring immediate attention`);
    recommendations.push("URGENT: Investigate error patterns immediately. Check for retry loops, invalid data formats, or authentication issues");
    priority = "high";
  } else if (snapshot.error_rate > 5) {
    hypotheses.push(`High error rate (${snapshot.error_rate}%) suggests client-side validation issues, retry loops, or API contract mismatches`);
    recommendations.push("Review error patterns and add client-side validation to prevent invalid requests. Check for retry logic causing cascading failures");
    priority = "high";
  } else if (snapshot.error_rate > 2) {
    hypotheses.push(`Moderate error rate (${snapshot.error_rate}%) - review top error endpoints for optimization opportunities`);
    recommendations.push("Review top error endpoints and add better error handling or validation");
  }

  // Analyze specific error types
  const uuidErrors = snapshot.top_errors.filter(e => e.sample_message?.includes("uuid") || e.sample_message?.includes("UUID"));
  if (uuidErrors.length > 0) {
    hypotheses.push(`${uuidErrors.reduce((sum, e) => sum + e.count, 0)} UUID validation errors detected - likely type mismatches in RPC calls`);
    recommendations.push("Fix UUID generation/validation: Ensure all RPC parameters expecting UUIDs receive proper UUIDv4 strings, not timestamps or random strings");
    codePointers.push("src/lib/services/*Service.ts - Check RPC calls with UUID parameters");
    codePointers.push("src/lib/utils/uuidUtils.ts - Verify UUID generation helpers");
    priority = "high";
  }

  const notFoundErrors = snapshot.top_errors.filter(e => e.status === 404);
  if (notFoundErrors.length > 0 && notFoundErrors.reduce((sum, e) => sum + e.count, 0) > snapshot.total_requests * 0.05) {
    hypotheses.push(`High 404 rate (${Math.round((notFoundErrors.reduce((sum, e) => sum + e.count, 0) / snapshot.total_requests) * 100)}%) - possible stale cache or missing data checks`);
    recommendations.push("Add existence checks before fetching related data. Consider using maybeSingle() instead of single() for optional relationships");
    codePointers.push("src/lib/services/*Service.ts - Replace .single() with .maybeSingle() where records might not exist");
  }

  // Analyze bursts with specific patterns
  if (snapshot.suspected_bursts.length > 0) {
    const totalBurstRequests = snapshot.suspected_bursts.reduce((sum, b) => sum + b.requests_per_minute, 0);
    hypotheses.push(`${snapshot.suspected_bursts.length} burst pattern(s) detected - ${totalBurstRequests} requests/min total. Likely causes: polling loops, missing React Query caching, or useEffect dependency issues`);
    
    snapshot.suspected_bursts.forEach((burst) => {
      if (burst.requests_per_minute > 100) {
        recommendations.push(`CRITICAL: ${burst.endpoint} has ${burst.requests_per_minute} req/min - implement immediate caching/deduplication`);
        codePointers.push(`Check all components calling ${burst.endpoint} - likely in src/lib/hooks/use*.ts or src/components/**/*.tsx`);
        priority = "high";
      } else if (burst.requests_per_minute > 60) {
        recommendations.push(`HIGH: ${burst.endpoint} has ${burst.requests_per_minute} req/min - add React Query caching with staleTime > 5s`);
        codePointers.push(`src/lib/hooks/use*.ts - Add staleTime to useQuery for ${burst.endpoint}`);
        priority = "high";
      } else {
        recommendations.push(`MEDIUM: ${burst.endpoint} has ${burst.requests_per_minute} req/min - consider request deduplication`);
      }
    });
    
    recommendations.push("Implement React Query's request deduplication: Ensure queries with same key share the same request");
    codePointers.push("src/lib/hooks/use*.ts - Verify queryKey includes all filter parameters to enable proper deduplication");
  }

  // Analyze top endpoints for optimization opportunities
  const topEndpoint = snapshot.top_endpoints[0];
  if (topEndpoint) {
    const endpointPercentage = (topEndpoint.count / snapshot.total_requests) * 100;
    if (endpointPercentage > 50) {
      hypotheses.push(`Single endpoint (${topEndpoint.endpoint}) accounts for ${Math.round(endpointPercentage)}% of all requests - major optimization target`);
      recommendations.push(`HIGH PRIORITY: Optimize ${topEndpoint.endpoint} - consider batching, pagination, or caching strategies`);
      codePointers.push(`Find all usages: grep -r "${topEndpoint.endpoint}" src/`);
      priority = "high";
    } else if (endpointPercentage > 30) {
      hypotheses.push(`Top endpoint (${topEndpoint.endpoint}) accounts for ${Math.round(endpointPercentage)}% of requests - good optimization candidate`);
      recommendations.push(`Consider caching or batching requests to ${topEndpoint.endpoint}`);
    }

    // Check for high error rate on specific endpoint
    if (topEndpoint.errors > 0) {
      const endpointErrorRate = (topEndpoint.errors / topEndpoint.count) * 100;
      if (endpointErrorRate > 10) {
        hypotheses.push(`${topEndpoint.endpoint} has ${endpointErrorRate.toFixed(1)}% error rate - investigate this endpoint specifically`);
        recommendations.push(`Fix errors in ${topEndpoint.endpoint}: Check request parameters, data validation, and error handling`);
        codePointers.push(`src/lib/services/*Service.ts - Find service method calling ${topEndpoint.endpoint}`);
        priority = "high";
      }
    }
  }

  // Detect retry loop patterns (same endpoint, same error, high frequency)
  const retryLoopCandidates = snapshot.top_errors.filter(e => {
    const endpoint = snapshot.top_endpoints.find(ep => ep.endpoint === e.endpoint);
    return endpoint && endpoint.count > 100 && e.count > endpoint.count * 0.1;
  });
  if (retryLoopCandidates.length > 0) {
    hypotheses.push(`${retryLoopCandidates.length} potential retry loop(s) detected - same endpoint failing repeatedly`);
    recommendations.push("URGENT: Break retry loops - add exponential backoff, max retry limits, and don't retry on 4xx errors");
    codePointers.push("src/lib/services/*Service.ts - Review error handling and retry logic");
    codePointers.push("src/lib/utils/errorHandling.ts - Add isNonRetriableError() helper");
    priority = "high";
  }

  // Detect notification/polling patterns
  const notificationEndpoints = snapshot.top_endpoints.filter(e => 
    e.endpoint.includes("notification") || e.endpoint.includes("unread")
  );
  if (notificationEndpoints.length > 0 && notificationEndpoints.reduce((sum, e) => sum + e.count, 0) > 200) {
    hypotheses.push("High notification endpoint usage detected - consider WebSocket/Realtime subscriptions instead of polling");
    recommendations.push("Replace notification polling with Supabase Realtime subscriptions for instant updates");
    codePointers.push("src/lib/hooks/useNotifications.ts - Check if using Realtime or polling");
    codePointers.push("src/lib/hooks/useRealtimeHub.ts - Verify Realtime subscriptions are active");
  }

  return {
    timeframe: {
      from: from.toISOString(),
      to: to.toISOString(),
      duration_hours: (to.getTime() - from.getTime()) / (1000 * 60 * 60),
    },
    totals: {
      total_requests: snapshot.total_requests,
      total_errors: snapshot.total_errors,
      error_rate: snapshot.error_rate,
    },
    top_endpoints: snapshot.top_endpoints.slice(0, 10),
    top_errors: snapshot.top_errors.slice(0, 10),
    suspected_sources: {
      browser: snapshot.top_callers.filter((c) => c.user_agent?.includes("Mozilla")).length,
      edge_functions: snapshot.top_callers.filter((c) => c.user_agent?.includes("Deno")).length,
      cron: snapshot.top_callers.filter((c) => !c.user_agent).length,
    },
    priority,
    hypotheses,
    recommended_next_changes: recommendations,
    code_pointers: codePointers,
    estimated_impact: {
      requests_reduction_potential: snapshot.suspected_bursts.length > 0 
        ? Math.round(snapshot.suspected_bursts.reduce((sum, b) => sum + b.requests_per_minute * 60 * 24, 0))
        : 0,
      error_reduction_potential: snapshot.total_errors > 0 
        ? Math.round(snapshot.total_errors * 0.8) // Assume 80% of errors are fixable
        : 0,
    },
  };
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
    // Handle both /api-monitor and /api-monitor/action paths
    const action = pathParts[pathParts.length - 1] || "api-monitor";

    // Verify platform admin access
    const authHeader = req.headers.get("Authorization");
    let authContext;
    try {
      authContext = await getAuthContext(req, supabase, SUPABASE_SERVICE_ROLE_KEY);
      console.log("[api-monitor] Auth context:", { mode: authContext.mode, userId: authContext.userId, isPlatformAdmin: authContext.isPlatformAdmin });
    } catch (authError) {
      console.error("[api-monitor] Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized: " + (authError instanceof Error ? authError.message : "Authentication failed") }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For user mode, also verify they're an internal user (platform admin = internal + is_admin)
    if (authContext.mode === 'user' && authContext.userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, is_admin')
        .eq('id', authContext.userId)
        .single();
      
      if (!profile) {
        return new Response(
          JSON.stringify({ error: "Unauthorized: User profile not found" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if user is internal (check internal_users table)
      const { data: internalUser } = await supabase
        .from('internal_users')
        .select('email')
        .eq('email', profile.email?.toLowerCase())
        .eq('is_active', true)
        .maybeSingle();

      const isInternalUser = !!internalUser;
      const isPlatformAdmin = profile.is_admin === true && isInternalUser;

      console.log("[api-monitor] User check:", { 
        email: profile.email, 
        is_admin: profile.is_admin, 
        is_internal: isInternalUser,
        is_platform_admin: isPlatformAdmin 
      });

      if (!isPlatformAdmin) {
        return new Response(
          JSON.stringify({ error: "Unauthorized: Platform admin access required (internal user + is_admin)" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (!authContext.isPlatformAdmin) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Platform admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse time range (default: last 24 hours)
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");
    const from = fromParam ? new Date(fromParam) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const to = toParam ? new Date(toParam) : new Date();

    // Route handling
    switch (action) {
      case "api-monitor": {
        // GET - Get aggregated metrics
        if (req.method === "GET") {
          try {
            const snapshot = await fetchSupabaseLogs(from, to, supabase);
            return new Response(
              JSON.stringify({ success: true, snapshot }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          } catch (fetchError) {
            console.error("[api-monitor] Error fetching logs:", fetchError);
            return new Response(
              JSON.stringify({ 
                success: false, 
                error: fetchError instanceof Error ? fetchError.message : "Failed to fetch logs",
                snapshot: null 
              }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
        break;
      }

      case "snapshot": {
        // POST - Create and save snapshot
        if (req.method === "POST") {
          const snapshot = await fetchSupabaseLogs(from, to, supabase);
          
          const { data, error } = await supabase
            .from("api_monitor_snapshots")
            .insert({
              snapshot_time: snapshot.snapshot_time,
              time_bucket_start: snapshot.time_bucket_start,
              time_bucket_end: snapshot.time_bucket_end,
              bucket_type: snapshot.bucket_type,
              total_requests: snapshot.total_requests,
              total_errors: snapshot.total_errors,
              error_rate: snapshot.error_rate,
              top_endpoints: snapshot.top_endpoints,
              top_errors: snapshot.top_errors,
              top_callers: snapshot.top_callers,
              suspected_bursts: snapshot.suspected_bursts,
              source: "supabase_logs",
            })
            .select()
            .single();

          if (error) throw error;

          return new Response(
            JSON.stringify({ success: true, snapshot: data }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        break;
      }

      case "improvements": {
        // GET - List improvements
        if (req.method === "GET") {
          const { data, error } = await supabase
            .from("api_monitor_improvements")
            .select("*")
            .order("shipped_at", { ascending: false })
            .limit(50);

          if (error) throw error;

          // Compute actual deltas for each
          const improvementsWithDeltas = await Promise.all(
            (data || []).map(async (imp) => {
              try {
                const { data: deltas } = await supabase.rpc("compute_improvement_deltas", {
                  p_improvement_id: imp.id,
                });
                if (deltas && deltas.length > 0) {
                  return {
                    ...imp,
                    actual_delta_requests_per_day: deltas[0].actual_delta_requests_per_day,
                    actual_delta_error_rate: deltas[0].actual_delta_error_rate,
                    actual_delta_requests_per_user_per_day: deltas[0].actual_delta_requests_per_user_per_day,
                  };
                }
              } catch (err) {
                console.warn(`[api-monitor] Failed to compute deltas for improvement ${imp.id}:`, err);
              }
              return imp;
            })
          );

          return new Response(
            JSON.stringify({ success: true, improvements: improvementsWithDeltas }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // POST - Create/update improvement
        if (req.method === "POST") {
          const body = await req.json();
          const {
            id,
            title,
            description,
            shipped_at,
            expected_delta_requests_per_day,
            expected_delta_error_rate,
            code_changes,
            before_window_start,
            before_window_end,
            after_window_start,
            after_window_end,
          } = body;

          if (!title || !description) {
            return new Response(
              JSON.stringify({ error: "title and description are required" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          const improvementData: any = {
            title,
            description,
            shipped_at: shipped_at || new Date().toISOString(),
            expected_delta_requests_per_day,
            expected_delta_error_rate,
            code_changes: code_changes || [],
            before_window_start,
            before_window_end,
            after_window_start,
            after_window_end,
            updated_at: new Date().toISOString(),
          };

          let data, error;
          if (id) {
            // Update
            ({ data, error } = await supabase
              .from("api_monitor_improvements")
              .update(improvementData)
              .eq("id", id)
              .select()
              .single());
          } else {
            // Insert
            ({ data, error } = await supabase
              .from("api_monitor_improvements")
              .insert(improvementData)
              .select()
              .single());
          }

          if (error) throw error;

          return new Response(
            JSON.stringify({ success: true, improvement: data }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        break;
      }

      case "ai-review": {
        // GET - Generate AI review JSON
        if (req.method === "GET") {
          try {
            const snapshot = await fetchSupabaseLogs(from, to, supabase);
            const review = generateAIReview(snapshot, from, to);
            
            return new Response(
              JSON.stringify({ success: true, review }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          } catch (fetchError) {
            console.error("[api-monitor] Error fetching logs for AI review:", fetchError);
            // Try to use latest snapshot from database as fallback
            const { data: latestSnapshot } = await supabase
              .from("api_monitor_snapshots")
              .select("*")
              .order("snapshot_time", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (latestSnapshot) {
              const snapshot: ApiSnapshot = {
                snapshot_time: latestSnapshot.snapshot_time,
                time_bucket_start: latestSnapshot.time_bucket_start,
                time_bucket_end: latestSnapshot.time_bucket_end,
                bucket_type: latestSnapshot.bucket_type,
                total_requests: latestSnapshot.total_requests,
                total_errors: latestSnapshot.total_errors,
                error_rate: latestSnapshot.error_rate,
                top_endpoints: latestSnapshot.top_endpoints as any,
                top_errors: latestSnapshot.top_errors as any,
                top_callers: latestSnapshot.top_callers as any,
                suspected_bursts: latestSnapshot.suspected_bursts as any,
              };
              const review = generateAIReview(snapshot, new Date(latestSnapshot.time_bucket_start), new Date(latestSnapshot.time_bucket_end));
              return new Response(
                JSON.stringify({ success: true, review }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }

            // If no snapshot available, return empty review
            const emptySnapshot: ApiSnapshot = {
              snapshot_time: new Date().toISOString(),
              time_bucket_start: from.toISOString(),
              time_bucket_end: to.toISOString(),
              bucket_type: '1h',
              total_requests: 0,
              total_errors: 0,
              error_rate: 0,
              top_endpoints: [],
              top_errors: [],
              top_callers: [],
              suspected_bursts: [],
            };
            const review = generateAIReview(emptySnapshot, from, to);
            return new Response(
              JSON.stringify({ success: true, review }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
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
    console.error("[api-monitor] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("[api-monitor] Error stack:", errorStack);
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        details: errorStack ? { stack: errorStack } : undefined,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
