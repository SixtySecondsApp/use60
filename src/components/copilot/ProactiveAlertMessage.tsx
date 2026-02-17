/**
 * ProactiveAlertMessage Component
 * Story: PIPE-020 - In-app copilot proactive health messages
 *
 * Renders a proactive alert in the copilot chat panel for deal health changes
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useCopilotAlerts, type DealHealthAlert } from '@/lib/hooks/useCopilotAlerts';
import { useCopilot } from '@/lib/contexts/CopilotContext';
import {
  AlertTriangle,
  TrendingDown,
  Ghost,
  Clock,
  Pause,
  MessageCircle,
  ExternalLink,
  Mail,
  Phone,
  X,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// =============================================================================
// Alert Icon Mapping
// =============================================================================

const ALERT_ICONS = {
  health_drop: TrendingDown,
  ghost_risk: Ghost,
  no_activity: Clock,
  stage_stall: Pause,
  sentiment_decline: MessageCircle,
  close_date_risk: AlertTriangle,
} as const;

const SEVERITY_COLORS = {
  info: 'bg-blue-50 border-blue-200 text-blue-900',
  warning: 'bg-amber-50 border-amber-200 text-amber-900',
  critical: 'bg-red-50 border-red-200 text-red-900',
} as const;

const SEVERITY_BADGE_COLORS = {
  info: 'bg-blue-100 text-blue-800',
  warning: 'bg-amber-100 text-amber-800',
  critical: 'bg-red-100 text-red-800',
} as const;

// =============================================================================
// Component Props
// =============================================================================

export interface ProactiveAlertMessageProps {
  alert: DealHealthAlert;
}

// =============================================================================
// Component
// =============================================================================

export function ProactiveAlertMessage({ alert }: ProactiveAlertMessageProps) {
  const navigate = useNavigate();
  const { sendMessage } = useCopilot();
  const { markAsRead, dismissAlert } = useCopilotAlerts();

  const AlertIcon = ALERT_ICONS[alert.alert_type] || AlertTriangle;
  const dealName = alert.metadata?.dealName || 'Unknown Deal';

  // Handle "Open Deal" action
  const handleOpenDeal = () => {
    markAsRead(alert.id);
    // Navigate to pipeline and open DealIntelligenceSheet
    navigate(`/crm/pipeline?dealId=${alert.deal_id}&sheet=intelligence`);
  };

  // Handle "Draft Email" action
  const handleDraftEmail = () => {
    markAsRead(alert.id);
    sendMessage(`Draft a re-engagement email for ${dealName}`);
  };

  // Handle "Schedule Call" action
  const handleScheduleCall = () => {
    markAsRead(alert.id);
    sendMessage(`Help me schedule a call to address concerns about ${dealName}`);
  };

  // Handle dismiss
  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    dismissAlert(alert.id);
  };

  return (
    <Card
      className={cn(
        'border-l-4 p-4 mb-3 transition-all hover:shadow-md',
        SEVERITY_COLORS[alert.severity]
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-1">
          <div className="p-2 rounded-lg bg-white/60">
            <AlertIcon className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-semibold text-sm">{alert.title}</h4>
              <Badge variant="outline" className={cn('text-xs', SEVERITY_BADGE_COLORS[alert.severity])}>
                {alert.severity}
              </Badge>
            </div>
            <p className="text-xs opacity-80">{dealName}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className="h-6 w-6 p-0 hover:bg-white/40"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Message */}
      <p className="text-sm mb-3 leading-relaxed">{alert.message}</p>

      {/* Suggested Actions (if any) */}
      {alert.suggested_actions && alert.suggested_actions.length > 0 && (
        <div className="mb-3 p-2 bg-white/40 rounded-md">
          <p className="text-xs font-medium mb-1">Suggested Actions:</p>
          <ul className="text-xs space-y-1">
            {alert.suggested_actions.slice(0, 2).map((action, idx) => (
              <li key={idx} className="flex items-start gap-1">
                <CheckCircle2 className="w-3 h-3 mt-0.5 flex-shrink-0 opacity-60" />
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="default"
          size="sm"
          onClick={handleOpenDeal}
          className="text-xs h-8"
        >
          <ExternalLink className="w-3 h-3 mr-1" />
          Open Deal
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDraftEmail}
          className="text-xs h-8"
        >
          <Mail className="w-3 h-3 mr-1" />
          Draft Email
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleScheduleCall}
          className="text-xs h-8"
        >
          <Phone className="w-3 h-3 mr-1" />
          Schedule Call
        </Button>
      </div>

      {/* Footer timestamp */}
      <div className="mt-3 pt-2 border-t border-white/30">
        <p className="text-xs opacity-60">
          {new Date(alert.created_at).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </p>
      </div>
    </Card>
  );
}

// =============================================================================
// Alert List Component
// =============================================================================

/**
 * Shows all recent unread alerts in copilot
 */
export function ProactiveAlertsList() {
  const { recentAlerts, unreadCount, isLoading } = useCopilotAlerts();

  if (isLoading) {
    return (
      <div className="p-4 space-y-2">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="h-32 bg-muted rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  if (unreadCount === 0) {
    return null;
  }

  return (
    <div className="px-2 py-3">
      <div className="flex items-center gap-2 mb-3 px-2">
        <AlertTriangle className="w-4 h-4 text-amber-600" />
        <h3 className="text-sm font-semibold">Deal Health Alerts</h3>
        {unreadCount > 0 && (
          <Badge variant="destructive" className="ml-auto text-xs">
            {unreadCount}
          </Badge>
        )}
      </div>
      <div className="space-y-2">
        {recentAlerts.map((alert) => (
          <ProactiveAlertMessage key={alert.id} alert={alert} />
        ))}
      </div>
    </div>
  );
}
