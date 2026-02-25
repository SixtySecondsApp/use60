// Reaction state machine — adds/removes emoji reactions on Slack messages
// to indicate processing state (hourglass → check/x)

interface ReactionStateMachine {
  pending(): Promise<void>;
  done(): Promise<void>;
  error(): Promise<void>;
}

async function addReaction(token: string, channel: string, timestamp: string, name: string): Promise<void> {
  try {
    await fetch('https://slack.com/api/reactions.add', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, timestamp, name }),
    });
  } catch { /* best-effort */ }
}

async function removeReaction(token: string, channel: string, timestamp: string, name: string): Promise<void> {
  try {
    await fetch('https://slack.com/api/reactions.remove', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, timestamp, name }),
    });
  } catch { /* best-effort */ }
}

export function reactionStateMachine(token: string, channel: string, timestamp: string): ReactionStateMachine {
  return {
    async pending() {
      await addReaction(token, channel, timestamp, 'hourglass_flowing_sand');
    },
    async done() {
      await removeReaction(token, channel, timestamp, 'hourglass_flowing_sand');
      await addReaction(token, channel, timestamp, 'white_check_mark');
    },
    async error() {
      await removeReaction(token, channel, timestamp, 'hourglass_flowing_sand');
      await addReaction(token, channel, timestamp, 'x');
    },
  };
}
