/**
 * useHeyGenVideos — Hook for querying HeyGen video status for Ops table rows.
 * Polls for in-progress videos and returns current status per row.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgStore } from '@/lib/stores/orgStore';
import type { HeyGenVideo, VideoStatus } from '@/lib/types/heygen';

interface VideosByRow {
  [rowId: string]: {
    status: VideoStatus;
    videoUrl: string | null;
    thumbnailUrl: string | null;
    durationSeconds: number | null;
    errorMessage: string | null;
  };
}

export function useHeyGenVideos(tableId: string | null) {
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const [videos, setVideos] = useState<VideosByRow>({});
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchVideos = useCallback(async () => {
    if (!activeOrgId || !tableId) return;

    try {
      const { data, error } = await supabase
        .from('heygen_videos')
        .select('id, dynamic_table_row_id, status, video_url, thumbnail_url, duration_seconds, error_message')
        .eq('org_id', activeOrgId)
        .not('dynamic_table_row_id', 'is', null);

      if (error) throw error;

      const byRow: VideosByRow = {};
      for (const v of data ?? []) {
        if (!v.dynamic_table_row_id) continue;
        // Keep the most recent video per row (they're ordered by created_at desc by default)
        if (!byRow[v.dynamic_table_row_id] || v.status === 'completed') {
          byRow[v.dynamic_table_row_id] = {
            status: v.status as VideoStatus,
            videoUrl: v.video_url,
            thumbnailUrl: v.thumbnail_url,
            durationSeconds: v.duration_seconds,
            errorMessage: v.error_message,
          };
        }
      }
      setVideos(byRow);
    } catch (err) {
      console.error('[useHeyGenVideos] fetch error:', err);
    }
  }, [activeOrgId, tableId]);

  // Initial fetch
  useEffect(() => {
    setLoading(true);
    fetchVideos().finally(() => setLoading(false));
  }, [fetchVideos]);

  // Poll for in-progress videos
  useEffect(() => {
    const hasProcessing = Object.values(videos).some(
      (v) => v.status === 'pending' || v.status === 'processing'
    );

    if (hasProcessing) {
      pollRef.current = setInterval(fetchVideos, 10000); // Poll every 10s
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [videos, fetchVideos]);

  return {
    videos,
    loading,
    refresh: fetchVideos,
  };
}
