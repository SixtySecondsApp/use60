import React from 'react';
import type { ActionSummaryResponse as ActionSummaryResponseType } from '../types';
import { CheckCircle2, Briefcase, Users, CheckSquare, Activity, ArrowRight, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActionSummaryResponseProps {
  data: ActionSummaryResponseType;
  onActionClick?: (action: any) => void;
}

export const ActionSummaryResponse: React.FC<ActionSummaryResponseProps> = ({ data, onActionClick }) => {
  const { actionItems, metrics, actionsCompleted } = data.data;

  const getEntityIcon = (entityType: string) => {
    switch (entityType) {
      case 'deal':
        return Briefcase;
      case 'client':
        return Users;
      case 'task':
        return CheckSquare;
      case 'activity':
        return Activity;
      default:
        return CheckCircle2;
    }
  };

  const getEntityColor = (entityType: string) => {
    switch (entityType) {
      case 'deal':
        return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
      case 'client':
        return 'text-green-400 bg-green-500/10 border-green-500/20';
      case 'contact':
        return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20';
      case 'task':
        return 'text-purple-400 bg-purple-500/10 border-purple-500/20';
      case 'activity':
        return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
      default:
        return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
    }
  };

  const getOperationLabel = (operation: string) => {
    switch (operation) {
      case 'create':
        return 'Created';
      case 'update':
        return 'Updated';
      case 'delete':
        return 'Deleted';
      default:
        return 'Modified';
    }
  };

  const handleActionClick = (action: any) => {
    // Always use onActionClick contract - never direct window.location
    if (onActionClick) {
      onActionClick(action);
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Header */}
      <div className="bg-gradient-to-r from-green-500/10 to-blue-500/10 border border-green-500/20 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white mb-1">Actions Completed</h3>
            <p className="text-sm text-gray-300">{data.summary}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-green-400">{actionsCompleted}</div>
            <div className="text-xs text-gray-400">completed</div>
          </div>
        </div>
      </div>

      {/* Metrics Cards */}
      {(metrics.dealsUpdated > 0 || metrics.clientsUpdated > 0 || metrics.contactsUpdated > 0 || metrics.tasksCreated > 0 || metrics.activitiesCreated > 0) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {metrics.dealsUpdated > 0 && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Briefcase className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-gray-400">Deals</span>
              </div>
              <div className="text-xl font-bold text-white">{metrics.dealsUpdated}</div>
            </div>
          )}
          {metrics.clientsUpdated > 0 && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-green-400" />
                <span className="text-xs text-gray-400">Clients</span>
              </div>
              <div className="text-xl font-bold text-white">{metrics.clientsUpdated}</div>
            </div>
          )}
          {metrics.contactsUpdated > 0 && (
            <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-cyan-400" />
                <span className="text-xs text-gray-400">Contacts</span>
              </div>
              <div className="text-xl font-bold text-white">{metrics.contactsUpdated}</div>
            </div>
          )}
          {metrics.tasksCreated > 0 && (
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <CheckSquare className="w-4 h-4 text-purple-400" />
                <span className="text-xs text-gray-400">Tasks</span>
              </div>
              <div className="text-xl font-bold text-white">{metrics.tasksCreated}</div>
            </div>
          )}
          {metrics.activitiesCreated > 0 && (
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="w-4 h-4 text-orange-400" />
                <span className="text-xs text-gray-400">Activities</span>
              </div>
              <div className="text-xl font-bold text-white">{metrics.activitiesCreated}</div>
            </div>
          )}
        </div>
      )}

      {/* Action Items List */}
      {actionItems.length > 0 && (
        <div>
          <h4 className="text-md font-semibold text-white mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
            Completed Actions
          </h4>
          <div className="space-y-2">
            {actionItems.map((item, idx) => {
              const Icon = getEntityIcon(item.entityType);
              const colorClass = getEntityColor(item.entityType);
              
              return (
                <div
                  key={idx}
                  className={cn(
                    'border rounded-lg p-4 flex items-start gap-3',
                    colorClass
                  )}
                >
                  <div className="w-8 h-8 rounded-lg bg-current/20 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-white capitalize">
                        {getOperationLabel(item.operation)}
                      </span>
                      <span className="text-xs text-gray-400 capitalize">
                        {item.entityType}
                      </span>
                    </div>
                    {item.entityName && (
                      <div className="text-sm text-gray-200 font-medium truncate">
                        {item.entityName}
                      </div>
                    )}
                    {item.details && (
                      <div className="text-xs text-gray-400 mt-1">
                        {item.details}
                      </div>
                    )}
                  </div>
                  {item.success && (
                    <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      {data.actions && data.actions.length > 0 && (
        <div>
          <h4 className="text-md font-semibold text-white mb-3 flex items-center gap-2">
            <ArrowRight className="w-5 h-5 text-blue-400" />
            Quick Actions
          </h4>
          <div className="flex flex-wrap gap-2">
            {data.actions.map((action) => (
              <button
                key={action.id}
                onClick={() => handleActionClick(action)}
                className={cn(
                  'px-4 py-2 rounded-lg border transition-colors flex items-center gap-2',
                  action.type === 'primary'
                    ? 'bg-blue-500/20 border-blue-500/40 text-blue-300 hover:bg-blue-500/30'
                    : 'bg-gray-800/50 border-gray-700 text-gray-300 hover:bg-gray-800/70'
                )}
              >
                <span className="text-sm font-medium">{action.label}</span>
                {action.callback && action.callback.startsWith('/') && (
                  <ExternalLink className="w-3 h-3 opacity-50" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

