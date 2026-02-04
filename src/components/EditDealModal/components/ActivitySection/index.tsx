import React, { useState, useRef, useEffect } from 'react';
import { Users, PencilLine, Calendar, PhoneCall, Mail, Plus, Clock, AlertCircle, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '../../../ui/badge';
import ActivityItem from './ActivityItem';
import { DealActivity } from '@/lib/database/models';
import { useEditDeal } from '../../contexts/EditDealContext';
import { useFormContext } from 'react-hook-form';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { format, addDays, addHours } from 'date-fns';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import logger from '@/lib/utils/logger';

interface ActivitySectionProps {
  dealId?: string;
}

const ActivitySection: React.FC<ActivitySectionProps> = ({ dealId }) => {
  const [activityNote, setActivityNote] = useState('');
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showCallForm, setShowCallForm] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { watch } = useFormContext();
  
  // Get deal and contact information from form
  const dealName = watch('name');
  const contactName = watch('contactName');
  const contactEmail = watch('contactEmail');
  const company = watch('company');
  
  // Simple state for activities and notes
  const [activities, setActivities] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentNotes, setRecentNotes] = useState<string[]>([]);

  // Function to extract recent notes from deal notes
  const extractRecentNotes = (notesText: string) => {
    if (!notesText) return [];
    const lines = notesText.split('\n').filter(line => line.trim());
    const noteLines = lines.filter(line => line.match(/^\d{1,2}\/\d{1,2}\/\d{4}:/));
    return noteLines.slice(0, 3); // Show last 3 notes
  };

  // Load recent notes when component mounts
  useEffect(() => {
    const loadRecentNotes = async () => {
      if (!dealId) return;
      
      try {
        const { data: deal } = await (supabase as any)
          .from('deals')
          .select('notes')
          .eq('id', dealId)
          .single();
        
        if (deal?.notes) {
          setRecentNotes(extractRecentNotes(deal.notes));
        }
      } catch (error) {
        logger.error('Error loading recent notes:', error);
      }
    };

    loadRecentNotes();
  }, [dealId]);

  // Simplified activity creation functions using direct database calls
  const createDealActivity = async (activityData: {
    activity_type: string;
    notes?: string;
    due_date?: string;
    contact_email?: string;
  }): Promise<void> => {
    if (!dealId) {
      toast.error('No deal ID available');
      return;
    }

    try {
      logger.log('Creating activity:', { activityData, dealId });
      
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        throw new Error('User not authenticated');
      }

      logger.log('User authenticated:', userData.user.email);

      // Use simple user email as sales rep name
      const salesRepName = userData.user.email || 'Unknown Rep';

      if (activityData.activity_type === 'note') {
        logger.log('Adding note to deal...');
        
        // For notes, get current notes and append new one
        const { data: currentDeal, error: fetchError } = await (supabase as any)
          .from('deals')
          .select('notes')
          .eq('id', dealId)
          .single();

        if (fetchError) {
          logger.error('Error fetching current deal:', fetchError);
          throw fetchError;
        }

        logger.log('Current deal notes:', currentDeal?.notes);

        const currentNotes = currentDeal?.notes || '';
        const newNote = `${new Date().toLocaleDateString()}: ${activityData.notes}\n\n${currentNotes}`;
        
        const { error: updateError } = await (supabase as any)
          .from('deals')
          .update({ notes: newNote })
          .eq('id', dealId);

        if (updateError) {
          logger.error('Error updating deal notes:', updateError);
          throw updateError;
        }

        logger.log('Note added successfully');
        toast.success('Note added to deal');
        
        // Refresh recent notes display
        setRecentNotes(extractRecentNotes(newNote));
        return;
        
      } else if (activityData.activity_type === 'task') {
        logger.log('Creating task in tasks table...');
        
        // For tasks, create in the tasks table (not activities table)
        const { error: taskError } = await (supabase as any)
          .from('tasks')
          .insert({
            title: activityData.notes,
            description: `Task created from deal: ${dealName || 'Untitled Deal'}\nCompany: ${company || 'Unknown'}\nContact: ${contactName || contactEmail || 'Unknown'}`,
            due_date: activityData.due_date,
            priority: 'medium',
            task_type: 'follow_up',
            status: 'pending',
            assigned_to: userData.user.id,
            created_by: userData.user.id,
            deal_id: dealId,
            contact_email: contactEmail,
            contact_name: contactName,
            company: company,
            completed: false
          });

        if (taskError) {
          logger.error('Error creating task:', taskError);
          throw taskError;
        }

        // Also create an activity record for dashboard tracking
        const { error: activityError } = await (supabase as any)
          .from('activities')
          .insert({
            user_id: userData.user.id,
            type: 'outbound',
            status: 'pending',
            priority: 'medium',
            client_name: company || 'Unknown Company',
            sales_rep: salesRepName,
            details: `Task scheduled: ${activityData.notes}${activityData.due_date ? ` (Due: ${new Date(activityData.due_date).toLocaleDateString()})` : ''}`,
            date: new Date().toISOString()
          });

        // Don't fail if activity creation fails (tasks table is more important)
        if (activityError) {
          logger.warn('Activity record creation failed, but task was created successfully:', activityError);
        }

        logger.log('Task created successfully');
        toast.success('Task scheduled and added to task list');
        return;
        
      } else if (activityData.activity_type === 'call' || activityData.activity_type === 'email') {
        logger.log(`Creating ${activityData.activity_type} activity...`);
        
        // For calls and emails, add to main activities as outbound
        const basicData = {
          user_id: userData.user.id,
          type: 'outbound',
          status: 'completed',
          priority: 'medium',
          client_name: company || 'Unknown Company',
          sales_rep: salesRepName,
          details: `${activityData.activity_type === 'call' ? 'Call' : 'Email'}: ${activityData.notes || 'No details provided'}`,
          date: new Date().toISOString()
        };

        // Try to add enhanced tracking columns
        const enhancedData = {
          ...basicData,
          deal_id: dealId,
          contact_identifier: contactEmail,
          contact_identifier_type: 'email',
          quantity: 1
        };

        let { error: insertError } = await (supabase as any)
          .from('activities')
          .insert(enhancedData);

        // If enhanced insert fails, try basic insert
        if (insertError && insertError.message?.includes('column')) {
          logger.log('Enhanced columns not available, trying basic insert...');
          const { error: basicError } = await (supabase as any)
            .from('activities')
            .insert(basicData);
          insertError = basicError;
        }

        if (insertError) {
          logger.error(`Error creating ${activityData.activity_type} activity:`, insertError);
          throw insertError;
        }

        logger.log(`${activityData.activity_type} activity created successfully`);
        toast.success(`${activityData.activity_type === 'call' ? 'Call' : 'Email'} logged successfully and added to activity tracking`);
        return;
      }
      
    } catch (error: any) {
      logger.error('Error creating activity:', error);
      toast.error(`Failed to add activity: ${error?.message || 'Unknown error'}`);
    }
  };
  
  // Display loading state
  if (isLoading) {
    return (
      <div id="activity-section" role="tabpanel" aria-labelledby="tab-activity">
        <SectionHeading icon={<Users className="w-4 h-4" />} title="Deal Activity" />
        <div className="py-8 text-center text-gray-500">
          Loading activities...
        </div>
      </div>
    );
  }
  
  // Display error state
  if (error) {
    return (
      <div id="activity-section" role="tabpanel" aria-labelledby="tab-activity">
        <SectionHeading icon={<Users className="w-4 h-4" />} title="Deal Activity" />
        <div className="py-8 text-center text-red-500">
          Error loading activities. Please try again.
        </div>
      </div>
    );
  }
  
  // Handle adding a note
  const handleAddNote = async (e?: React.MouseEvent) => {
    logger.log('handleAddNote called');
    if (e) {
      e.preventDefault();
      e.stopPropagation();
      logger.log('Event prevented and stopped');
    }
    
    if (activityNote.trim() && dealId) {
      logger.log('About to create note activity');
      await createDealActivity({
        activity_type: 'note',
        notes: activityNote.trim()
      });
      
      setActivityNote('');
      
      // Focus back on textarea after adding note
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    } else {
      logger.log('Note not added - missing note or dealId:', { note: activityNote.trim(), dealId });
    }
  };

  // Handle scheduling a task
  const handleScheduleTask = (e?: React.MouseEvent) => {
    logger.log('handleScheduleTask called');
    if (e) {
      e.preventDefault();
      e.stopPropagation();
      logger.log('Event prevented and stopped');
    }
    setShowTaskForm(true);
  };

  // Handle logging a call
  const handleLogCall = (e?: React.MouseEvent) => {
    logger.log('handleLogCall called');
    if (e) {
      e.preventDefault();
      e.stopPropagation();
      logger.log('Event prevented and stopped');
    }
    setShowCallForm(true);
  };

  // Handle logging an email
  const handleLogEmail = (e?: React.MouseEvent) => {
    logger.log('handleLogEmail called');
    if (e) {
      e.preventDefault();
      e.stopPropagation();
      logger.log('Event prevented and stopped');
    }
    setShowEmailForm(true);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Submit on Ctrl/Cmd + Enter
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleAddNote();
    }
  };
  
  return (
    <div id="activity-section" role="tabpanel" aria-labelledby="tab-activity">
      <SectionHeading 
        icon={<Users className="w-4 h-4" />} 
        title="Deal Activity"
      />
      
      <div className="mb-6">
        <label 
          htmlFor="activityNote" 
          className="block text-sm font-medium text-gray-300 mb-3"
        >
          Add Activity Note
        </label>
        <div className="relative mb-4">
          <div className="absolute left-3 top-3 text-gray-400">
            <PencilLine className="w-4 h-4" />
          </div>
          <textarea
            id="activityNote"
            ref={textareaRef}
            className="w-full p-3 pl-10 bg-gray-800/50 border border-gray-700/50 
              rounded-xl focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 focus:outline-none transition-all duration-200
              text-gray-100 placeholder-gray-500 resize-vertical backdrop-blur-sm"
            value={activityNote}
            onChange={(e) => setActivityNote(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a note about this deal..."
            rows={3}
            aria-label="Add a note about this deal"
          />
          <div className="absolute bottom-2 right-2 text-xs text-gray-500">
            Ctrl+Enter to save
          </div>
        </div>
        
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            size="sm"
            onClick={handleAddNote}
            disabled={!activityNote.trim() || !dealId}
            className="gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 
              text-white border-0 shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
          >
            <PencilLine className="w-4 h-4" />
            Add Note
          </Button>
          
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 bg-gray-800/50 border-gray-700/50 text-gray-300 hover:bg-gray-700/50 hover:text-white
              hover:border-blue-500/50 transition-all duration-200 backdrop-blur-sm"
            onClick={handleScheduleTask}
          >
            <Calendar className="w-4 h-4" />
            Schedule Task
          </Button>
          
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 bg-gray-800/50 border-gray-700/50 text-gray-300 hover:bg-gray-700/50 hover:text-white
              hover:border-green-500/50 transition-all duration-200 backdrop-blur-sm"
            onClick={handleLogCall}
          >
            <PhoneCall className="w-4 h-4" />
            Log Call
          </Button>
          
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 bg-gray-800/50 border-gray-700/50 text-gray-300 hover:bg-gray-700/50 hover:text-white
              hover:border-orange-500/50 transition-all duration-200 backdrop-blur-sm"
            onClick={handleLogEmail}
          >
            <Mail className="w-4 h-4" />
            Log Email
          </Button>
        </div>
      </div>
      
      {/* Activities List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-lg font-semibold text-gray-200">Recent Activity</h4>
        </div>
        
        {/* Recent Notes */}
        {recentNotes.length > 0 && (
          <div className="space-y-3">
            <h5 className="text-sm font-medium text-gray-400 uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Recent Notes
            </h5>
            <div className="space-y-2">
              {recentNotes.map((note, index) => (
                <div key={index} className="group relative">
                  <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/40 dark:to-gray-900/40 border border-gray-200 dark:border-gray-700/30 rounded-xl p-4 
                    backdrop-blur-sm hover:border-gray-600/50 transition-all duration-200 hover:shadow-lg">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 bg-violet-500/10 rounded-lg flex items-center justify-center">
                        <FileText className="w-4 h-4 text-violet-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-200 leading-relaxed">{note}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Activity Tracking Info */}
        <div className="bg-gradient-to-r from-blue-900/20 to-indigo-900/20 border border-blue-500/20 rounded-xl p-4 backdrop-blur-sm">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
              <FileText className="w-4 h-4 text-blue-400" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-blue-200 mb-2">Activity Logging Active</p>
              <div className="space-y-1 text-sm text-blue-300/80">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-violet-400 rounded-full"></div>
                  <span><strong className="text-violet-300">Notes</strong> appear above and are saved to this deal</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
                  <span><strong className="text-blue-300">Tasks</strong> are added to your Task List</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-green-400 rounded-full"></div>
                  <span><strong className="text-green-300">Calls & Emails</strong> are logged to your Activity Dashboard</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Task Form Modal */}
      {showTaskForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <TaskForm 
            dealId={dealId}
            contactName={contactName}
            contactEmail={contactEmail}
            company={company}
            onClose={() => setShowTaskForm(false)}
            onSubmit={createDealActivity}
          />
        </div>
      )}

      {/* Call Log Form Modal */}
      {showCallForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <CallLogForm 
            dealId={dealId}
            contactName={contactName}
            contactEmail={contactEmail}
            company={company}
            onClose={() => setShowCallForm(false)}
            onSubmit={createDealActivity}
          />
        </div>
      )}

      {/* Email Log Form Modal */}
      {showEmailForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <EmailLogForm 
            dealId={dealId}
            contactName={contactName}
            contactEmail={contactEmail}
            company={company}
            onClose={() => setShowEmailForm(false)}
            onSubmit={createDealActivity}
          />
        </div>
      )}
    </div>
  );
};

// Task Form Component
const TaskForm: React.FC<{
  dealId?: string;
  contactName?: string;
  contactEmail?: string;
  company?: string;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
}> = ({ dealId, contactName, contactEmail, company, onClose, onSubmit }) => {
  const [taskTitle, setTaskTitle] = useState('');
  const [taskNotes, setTaskNotes] = useState('');
  const [dueDate, setDueDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [dueTime, setDueTime] = useState('09:00');
  const [priority, setPriority] = useState('medium');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;

    const dueDatetime = `${dueDate}T${dueTime}:00`;
    
    await onSubmit({
      activity_type: 'task',
      notes: `Task: ${taskTitle}\n\nNotes: ${taskNotes}\n\nPriority: ${priority}`,
      due_date: dueDatetime,
      contact_email: contactEmail
    });
    
    onClose();
  };

  return (
    <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800 rounded-xl p-6 w-full max-w-md mx-4 border border-gray-200 dark:border-gray-700/50 shadow-2xl backdrop-blur-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
          <Calendar className="w-5 h-5 text-blue-400" />
        </div>
        <h3 className="text-xl font-semibold text-white">Schedule Task</h3>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Task Title</label>
          <Input
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            placeholder="Enter task title..."
            className="bg-gray-800/50 border-gray-700/50 text-white placeholder-gray-400 
              focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 rounded-lg"
            required
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Notes</label>
          <textarea
            value={taskNotes}
            onChange={(e) => setTaskNotes(e.target.value)}
            placeholder="Additional notes..."
            className="w-full p-3 bg-gray-800/50 border border-gray-700/50 rounded-lg text-white placeholder-gray-400
              focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
            rows={3}
          />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Due Date</label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="bg-gray-800/50 border-gray-700/50 text-white
                focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Due Time</label>
            <Input
              type="time"
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
              className="bg-gray-800/50 border-gray-700/50 text-white
                focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 rounded-lg"
            />
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Priority</label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="bg-gray-800/50 border-gray-700/50 text-white hover:bg-gray-700/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-gray-700">
              <SelectItem value="low" className="text-gray-300 hover:bg-gray-700">Low</SelectItem>
              <SelectItem value="medium" className="text-gray-300 hover:bg-gray-700">Medium</SelectItem>
              <SelectItem value="high" className="text-gray-300 hover:bg-gray-700">High</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex gap-3 pt-4">
          <Button 
            type="submit" 
            className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700
              text-white border-0 shadow-lg hover:shadow-xl transition-all duration-200"
          >
            <Calendar className="w-4 h-4 mr-2" />
            Schedule Task
          </Button>
          <Button 
            type="button" 
            variant="outline" 
            onClick={onClose}
            className="bg-gray-800/50 border-gray-700/50 text-gray-300 hover:bg-gray-700/50 hover:text-white"
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
};

// Call Log Form Component
const CallLogForm: React.FC<{
  dealId?: string;
  contactName?: string;
  contactEmail?: string;
  company?: string;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
}> = ({ dealId, contactName, contactEmail, company, onClose, onSubmit }) => {
  const [callNotes, setCallNotes] = useState('');
  const [outcome, setOutcome] = useState('');
  const [duration, setDuration] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!callNotes.trim()) return;

    await onSubmit({
      activity_type: 'call',
      notes: `Call with ${contactName || contactEmail}\n\nOutcome: ${outcome}\nDuration: ${duration} minutes\n\nNotes: ${callNotes}`,
      contact_email: contactEmail
    });
    
    onClose();
  };

  return (
    <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800 rounded-xl p-6 w-full max-w-md mx-4 border border-gray-200 dark:border-gray-700/50 shadow-2xl backdrop-blur-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
          <PhoneCall className="w-5 h-5 text-green-400" />
        </div>
        <h3 className="text-xl font-semibold text-white">Log Call</h3>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Call Outcome</label>
          <Select value={outcome} onValueChange={setOutcome}>
            <SelectTrigger className="bg-gray-800/50 border-gray-700/50 text-white hover:bg-gray-700/50">
              <SelectValue placeholder="Select outcome..." />
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-gray-700">
              <SelectItem value="connected" className="text-gray-300 hover:bg-gray-700">Connected</SelectItem>
              <SelectItem value="voicemail" className="text-gray-300 hover:bg-gray-700">Left Voicemail</SelectItem>
              <SelectItem value="no-answer" className="text-gray-300 hover:bg-gray-700">No Answer</SelectItem>
              <SelectItem value="busy" className="text-gray-300 hover:bg-gray-700">Busy</SelectItem>
              <SelectItem value="meeting-scheduled" className="text-gray-300 hover:bg-gray-700">Meeting Scheduled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Duration (minutes)</label>
          <Input
            type="number"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="5"
            className="bg-gray-800/50 border-gray-700/50 text-white placeholder-gray-400
              focus:border-green-500/50 focus:ring-2 focus:ring-green-500/20 rounded-lg"
            min="1"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Call Notes</label>
          <textarea
            value={callNotes}
            onChange={(e) => setCallNotes(e.target.value)}
            placeholder="What was discussed during the call..."
            className="w-full p-3 bg-gray-800/50 border border-gray-700/50 rounded-lg text-white placeholder-gray-400
              focus:border-green-500/50 focus:ring-2 focus:ring-green-500/20 transition-all duration-200"
            rows={4}
            required
          />
        </div>
        
        <div className="flex gap-3 pt-4">
          <Button 
            type="submit" 
            className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700
              text-white border-0 shadow-lg hover:shadow-xl transition-all duration-200"
          >
            <PhoneCall className="w-4 h-4 mr-2" />
            Log Call
          </Button>
          <Button 
            type="button" 
            variant="outline" 
            onClick={onClose}
            className="bg-gray-800/50 border-gray-700/50 text-gray-300 hover:bg-gray-700/50 hover:text-white"
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
};

// Email Log Form Component
const EmailLogForm: React.FC<{
  dealId?: string;
  contactName?: string;
  contactEmail?: string;
  company?: string;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
}> = ({ dealId, contactName, contactEmail, company, onClose, onSubmit }) => {
  const [subject, setSubject] = useState('');
  const [direction, setDirection] = useState('outbound');
  const [emailNotes, setEmailNotes] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !emailNotes.trim()) return;

    await onSubmit({
      activity_type: 'email',
      notes: `Email ${direction} - ${contactName || contactEmail}\n\nSubject: ${subject}\n\nNotes: ${emailNotes}`,
      contact_email: contactEmail
    });
    
    onClose();
  };

  return (
    <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800 rounded-xl p-6 w-full max-w-md mx-4 border border-gray-200 dark:border-gray-700/50 shadow-2xl backdrop-blur-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-orange-500/10 rounded-lg flex items-center justify-center">
          <Mail className="w-5 h-5 text-orange-400" />
        </div>
        <h3 className="text-xl font-semibold text-white">Log Email</h3>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Direction</label>
          <Select value={direction} onValueChange={setDirection}>
            <SelectTrigger className="bg-gray-800/50 border-gray-700/50 text-white hover:bg-gray-700/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-gray-700">
              <SelectItem value="outbound" className="text-gray-300 hover:bg-gray-700">Sent Email</SelectItem>
              <SelectItem value="inbound" className="text-gray-300 hover:bg-gray-700">Received Email</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Subject</label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject..."
            className="bg-gray-800/50 border-gray-700/50 text-white placeholder-gray-400
              focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20 rounded-lg"
            required
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Email Summary</label>
          <textarea
            value={emailNotes}
            onChange={(e) => setEmailNotes(e.target.value)}
            placeholder="Summary of the email content and any follow-up actions..."
            className="w-full p-3 bg-gray-800/50 border border-gray-700/50 rounded-lg text-white placeholder-gray-400
              focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20 transition-all duration-200"
            rows={4}
            required
          />
        </div>
        
        <div className="flex gap-3 pt-4">
          <Button 
            type="submit" 
            className="flex-1 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700
              text-white border-0 shadow-lg hover:shadow-xl transition-all duration-200"
          >
            <Mail className="w-4 h-4 mr-2" />
            Log Email
          </Button>
          <Button 
            type="button" 
            variant="outline" 
            onClick={onClose}
            className="bg-gray-800/50 border-gray-700/50 text-gray-300 hover:bg-gray-700/50 hover:text-white"
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
};

// Helper function to get activity title
const getActivityTitle = (activity: any): string => {
  switch (activity.activity_type) {
    case 'note':
      return 'Note added';
    case 'call':
      return 'Call logged';
    case 'email':
      return 'Email logged';
    case 'meeting':
      return 'Meeting scheduled';
    case 'task':
      return 'Task created';
    case 'stage_change':
      return 'Stage changed';
    default:
      return 'Activity recorded';
  }
};

// Helper component
interface SectionHeadingProps {
  icon: React.ReactNode;
  title: string;
}

const SectionHeading: React.FC<SectionHeadingProps> = ({ icon, title }) => (
  <div className="flex items-center gap-3 mb-6">
    <div className="w-8 h-8 bg-violet-500/10 rounded-lg flex items-center justify-center">
      {icon}
    </div>
    <h2 className="text-xl font-semibold text-gray-200">{title}</h2>
  </div>
);

export default ActivitySection; 