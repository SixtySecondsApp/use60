import { Helmet } from 'react-helmet-async';
import { ProspectingTab } from '@/components/prospecting/ProspectingTab';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';

// Structural skeleton matching the ProspectingTab table/card layout
function PageSkeleton() {
  return (
    <div className="p-6 space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
      </div>

      {/* Search + filter bar */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 flex-1 max-w-sm rounded-lg" />
        <Skeleton className="h-9 w-32 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>

      {/* Table header row */}
      <div className="grid grid-cols-5 gap-4 border-b border-zinc-200/60 dark:border-zinc-800/60 pb-3">
        {['Name', 'Company', 'Title', 'Status', 'Actions'].map((col) => (
          <Skeleton key={col} className="h-4 w-16" />
        ))}
      </div>

      {/* Table row skeletons */}
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="grid grid-cols-5 gap-4 items-center py-2 border-b border-zinc-100 dark:border-zinc-800/40">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export default function ProspectingPage() {
  const orgId = useActiveOrgId();
  const { userId } = useAuth();

  if (!orgId || !userId) return <PageSkeleton />;

  return (
    <>
      <Helmet><title>Prospecting | 60</title></Helmet>
      <ProspectingTab orgId={orgId} userId={userId} />
    </>
  );
}
