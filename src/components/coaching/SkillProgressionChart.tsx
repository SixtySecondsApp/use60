import React from 'react';

interface SkillProgressionChartProps {
  userId: string;
  orgId: string;
}

export function SkillProgressionChart({ userId, orgId }: SkillProgressionChartProps) {
  return (
    <div className="text-sm text-gray-500 py-8 text-center">
      Skill progression chart coming soon
    </div>
  );
}
