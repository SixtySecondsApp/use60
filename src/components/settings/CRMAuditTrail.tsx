import { History } from 'lucide-react';

export function CRMAuditTrail() {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
      <History className="h-8 w-8 opacity-30" />
      <p className="text-sm">CRM audit trail coming soon.</p>
    </div>
  );
}
