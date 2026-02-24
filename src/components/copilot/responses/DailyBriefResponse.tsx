/**
 * Daily Brief Response Component
 * Renders the "catch me up" / daily briefing structured response
 * 
 * Adapts based on time of day:
 * - Morning: Today's focus and priorities
 * - Afternoon: Progress and remaining items
 * - Evening: Wrap-up + tomorrow preview
 */

import React, { useState } from 'react';
import { 
  Calendar, 
  Briefcase, 
  Users, 
  CheckSquare, 
  ChevronDown, 
  ChevronUp,
  ExternalLink,
  Clock,
  AlertCircle,
  Sun,
  Sunset,
  Moon,
  Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DailyBriefResponse as DailyBriefResponseType } from '../types';

interface Props {
  data: DailyBriefResponseType;
  onActionClick?: (action: any) => void;
}

// Time-of-day icon
function TimeIcon({ timeOfDay }: { timeOfDay: 'morning' | 'afternoon' | 'evening' }) {
  switch (timeOfDay) {
    case 'morning':
      return <Sun className="w-5 h-5 text-amber-400" />;
    case 'afternoon':
      return <Sunset className="w-5 h-5 text-orange-400" />;
    case 'evening':
      return <Moon className="w-5 h-5 text-indigo-400" />;
  }
}

// Collapsible section component with summary preview
function Section({ 
  title, 
  icon: Icon, 
  iconColor, 
  count, 
  preview,
  statusBadge,
  defaultOpen = false,
  children 
}: { 
  title: string;
  icon: React.ElementType;
  iconColor: string;
  count?: number;
  preview?: string;
  statusBadge?: { text: string; color: string };
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-gray-800/60 bg-gray-900/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-800/30 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Icon className={cn('w-4 h-4 shrink-0', iconColor)} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">{title}</span>
              {typeof count === 'number' && (
                <span className="text-xs text-gray-400 bg-gray-800/50 px-2 py-0.5 rounded-full shrink-0">
                  {count}
                </span>
              )}
              {statusBadge && (
                <span className={cn('text-xs px-1.5 py-0.5 rounded shrink-0', statusBadge.color)}>
                  {statusBadge.text}
                </span>
              )}
            </div>
            {!isOpen && preview && (
              <p className="text-xs text-gray-400 truncate mt-0.5">{preview}</p>
            )}
          </div>
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-gray-400 shrink-0 ml-2" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 ml-2" />
        )}
      </button>
      {isOpen && <div className="px-3 pb-3 pt-1">{children}</div>}
    </div>
  );
}

export function DailyBriefResponse({ data, onActionClick }: Props) {
  const brief = data.data;
  const [showAllMeetings, setShowAllMeetings] = useState(false);

  // Default to morning if not specified
  const timeOfDay = brief.timeOfDay || 'morning';
  const greeting = brief.greeting || getDefaultGreeting(timeOfDay);
  const schedule = brief.schedule || [];
  const priorityDeals = brief.priorityDeals || [];
  const contacts = brief.contactsNeedingAttention || [];
  const tasks = brief.tasks || [];
  const tomorrowPreview = brief.tomorrowPreview || [];

  // Limit displayed items for compact view
  const displayedMeetings = showAllMeetings ? schedule : schedule.slice(0, 3);
  const displayedDeals = priorityDeals.slice(0, 3);
  const displayedContacts = contacts.slice(0, 5);
  const displayedTasks = tasks.slice(0, 5);
  
  // Generate preview text for collapsed sections
  const schedulePreview = schedule.length > 0 
    ? schedule.slice(0, 2).map(m => m.title).join(', ') + (schedule.length > 2 ? '...' : '')
    : undefined;
    
  const dealsPreview = priorityDeals.length > 0
    ? priorityDeals.slice(0, 2).map(d => d.name).join(', ') + (priorityDeals.length > 2 ? '...' : '')
    : undefined;
    
  const contactsPreview = contacts.length > 0
    ? contacts.slice(0, 2).map(c => c.name).join(', ') + (contacts.length > 2 ? '...' : '')
    : undefined;
    
  const tasksPreview = tasks.length > 0
    ? tasks.slice(0, 2).map(t => t.title).join(', ') + (tasks.length > 2 ? '...' : '')
    : undefined;
  
  // Count urgent items for status badges
  const highRiskContacts = contacts.filter(c => c.riskLevel === 'high' || c.healthStatus === 'ghost').length;
  const staleDeals = priorityDeals.filter(d => d.healthStatus === 'stale' || d.healthStatus === 'at_risk').length;
  const highPriorityTasks = tasks.filter(t => t.priority === 'high').length;

  return (
    <div className="space-y-4">
      {/* Header with greeting */}
      <div className="flex items-start gap-3">
        <div className="flex items-center gap-2">
          <TimeIcon timeOfDay={timeOfDay} />
          <Sparkles className="w-4 h-4 text-violet-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-white">{greeting}</h3>
          <p className="text-sm text-gray-300 mt-1">{brief.summary || data.summary}</p>
        </div>
      </div>

      {/* Schedule Section */}
      {schedule.length > 0 && (
        <Section 
          title="Today's Schedule" 
          icon={Calendar} 
          iconColor="text-blue-400"
          count={schedule.length}
          preview={schedulePreview}
          defaultOpen={false}
        >
          <div className="space-y-2">
            {displayedMeetings.map((meeting) => (
              <div
                key={meeting.id}
                className="flex items-start justify-between p-3 rounded-lg bg-gray-800/40 hover:bg-gray-800/60 transition-colors cursor-pointer"
                onClick={() => onActionClick?.({ action: 'open_meeting', data: { meetingId: meeting.id } })}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white truncate">{meeting.title}</div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                    {formatTime(meeting.startTime) && (
                      <>
                        <Clock className="w-3 h-3" />
                        <span>{formatTime(meeting.startTime)}</span>
                      </>
                    )}
                    {meeting.attendees && meeting.attendees.length > 0 && (
                      <>
                        {formatTime(meeting.startTime) && <span>•</span>}
                        <span>{meeting.attendees.length} attendee{meeting.attendees.length !== 1 ? 's' : ''}</span>
                      </>
                    )}
                  </div>
                  {meeting.linkedDealName && (
                    <div className="mt-1 text-xs text-blue-400">
                      Deal: {meeting.linkedDealName}
                    </div>
                  )}
                </div>
                {meeting.meetingUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onActionClick?.({ action: 'open_external_url', data: { url: meeting.meetingUrl } });
                    }}
                    className="shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            ))}
            {schedule.length > 3 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAllMeetings(!showAllMeetings)}
                className="w-full text-gray-400 hover:text-white"
              >
                {showAllMeetings ? 'Show less' : `Show ${schedule.length - 3} more`}
              </Button>
            )}
          </div>
        </Section>
      )}

      {/* Priority Deals Section */}
      {priorityDeals.length > 0 && (
        <Section 
          title="Deals Needing Attention" 
          icon={Briefcase} 
          iconColor="text-purple-400"
          count={priorityDeals.length}
          preview={dealsPreview}
          statusBadge={staleDeals > 0 ? { text: `${staleDeals} at risk`, color: 'bg-amber-500/20 text-amber-400' } : undefined}
          defaultOpen={false}
        >
          <div className="space-y-2">
            {displayedDeals.map((deal) => (
              <div
                key={deal.id}
                className="flex items-start justify-between p-3 rounded-lg bg-gray-800/40 hover:bg-gray-800/60 transition-colors cursor-pointer"
                onClick={() => onActionClick?.({ action: 'open_deal', data: { dealId: deal.id } })}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white truncate">{deal.name}</span>
                    {deal.healthStatus === 'stale' && (
                      <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    )}
                    {deal.healthStatus === 'at_risk' && (
                      <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                    {deal.company && <span>{deal.company}</span>}
                    {deal.stage && (
                      <>
                        <span>•</span>
                        <span>{deal.stage}</span>
                      </>
                    )}
                    {deal.value && (
                      <>
                        <span>•</span>
                        <span className="text-emerald-400">{formatCurrency(deal.value)}</span>
                      </>
                    )}
                  </div>
                  {(deal.contactName || deal.contactEmail) && (
                    <div className="mt-1 text-xs text-gray-400">
                      {deal.contactName && <span>{deal.contactName}</span>}
                      {deal.contactName && deal.contactEmail && <span> • </span>}
                      {deal.contactEmail && <span className="text-blue-400">{deal.contactEmail}</span>}
                    </div>
                  )}
                  {deal.daysStale && deal.daysStale > 0 && (
                    <div className="mt-1 text-xs text-amber-400">
                      {deal.daysStale} day{deal.daysStale !== 1 ? 's' : ''} since last activity
                    </div>
                  )}
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Contacts Section */}
      {contacts.length > 0 && (
        <Section 
          title="Contacts to Follow Up" 
          icon={Users} 
          iconColor="text-cyan-400"
          count={contacts.length}
          preview={contactsPreview}
          statusBadge={highRiskContacts > 0 ? { text: `${highRiskContacts} high risk`, color: 'bg-red-500/20 text-red-400' } : undefined}
          defaultOpen={false}
        >
          <div className="space-y-2">
            {displayedContacts.map((contact) => (
              <div
                key={contact.id}
                className="p-3 rounded-lg bg-gray-800/40 hover:bg-gray-800/60 transition-colors"
              >
                <div 
                  className="flex items-start justify-between cursor-pointer"
                  onClick={() => onActionClick?.({ action: 'open_contact', data: { contactId: contact.id } })}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white truncate">{contact.name}</span>
                      {contact.riskLevel === 'high' && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">High Risk</span>
                      )}
                      {contact.healthStatus === 'ghost' && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">Going Dark</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                      {contact.company && <span>{contact.company}</span>}
                      {contact.daysSinceContact && (
                        <>
                          <span>•</span>
                          <span>{contact.daysSinceContact} days since contact</span>
                        </>
                      )}
                      {!contact.daysSinceContact && contact.lastContactDate && (
                        <>
                          <span>•</span>
                          <span>Last: {formatRelativeDate(contact.lastContactDate)}</span>
                        </>
                      )}
                    </div>
                    {contact.reason && (
                      <div className="mt-1 text-xs text-cyan-400">{contact.reason}</div>
                    )}
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                </div>
                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="text-xs gap-1.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (onActionClick) {
                        onActionClick({ 
                          action: 'send_message', 
                          data: { 
                            prompt: `Draft a re-engagement email for ${contact.name}${contact.company ? ` at ${contact.company}` : ''}. Use my personal writing style and tone of voice. Keep it warm and friendly, checking in on how things are going and seeing if there's anything I can help with.`
                          } 
                        });
                      }
                    }}
                  >
                    Draft Email
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs gap-1.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (onActionClick) {
                        onActionClick({ 
                          action: 'send_message', 
                          data: { 
                            prompt: `Create a follow-up task for ${contact.name}${contact.company ? ` at ${contact.company}` : ''}`
                          } 
                        });
                      }
                    }}
                  >
                    Create Task
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs gap-1.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (onActionClick) {
                        onActionClick({ 
                          action: 'send_message', 
                          data: { 
                            prompt: `What do I need to know about ${contact.name}${contact.company ? ` at ${contact.company}` : ''}? Give me context on our relationship and any recent interactions.`
                          } 
                        });
                      }
                    }}
                  >
                    Get Context
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Tasks Section */}
      {tasks.length > 0 && (
        <Section 
          title="Pending Tasks" 
          icon={CheckSquare} 
          iconColor="text-green-400"
          count={tasks.length}
          preview={tasksPreview}
          statusBadge={highPriorityTasks > 0 ? { text: `${highPriorityTasks} high priority`, color: 'bg-red-500/20 text-red-400' } : undefined}
          defaultOpen={false}
        >
          <div className="space-y-2">
            {displayedTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-start justify-between p-3 rounded-lg bg-gray-800/40 hover:bg-gray-800/60 transition-colors cursor-pointer"
                onClick={() => onActionClick?.({ action: 'open_task', data: { taskId: task.id } })}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white truncate">{task.title}</span>
                    {task.priority === 'high' && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">High</span>
                    )}
                  </div>
                  {task.dueDate && (
                    <div className="mt-1 text-xs text-gray-400">
                      Due: {formatRelativeDate(task.dueDate)}
                    </div>
                  )}
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Tomorrow Preview (Evening only) */}
      {timeOfDay === 'evening' && tomorrowPreview.length > 0 && (
        <Section 
          title="Tomorrow Preview" 
          icon={Calendar} 
          iconColor="text-indigo-400"
          count={tomorrowPreview.length}
          preview={tomorrowPreview.slice(0, 2).map(m => m.title).join(', ')}
          defaultOpen={false}
        >
          <div className="space-y-2">
            {tomorrowPreview.slice(0, 3).map((meeting) => (
              <div
                key={meeting.id}
                className="flex items-start justify-between p-3 rounded-lg bg-gray-800/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white truncate">{meeting.title}</div>
                  {formatTime(meeting.startTime) && (
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                      <Clock className="w-3 h-3" />
                      <span>{formatTime(meeting.startTime)}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Empty state */}
      {schedule.length === 0 && priorityDeals.length === 0 && contacts.length === 0 && tasks.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          <Sparkles className="w-8 h-8 mx-auto mb-3 text-violet-400/50" />
          <p className="text-sm">All caught up! Nothing urgent right now.</p>
        </div>
      )}
    </div>
  );
}

// Helper functions
function getDefaultGreeting(timeOfDay: 'morning' | 'afternoon' | 'evening'): string {
  switch (timeOfDay) {
    case 'morning':
      return "Good morning! Here's your day ahead.";
    case 'afternoon':
      return "Here's your afternoon update.";
    case 'evening':
      return "Wrapping up the day. Here's your summary.";
  }
}

function formatTime(isoString: string | undefined | null): string {
  try {
    if (!isoString) return '';
    const date = new Date(isoString);
    // Check for Invalid Date - getTime() returns NaN for invalid dates
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return '';
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatRelativeDate(isoString: string | undefined | null): string {
  try {
    if (!isoString) return '';
    const date = new Date(isoString);
    // Check for Invalid Date
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) !== 1 ? 's' : ''} ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export default DailyBriefResponse;
