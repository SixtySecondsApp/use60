import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase/clientV2';
import { useUser } from '@/lib/hooks/useUser';
import { format, subDays, startOfDay } from 'date-fns';

interface SentimentTrendData {
  date: string;
  sentiment: number;
  meetingCount: number;
}

export function SentimentTrend() {
  const { user } = useUser();
  const [trendData, setTrendData] = useState<SentimentTrendData[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7' | '30' | '90'>('30');

  useEffect(() => {
    if (user) {
      loadTrendData();
    }
  }, [user, timeRange]);

  const loadTrendData = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const days = parseInt(timeRange);
      const startDate = startOfDay(subDays(new Date(), days));

      const { data, error } = await supabase
        .from('meetings')
        .select('sentiment_score, meeting_start')
        .eq('owner_user_id', user.id)
        .not('sentiment_score', 'is', null)
        .gte('meeting_start', startDate.toISOString())
        .order('meeting_start', { ascending: true });

      if (error) throw error;

      // Group by date
      const grouped = (data || []).reduce((acc: any, meeting: any) => {
        const date = format(new Date(meeting.meeting_start), 'yyyy-MM-dd');
        if (!acc[date]) {
          acc[date] = {
            date,
            sentiments: [],
          };
        }
        acc[date].sentiments.push(meeting.sentiment_score);
        return acc;
      }, {});

      const result = Object.values(grouped).map((item: any) => ({
        date: format(new Date(item.date), 'MMM d'),
        sentiment: item.sentiments.reduce((a: number, b: number) => a + b, 0) / item.sentiments.length,
        meetingCount: item.sentiments.length,
      }));

      setTrendData(result);
    } catch (error) {
      console.error('Error loading sentiment trend:', error);
    } finally {
      setLoading(false);
    }
  };

  const avgSentiment = trendData.length > 0
    ? trendData.reduce((sum, d) => sum + d.sentiment, 0) / trendData.length
    : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Sentiment Trend</CardTitle>
            <CardDescription>
              Average sentiment over time
            </CardDescription>
          </div>
          <Select value={timeRange} onValueChange={(value: any) => setTimeRange(value)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
          </div>
        ) : trendData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-gray-500 dark:text-gray-400">
            No sentiment data available
          </div>
        ) : (
          <div className="space-y-4">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="sentimentGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                  <XAxis
                    dataKey="date"
                    className="text-xs text-gray-600 dark:text-gray-400"
                  />
                  <YAxis
                    domain={[-1, 1]}
                    className="text-xs text-gray-600 dark:text-gray-400"
                    label={{ value: 'Sentiment', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number) => value.toFixed(2)}
                  />
                  <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="3 3" />
                  <Area
                    type="monotone"
                    dataKey="sentiment"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#sentimentGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Average Sentiment</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {avgSentiment.toFixed(2)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total Meetings</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {trendData.reduce((sum, d) => sum + d.meetingCount, 0)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

