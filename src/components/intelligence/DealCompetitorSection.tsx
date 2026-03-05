import { Swords } from 'lucide-react';

interface DealCompetitorSectionProps {
  dealId: string;
}

export function DealCompetitorSection({ dealId }: DealCompetitorSectionProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
      <Swords className="h-8 w-8" />
      <p className="text-sm">Competitor intelligence will appear here when detected in meetings.</p>
    </div>
  );
}
