/**
 * Email Response Component
 * Displays email drafts with context and suggestions
 * Interactive email actions: inline edit, send now, schedule, task creation
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  Lightbulb, Clock, Briefcase, Smile, Zap, ChevronDown, ChevronUp,
  Copy, Mail, Loader2, Pencil, Check, X, Send, CheckCircle, ListTodo,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EmailResponse as EmailResponseData } from '../types';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import { useGmailSendEnabled } from '@/lib/hooks/useGoogleIntegration';

interface EmailResponseProps {
  data: EmailResponseData;
  onActionClick?: (action: any) => void;
}

// Tone options for email generation
const toneOptions = [
  {
    value: 'professional' as const,
    label: 'Professional',
    icon: Briefcase,
    description: 'More formal than your usual style'
  },
  {
    value: 'friendly' as const,
    label: 'Friendly',
    icon: Smile,
    description: 'More casual and warm'
  },
  {
    value: 'concise' as const,
    label: 'Concise',
    icon: Zap,
    description: 'Brief and to the point'
  },
] as const;

type EmailTone = 'professional' | 'friendly' | 'concise';

function getNextBusinessDay(daysAhead: number): Date {
  const date = new Date();
  let added = 0;
  while (added < daysAhead) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return date;
}

function getScheduleOptions(aiSendTime?: string) {
  const options: { label: string; date: Date }[] = [];

  const day1 = getNextBusinessDay(1);
  day1.setHours(9, 0, 0, 0);
  options.push({
    label: day1.toLocaleDateString('en-US', { weekday: 'short' }) + ' 9am',
    date: day1,
  });

  const day2 = getNextBusinessDay(2);
  day2.setHours(10, 0, 0, 0);
  options.push({
    label: day2.toLocaleDateString('en-US', { weekday: 'short' }) + ' 10am',
    date: day2,
  });

  if (aiSendTime) {
    const aiDate = new Date(aiSendTime);
    if (!isNaN(aiDate.getTime()) && aiDate > new Date()) {
      options.push({
        label: aiDate.toLocaleDateString('en-US', { weekday: 'short' }) + ' ' +
          aiDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        date: aiDate,
      });
    }
  }

  return options;
}

export const EmailResponse: React.FC<EmailResponseProps> = ({ data, onActionClick }) => {
  const [showContext, setShowContext] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [currentTone, setCurrentTone] = useState<EmailTone>(data.data.email.tone || 'professional');
  const [emailSubject, setEmailSubject] = useState(data.data.email.subject);
  const [emailBody, setEmailBody] = useState(data.data.email.body);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const editSnapshotRef = useRef<{ subject: string; body: string }>({ subject: '', body: '' });

  // Send state
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);

  // Schedule state
  const [scheduledId, setScheduledId] = useState<string | null>(null);
  const [scheduledLabel, setScheduledLabel] = useState<string | null>(null);
  const [isScheduling, setIsScheduling] = useState(false);

  // Task creation state
  const [taskCreated, setTaskCreated] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  // Handle tone change - regenerate in-place using the API
  const handleToneChange = useCallback(async (newTone: EmailTone) => {
    if (newTone === currentTone || isRegenerating) return;

    setIsRegenerating(true);
    setCurrentTone(newTone);

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-copilot/actions/regenerate-email-tone`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.session.access_token}`
          },
          body: JSON.stringify({
            currentEmail: {
              subject: data.data.email.subject,
              body: data.data.email.body,
              to: data.data.email.to
            },
            newTone,
            context: data.data.context
          })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to regenerate email');
      }

      const result = await response.json();
      if (result.subject && result.body) {
        setEmailSubject(result.subject);
        setEmailBody(result.body);
        toast.success(`Email adjusted to ${newTone} tone`);
      }
    } catch (error) {
      console.error('Failed to regenerate email:', error);
      toast.error('Failed to regenerate email. Please try again.');
      setCurrentTone(data.data.email.tone || 'professional');
    } finally {
      setIsRegenerating(false);
    }
  }, [currentTone, isRegenerating, data.data.email, data.data.context]);

  // Edit mode handlers
  const handleStartEdit = useCallback(() => {
    editSnapshotRef.current = { subject: emailSubject, body: emailBody };
    setIsEditing(true);
  }, [emailSubject, emailBody]);

  const handleDoneEdit = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEmailSubject(editSnapshotRef.current.subject);
    setEmailBody(editSnapshotRef.current.body);
    setIsEditing(false);
  }, []);

  // Send Now handler
  const handleSendNow = useCallback(async () => {
    if (isSending || sent) return;

    setIsSending(true);
    try {
      const { error } = await supabase.functions.invoke('email-send-as-rep', {
        body: {
          to: data.data.email.to?.join(', ') || '',
          subject: emailSubject,
          body: emailBody,
          cc: data.data.email.cc?.join(', '),
        },
      });

      if (error) throw error;

      toast.success('Email sent from your Gmail');
      setSent(true);

      // Auto-create follow-up task
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const followUpDate = getNextBusinessDay(3);

        await supabase.from('tasks').insert({
          title: `Follow up: ${emailSubject}`,
          description: `Follow up on email sent to ${data.data.email.to?.join(', ')} regarding "${emailSubject}"`,
          task_type: 'follow_up',
          status: 'pending',
          ai_status: 'none',
          priority: 'medium',
          due_date: followUpDate.toISOString(),
          assigned_to: user?.id,
          created_by: user?.id,
          source: 'auto_generated',
          metadata: {
            original_subject: emailSubject,
            sent_at: new Date().toISOString(),
          },
        });

        toast.info(`Follow-up task created for ${followUpDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`);
      } catch (err) {
        console.warn('Failed to create follow-up task:', err);
      }
    } catch (error) {
      console.error('Failed to send email:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to send email');
    } finally {
      setIsSending(false);
    }
  }, [isSending, sent, emailSubject, emailBody, data.data.email]);

  // Schedule handler
  const handleSchedule = useCallback(async (option: { label: string; date: Date }) => {
    if (isScheduling || scheduledId) return;

    setIsScheduling(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: row, error } = await supabase
        .from('scheduled_emails')
        .insert({
          user_id: user?.id,
          to_email: data.data.email.to?.join(', ') || '',
          cc_email: data.data.email.cc?.join(', ') || null,
          subject: emailSubject,
          body: emailBody,
          scheduled_for: option.date.toISOString(),
        })
        .select('id')
        .maybeSingle();

      if (error) throw error;

      setScheduledId(row?.id || null);
      setScheduledLabel(option.label);
      toast.success(`Email scheduled for ${option.label}`);
    } catch (error) {
      console.error('Failed to schedule email:', error);
      toast.error('Failed to schedule email');
    } finally {
      setIsScheduling(false);
    }
  }, [isScheduling, scheduledId, emailSubject, emailBody, data.data.email]);

  // Cancel schedule handler
  const handleCancelSchedule = useCallback(async () => {
    if (!scheduledId) return;

    try {
      await supabase
        .from('scheduled_emails')
        .delete()
        .eq('id', scheduledId);

      setScheduledId(null);
      setScheduledLabel(null);
      toast.success('Scheduled email cancelled');
    } catch (error) {
      console.error('Failed to cancel scheduled email:', error);
      toast.error('Failed to cancel');
    }
  }, [scheduledId]);

  // Create follow-up task handler
  const handleCreateTask = useCallback(async () => {
    if (isCreatingTask || taskCreated) return;

    setIsCreatingTask(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const followUpDate = getNextBusinessDay(3);

      const { error } = await supabase.from('tasks').insert({
        title: `Follow up: ${emailSubject}`,
        description: `Follow up on email to ${data.data.email.to?.join(', ')} regarding "${emailSubject}"`,
        task_type: 'follow_up',
        status: 'pending',
        ai_status: 'none',
        priority: 'medium',
        due_date: followUpDate.toISOString(),
        assigned_to: user?.id,
        created_by: user?.id,
        source: 'copilot',
        metadata: {
          original_subject: emailSubject,
          created_from: 'copilot_email_response',
        },
      });

      if (error) throw error;

      setTaskCreated(true);
      toast.success(`Follow-up task created for ${followUpDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`);
    } catch (error) {
      console.error('Failed to create task:', error);
      toast.error('Failed to create follow-up task');
    } finally {
      setIsCreatingTask(false);
    }
  }, [isCreatingTask, taskCreated, emailSubject, data.data.email]);

  // Handle suggestion click - all actions happen in-place
  const handleSuggestionClick = useCallback(async (suggestion: { action: string; label: string; description: string }) => {
    if (suggestion.action === 'change_tone') {
      const currentIndex = toneOptions.findIndex(t => t.value === currentTone);
      const nextIndex = (currentIndex + 1) % toneOptions.length;
      handleToneChange(toneOptions[nextIndex].value);
    } else if (suggestion.action === 'shorten') {
      handleToneChange('concise');
    } else if (suggestion.action === 'add_calendar_link') {
      const calendarLink = '\n\nFeel free to book a time that works for you: [Your Calendar Link]';
      setEmailBody(prev => prev + calendarLink);
      toast.success('Calendar link placeholder added - replace with your actual link');
    } else if (suggestion.action === 'send_now') {
      handleSendNow();
    } else if (suggestion.action === 'schedule_send') {
      const options = getScheduleOptions(data.data.email.sendTime);
      if (options.length > 0) handleSchedule(options[0]);
    } else if (suggestion.action === 'create_task') {
      handleCreateTask();
    }
  }, [currentTone, handleToneChange, handleSendNow, handleSchedule, handleCreateTask, data.data.email.sendTime]);

  // Copy email to clipboard
  const handleCopy = useCallback(() => {
    const emailText = `Subject: ${emailSubject}\n\n${emailBody}`;
    navigator.clipboard.writeText(emailText).then(() => {
      toast.success('Email copied to clipboard');
    });
  }, [emailSubject, emailBody]);

  // Open in Gmail
  const handleOpenGmail = useCallback(() => {
    const to = data.data.email.to?.join(',') || '';
    const subject = encodeURIComponent(emailSubject || '');
    const body = encodeURIComponent(emailBody || '');
    window.open(`https://mail.google.com/mail/?view=cm&to=${to}&su=${subject}&body=${body}`, '_blank');
  }, [data.data.email.to, emailSubject, emailBody]);

  const scheduleOptions = getScheduleOptions(data.data.email.sendTime);

  return (
    <div className="space-y-3">
      {/* Compact Header with Tone Selector */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          {toneOptions.map((tone) => {
            const Icon = tone.icon;
            const isActive = currentTone === tone.value;
            return (
              <button
                key={tone.value}
                type="button"
                onClick={() => handleToneChange(tone.value)}
                disabled={isRegenerating}
                title={tone.description}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all',
                  isActive
                    ? 'bg-violet-600 text-white'
                    : 'bg-gray-800/40 text-gray-400 hover:bg-gray-800/60 hover:text-gray-300',
                  isRegenerating && 'opacity-50 cursor-not-allowed'
                )}
              >
                <Icon className="w-3 h-3" />
                <span className="hidden sm:inline">{tone.label}</span>
              </button>
            );
          })}
          {isRegenerating && (
            <div className="flex items-center gap-1.5 px-2 text-xs text-gray-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Adjusting...</span>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="flex gap-1">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={handleDoneEdit}
                title="Save edits"
                className="p-1.5 rounded-md bg-green-800/40 text-green-400 hover:bg-green-800/60 hover:text-green-300 transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                title="Cancel edits"
                className="p-1.5 rounded-md bg-red-800/40 text-red-400 hover:bg-red-800/60 hover:text-red-300 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleStartEdit}
              title="Edit email"
              className="p-1.5 rounded-md bg-gray-800/40 text-gray-400 hover:bg-gray-800/60 hover:text-gray-300 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            title="Copy to clipboard"
            className="p-1.5 rounded-md bg-gray-800/40 text-gray-400 hover:bg-gray-800/60 hover:text-gray-300 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleOpenGmail}
            title="Open in Gmail"
            className="p-1.5 rounded-md bg-gray-800/40 text-gray-400 hover:bg-gray-800/60 hover:text-gray-300 transition-colors"
          >
            <Mail className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Email Preview - Compact */}
      <div className={cn(
        "bg-gray-900/60 border border-gray-800/50 rounded-lg overflow-hidden transition-opacity",
        isRegenerating && "opacity-60"
      )}>
        {/* Header */}
        <div className="px-3 py-2 border-b border-gray-800/50 space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-gray-500 w-12">To:</span>
            <span className="text-gray-300">{data.data.email.to.join(', ') || 'No recipient'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 w-12">Subject:</span>
            {isEditing ? (
              <input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                className="flex-1 bg-gray-800/60 border border-gray-700/50 rounded px-2 py-0.5 text-gray-200 font-medium text-xs focus:outline-none focus:border-violet-500/50"
              />
            ) : (
              <span className="text-gray-200 font-medium">{emailSubject}</span>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="px-3 py-3">
          {isEditing ? (
            <textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              className="w-full min-h-[200px] bg-gray-800/60 border border-gray-700/50 rounded px-2 py-2 text-sm text-gray-300 font-sans leading-relaxed resize-y focus:outline-none focus:border-violet-500/50"
            />
          ) : (
            <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
              {emailBody}
            </pre>
          )}
        </div>
      </div>

      {/* Send Now Button */}
      <button
        type="button"
        onClick={handleSendNow}
        disabled={isSending || sent}
        className={cn(
          'w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
          sent
            ? 'bg-green-800/30 text-green-400 cursor-default'
            : 'bg-violet-600 text-white hover:bg-violet-500 active:bg-violet-700',
          isSending && 'opacity-70 cursor-not-allowed'
        )}
      >
        {isSending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Sending...</span>
          </>
        ) : sent ? (
          <>
            <CheckCircle className="w-4 h-4" />
            <span>Sent</span>
          </>
        ) : (
          <>
            <Send className="w-4 h-4" />
            <span>Send Now</span>
          </>
        )}
      </button>

      {/* Schedule Quick-Pick */}
      {!sent && (
        <div className="flex items-center gap-2 flex-wrap">
          {scheduledId ? (
            <div className="flex items-center gap-2 text-xs text-green-400">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Scheduled for {scheduledLabel}</span>
              <button
                type="button"
                onClick={handleCancelSchedule}
                className="text-gray-500 hover:text-gray-300 underline transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <Clock className="w-3 h-3" />
                <span>Schedule:</span>
              </div>
              {scheduleOptions.map((option, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSchedule(option)}
                  disabled={isScheduling}
                  className={cn(
                    'px-2.5 py-1 bg-gray-800/40 border border-gray-700/40 rounded-md text-xs text-gray-400 hover:bg-gray-800/60 hover:text-gray-300 hover:border-gray-600/50 transition-colors',
                    isScheduling && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {/* Create Follow-Up Task */}
      <button
        type="button"
        onClick={handleCreateTask}
        disabled={isCreatingTask || taskCreated}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors',
          taskCreated
            ? 'bg-green-800/20 text-green-400 cursor-default'
            : 'bg-gray-800/40 border border-gray-700/40 text-gray-400 hover:bg-gray-800/60 hover:text-gray-300',
          isCreatingTask && 'opacity-50 cursor-not-allowed'
        )}
      >
        {isCreatingTask ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Creating task...</span>
          </>
        ) : taskCreated ? (
          <>
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Follow-up task created</span>
          </>
        ) : (
          <>
            <ListTodo className="w-3.5 h-3.5" />
            <span>Create follow-up task</span>
          </>
        )}
      </button>

      {/* Collapsible Context */}
      {data.data.context.keyPoints && data.data.context.keyPoints.length > 0 && (
        <button
          type="button"
          onClick={() => setShowContext(!showContext)}
          className="w-full flex items-center justify-between px-3 py-2 bg-gray-900/40 border border-gray-800/40 rounded-lg text-xs text-gray-400 hover:bg-gray-900/60 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Lightbulb className="w-3.5 h-3.5 text-blue-400" />
            <span>Context used ({data.data.context.keyPoints.length} points)</span>
          </div>
          {showContext ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      )}

      {showContext && data.data.context.keyPoints && (
        <div className="px-3 py-2 bg-gray-900/30 border border-gray-800/30 rounded-lg text-xs space-y-1">
          {data.data.context.keyPoints.map((point, i) => (
            <div key={i} className="text-gray-400">{point}</div>
          ))}
          {data.data.context.warnings && data.data.context.warnings.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-800/30">
              {data.data.context.warnings.map((warning, i) => (
                <div key={i} className="flex items-center gap-1.5 text-amber-400/80">
                  <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Suggestion Pills - Compact */}
      {data.data.suggestions && data.data.suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.data.suggestions.map((suggestion, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSuggestionClick(suggestion)}
              title={suggestion.description}
              className="px-2.5 py-1 bg-gray-800/40 border border-gray-700/40 rounded-md text-xs text-gray-400 hover:bg-gray-800/60 hover:text-gray-300 hover:border-gray-600/50 transition-colors"
            >
              {suggestion.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default EmailResponse;
