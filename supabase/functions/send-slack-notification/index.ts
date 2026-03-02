import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { captureException } from '../_shared/sentryEdge.ts';
import { verifyCronSecret } from '../_shared/edgeAuth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SlackMessage {
  text?: string;
  blocks?: any[];
  attachments?: any[];
  channel?: string;
  username?: string;
  icon_emoji?: string;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Auth: require cron secret
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!verifyCronSecret(req, cronSecret)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { 
      webhookUrl,
      messageType,
      customMessage,
      channel,
      includeDealLink,
      dealData,
      taskData,
      triggerData 
    } = await req.json();

    if (!webhookUrl) {
      throw new Error('Webhook URL is required');
    }

    let message: SlackMessage = {
      username: 'Sixty Sales Bot',
      icon_emoji: ':chart_with_upwards_trend:',
    };

    // Override channel if provided
    if (channel) {
      message.channel = channel;
    }

    // Build message based on type
    switch (messageType) {
      case 'deal_notification':
        if (dealData) {
          const baseUrl = Deno.env.get('PUBLIC_URL') || 'https://app.sixty.app';
          const dealUrl = `${baseUrl}/crm/pipeline?deal=${dealData.id}`;
          
          message.text = `🎉 Deal Update: ${dealData.name || 'Unnamed Deal'}`;
          message.attachments = [{
            color: '#36a64f',
            fields: [
              {
                title: 'Company',
                value: dealData.company || 'N/A',
                short: true,
              },
              {
                title: 'Value',
                value: dealData.value ? `£${dealData.value.toLocaleString()}` : 'N/A',
                short: true,
              },
              {
                title: 'Stage',
                value: dealData.stage_name || 'Unknown',
                short: true,
              },
              {
                title: 'Owner',
                value: dealData.owner_name || 'Unassigned',
                short: true,
              },
            ],
            footer: 'Sixty Sales Workflow',
            ts: Math.floor(Date.now() / 1000),
          }];

          if (includeDealLink) {
            message.attachments[0].actions = [{
              type: 'button',
              text: 'View Deal',
              url: dealUrl,
              style: 'primary',
            }];
          }
        }
        break;

      case 'task_created':
        if (taskData) {
          message.text = `📋 New Task Created: ${taskData.title || 'Unnamed Task'}`;
          message.attachments = [{
            color: '#439FE0',
            fields: [
              {
                title: 'Description',
                value: taskData.description || 'No description',
                short: false,
              },
              {
                title: 'Priority',
                value: taskData.priority || 'Medium',
                short: true,
              },
              {
                title: 'Due Date',
                value: taskData.due_date ? new Date(taskData.due_date).toLocaleDateString() : 'No due date',
                short: true,
              },
            ],
            footer: 'Sixty Sales Workflow',
            ts: Math.floor(Date.now() / 1000),
          }];
        }
        break;

      case 'custom':
        if (customMessage) {
          // Replace template variables if deal data is provided
          let processedMessage = customMessage;
          if (dealData) {
            processedMessage = processedMessage
              .replace(/\{\{deal_name\}\}/g, dealData.name || 'Unnamed Deal')
              .replace(/\{\{company\}\}/g, dealData.company || 'N/A')
              .replace(/\{\{value\}\}/g, dealData.value ? `£${dealData.value.toLocaleString()}` : 'N/A')
              .replace(/\{\{stage\}\}/g, dealData.stage_name || 'Unknown')
              .replace(/\{\{owner\}\}/g, dealData.owner_name || 'Unassigned');
          }
          message.text = processedMessage;
        }
        break;

      case 'simple':
      default:
        message.text = customMessage || `🔔 Workflow notification from Sixty Sales`;
        if (triggerData) {
          message.attachments = [{
            color: '#36a64f',
            text: `Triggered by: ${triggerData.type || 'Manual'}`,
            footer: 'Sixty Sales Workflow',
            ts: Math.floor(Date.now() / 1000),
          }];
        }
        break;
    }

    // Send to Slack
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Slack webhook failed: ${response.status}`);
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Slack notification sent successfully' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    await captureException(error, {
      tags: {
        function: 'send-slack-notification',
        integration: 'slack',
      },
    });
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});