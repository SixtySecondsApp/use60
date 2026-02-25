// supabase/functions/_shared/slackBotStatus.ts
// Bot status presence — shows what the agent is actively working on

/**
 * Set the bot's Slack status to indicate active work.
 * Status auto-expires after the specified duration as a safety net.
 *
 * Only use for long-running operations (meeting prep, research, email drafts).
 * Do not set status for quick lookups.
 */
export async function setBotStatus(
  botToken: string,
  statusText: string,
  expirationMinutes: number = 5
): Promise<void> {
  try {
    const statusExpiration = Math.floor(Date.now() / 1000) + (expirationMinutes * 60);

    await fetch('https://slack.com/api/users.profile.set', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        profile: {
          status_text: statusText.slice(0, 100), // Slack limit
          status_emoji: '',
          status_expiration: statusExpiration,
        },
      }),
    });
  } catch {
    // Non-critical — status is ambient, not functional
  }
}

/**
 * Clear the bot's Slack status after work is complete.
 */
export async function clearBotStatus(botToken: string): Promise<void> {
  try {
    await fetch('https://slack.com/api/users.profile.set', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        profile: {
          status_text: '',
          status_emoji: '',
          status_expiration: 0,
        },
      }),
    });
  } catch {
    // Non-critical
  }
}
