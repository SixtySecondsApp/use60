// supabase/functions/slack-slash-commands/index.ts
// Main handler for /sixty and /60 slash commands

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import {
  verifySlackSignature,
  parseSlashCommandPayload,
  parseCommandText,
  getSlackOrgConnection,
  getSixtyUserContext,
  sendEphemeral,
  buildErrorResponse,
  buildHelpMessage,
  buildLoadingResponse,
  type SlashCommandPayload,
  type SixtyUserContext,
  type SlackOrgConnection,
} from '../_shared/slackAuth.ts';

// Import command handlers
import { handleToday } from './handlers/today.ts';
import { handleContact } from './handlers/contact.ts';
import { handleDeal } from './handlers/deal.ts';
import { handleMeetingBrief } from './handlers/meetingBrief.ts';
import { handleFollowUp } from './handlers/followUp.ts';
import { handleRisks } from './handlers/risks.ts';
import { handleDebrief } from './handlers/debrief.ts';
import { handleTaskAdd, handleTaskList, handleFocus } from './handlers/task.ts';
// Phase 5: Team & Manager Commands
import { handleStandup } from './handlers/standup.ts';
import { handlePipeline } from './handlers/pipeline.ts';
import { handleApprovals } from './handlers/approvals.ts';

// ============================================================================
// Environment
// ============================================================================

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const appUrl = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://app.use60.com';

// ============================================================================
// Types
// ============================================================================

export interface CommandContext {
  supabase: SupabaseClient;
  payload: SlashCommandPayload;
  userContext: SixtyUserContext;
  orgConnection: SlackOrgConnection;
  appUrl: string;
}

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
  // Handle CORS preflight
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    // Read body as text for signature verification
    const rawBody = await req.text();

    // Verify Slack signature
    const timestamp = req.headers.get('X-Slack-Request-Timestamp') || '';
    const signature = req.headers.get('X-Slack-Signature') || '';

    const isValid = await verifySlackSignature(rawBody, timestamp, signature);
    if (!isValid) {
      console.error('Invalid Slack signature');
      return new Response('Invalid signature', { status: 401 });
    }

    // Parse slash command payload
    const payload = parseSlashCommandPayload(rawBody);
    if (!payload) {
      console.error('Failed to parse slash command payload');
      return new Response('Invalid payload', { status: 400 });
    }

    console.log(`Slash command received: ${payload.command} ${payload.text} from user ${payload.user_id}`);

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get org connection (bot token)
    const orgConnection = await getSlackOrgConnection(supabase, payload.team_id);
    if (!orgConnection) {
      return jsonResponse(buildErrorResponse(
        'Slack workspace not connected to Sixty. Please connect via Settings → Integrations.'
      ));
    }

    // Get Sixty user context
    const userContext = await getSixtyUserContext(supabase, payload.user_id, payload.team_id);
    if (!userContext) {
      return jsonResponse(buildErrorResponse(
        'Your Slack account is not linked to Sixty. Use `/sixty connect` or link via Settings → Profile.'
      ));
    }

    // Parse subcommand
    const { subcommand, args, rawArgs } = parseCommandText(payload.text);

    // Build context for handlers
    const ctx: CommandContext = {
      supabase,
      payload,
      userContext,
      orgConnection,
      appUrl,
    };

    // Route to appropriate handler
    return await routeCommand(ctx, subcommand, args, rawArgs);

  } catch (error) {
    console.error('Error handling slash command:', error);
    return jsonResponse(buildErrorResponse(
      'Something went wrong. Please try again or contact support.'
    ));
  }
});

// ============================================================================
// Command Router
// ============================================================================

async function routeCommand(
  ctx: CommandContext,
  subcommand: string,
  args: string[],
  rawArgs: string
): Promise<Response> {
  switch (subcommand) {
    case '':
    case 'help':
      // No subcommand or help → show help message
      return jsonResponse(buildHelpMessage());

    case 'today':
      // Day-at-a-glance
      return await handleTodayCommand(ctx);

    case 'contact':
      // Contact lookup
      if (!rawArgs) {
        return jsonResponse(buildErrorResponse(
          'Please specify a contact to look up. Example: `/sixty contact john@acme.com`'
        ));
      }
      return await handleContactCommand(ctx, rawArgs);

    case 'deal':
      // Deal snapshot
      if (!rawArgs) {
        return jsonResponse(buildErrorResponse(
          'Please specify a deal to look up. Example: `/sixty deal Acme Corp`'
        ));
      }
      return await handleDealCommand(ctx, rawArgs);

    case 'meeting-brief':
    case 'meeting':
    case 'prep':
      // Meeting prep (aliases: meeting-brief, meeting, prep)
      return await handleMeetingBriefCommand(ctx, rawArgs || 'next');

    case 'follow-up':
    case 'followup':
    case 'fu':
      // Draft follow-up (aliases: follow-up, followup, fu)
      if (!rawArgs) {
        return jsonResponse(buildErrorResponse(
          'Please specify who to follow up with. Example: `/sixty follow-up John at Acme`'
        ));
      }
      return await handleFollowUpCommand(ctx, rawArgs);

    case 'risks':
    case 'risk':
    case 'stale':
      // At-risk and stale deals (aliases: risks, risk, stale)
      return await handleRisksCommand(ctx, rawArgs || '');

    case 'debrief':
      // Post-meeting debrief (Phase 3)
      return await handleDebriefCommand(ctx, rawArgs || 'last');

    case 'task':
      // Task management (Phase 4)
      // Parse task subcommand: /sixty task add <text>, /sixty task list [filter]
      const taskSubcmd = args[0]?.toLowerCase() || '';
      const taskArgs = args.slice(1).join(' ');

      if (taskSubcmd === 'add') {
        if (!taskArgs) {
          return jsonResponse(buildErrorResponse(
            'Please provide a task description.\n\nExample: `/sixty task add Follow up with John tomorrow`'
          ));
        }
        return await handleTaskAddCommand(ctx, taskArgs);
      } else if (taskSubcmd === 'list' || taskSubcmd === '') {
        return await handleTaskListCommand(ctx, taskArgs);
      } else {
        // Assume it's task add without the "add" keyword
        return await handleTaskAddCommand(ctx, rawArgs);
      }

    case 'focus':
      // Focus mode (Phase 4)
      return await handleFocusCommand(ctx);

    // Phase 5: Team & Manager Commands
    case 'standup':
    case 'stand-up':
      // Team standup digest
      return await handleStandupCommand(ctx);

    case 'pipeline':
    case 'pipe':
      // Pipeline summary with filters
      return await handlePipelineCommand(ctx, rawArgs || '');

    case 'approvals':
    case 'approve':
    case 'pending':
      // Pending HITL approvals
      return await handleApprovalsCommand(ctx);

    default:
      // Unknown command → show help with suggestion
      return jsonResponse({
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `❓ Unknown command: \`${subcommand}\`\n\nDid you mean one of these?`,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: getSuggestion(subcommand),
            },
          },
          {
            type: 'context',
            elements: [
              { type: 'mrkdwn', text: 'Use `/sixty help` to see all available commands.' },
            ],
          },
        ],
        text: `Unknown command: ${subcommand}. Use /sixty help for available commands.`,
      });
  }
}

// ============================================================================
// Command Handlers (wrappers with async response handling)
// ============================================================================

/**
 * Handle /sixty today
 * Sends loading message immediately, then fetches data and sends full response
 */
async function handleTodayCommand(ctx: CommandContext): Promise<Response> {
  // Send immediate loading response (Slack requires response within 3 seconds)
  const loadingResponse = buildLoadingResponse('Fetching your day at a glance...');

  // Process in background and send update via response_url
  processInBackground(async () => {
    try {
      const response = await handleToday(ctx);
      await sendEphemeral(ctx.payload.response_url, response);
    } catch (error) {
      console.error('Error in handleToday:', error);
      await sendEphemeral(ctx.payload.response_url, buildErrorResponse(
        'Failed to load your day. Please try again.'
      ));
    }
  });

  return jsonResponse(loadingResponse);
}

/**
 * Handle /sixty contact <query>
 */
async function handleContactCommand(ctx: CommandContext, query: string): Promise<Response> {
  const loadingResponse = buildLoadingResponse(`Searching for "${query}"...`);

  processInBackground(async () => {
    try {
      const response = await handleContact(ctx, query);
      await sendEphemeral(ctx.payload.response_url, response);
    } catch (error) {
      console.error('Error in handleContact:', error);
      await sendEphemeral(ctx.payload.response_url, buildErrorResponse(
        'Failed to search contacts. Please try again.'
      ));
    }
  });

  return jsonResponse(loadingResponse);
}

/**
 * Handle /sixty deal <query>
 */
async function handleDealCommand(ctx: CommandContext, query: string): Promise<Response> {
  const loadingResponse = buildLoadingResponse(`Searching for "${query}"...`);

  processInBackground(async () => {
    try {
      const response = await handleDeal(ctx, query);
      await sendEphemeral(ctx.payload.response_url, response);
    } catch (error) {
      console.error('Error in handleDeal:', error);
      await sendEphemeral(ctx.payload.response_url, buildErrorResponse(
        'Failed to search deals. Please try again.'
      ));
    }
  });

  return jsonResponse(loadingResponse);
}

/**
 * Handle /sixty meeting-brief [next|today|name]
 */
async function handleMeetingBriefCommand(ctx: CommandContext, target: string): Promise<Response> {
  const loadingResponse = buildLoadingResponse('Preparing meeting brief...');

  processInBackground(async () => {
    try {
      const response = await handleMeetingBrief(ctx, target);
      await sendEphemeral(ctx.payload.response_url, response);
    } catch (error) {
      console.error('Error in handleMeetingBrief:', error);
      await sendEphemeral(ctx.payload.response_url, buildErrorResponse(
        'Failed to load meeting brief. Please try again.'
      ));
    }
  });

  return jsonResponse(loadingResponse);
}

/**
 * Handle /sixty follow-up <person/company>
 */
async function handleFollowUpCommand(ctx: CommandContext, target: string): Promise<Response> {
  const loadingResponse = buildLoadingResponse('Drafting follow-up...');

  processInBackground(async () => {
    try {
      const response = await handleFollowUp(ctx, target);
      await sendEphemeral(ctx.payload.response_url, response);
    } catch (error) {
      console.error('Error in handleFollowUp:', error);
      await sendEphemeral(ctx.payload.response_url, buildErrorResponse(
        'Failed to draft follow-up. Please try again.'
      ));
    }
  });

  return jsonResponse(loadingResponse);
}

/**
 * Handle /sixty risks [stale|closing|all]
 */
async function handleRisksCommand(ctx: CommandContext, filter: string): Promise<Response> {
  const loadingResponse = buildLoadingResponse('Analyzing pipeline risks...');

  processInBackground(async () => {
    try {
      const response = await handleRisks(ctx, filter);
      await sendEphemeral(ctx.payload.response_url, response);
    } catch (error) {
      console.error('Error in handleRisks:', error);
      await sendEphemeral(ctx.payload.response_url, buildErrorResponse(
        'Failed to fetch at-risk deals. Please try again.'
      ));
    }
  });

  return jsonResponse(loadingResponse);
}

/**
 * Handle /sixty debrief [last|today|name]
 */
async function handleDebriefCommand(ctx: CommandContext, target: string): Promise<Response> {
  const loadingResponse = buildLoadingResponse('Generating meeting debrief...');

  processInBackground(async () => {
    try {
      const response = await handleDebrief(ctx, target);
      await sendEphemeral(ctx.payload.response_url, response);
    } catch (error) {
      console.error('Error in handleDebrief:', error);
      await sendEphemeral(ctx.payload.response_url, buildErrorResponse(
        'Failed to generate meeting debrief. Please try again.'
      ));
    }
  });

  return jsonResponse(loadingResponse);
}

/**
 * Handle /sixty task add <text>
 */
async function handleTaskAddCommand(ctx: CommandContext, text: string): Promise<Response> {
  const loadingResponse = buildLoadingResponse('Creating task...');

  processInBackground(async () => {
    try {
      const response = await handleTaskAdd(ctx, text);
      await sendEphemeral(ctx.payload.response_url, response);
    } catch (error) {
      console.error('Error in handleTaskAdd:', error);
      await sendEphemeral(ctx.payload.response_url, buildErrorResponse(
        'Failed to create task. Please try again.'
      ));
    }
  });

  return jsonResponse(loadingResponse);
}

/**
 * Handle /sixty task list [filter]
 */
async function handleTaskListCommand(ctx: CommandContext, filter: string): Promise<Response> {
  const loadingResponse = buildLoadingResponse('Loading your tasks...');

  processInBackground(async () => {
    try {
      const response = await handleTaskList(ctx, filter);
      await sendEphemeral(ctx.payload.response_url, response);
    } catch (error) {
      console.error('Error in handleTaskList:', error);
      await sendEphemeral(ctx.payload.response_url, buildErrorResponse(
        'Failed to load tasks. Please try again.'
      ));
    }
  });

  return jsonResponse(loadingResponse);
}

/**
 * Handle /sixty focus
 */
async function handleFocusCommand(ctx: CommandContext): Promise<Response> {
  const loadingResponse = buildLoadingResponse('Starting focus mode...');

  processInBackground(async () => {
    try {
      const response = await handleFocus(ctx);
      await sendEphemeral(ctx.payload.response_url, response);
    } catch (error) {
      console.error('Error in handleFocus:', error);
      await sendEphemeral(ctx.payload.response_url, buildErrorResponse(
        'Failed to start focus mode. Please try again.'
      ));
    }
  });

  return jsonResponse(loadingResponse);
}

// ============================================================================
// Phase 5: Team & Manager Command Wrappers
// ============================================================================

/**
 * Handle /sixty standup
 */
async function handleStandupCommand(ctx: CommandContext): Promise<Response> {
  const loadingResponse = buildLoadingResponse('Generating team standup...');

  processInBackground(async () => {
    try {
      const response = await handleStandup(ctx);
      await sendEphemeral(ctx.payload.response_url, response);
    } catch (error) {
      console.error('Error in handleStandup:', error);
      await sendEphemeral(ctx.payload.response_url, buildErrorResponse(
        'Failed to generate standup. Please try again.'
      ));
    }
  });

  return jsonResponse(loadingResponse);
}

/**
 * Handle /sixty pipeline [filter]
 */
async function handlePipelineCommand(ctx: CommandContext, filter: string): Promise<Response> {
  const loadingResponse = buildLoadingResponse('Loading pipeline...');

  processInBackground(async () => {
    try {
      const response = await handlePipeline(ctx, filter);
      await sendEphemeral(ctx.payload.response_url, response);
    } catch (error) {
      console.error('Error in handlePipeline:', error);
      await sendEphemeral(ctx.payload.response_url, buildErrorResponse(
        'Failed to load pipeline. Please try again.'
      ));
    }
  });

  return jsonResponse(loadingResponse);
}

/**
 * Handle /sixty approvals
 */
async function handleApprovalsCommand(ctx: CommandContext): Promise<Response> {
  const loadingResponse = buildLoadingResponse('Loading pending approvals...');

  processInBackground(async () => {
    try {
      const response = await handleApprovals(ctx);
      await sendEphemeral(ctx.payload.response_url, response);
    } catch (error) {
      console.error('Error in handleApprovals:', error);
      await sendEphemeral(ctx.payload.response_url, buildErrorResponse(
        'Failed to load approvals. Please try again.'
      ));
    }
  });

  return jsonResponse(loadingResponse);
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Create JSON response for Slack
 */
function jsonResponse(body: { blocks: unknown[]; text: string }): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Process work in background (fire and forget)
 * Important: Slack requires response within 3 seconds
 */
function processInBackground(fn: () => Promise<void>): void {
  // Use setTimeout to not block the response
  setTimeout(() => {
    fn().catch(err => console.error('Background processing error:', err));
  }, 0);
}

/**
 * Get command suggestion based on input (fuzzy match)
 */
function getSuggestion(input: string): string {
  const commands = [
    { cmd: 'today', desc: 'Your day at a glance' },
    { cmd: 'contact', desc: 'Look up a contact' },
    { cmd: 'deal', desc: 'Deal snapshot' },
    { cmd: 'meeting-brief', desc: 'Meeting prep' },
    { cmd: 'follow-up', desc: 'Draft a follow-up' },
    { cmd: 'risks', desc: 'At-risk deals' },
    { cmd: 'debrief', desc: 'Post-meeting summary' },
    { cmd: 'task add', desc: 'Create a new task' },
    { cmd: 'task list', desc: 'View your tasks' },
    { cmd: 'focus', desc: 'Focus mode with top tasks' },
    // Phase 5: Team & Manager Commands
    { cmd: 'standup', desc: 'Team standup digest' },
    { cmd: 'pipeline', desc: 'Pipeline summary' },
    { cmd: 'approvals', desc: 'Pending AI approvals' },
  ];

  // Simple fuzzy match - find commands that start with same letter or contain the input
  const suggestions = commands.filter(c =>
    c.cmd.startsWith(input[0]) ||
    c.cmd.includes(input) ||
    input.includes(c.cmd.slice(0, 3))
  );

  if (suggestions.length > 0) {
    return suggestions.map(s => `• \`/sixty ${s.cmd}\` - ${s.desc}`).join('\n');
  }

  // Default: show all commands
  return commands.map(c => `• \`/sixty ${c.cmd}\` - ${c.desc}`).join('\n');
}
