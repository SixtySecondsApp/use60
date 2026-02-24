import { useQuery } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import { getUserJoinRequests } from '@/lib/services/joinRequestService';
import { useAuth } from '@/lib/contexts/AuthContext';

export function PendingJoinRequestBanner() {
  const { user } = useAuth();

  const { data: joinRequests } = useQuery({
    queryKey: ['user-join-requests', user?.id],
    queryFn: () => {
      if (!user?.id) return [];
      return getUserJoinRequests(user.id);
    },
    enabled: !!user?.id,
  });

  const pendingRequest = joinRequests?.find((r) => r.status === 'pending');

  if (!pendingRequest) return null;

  return (
    <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-xl p-4 mb-6">
      <div className="flex items-start gap-3">
        <Clock className="w-5 h-5 text-yellow-400 mt-0.5" />
        <div className="flex-1">
          <p className="text-yellow-400 font-medium mb-1">Join Request Pending</p>
          <p className="text-sm text-yellow-400/80">
            Your request to join <strong>{pendingRequest.organizations?.name}</strong> is
            awaiting admin approval. You can continue using the platform with limited access
            until approved.
          </p>
        </div>
      </div>
    </div>
  );
}
