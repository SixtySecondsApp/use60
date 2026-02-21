import { useState } from 'react';
import { supabase } from '@/lib/supabase/clientV2';

export interface MeetingSearchResult {
  meeting_id: string;
  meeting_title: string;
  meeting_date: string;
  snippet: string;
  speaker?: string;
  timestamp?: string;
  relevance_score?: number;
}

export function useMeetingSearch() {
  const [results, setResults] = useState<MeetingSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async (query: string, filters?: { contact_id?: string; deal_id?: string }) => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('meeting-intelligence-search', {
        body: {
          query: query.trim(),
          contact_id: filters?.contact_id,
          deal_id: filters?.deal_id,
          limit: 10,
        },
      });

      if (fnError) throw fnError;

      // Normalize the response - the edge function may return different formats
      const searchResults = (data?.results || data?.matches || data || []).map((r: any) => ({
        meeting_id: r.meeting_id || r.id,
        meeting_title: r.meeting_title || r.title || 'Untitled Meeting',
        meeting_date: r.meeting_date || r.start_time || r.date || '',
        snippet: r.snippet || r.text || r.content || '',
        speaker: r.speaker || r.speaker_name,
        timestamp: r.timestamp || r.time,
        relevance_score: r.relevance_score || r.score,
      }));

      setResults(searchResults);
    } catch (err: any) {
      setError(err.message || 'Search failed');
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const clearResults = () => {
    setResults([]);
    setError(null);
  };

  return { results, isSearching, error, search, clearResults };
}
