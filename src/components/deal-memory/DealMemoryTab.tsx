import { Brain } from 'lucide-react';

interface DealMemoryTabProps {
  dealId: string;
}

export function DealMemoryTab({ dealId }: DealMemoryTabProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
      <Brain className="h-8 w-8" />
      <p className="text-sm">Deal memory will appear here as 60 learns about this deal.</p>
    </div>
  );
}
