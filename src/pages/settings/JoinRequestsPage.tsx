import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Check, X, Clock, Users } from 'lucide-react';
import { getPendingJoinRequests, approveJoinRequest, rejectJoinRequest } from '@/lib/services/joinRequestService';
import { useOrgStore } from '@/lib/stores/orgStore';
import { useAuth } from '@/lib/contexts/AuthContext';
import { toast } from 'sonner';

export function JoinRequestsPage() {
  const { activeOrgId } = useOrgStore();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  // Fetch join requests
  const { data: joinRequests, isLoading, error } = useQuery({
    queryKey: ['join-requests', activeOrgId, filter],
    queryFn: () => {
      if (!activeOrgId) throw new Error('No active organization');
      return getPendingJoinRequests(activeOrgId);
    },
    enabled: !!activeOrgId,
    retry: 2,
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: (requestId: string) => approveJoinRequest(requestId, user?.id || ''),
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Join request approved');
        queryClient.invalidateQueries({ queryKey: ['join-requests'] });
        queryClient.invalidateQueries({ queryKey: ['organization-members'] });
      } else {
        toast.error(result.error);
      }
    },
    onError: () => {
      toast.error('Failed to approve request');
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: ({ requestId, reason }: { requestId: string; reason?: string }) =>
      rejectJoinRequest(requestId, user?.id || '', reason),
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Join request rejected');
        queryClient.invalidateQueries({ queryKey: ['join-requests'] });
      } else {
        toast.error(result.error);
      }
    },
    onError: () => {
      toast.error('Failed to reject request');
    },
  });

  const pendingCount = joinRequests?.filter((r) => r.status === 'pending').length || 0;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-2">Join Requests</h1>
        <p className="text-gray-400">
          Review and approve requests from users who want to join your organization
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-800">
        <button
          onClick={() => setFilter('pending')}
          className={`px-4 py-2 font-medium transition-colors ${
            filter === 'pending'
              ? 'text-violet-400 border-b-2 border-violet-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Pending {pendingCount > 0 && `(${pendingCount})`}
        </button>
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 font-medium transition-colors ${
            filter === 'all'
              ? 'text-violet-400 border-b-2 border-violet-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          All Requests
        </button>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="mb-4 bg-red-500/20 border border-red-500 rounded-lg p-4">
          <p className="text-red-400 font-medium">Failed to load join requests</p>
          <p className="text-red-300 text-sm mt-1">
            {error instanceof Error ? error.message : 'Unknown error occurred'}
          </p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && (!joinRequests || joinRequests.length === 0) && (
        <div className="text-center py-12 bg-gray-900 rounded-xl border border-gray-800">
          <Users className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">
            {filter === 'pending' ? 'No pending join requests' : 'No join requests yet'}
          </p>
        </div>
      )}

      {/* Join Requests List */}
      {!isLoading && !error && joinRequests && joinRequests.length > 0 && (
        <div className="space-y-3">
          {joinRequests.map((request) => (
            <motion.div
              key={request.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gray-900 rounded-xl border border-gray-800 p-4 hover:border-gray-700 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                {/* User Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center">
                      <span className="text-violet-400 font-semibold text-sm">
                        {request.user_profile?.first_name?.[0] ||
                          request.email[0].toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-white font-medium">
                        {request.user_profile?.first_name &&
                        request.user_profile?.last_name
                          ? `${request.user_profile.first_name} ${request.user_profile.last_name}`
                          : request.email}
                      </p>
                      <p className="text-gray-400 text-sm">{request.email}</p>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="flex items-center gap-2">
                    {request.status === 'pending' && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-yellow-500/20 text-yellow-400 text-xs">
                        <Clock className="w-3 h-3" />
                        Pending
                      </span>
                    )}
                    {request.status === 'approved' && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/20 text-emerald-400 text-xs">
                        <Check className="w-3 h-3" />
                        Approved
                      </span>
                    )}
                    {request.status === 'rejected' && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/20 text-red-400 text-xs">
                        <X className="w-3 h-3" />
                        Rejected
                      </span>
                    )}
                    <span className="text-gray-500 text-xs">
                      {new Date(request.requested_at).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Rejection Reason */}
                  {request.status === 'rejected' && request.rejection_reason && (
                    <p className="mt-2 text-sm text-gray-400">
                      Reason: {request.rejection_reason}
                    </p>
                  )}
                </div>

                {/* Actions (for pending requests only) */}
                {request.status === 'pending' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => approveMutation.mutate(request.id)}
                      disabled={approveMutation.isPending}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <Check className="w-4 h-4" />
                      Approve
                    </button>
                    <button
                      onClick={() => rejectMutation.mutate({ requestId: request.id })}
                      disabled={rejectMutation.isPending}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <X className="w-4 h-4" />
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
