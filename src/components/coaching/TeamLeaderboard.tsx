import React from 'react';

interface TeamLeaderboardProps {
  onRepSelect: (userId: string) => void;
  selectedUserId?: string;
}

export function TeamLeaderboard({ onRepSelect, selectedUserId }: TeamLeaderboardProps) {
  return (
    <div className="text-sm text-gray-500 py-8 text-center">
      Leaderboard coming soon
    </div>
  );
}
