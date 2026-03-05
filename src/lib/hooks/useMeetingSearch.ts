import { useState } from 'react';
import { askMeeting } from '@/lib/services/meetingAnalyticsService';

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

  const search = async (query: string, _filters?: { contact_id?: string; deal_id?: string }) => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      // Call meeting-analytics /api/search/ask (Railway pgvector + GPT-4o-mini)
      const askResponse = await askMeeting({
        question: query.trim(),
        maxMeetings: 10,
      });

      // Map meeting-analytics sources to MeetingSearchResult format
      const searchResults: MeetingSearchResult[] = (askResponse.sources || []).map((s) => ({
        meeting_id: s.transcriptId,
        meeting_title: s.transcriptTitle || 'Untitled Meeting',
        meeting_date: (s as any).date || '',
        snippet: s.text || '',
        speaker: undefined,
        timestamp: undefined,
        relevance_score: s.similarity,
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
