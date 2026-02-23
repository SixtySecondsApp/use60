import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase/clientV2';
import { useUser } from '@/lib/hooks/useUser';
import { TrendingUp, TrendingDown, Minus, Smile, Frown, Meh } from 'lucide-react';
import { format } from 'date-fns';

interface SentimentData {
  contactId?: string;
  contactName?: string;
  companyId?: string;
  companyName?: string;
  avgSentiment: number;
  meetingCount: number;
  trend: 'improving' | 'stable' | 'declining';
  lastMeetingDate: string;
}

export function SentimentDashboard() {
  const { user } = useUser();
  const [sentimentData, setSentimentData] = useState<SentimentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'contact' | 'company'>('contact');

  useEffect(() => {
    if (user) {
      loadSentimentData();
    }
  }, [user, viewMode]);

  const loadSentimentData = async () => {
    if (!user) return;

    try {
      setLoading(true);
      
      if (viewMode === 'contact') {
        // Load contact-level sentiment
        const { data, error } = await supabase
          .from('meetings')
          .select(`
            contact_id,
            contacts!inner(name),
            sentiment_score,
            meeting_start
          `)
          .eq('owner_user_id', user.id)
          .not('sentiment_score', 'is', null)
          .order('meeting_start', { ascending: false });

        if (error) throw error;

        // Aggregate by contact
        const aggregated = (data || []).reduce((acc: any, meeting: any) => {
          const contactId = meeting.contact_id;
          if (!contactId) return acc;

          if (!acc[contactId]) {
            acc[contactId] = {
              contactId,
              contactName: meeting.contacts?.name || 'Unknown',
              sentiments: [],
              dates: [],
            };
          }

          acc[contactId].sentiments.push(meeting.sentiment_score);
          acc[contactId].dates.push(meeting.meeting_start);

          return acc;
        }, {});

        const result = Object.values(aggregated).map((item: any) => {
          const avgSentiment = item.sentiments.reduce((a: number, b: number) => a + b, 0) / item.sentiments.length;
          const sortedDates = item.dates.sort();
          const midpoint = Math.floor(item.sentiments.length / 2);
          const firstHalf = item.sentiments.slice(0, midpoint);
          const secondHalf = item.sentiments.slice(midpoint);

          const firstHalfAvg = firstHalf.reduce((a: number, b: number) => a + b, 0) / firstHalf.length;
          const secondHalfAvg = secondHalf.reduce((a: number, b: number) => a + b, 0) / secondHalf.length;

          let trend: 'improving' | 'stable' | 'declining' = 'stable';
          if (secondHalfAvg > firstHalfAvg + 0.1) {
            trend = 'improving';
          } else if (secondHalfAvg < firstHalfAvg - 0.1) {
            trend = 'declining';
          }

          return {
            contactId: item.contactId,
            contactName: item.contactName,
            avgSentiment,
            meetingCount: item.sentiments.length,
            trend,
            lastMeetingDate: sortedDates[sortedDates.length - 1],
          };
        });

        setSentimentData(result.sort((a, b) => a.avgSentiment - b.avgSentiment));
      } else {
        // Load company-level sentiment (similar logic but group by company)
        // For now, placeholder
        setSentimentData([]);
      }
    } catch (error) {
      console.error('Error loading sentiment data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSentimentIcon = (score: number) => {
    if (score > 0.3) return <Smile className="w-5 h-5 text-green-500" />;
    if (score < -0.3) return <Frown className="w-5 h-5 text-red-500" />;
    return <Meh className="w-5 h-5 text-yellow-500" />;
  };

  const getSentimentLabel = (score: number) => {
    if (score > 0.5) return 'Very Positive';
    if (score > 0.2) return 'Positive';
    if (score > -0.2) return 'Neutral';
    if (score > -0.5) return 'Negative';
    return 'Very Negative';
  };

  const getTrendIcon = (trend: string) => {
    if (trend === 'improving') return <TrendingUp className="w-4 h-4 text-green-500" />;
    if (trend === 'declining') return <TrendingDown className="w-4 h-4 text-red-500" />;
    return <Minus className="w-4 h-4 text-gray-500" />;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Sentiment Overview</CardTitle>
            <CardDescription>
              Sentiment analysis by {viewMode === 'contact' ? 'contact' : 'company'}
            </CardDescription>
          </div>
          <Select value={viewMode} onValueChange={(value: any) => setViewMode(value)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="contact">By Contact</SelectItem>
              <SelectItem value="company">By Company</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
          </div>
        ) : sentimentData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-gray-500 dark:text-gray-400">
            No sentiment data available
          </div>
        ) : (
          <div className="space-y-3">
            {sentimentData.map((item) => (
              <div
                key={item.contactId || item.companyId}
                className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getSentimentIcon(item.avgSentiment)}
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {item.contactName || item.companyName}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {item.meetingCount} meeting{item.meetingCount !== 1 ? 's' : ''} • Last: {format(new Date(item.lastMeetingDate), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <Badge variant={item.avgSentiment > 0.2 ? 'default' : item.avgSentiment < -0.2 ? 'destructive' : 'secondary'}>
                        {getSentimentLabel(item.avgSentiment)}
                      </Badge>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {item.avgSentiment.toFixed(2)}
                      </p>
                    </div>
                    {getTrendIcon(item.trend)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

