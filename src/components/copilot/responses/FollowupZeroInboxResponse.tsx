import React from 'react';
import { Mail, MessageSquare, CheckSquare, ExternalLink, Sparkles, AlertCircle, Clock, X, Pencil, SkipForward } from 'lucide-react';
import { motion } from 'framer-motion';
import type { FollowupZeroInboxResponse as FollowupZeroInboxResponseType } from '../types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCopilot } from '@/lib/contexts/CopilotContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Props {
  data: FollowupZeroInboxResponseType;
  onActionClick?: (action: any) => void;
}

export function FollowupZeroInboxResponse({ data }: Props) {
  const { sendMessage, isLoading } = useCopilot();
  const { emailThreads, triage, replyDrafts, emailPreview, taskPreview, isSimulation } = data.data;

  const threadsNeedingResponse = triage?.threads_needing_response || [];
  const priorities = triage?.priorities || [];
  const drafts = replyDrafts?.reply_drafts || [];
  const taskPreviews = replyDrafts?.task_previews || [];

  const topThread = threadsNeedingResponse[0];
  const topDraft = drafts[0];
  const topTask = taskPreview || taskPreviews[0];

  const emailSubject = emailPreview?.subject || topDraft?.subject || 'Follow-up';
  const emailBody = emailPreview?.body || topDraft?.context || 'No email body generated.';
  const emailTo = emailPreview?.to || topDraft?.to || 'No recipient';

  const taskTitle = topTask?.title ? String(topTask.title) : 'Follow-up task';
  const taskDescription = topTask?.description ? String(topTask.description) : '';
  const taskDueDate = topTask?.due_date ? String(topTask.due_date) : null;
  const taskPriority = topTask?.priority ? String(topTask.priority) : null;

  return (
    <motion.div 
      className="space-y-5" 
      data-testid="followup-zero-inbox-response"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-400" />
            <h3 className="text-base font-semibold text-white truncate">Follow-Up Zero Inbox</h3>
          </div>
          <p className="text-sm text-gray-300 mt-1">{data.summary}</p>
        </div>
        <div className={cn(
          'text-xs px-2 py-1 rounded-md border',
          isSimulation ? 'border-blue-500/30 bg-blue-500/10 text-blue-300' : 'border-green-500/30 bg-green-500/10 text-green-300'
        )}>
          {isSimulation ? 'Preview' : 'Created'}
        </div>
      </div>

      {/* Threads Summary */}
      {threadsNeedingResponse.length > 0 && (
        <div className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <div className="text-sm font-semibold text-white">
              {threadsNeedingResponse.length} Thread{threadsNeedingResponse.length !== 1 ? 's' : ''} Needing Response
            </div>
          </div>
          <div className="space-y-2">
            {threadsNeedingResponse.slice(0, 5).map((thread: any, index: number) => (
              <div key={index} className="flex items-start gap-2 p-2 rounded-lg bg-black/20 border border-gray-800/50">
                <div className={cn(
                  'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                  thread.urgency === 'high' ? 'bg-red-500' :
                  thread.urgency === 'medium' ? 'bg-orange-500' : 'bg-yellow-500'
                )} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-white truncate">{thread.subject || `Thread ${index + 1}`}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{thread.reason || thread.context || ''}</div>
                  {thread.last_message_date ? (
                    <div className="text-xs text-gray-500 mt-1 inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {thread.last_message_date}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Tabs defaultValue="email" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="drafts">Drafts</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
        </TabsList>
        <TabsContent value="email" className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-4 mt-3">
          <div className="flex items-center gap-2 mb-3">
            <Mail className="w-4 h-4 text-blue-400" />
            <div className="text-sm font-semibold text-white">Reply Email</div>
          </div>
          <div className="text-xs text-gray-400 mb-2">To: {emailTo}</div>
          <div className="text-sm text-gray-100 font-medium mb-2">Subject: {emailSubject}</div>
          <pre className="mt-3 text-xs text-gray-300 whitespace-pre-wrap bg-black/20 border border-gray-800/50 rounded-lg p-3 max-h-64 overflow-auto">
            {emailBody}
          </pre>
        </TabsContent>
        <TabsContent value="drafts" className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-4 mt-3">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="w-4 h-4 text-green-400" />
            <div className="text-sm font-semibold text-white">Reply Drafts</div>
          </div>
          <div className="space-y-3">
            {drafts.slice(0, 3).map((draft: any, index: number) => (
              <div key={index} className="p-3 rounded-lg bg-black/20 border border-gray-800/50">
                <div className="text-xs font-medium text-white mb-1">{draft.subject || `Draft ${index + 1}`}</div>
                <div className="text-xs text-gray-400 mb-2">To: {draft.to || 'No recipient'}</div>
                <pre className="text-xs text-gray-300 whitespace-pre-wrap max-h-32 overflow-auto">
                  {draft.context || 'No content'}
                </pre>
              </div>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="tasks" className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-4 mt-3">
          <div className="flex items-center gap-2 mb-3">
            <CheckSquare className="w-4 h-4 text-purple-400" />
            <div className="text-sm font-semibold text-white">Follow-Up Task</div>
          </div>
          <div className="text-sm text-gray-100 font-medium">{taskTitle}</div>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
            {taskDueDate ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Due: {taskDueDate}
              </span>
            ) : null}
            {taskPriority ? <span>Priority: {taskPriority}</span> : null}
          </div>
          {taskDescription ? (
            <pre className="mt-3 text-xs text-gray-300 whitespace-pre-wrap bg-black/20 border border-gray-800/50 rounded-lg p-3 max-h-48 overflow-auto">
              {taskDescription}
            </pre>
          ) : null}
        </TabsContent>
      </Tabs>

      {isSimulation && (
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button
            size="sm"
            onClick={() => sendMessage('Confirm')}
            disabled={isLoading}
            className="gap-2"
            data-testid="followup-zero-inbox-confirm-btn"
          >
            <CheckSquare className="w-4 h-4" />
            Create follow-up task
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
            variant="outline" 
            size="sm" 
            onClick={() => sendMessage("Skip this email, show me the next one")} 
            disabled={isLoading} 
            className="gap-2"
          >
            <SkipForward className="w-4 h-4" />
            Skip
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => sendMessage("Cancel, I don't want to send this")} 
            disabled={isLoading} 
            className="gap-2 text-gray-400 hover:text-gray-200"
          >
            <X className="w-4 h-4" />
            Cancel
          </Button>
        </div>
      )}
    </motion.div>
  );
}
