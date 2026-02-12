import { useState } from 'react';
import { Search, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';

// Placeholder examples that rotate
const PLACEHOLDER_EXAMPLES = [
  "Find 20 marketing agencies in Bristol",
  "Get 50 tech companies in San Francisco",
  "Find CEOs at SaaS companies in London",
  "Search for HR managers on LinkedIn in New York"
];

// Type definition for parsed query result
// This should match the edge function output structure
export interface QueryParseResult {
  entity_type: 'companies' | 'people';
  count: number;
  location?: string;
  keywords?: string[];
  filters?: Record<string, any>;
  source_preference?: 'linkedin' | 'maps' | 'serp' | 'apollo' | 'ai_ark';
  confidence?: number;
}

interface NaturalLanguageQueryBarProps {
  onQuerySubmit: (parsedQuery: QueryParseResult) => void;
  isLoading?: boolean;
  disabled?: boolean;
}

export function NaturalLanguageQueryBar({
  onQuerySubmit,
  isLoading = false,
  disabled = false
}: NaturalLanguageQueryBarProps) {
  const [query, setQuery] = useState('');
  const [parsing, setParsing] = useState(false);
  const [placeholderIndex] = useState(Math.floor(Math.random() * PLACEHOLDER_EXAMPLES.length));
  const [suggestedQueries, setSuggestedQueries] = useState<string[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!query.trim()) {
      toast.error('Please enter a search query');
      return;
    }

    setParsing(true);
    setSuggestedQueries([]);

    try {
      // Set 30-second timeout for parser
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 30000)
      );

      const parsePromise = supabase.functions.invoke('parse-nl-query', {
        body: { query }
      });

      const { data, error } = await Promise.race([parsePromise, timeoutPromise]) as any;

      if (error) throw error;

      if (!data) {
        throw new Error('No data returned from parser');
      }

      // Success - clear suggestions
      setSuggestedQueries([]);
      onQuerySubmit(data);
    } catch (error: any) {
      // Enhanced error handling with specific messages
      if (error.message === 'timeout') {
        toast.error('Parser timed out. Try a simpler query.');
        setSuggestedQueries([
          'Find 20 marketing agencies in Bristol',
          'Get 50 tech companies in San Francisco'
        ]);
      } else if (error.message?.includes('confidence') || error.message?.includes('unclear')) {
        toast.error('Query unclear. Try being more specific (e.g., "20 marketing agencies in Bristol")');
        setSuggestedQueries([
          'Find 20 marketing agencies in Bristol',
          'Get 50 tech companies in San Francisco',
          'Search for HR managers in London'
        ]);
      } else if (error.message?.includes('rate limit') || error.message?.includes('429')) {
        toast.error('Too many requests. Please wait a moment and try again.');
      } else {
        toast.error('Failed to parse query. Try rephrasing or use simpler terms.');
        setSuggestedQueries([
          'Find 20 marketing agencies in Bristol',
          'Get 50 tech companies in San Francisco',
          'Search for HR managers in London'
        ]);
      }

      // Log error for debugging
      console.error('[NL Query Error - Parser]', {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
        query
      });
    } finally {
      setParsing(false);
    }
  };

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={PLACEHOLDER_EXAMPLES[placeholderIndex]}
          disabled={disabled || parsing || isLoading}
          className="flex-1"
        />
        <Button
          type="submit"
          disabled={!query.trim() || disabled || parsing || isLoading}
        >
          {parsing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Parsing...
            </>
          ) : (
            <>
              <Search className="mr-2 h-4 w-4" />
              Search
            </>
          )}
        </Button>
      </form>

      {/* Suggested Queries */}
      {suggestedQueries.length > 0 && (
        <div className="space-y-2 p-3 border border-amber-500/30 rounded-lg bg-amber-50/50">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-900">
            <AlertCircle className="h-4 w-4" />
            Try these examples:
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestedQueries.map((suggestion, i) => (
              <Button
                key={i}
                variant="outline"
                size="sm"
                onClick={() => {
                  setQuery(suggestion);
                  setSuggestedQueries([]);
                }}
                className="text-xs"
              >
                {suggestion}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
