import React, { useState, useEffect } from 'react';
import { format, addDays, addWeeks, addMonths, isToday, isTomorrow, startOfWeek, addMinutes, setHours, setMinutes, startOfDay } from 'date-fns';
import { Calendar, Clock, User, Target, Star, Save, X, Zap, Plus, Search, ChevronLeft, ChevronRight } from 'lucide-react';

import { Task } from '@/lib/database/models';
import { useTasks } from '@/lib/hooks/useTasks';
import { useUser } from '@/lib/hooks/useUser';
import { useUsers } from '@/lib/hooks/useUsers';
import { useContacts } from '@/lib/hooks/useContacts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import logger from '@/lib/utils/logger';

interface TaskFormProps {
  task?: Task;
  isOpen: boolean;
  onClose: () => void;
  onTaskCreated?: (task: Task) => void;
  dealId?: string;
  companyId?: string;
  contactId?: string;
  contactEmail?: string;
  contactName?: string;
  company?: string;
}

interface SimpleTaskFormData {
  title: string;
  description: string;
  task_type: Task['task_type'];
  priority: Task['priority'];
  due_date: string;
  assigned_to: string;
  // Optional context - simplified
  deal_id: string;
  contact_name: string;
  company: string;
}

const TaskForm: React.FC<TaskFormProps> = ({
  task,
  isOpen,
  onClose,
  onTaskCreated,
  dealId = '',
  companyId = '',
  contactId = '',
  contactEmail = '',
  contactName = '',
  company = ''
}) => {
  const { userData, isLoading: isUserLoading } = useUser();
  const { users } = useUsers();
  const { contacts } = useContacts();
  const { createTask, updateTask } = useTasks();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState<SimpleTaskFormData>({
    title: '',
    description: '',
    task_type: 'call',
    priority: 'medium',
    due_date: '',
    assigned_to: userData?.id || '',
    deal_id: dealId,
    contact_name: contactName,
    company: company
  });

  // Contact search states
  const [isClientSelected, setIsClientSelected] = useState(false);
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [searchedContacts, setSearchedContacts] = useState<any[]>([]);
  const [selectedContact, setSelectedContact] = useState<any>(null);

  // Date picker states
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState('09:00');
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // Quick due date options
  const quickDueDates = [
    { label: 'Today', value: format(new Date(), "yyyy-MM-dd'T'09:00") },
    { label: 'Tomorrow', value: format(addDays(new Date(), 1), "yyyy-MM-dd'T'09:00") },
    { label: 'Next Week', value: format(addDays(new Date(), 7), "yyyy-MM-dd'T'09:00") },
  ];

  // Task type options with icons and colors
  const taskTypes = [
    { value: 'call', label: 'Phone Call', icon: '📞', color: 'bg-blue-500/20 text-blue-400' },
    { value: 'email', label: 'Email', icon: '✉️', color: 'bg-green-500/20 text-green-400' },
    { value: 'meeting', label: 'Meeting', icon: '🤝', color: 'bg-purple-500/20 text-purple-400' },
    { value: 'follow_up', label: 'Follow Up', icon: '🔄', color: 'bg-orange-500/20 text-orange-400' },
    { value: 'demo', label: 'Demo', icon: '🎯', color: 'bg-indigo-500/20 text-indigo-400' },
    { value: 'proposal', label: 'Proposal', icon: '📋', color: 'bg-yellow-500/20 text-yellow-400' },
    { value: 'general', label: 'General', icon: '⚡', color: 'bg-gray-500/20 text-gray-400' },
  ];

  // Priority options with visual indicators
  const priorities = [
    { value: 'low', label: 'Low', icon: '🟢', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
    { value: 'medium', label: 'Medium', icon: '🟡', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    { value: 'high', label: 'High', icon: '🟠', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
    { value: 'urgent', label: 'Urgent', icon: '🔴', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  ];

  // Update form data when task prop changes
  useEffect(() => {
    if (task) {
      const taskDate = task.due_date ? new Date(task.due_date) : undefined;
      setFormData({
        title: task.title,
        description: task.description || '',
        task_type: task.task_type,
        priority: task.priority,
        due_date: task.due_date ? format(taskDate!, "yyyy-MM-dd'T'HH:mm") : '',
        assigned_to: task.assigned_to,
        deal_id: task.deal_id || '',
        contact_name: task.contact_name || '',
        company: typeof task.company === 'object' && task.company !== null
          ? (task.company as any).name
          : (task.company || '')
      });
      
      // Update date picker states
      if (taskDate) {
        setSelectedDate(taskDate);
        setSelectedTime(format(taskDate, 'HH:mm'));
      }
      
      // If task has client assignment, set up contact selection state
      if (task.assigned_to === 'client') {
        setIsClientSelected(true);
        if (task.contact_name) {
          setSelectedContact({
            id: contactId,
            full_name: task.contact_name,
            email: contactEmail,
            company: task.company
          });
          setContactSearchQuery(task.contact_name);
        }
      }
    } else {
      // Reset for new task with provided context
      setFormData({
        title: '',
        description: '',
        task_type: 'call',
        priority: 'medium',
        due_date: '',
        assigned_to: userData?.id || 'current-user',
        deal_id: dealId,
        contact_name: contactName,
        company: company
      });
      
      // Reset date picker states
      setSelectedDate(undefined);
      setSelectedTime('09:00');
      
      // Reset contact selection states
      setIsClientSelected(false);
      setSelectedContact(null);
      setContactSearchQuery('');
      setSearchedContacts([]);
    }
  }, [task, userData?.id, dealId, contactName, company, contactId, contactEmail]);

  const handleInputChange = (field: keyof SimpleTaskFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Handle assignment change
  const handleAssignmentChange = (value: string) => {
    setFormData(prev => ({ ...prev, assigned_to: value }));
    
    // Check if client is selected
    const isClient = value === 'client';
    setIsClientSelected(isClient);
    
    if (isClient) {
      // If we have contact context (from contact page), automatically populate
      if (contactId && contactName) {
        setSelectedContact({
          id: contactId,
          full_name: contactName,
          email: contactEmail,
          company: company
        });
        setContactSearchQuery(contactName);
        
        // Update form data with current contact info
        setFormData(prev => ({
          ...prev,
          assigned_to: value,
          contact_name: contactName,
          company: company || ''
        }));
      } else {
        // No contact context, show search interface
        setSelectedContact(null);
        setContactSearchQuery('');
      }
      setSearchedContacts([]);
    } else {
      // Reset contact search states and clear contact data from form
      setContactSearchQuery('');
      setSearchedContacts([]);
      setSelectedContact(null);
      
      // Clear contact-related form data when switching away from client
      setFormData(prev => ({
        ...prev,
        assigned_to: value,
        contact_name: contactName || '', // Reset to original or empty
        company: company || '' // Reset to original or empty
      }));
    }
  };

  // Search contacts
  const handleContactSearch = async (query: string) => {
    setContactSearchQuery(query);
    
    if (query.length < 2) {
      setSearchedContacts([]);
      return;
    }
    
    try {
      const results = await contacts.filter(contact => 
        contact.full_name?.toLowerCase().includes(query.toLowerCase()) ||
        contact.first_name?.toLowerCase().includes(query.toLowerCase()) ||
        contact.last_name?.toLowerCase().includes(query.toLowerCase()) ||
        contact.email?.toLowerCase().includes(query.toLowerCase()) ||
        contact.company?.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 10);
      
      setSearchedContacts(results);
    } catch (error) {
      logger.error('Error searching contacts:', error);
      setSearchedContacts([]);
    }
  };

  // Select a contact from search results
  const handleContactSelect = (contact: any) => {
    setSelectedContact(contact);
    setContactSearchQuery(contact.full_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim());
    setSearchedContacts([]);
    
    // Update form data with contact info
    setFormData(prev => ({
      ...prev,
      contact_name: contact.full_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
      company: contact.company || prev.company
    }));
  };

  const handleQuickDate = (dateValue: string) => {
    setFormData(prev => ({
      ...prev,
      due_date: dateValue
    }));
    
    // Update the date picker states to match
    if (dateValue) {
      const date = new Date(dateValue);
      setSelectedDate(date);
      setSelectedTime(format(date, 'HH:mm'));
    }
  };

  // Enhanced date handling
  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    setIsCalendarOpen(false);
    
    if (date && selectedTime) {
      try {
        const [hours, minutes] = selectedTime.split(':');
        const dateWithTime = setHours(setMinutes(date, parseInt(minutes) || 0), parseInt(hours) || 9);
        const formattedDate = format(dateWithTime, "yyyy-MM-dd'T'HH:mm");
        
        setFormData(prev => ({
          ...prev,
          due_date: formattedDate
        }));
      } catch (error) {
        logger.error('Error setting date:', error);
        // Fallback to simple date format
        const fallbackDate = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}T${selectedTime}`;
        setFormData(prev => ({
          ...prev,
          due_date: fallbackDate
        }));
      }
    }
  };

  const handleTimeChange = (time: string) => {
    setSelectedTime(time);
    
    if (selectedDate) {
      try {
        const [hours, minutes] = time.split(':');
        const dateWithTime = setHours(setMinutes(selectedDate, parseInt(minutes) || 0), parseInt(hours) || 9);
        const formattedDate = format(dateWithTime, "yyyy-MM-dd'T'HH:mm");
        
        setFormData(prev => ({
          ...prev,
          due_date: formattedDate
        }));
      } catch (error) {
        logger.error('Error setting time:', error);
        // Fallback to simple date format
        const fallbackDate = `${selectedDate.getFullYear()}-${(selectedDate.getMonth() + 1).toString().padStart(2, '0')}-${selectedDate.getDate().toString().padStart(2, '0')}T${time}`;
        setFormData(prev => ({
          ...prev,
          due_date: fallbackDate
        }));
      }
    }
  };

  const getSmartQuickDates = () => {
    try {
      const now = new Date();
      const tomorrow = addDays(now, 1);
      const nextWeek = addDays(startOfWeek(addWeeks(now, 1)), 1); // Next Monday
      
      return [
        {
          label: 'In 1 Hour',
          value: format(addMinutes(now, 60), "yyyy-MM-dd'T'HH:mm"),
          icon: '⏰'
        },
        {
          label: 'End of Day',
          value: format(setHours(setMinutes(now, 0), 17), "yyyy-MM-dd'T'HH:mm"),
          icon: '🌅'
        },
        {
          label: 'Tomorrow 9 AM',
          value: format(setHours(setMinutes(tomorrow, 0), 9), "yyyy-MM-dd'T'HH:mm"),
          icon: '📅'
        },
        {
          label: 'Next Monday',
          value: format(setHours(setMinutes(nextWeek, 0), 9), "yyyy-MM-dd'T'HH:mm"),
          icon: '📆'
        }
      ];
    } catch (error) {
      logger.error('Error generating quick dates:', error);
      // Fallback to simple dates
      const now = new Date();
      return [
        {
          label: 'In 1 Hour',
          value: new Date(now.getTime() + 60 * 60 * 1000).toISOString().slice(0, 16),
          icon: '⏰'
        },
        {
          label: 'Tomorrow',
          value: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
          icon: '📅'
        }
      ];
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Debug user data
    logger.log('TaskForm handleSubmit - userData:', userData);
    logger.log('TaskForm handleSubmit - isUserLoading:', isUserLoading);
    
    if (!formData.title.trim()) {
      toast.error('Task title is required');
      return;
    }

    if (!formData.assigned_to) {
      toast.error('Please assign this task to someone');
      return;
    }

    if (formData.assigned_to === 'client' && !selectedContact) {
      toast.error('Please search and select a client contact');
      return;
    }

    // Check if user data is still loading
    if (isUserLoading || !userData) {
      toast.error('Please wait for user data to load');
      return;
    }

    setIsSubmitting(true);

    try {
      // Handle different assignment types
      const isClientAssignment = formData.assigned_to === 'client';
      const isSpecialUser = formData.assigned_to === 'steve' || formData.assigned_to === 'phil';
      
      // Get contact info if assigning to a client
      const assignedContact = isClientAssignment ? selectedContact : null;

      // Determine the actual assigned user ID
      let actualAssignedTo = formData.assigned_to;
      
      if (isClientAssignment) {
        // For client assignments, we'll assign to the current user but track the contact info
        actualAssignedTo = userData?.id || 'current-user';
      } else if (isSpecialUser) {
        // For special users like Steve and Phil, keep the string identifier
        actualAssignedTo = formData.assigned_to;
      } else if (formData.assigned_to === 'current-user') {
        // Handle fallback case when userData.id is not available
        actualAssignedTo = userData?.id || 'current-user';
      }

      const taskData = {
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        task_type: formData.task_type,
        priority: formData.priority,
        due_date: formData.due_date ? new Date(formData.due_date).toISOString() : undefined,
        assigned_to: actualAssignedTo,
        // Simplified context
        deal_id: formData.deal_id || undefined,
        contact_name: assignedContact ? 
          (assignedContact.full_name || `${assignedContact.first_name || ''} ${assignedContact.last_name || ''}`.trim()) :
          formData.contact_name.trim() || undefined,
        company: formData.company.trim() || undefined,
        // Default other fields
        contact_email: assignedContact?.email || contactEmail || undefined,
        company_id: assignedContact?.company_id || companyId || undefined,
        contact_id: assignedContact?.id || contactId || undefined,
        // Add notes for client assignments
        notes: isClientAssignment ? `Task assigned to client: ${assignedContact?.full_name || assignedContact?.email}` : undefined,
      };

      if (task) {
        await updateTask(task.id, taskData);
        toast.success('Task updated successfully');
      } else {
        const newTask = await createTask(taskData);
        logger.log('Task created successfully:', newTask);
        
        // Notify parent component of task creation
        if (onTaskCreated && newTask) {
          onTaskCreated(newTask);
        }
        
        if (isClientAssignment) {
          toast.success(`Task created and assigned to client: ${assignedContact?.full_name || 'contact'}`);
        } else if (isSpecialUser) {
          const userName = formData.assigned_to === 'steve' ? 'Steve' : 'Phil';
          toast.success(`Task created and assigned to ${userName}`);
        } else if (formData.assigned_to === userData?.id) {
          toast.success('Task created and assigned to you');
        } else {
          toast.success('Task created successfully');
        }
      }

      // Add a small delay to ensure the task list updates before closing the form
      setTimeout(() => {
        onClose();
      }, 100);
      
    } catch (error) {
      logger.error('Error saving task:', error);
      toast.error('Failed to save task. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedTaskType = taskTypes.find(t => t.value === formData.task_type);
  const selectedPriority = priorities.find(p => p.value === formData.priority);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="
        fixed inset-0 w-screen h-screen max-w-none !max-h-none rounded-none p-0 m-0
        sm:fixed sm:left-[50%] sm:top-[50%] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:right-auto sm:bottom-auto sm:w-full sm:h-auto sm:max-w-xl sm:max-h-[90vh] sm:rounded-xl sm:p-0 sm:m-0
        bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden flex flex-col
      ">
        <DialogHeader className="sr-only">
          <DialogTitle>{task ? 'Edit Task' : 'Create New Task'}</DialogTitle>
          <DialogDescription>
            {task ? 'Update your task details' : 'Set up a new task quickly and efficiently'}
          </DialogDescription>
        </DialogHeader>

        {/* Clean Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-br from-white to-gray-50 dark:from-gray-950 dark:to-gray-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
              <Plus className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {task ? 'Edit Task' : 'Create Task'}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {task ? 'Update task details' : 'Add a new task'}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg p-2"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Scrollable Form Content */}
        <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-950">
          <form id="task-form" onSubmit={handleSubmit} className="p-5 space-y-5">
            {/* Task Title */}
            <div className="space-y-2">
              <Label htmlFor="title" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Task Title *
              </Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="e.g., Call John about the proposal"
                className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white h-11 rounded-lg focus:border-blue-500 focus:ring-blue-500/20 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                required
              />
            </div>

            {/* Task Type & Priority Row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Type</Label>
                <Select value={formData.task_type} onValueChange={(value) => handleInputChange('task_type', value)}>
                  <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 h-10 rounded-lg text-gray-900 dark:text-white">
                    <SelectValue>
                      <div className="flex items-center gap-2">
                        <span>{selectedTaskType?.icon}</span>
                        <span className="text-sm">{selectedTaskType?.label}</span>
                      </div>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
                    {taskTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value} className="text-gray-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          <span>{type.icon}</span>
                          <span>{type.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Priority</Label>
                <Select value={formData.priority} onValueChange={(value) => handleInputChange('priority', value)}>
                  <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 h-10 rounded-lg text-gray-900 dark:text-white">
                    <SelectValue>
                      <div className="flex items-center gap-2">
                        <span>{selectedPriority?.icon}</span>
                        <span className="text-sm">{selectedPriority?.label}</span>
                      </div>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
                    {priorities.map((priority) => (
                      <SelectItem key={priority.value} value={priority.value} className="text-gray-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          <span>{priority.icon}</span>
                          <span>{priority.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Due Date */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Due Date</Label>
              
              {/* Quick Date Buttons */}
              <div className="grid grid-cols-4 gap-2 mb-3">
                {getSmartQuickDates().map((quick) => (
                  <Button
                    key={quick.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickDate(quick.value)}
                    className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 h-9 text-xs"
                  >
                    <span className="mr-1">{quick.icon}</span>
                    <span>{quick.label}</span>
                  </Button>
                ))}
              </div>
              
              {/* Date and Time Picker */}
              <div className="grid grid-cols-2 gap-3">
                <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 h-10 rounded-lg justify-start text-gray-900 dark:text-white"
                    >
                      <Calendar className="mr-2 h-4 w-4 text-gray-400" />
                      {selectedDate ? (
                        <span className="text-sm">
                          {format(selectedDate, 'MMM dd')}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">Date</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={selectedDate}
                      onSelect={handleDateSelect}
                      disabled={(date) => date < startOfDay(new Date())}
                      className="rounded-md"
                    />
                  </PopoverContent>
                </Popover>

                <Select value={selectedTime} onValueChange={handleTimeChange}>
                  <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 h-10 rounded-lg text-gray-900 dark:text-white">
                    <SelectValue>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-400" />
                        <span className="text-sm">{selectedTime}</span>
                      </div>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 max-h-64 overflow-y-auto">
                    {Array.from({ length: 24 }, (_, hour) => 
                      Array.from({ length: 4 }, (_, quarter) => {
                        const minutes = quarter * 15;
                        const time = `${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                        const displayTime = format(setMinutes(setHours(new Date(), hour), minutes), 'h:mm a');
                        if (!time || time.trim() === '') return null;
                        return (
                          <SelectItem key={time} value={time} className="text-gray-900 dark:text-white">
                            {displayTime}
                          </SelectItem>
                        );
                      })
                    ).flat().filter(Boolean)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Assignee */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Assign To *</Label>
              <Select value={formData.assigned_to} onValueChange={handleAssignmentChange}>
                <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 h-10 rounded-lg text-gray-900 dark:text-white">
                  <SelectValue placeholder="Choose someone..." />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
                  {/* Me Option */}
                  <SelectItem value={userData?.id || 'current-user'} className="text-gray-900 dark:text-white">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-gradient-to-br from-emerald-500 to-green-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                        ME
                      </div>
                      <span>Me</span>
                    </div>
                  </SelectItem>

                  {/* Client Option */}
                  <SelectItem value="client" className="text-gray-900 dark:text-white">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-gradient-to-br from-orange-500 to-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                        CL
                      </div>
                      <span>Client</span>
                    </div>
                  </SelectItem>

                  {/* Sales Team */}
                  <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Team
                  </div>
                  {users.filter(user => user.id !== userData?.id).map((user) => (
                    <SelectItem key={`user-${user.id}`} value={user.id} className="text-gray-900 dark:text-white">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                          {user.first_name?.[0]}{user.last_name?.[0]}
                        </div>
                        <span>{user.first_name} {user.last_name}</span>
                      </div>
                    </SelectItem>
                  ))}
                  <SelectItem value="steve" className="text-gray-900 dark:text-white">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                        ST
                      </div>
                      <span>Steve</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="phil" className="text-gray-900 dark:text-white">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                        PH
                      </div>
                      <span>Phil</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Contact Search - Only shown when Client is selected */}
            {isClientSelected && (
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Client Contact</Label>
                
                {selectedContact && contactId ? (
                  <div className="p-3 bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                        {selectedContact.full_name?.[0] || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {selectedContact.full_name}
                        </div>
                        {selectedContact.email && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{selectedContact.email}</div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <Input
                      value={contactSearchQuery}
                      onChange={(e) => handleContactSearch(e.target.value)}
                      placeholder="Search contacts..."
                      className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 h-10 rounded-lg text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                    />
                    
                    {searchedContacts.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                        {searchedContacts.map((contact) => (
                          <div
                            key={contact.id}
                            onClick={() => handleContactSelect(contact)}
                            className="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                          >
                            <div className="w-7 h-7 bg-gradient-to-br from-orange-500 to-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                              {contact.first_name?.[0] || contact.full_name?.[0] || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {contact.full_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim()}
                              </div>
                              {contact.email && (
                                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{contact.email}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {selectedContact && !contactId && (
                      <div className="mt-2 p-2 bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-gradient-to-br from-orange-500 to-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                            {selectedContact.full_name?.[0] || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {selectedContact.full_name}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Description (Optional)
              </Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Add any additional context..."
                rows={3}
                className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white resize-none rounded-lg placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
            </div>
          </form>
        </div>

        {/* Clean Footer */}
        <div className="flex items-center gap-2 p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="flex-1 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 h-9 rounded-lg text-sm font-medium"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="task-form"
            disabled={isSubmitting || isUserLoading}
            className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white h-9 rounded-lg text-sm font-medium shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                {task ? 'Updating...' : 'Creating...'}
              </>
            ) : isUserLoading ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                Loading...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                {task ? 'Update' : 'Create'}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TaskForm;