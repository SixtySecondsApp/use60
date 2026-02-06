/**
 * Edge Function: Send Organization Notifications to Slack
 * Story: ORG-NOTIF-012
 * Description: Sends org-wide notifications to configured Slack webhooks
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Verify user is authenticated
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      throw new Error('Unauthorized')
    }

    // Get request payload
    const { notification_id, org_id } = await req.json()

    if (!notification_id || !org_id) {
      throw new Error('notification_id and org_id are required')
    }

    // Get notification details
    const { data: notification, error: notifError } = await supabaseClient
      .from('notifications')
      .select('id, title, message, type, category, action_url, metadata')
      .eq('id', notification_id)
      .eq('org_id', org_id)
      .single()

    if (notifError || !notification) {
      throw new Error('Notification not found')
    }

    // Get organization details and Slack webhook
    const { data: org, error: orgError } = await supabaseClient
      .from('organizations')
      .select('id, name, notification_settings')
      .eq('id', org_id)
      .single()

    if (orgError || !org) {
      throw new Error('Organization not found')
    }

    // Check if Slack notifications are enabled
    const slackSettings = org.notification_settings?.slack
    if (!slackSettings?.enabled || !slackSettings?.webhook_url) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Slack notifications not configured'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    // Map notification type to Slack color
    const colorMap: Record<string, string> = {
      info: '#439FE0',
      success: '#36a64f',
      warning: '#ff9900',
      error: '#d9534f',
    }

    // Map category to emoji
    const emojiMap: Record<string, string> = {
      team: ':busts_in_silhouette:',
      deal: ':moneybag:',
      system: ':gear:',
      digest: ':newspaper:',
    }

    // Build Slack message
    const slackMessage = {
      username: 'Sixty Sales Bot',
      icon_emoji: emojiMap[notification.category] || ':bell:',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: notification.title,
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: notification.message,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `📊 *${org.name}* • ${new Date().toLocaleString()}`,
            },
          ],
        },
      ],
    }

    // Add action button if URL provided
    if (notification.action_url) {
      slackMessage.blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View Details',
              emoji: true,
            },
            url: `https://app.use60.com${notification.action_url}`,
            style: notification.type === 'error' ? 'danger' : 'primary',
          },
        ],
      })
    }

    // Add metadata as context if present
    if (notification.metadata && Object.keys(notification.metadata).length > 0) {
      const metadataFields = Object.entries(notification.metadata)
        .slice(0, 5) // Limit to 5 fields
        .map(([key, value]) => `*${key}:* ${JSON.stringify(value)}`)
        .join(' • ')

      slackMessage.blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: metadataFields,
          },
        ],
      })
    }

    // Send to Slack
    const slackResponse = await fetch(slackSettings.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(slackMessage),
    })

    if (!slackResponse.ok) {
      const errorText = await slackResponse.text()
      throw new Error(`Slack webhook failed: ${slackResponse.status} - ${errorText}`)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Notification sent to Slack successfully'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error sending org notification to Slack:', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
