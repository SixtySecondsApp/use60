import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TeamAnalyticsService, type TeamMemberMetrics } from '@/lib/services/teamAnalyticsService';
import { TrendingUp, TrendingDown, Minus, Target, Award, AlertCircle } from 'lucide-react';

interface RepScorecardProps {
  userId: string;
  repUserId: string;
}

export function RepScorecard({ userId, repUserId }: RepScorecardProps) {
  const [comparison, setComparison] = useState<{
    rep: TeamMemberMetrics | null;
    teamAverage: {
      avgSentiment: number;
      avgTalkTime: number;
      avgCoachRating: number;
      totalMeetings: number;
    };
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId && repUserId) {
      loadComparison();
    }
  }, [userId, repUserId]);

  const loadComparison = async () => {
    try {
      setLoading(true);
      const data = await TeamAnalyticsService.getRepComparison(userId, repUserId);
      setComparison(data);
    } catch (error) {
      console.error('Error loading rep comparison:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !comparison || !comparison.rep) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Rep Scorecard</CardTitle>
          <CardDescription>Personal metrics vs team average</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { rep, teamAverage } = comparison;

  const getComparisonIcon = (value: number, average: number) => {
    const diff = value - average;
    if (Math.abs(diff) < 0.01) return <Minus className="w-4 h-4 text-gray-500" />;
    if (diff > 0) return <TrendingUp className="w-4 h-4 text-emerald-500" />;
    return <TrendingDown className="w-4 h-4 text-red-500" />;
  };

  const getComparisonColor = (value: number, average: number, higherIsBetter: boolean = true) => {
    const diff = value - average;
    if (Math.abs(diff) < 0.01) return 'text-gray-600 dark:text-gray-400';
    const isBetter = higherIsBetter ? diff > 0 : diff < 0;
    return isBetter ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="w-5 h-5 text-emerald-500" />
          {rep.full_name || rep.email}
        </CardTitle>
        <CardDescription>
          Performance metrics compared to team average
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Sentiment Comparison */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Average Sentiment</span>
            <div className="flex items-center gap-2">
              {getComparisonIcon(rep.avg_sentiment || 0, teamAverage.avgSentiment)}
              <span className={`text-sm font-semibold ${getComparisonColor(rep.avg_sentiment || 0, teamAverage.avgSentiment)}`}>
                {rep.avg_sentiment !== null ? (rep.avg_sentiment > 0 ? '+' : '') + rep.avg_sentiment.toFixed(2) : 'N/A'}
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>You</span>
              <span>Team Avg: {teamAverage.avgSentiment > 0 ? '+' : ''}{teamAverage.avgSentiment.toFixed(2)}</span>
            </div>
            <Progress 
              value={rep.avg_sentiment !== null ? ((rep.avg_sentiment + 1) / 2) * 100 : 0} 
              className="h-2"
            />
          </div>
        </div>

        {/* Talk Time Comparison */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Average Talk Time</span>
            <div className="flex items-center gap-2">
              {getComparisonIcon(rep.avg_talk_time || 0, teamAverage.avgTalkTime)}
              <span className={`text-sm font-semibold ${getComparisonColor(rep.avg_talk_time || 0, teamAverage.avgTalkTime, false)}`}>
                {rep.avg_talk_time !== null ? rep.avg_talk_time.toFixed(1) + '%' : 'N/A'}
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>You</span>
              <span>Team Avg: {teamAverage.avgTalkTime.toFixed(1)}%</span>
            </div>
            <Progress 
              value={rep.avg_talk_time || 0} 
              className="h-2"
            />
            {rep.avg_talk_time !== null && (
              <div className="flex items-center gap-2 mt-1">
                {rep.avg_talk_time >= 45 && rep.avg_talk_time <= 55 ? (
                  <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs">
                    Ideal Range
                  </Badge>
                ) : rep.avg_talk_time > 55 ? (
                  <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 text-xs">
                    Too High
                  </Badge>
                ) : (
                  <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-xs">
                    Too Low
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Meeting Volume */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Total Meetings</span>
            <div className="flex items-center gap-2">
              {getComparisonIcon(rep.total_meetings, teamAverage.totalMeetings)}
              <span className={`text-sm font-semibold ${getComparisonColor(rep.total_meetings, teamAverage.totalMeetings)}`}>
                {rep.total_meetings}
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>You</span>
              <span>Team Avg: {teamAverage.totalMeetings}</span>
            </div>
            <Progress 
              value={teamAverage.totalMeetings > 0 ? (rep.total_meetings / (teamAverage.totalMeetings * 2)) * 100 : 0} 
              className="h-2"
            />
          </div>
        </div>

        {/* Coach Rating */}
        {rep.avg_coach_rating !== null && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Coach Rating</span>
              <div className="flex items-center gap-2">
                {getComparisonIcon(rep.avg_coach_rating, teamAverage.avgCoachRating)}
                <span className={`text-sm font-semibold ${getComparisonColor(rep.avg_coach_rating, teamAverage.avgCoachRating)}`}>
                  {Math.min(rep.avg_coach_rating, 10).toFixed(1)}/10
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>You</span>
                <span>Team Avg: {Math.min(teamAverage.avgCoachRating, 10).toFixed(1)}/10</span>
              </div>
              <Progress
                value={Math.min((rep.avg_coach_rating / 10) * 100, 100)}
                className="h-2"
              />
            </div>
          </div>
        )}

        {/* Summary Stats */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700 grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Positive Meetings</p>
            <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{rep.positive_meetings}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Negative Meetings</p>
            <p className="text-lg font-semibold text-red-600 dark:text-red-400">{rep.negative_meetings}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}































