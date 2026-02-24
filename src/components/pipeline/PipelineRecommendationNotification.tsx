import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { Bell, CheckCircle, XCircle, TrendingUp, AlertCircle } from 'lucide-react';
import { MeetingSummaryDisplay } from '@/components/shared/MeetingSummaryDisplay';

interface PipelineRecommendation {
  id: string;
  meeting_id: string;
  deal_id: string | null;
  company_id: string | null;
  current_stage: string;
  recommended_stage: string;
  confidence_score: number;
  recommendation_reason: string;
  meeting_sentiment_score: number;
  meeting_summary: string | null;
  key_signals: string[];
  status: 'pending' | 'approved' | 'rejected' | 'auto_applied' | 'expired';
  created_at: string;
}

interface Company {
  id: string;
  name: string;
}

interface Deal {
  id: string;
  title: string;
  stage: string;
}

export const PipelineRecommendationNotification: React.FC = () => {
  const [recommendations, setRecommendations] = useState<PipelineRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Fetch pending recommendations and subscribe to user-specific updates
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setupSubscription = async () => {
      // Get current user for filtering
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;

      // Fetch initial data
      await fetchRecommendations();

      // Only subscribe if we have a user ID
      if (!userId) return;

      // Subscribe to new recommendations - FILTER BY USER to avoid receiving all users' events
      channel = supabase
        .channel(`pipeline_recommendations_${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'pipeline_stage_recommendations',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            // Only refetch if the new record is pending
            if (payload.new && (payload.new as any).status === 'pending') {
              fetchRecommendations();
            }
          }
        )
        .subscribe();
    };

    setupSubscription();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  const fetchRecommendations = async () => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const { data, error } = await supabase
        .from('pipeline_stage_recommendations')
        .select('*')
        .eq('user_id', user.user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setRecommendations(data || []);
    } catch (error) {
      console.error('Error fetching recommendations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (recommendationId: string) => {
    setProcessingId(recommendationId);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const { data, error } = await supabase.rpc('approve_pipeline_recommendation', {
        p_recommendation_id: recommendationId,
        p_reviewed_by: user.user.id,
        p_notes: 'Approved via UI',
      });

      if (error) throw error;

      // Remove from list
      setRecommendations((prev) => prev.filter((r) => r.id !== recommendationId));

      // Show success message (you can use a toast library here)
    } catch (error) {
      alert('Failed to approve recommendation. Please try again.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (recommendationId: string) => {
    setProcessingId(recommendationId);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const { data, error } = await supabase.rpc('reject_pipeline_recommendation', {
        p_recommendation_id: recommendationId,
        p_reviewed_by: user.user.id,
        p_notes: 'Rejected via UI',
      });

      if (error) throw error;

      // Remove from list
      setRecommendations((prev) => prev.filter((r) => r.id !== recommendationId));
    } catch (error) {
      alert('Failed to reject recommendation. Please try again.');
    } finally {
      setProcessingId(null);
    }
  };

  const getSentimentColor = (score: number) => {
    if (score >= 0.5) return 'text-green-500';
    if (score >= 0.2) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return 'bg-green-100 text-green-800 border-green-300';
    if (score >= 0.6) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    return 'bg-orange-100 text-orange-800 border-orange-300';
  };

  if (loading) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg">
        <p className="text-sm text-gray-500">Loading recommendations...</p>
      </div>
    );
  }

  if (recommendations.length === 0) {
    return null; // Don't show anything if no recommendations
  }

  return (
    <div className="space-y-3 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Bell className="w-5 h-5 text-blue-500" />
        <h3 className="text-lg font-semibold text-gray-900">
          Pipeline Recommendations ({recommendations.length})
        </h3>
      </div>

      {recommendations.map((rec) => (
        <div
          key={rec.id}
          className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow"
        >
          {/* Header */}
          <div
            className="p-4 cursor-pointer"
            onClick={() => setExpandedId(expandedId === rec.id ? null : rec.id)}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-5 h-5 text-blue-500" />
                  <h4 className="font-semibold text-gray-900">
                    Move from{' '}
                    <span className="text-orange-600">{rec.current_stage}</span> →{' '}
                    <span className="text-green-600">{rec.recommended_stage}</span>
                  </h4>
                </div>

                <p className="text-sm text-gray-600 mb-2">{rec.recommendation_reason}</p>

                <div className="flex items-center gap-4 text-sm">
                  {/* Sentiment Score */}
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500">Sentiment:</span>
                    <span className={`font-semibold ${getSentimentColor(rec.meeting_sentiment_score)}`}>
                      {(rec.meeting_sentiment_score * 100).toFixed(0)}%
                    </span>
                  </div>

                  {/* Confidence Score */}
                  <div
                    className={`px-2 py-1 rounded border ${getConfidenceColor(rec.confidence_score)}`}
                  >
                    <span className="font-medium">
                      {(rec.confidence_score * 100).toFixed(0)}% confident
                    </span>
                  </div>

                  {/* Time */}
                  <span className="text-gray-400">
                    {new Date(rec.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleApprove(rec.id);
                  }}
                  disabled={processingId === rec.id}
                  className="flex items-center gap-1 px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors"
                >
                  <CheckCircle className="w-4 h-4" />
                  Approve
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReject(rec.id);
                  }}
                  disabled={processingId === rec.id}
                  className="flex items-center gap-1 px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                  Reject
                </button>
              </div>
            </div>
          </div>

          {/* Expanded Details */}
          {expandedId === rec.id && (
            <div className="px-4 pb-4 pt-2 border-t border-gray-100">
              {/* Meeting Summary */}
              {rec.meeting_summary && (
                <div className="mb-3">
                  <h5 className="text-sm font-semibold text-gray-700 mb-1">Meeting Summary</h5>
                  <div className="text-sm text-gray-600">
                    <MeetingSummaryDisplay summary={rec.meeting_summary} />
                  </div>
                </div>
              )}

              {/* Key Signals */}
              {rec.key_signals && rec.key_signals.length > 0 && (
                <div>
                  <h5 className="text-sm font-semibold text-gray-700 mb-2">Key Signals</h5>
                  <div className="flex flex-wrap gap-2">
                    {rec.key_signals.map((signal, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-200"
                      >
                        {signal.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default PipelineRecommendationNotification;
