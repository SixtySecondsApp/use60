import React from 'react';
import { CalendarDays, CheckSquare, ExternalLink, Mail, MessageSquare, Sparkles, X, Pencil } from 'lucide-react';
import type { PostMeetingFollowUpPackResponse as PostMeetingFollowUpPackResponseType } from '../types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCopilot } from '@/lib/contexts/CopilotContext';

interface Props {
  data: PostMeetingFollowUpPackResponseType;
  onActionClick?: (action: any) => void;
}

type TabKey = 'email' | 'slack' | 'tasks';

export function PostMeetingFollowUpPackResponse({ data, onActionClick }: Props) {
  const { sendMessage, isLoading } = useCopilot();
  const { meeting, contact, pack, isSimulation } = data.data;

  const [tab, setTab] = React.useState<TabKey>('email');

  const meetingTitle = meeting?.title ? String(meeting.title) : 'Most recent meeting';
  const meetingStart = meeting?.meeting_start ? String(meeting.meeting_start) : null;
  const shareUrl = meeting?.share_url ? String(meeting.share_url) : null;

  const contactName =
    contact?.full_name ? String(contact.full_name) :
    contact?.name ? String(contact.name) :
    null;
  const contactEmail = contact?.email ? String(contact.email) : null;

  const buyerEmail = pack?.buyer_email || null;
  const emailTo = buyerEmail?.to ? String(buyerEmail.to) : (contactEmail || null);
  const emailSubject = buyerEmail?.subject ? String(buyerEmail.subject) : 'Follow-up and next steps';
  const emailContext = buyerEmail?.context ? String(buyerEmail.context) : '';

  const slackUpdate = pack?.slack_update || null;
  const slackMessage = slackUpdate?.message ? String(slackUpdate.message) : '';

  const tasks = Array.isArray(pack?.tasks) ? pack.tasks : [];
  const topTask = tasks[0] || null;
  const topTaskTitle = topTask?.title ? String(topTask.title) : 'Follow-up task';
  const topTaskDue = topTask?.due_date ? String(topTask.due_date) : null;
  const topTaskPriority = topTask?.priority ? String(topTask.priority) : null;
  const topTaskDesc = topTask?.description ? String(topTask.description) : '';

  const TabButton = ({ k, label, icon }: { k: TabKey; label: string; icon: React.ReactNode }) => (
    <button
      type="button"
      onClick={() => setTab(k)}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg text-xs border transition-colors',
        tab === k
          ? 'border-violet-500/40 bg-violet-500/10 text-violet-200'
          : 'border-gray-800/60 bg-gray-900/20 text-gray-300 hover:bg-gray-900/40'
      )}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-400" />
            <h3 className="text-base font-semibold text-white truncate">Post-Meeting Follow-Up Pack</h3>
          </div>
          <p className="text-sm text-gray-300 mt-1">{data.summary}</p>
        </div>
        <div
          className={cn(
            'text-xs px-2 py-1 rounded-md border',
            isSimulation ? 'border-blue-500/30 bg-blue-500/10 text-blue-300' : 'border-green-500/30 bg-green-500/10 text-green-300'
          )}
        >
          {isSimulation ? 'Preview' : 'Executed'}
        </div>
      </div>

      <div className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-4">
        <div className="flex items-center gap-2 mb-2">
          <CalendarDays className="w-4 h-4 text-emerald-400" />
          <div className="text-sm font-semibold text-white">Meeting</div>
        </div>
        <div className="text-sm text-gray-100 font-medium">{meetingTitle}</div>
        <div className="text-xs text-gray-400 mt-1">
          {meetingStart ? `Start: ${meetingStart}` : 'Start time unknown'}
          {contactName || contactEmail ? ` • ${contactName || 'Contact'}${contactEmail ? ` (${contactEmail})` : ''}` : ''}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {shareUrl ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (onActionClick) return onActionClick({ action: 'open_external_url', data: { url: shareUrl } });
                window.open(shareUrl, '_blank');
              }}
              className="gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Open recording
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <TabButton k="email" label="Email" icon={<Mail className="w-4 h-4" />} />
        <TabButton k="slack" label="Slack" icon={<MessageSquare className="w-4 h-4" />} />
        <TabButton k="tasks" label="Tasks" icon={<CheckSquare className="w-4 h-4" />} />
      </div>

      {tab === 'email' ? (
        <div className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-4">
          <div className="text-sm font-semibold text-white">Buyer email (preview)</div>
          <div className="text-xs text-gray-400 mt-1">
            {emailTo ? `To: ${emailTo}` : 'To: (missing)'}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            Subject: <span className="text-gray-200">{emailSubject}</span>
          </div>
          {emailContext ? (
            <pre className="mt-3 text-xs text-gray-300 whitespace-pre-wrap bg-black/20 border border-gray-800/50 rounded-lg p-3 max-h-64 overflow-auto">
              {emailContext}
            </pre>
          ) : (
            <div className="mt-3 text-xs text-gray-400">No email context returned (yet).</div>
          )}
        </div>
      ) : null}

      {tab === 'slack' ? (
        <div className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-4">
          <div className="text-sm font-semibold text-white">Internal Slack update (preview)</div>
          {slackMessage ? (
            <pre className="mt-3 text-xs text-gray-300 whitespace-pre-wrap bg-black/20 border border-gray-800/50 rounded-lg p-3 max-h-64 overflow-auto">
              {slackMessage}
            </pre>
          ) : (
            <div className="mt-3 text-xs text-gray-400">No Slack message returned (yet).</div>
          )}
        </div>
      ) : null}

      {tab === 'tasks' ? (
        <div className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-4">
          <div className="text-sm font-semibold text-white">Top task (preview)</div>
          <div className="text-sm text-gray-100 font-medium mt-2">{topTaskTitle}</div>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
            {topTaskDue ? <span>Due: {topTaskDue}</span> : null}
            {topTaskPriority ? <span>Priority: {topTaskPriority}</span> : null}
            {tasks.length > 1 ? <span>{tasks.length} tasks generated</span> : null}
          </div>
          {topTaskDesc ? (
            <pre className="mt-3 text-xs text-gray-300 whitespace-pre-wrap bg-black/20 border border-gray-800/50 rounded-lg p-3 max-h-64 overflow-auto">
              {topTaskDesc}
            </pre>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {isSimulation ? (
          <>
            <Button size="sm" onClick={() => sendMessage('Confirm')} disabled={isLoading} className="gap-2">
              <CheckSquare className="w-4 h-4" />
              Run follow-up pack
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => sendMessage('Edit the email draft')} 
              disabled={isLoading} 
              className="gap-2"
            >
              <Pencil className="w-4 h-4" />
              Edit
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => sendMessage('Cancel, I don\'t want to send this')} 
              disabled={isLoading} 
              className="gap-2 text-gray-400 hover:text-gray-200"
            >
              <X className="w-4 h-4" />
              Cancel
            </Button>
          </>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (onActionClick) return onActionClick({ action: 'open_task', data: {} });
              window.location.href = '/tasks';
            }}
            className="gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            View tasks
          </Button>
        )}
      </div>
    </div>
  );
}

