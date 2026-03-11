import React, { useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { 
  Activity, 
  Calendar, 
  TrendingUp, 
  FileText, 
  CheckCircle2,
  DollarSign,
  Phone,
  Mail,
  ExternalLink
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTimelineInfinite, type TimelineItem } from '@/lib/hooks/useContactCompanyGraph';
import { cn } from '@/lib/utils';

interface TimelineViewProps {
  type: 'contact' | 'company';
  id: string | undefined;
  onItemClick?: (item: TimelineItem) => void;
  className?: string;
}

export function TimelineView({ type, id, onItemClick, className }: TimelineViewProps) {
  const {
    timelineItems,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = useTimelineInfinite(type, id, 20);

  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => {
      if (loadMoreRef.current) {
        observer.unobserve(loadMoreRef.current);
      }
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const getRecordTypeIcon = (recordType: TimelineItem['recordType']) => {
    switch (recordType) {
      case 'activity':
        return Activity;
      case 'meeting':
        return Calendar;
      case 'lead':
        return TrendingUp;
      case 'deal':
        return DollarSign;
      case 'task':
        return CheckCircle2;
      case 'communication':
        return Mail;
      default:
        return FileText;
    }
  };

  const getRecordTypeColor = (recordType: TimelineItem['recordType']) => {
    switch (recordType) {
      case 'activity':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'meeting':
        return 'bg-green-500/10 text-green-400 border-green-500/30';
      case 'lead':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'deal':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'task':
        return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
      case 'communication':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    }
  };

  const getPipelineStageColor = (stage?: TimelineItem['pipelineStage']) => {
    switch (stage) {
      case 'SQL':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'Opportunity':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'Verbal':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'Signed':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="h-20 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 theme-text-tertiary">
        <p className="text-sm">Failed to load timeline items</p>
      </div>
    );
  }

  if (timelineItems.length === 0) {
    return (
      <div className="text-center py-12 theme-text-tertiary">
        <Activity className="w-16 h-16 mx-auto mb-4 opacity-30" />
        <p className="text-lg font-medium mb-2">No activity found</p>
        <p className="text-sm">Activities, meetings, leads, deals, and tasks will appear here</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {timelineItems.map((item) => {
        const Icon = getRecordTypeIcon(item.recordType);
        const typeColor = getRecordTypeColor(item.recordType);
        
        return (
          <div
            key={item.id}
            className={cn(
              'p-4 rounded-lg bg-gray-100/50 dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50',
              'hover:border-gray-400 dark:hover:border-gray-600/50 hover:bg-gray-200/50 dark:hover:bg-gray-800/70',
              'transition-all cursor-pointer group',
              onItemClick && 'cursor-pointer'
            )}
            onClick={() => onItemClick?.(item)}
          >
            <div className="flex items-start gap-4">
              {/* Icon */}
              <div className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                typeColor
              )}>
                <Icon className="w-5 h-5" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="theme-text-primary font-medium group-hover:text-blue-400 transition-colors">
                        {item.title}
                      </h3>
                      <Badge className={cn('text-xs', typeColor)}>
                        {item.recordType}
                      </Badge>
                      {item.badgeLabel && (
                        <Badge variant="outline" className="text-xs">
                          {item.badgeLabel}
                        </Badge>
                      )}
                      {item.pipelineStage && (
                        <Badge className={cn('text-xs', getPipelineStageColor(item.pipelineStage))}>
                          {item.pipelineStage}
                        </Badge>
                      )}
                      {item.stageLabel && item.recordType === 'deal' && (
                        <Badge variant="outline" className="text-xs">
                          {item.stageLabel}
                        </Badge>
                      )}
                    </div>
                    {item.description && (
                      <p className="theme-text-secondary text-sm mb-2 line-clamp-2">
                        {item.description}
                      </p>
                    )}
                  </div>
                  <ExternalLink className="w-4 h-4 text-gray-500 dark:text-gray-500 group-hover:text-blue-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0" />
                </div>

                {/* Metadata */}
                <div className="flex items-center gap-4 text-xs theme-text-tertiary flex-wrap">
                  <span>
                    {format(new Date(item.timestamp), 'MMM d, yyyy HH:mm')}
                  </span>
                  
                  {item.metadata.dealValue && (
                    <span className="text-emerald-400 font-medium">
                      {formatCurrency(item.metadata.dealValue)}
                    </span>
                  )}
                  
                  {item.metadata.amount && (
                    <span className="text-emerald-400 font-medium">
                      {formatCurrency(item.metadata.amount)}
                    </span>
                  )}
                  
                  {item.metadata.dealProbability !== undefined && (
                    <span>
                      {item.metadata.dealProbability}% probability
                    </span>
                  )}
                  
                  {item.metadata.taskPriority && (
                    <Badge variant="outline" className="text-xs">
                      {item.metadata.taskPriority} priority
                    </Badge>
                  )}
                  
                  {item.metadata.taskStatus && (
                    <Badge variant="outline" className="text-xs">
                      {item.metadata.taskStatus}
                    </Badge>
                  )}
                  
                  {item.metadata.meetingDuration && (
                    <span>
                      {item.metadata.meetingDuration} min
                    </span>
                  )}
                  
                  {item.metadata.leadStatus && (
                    <Badge variant="outline" className="text-xs">
                      {item.metadata.leadStatus}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Load more trigger */}
      {hasNextPage && (
        <div ref={loadMoreRef} className="flex justify-center py-4">
          {isFetchingNextPage ? (
            <div className="text-sm theme-text-tertiary">Loading more...</div>
          ) : (
            <Button
              variant="outline"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              Load More
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

