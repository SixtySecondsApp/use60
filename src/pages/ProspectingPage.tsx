import { Helmet } from 'react-helmet-async';
import { ProspectingTab } from '@/components/prospecting/ProspectingTab';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { useAuth } from '@/lib/contexts/AuthContext';

// Simple skeleton for loading
function PageSkeleton() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="animate-pulse text-[#94A3B8]">Loading...</div>
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
