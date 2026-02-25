// supabase/functions/_shared/slackReactions.ts
// Reaction state machine for Slack message processing indicators

/**
 * Manages emoji reactions on a Slack message to indicate processing state.
 *
 * Flow: pending (hourglass) → done (checkmark) or error (x)
 *
 * All methods are fire-and-forget — reaction failures never break the main flow.
 */
export function reactionStateMachine(botToken: string, channel: string, timestamp: string) {
  const addReaction = async (name: string): Promise<void> => {
    try {
      await fetch('https://slack.com/api/reactions.add', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channel, timestamp, name }),
      });
    } catch {
      // Non-critical — reaction failures should never break the main flow
    }
  };

  const removeReaction = async (name: string): Promise<void> => {
    try {
      await fetch('https://slack.com/api/reactions.remove', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channel, timestamp, name }),
      });
    } catch {
      // Non-critical
    }
  };

  return {
    /** Add hourglass reaction to indicate work has started */
    async pending(): Promise<void> {
      await addReaction('hourglass_flowing_sand');
    },

    /** Replace hourglass with checkmark to indicate success */
    async done(): Promise<void> {
      await removeReaction('hourglass_flowing_sand');
      await addReaction('white_check_mark');
    },

    /** Replace hourglass with X to indicate failure */
    async error(): Promise<void> {
      await removeReaction('hourglass_flowing_sand');
      await addReaction('x');
    },
  };
}
