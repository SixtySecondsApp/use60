import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  X,
  Brain,
  Sparkles,
  ChevronRight,
  ArrowUp,
  Paperclip,
  Mic,
  PhoneCall,
  Users,
  FileText,
  PoundSterling,
  CheckSquare,
  Map
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { format, addDays, addWeeks } from 'date-fns';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

// Original imports for backward compatibility
import { useActivitiesActions } from '@/lib/hooks/useActivitiesActions';
import { useTasks } from '@/lib/hooks/useTasks';
import { useContacts } from '@/lib/hooks/useContacts';
import { useUser } from '@/lib/hooks/useUser';
import { useDealsActions } from '@/lib/hooks/useDealsActions';
import { useRoadmapActions } from '@/lib/hooks/useRoadmapActions';
import { ContactSearchModal } from '@/components/ContactSearchModal';
import logger from '@/lib/utils/logger';
import { supabase, authUtils } from '@/lib/supabase/clientV2';
import { sanitizeCrmForm, sanitizeNumber } from '@/lib/utils/inputSanitizer';
import { canSplitDeals } from '@/lib/utils/adminUtils';
import { ensureDealEntities } from '@/lib/services/entityResolutionService';

// New decoupling imports
import { 
  useEventListener, 
  useEventEmitter,
  eventBus 
} from '@/lib/communication/EventBus';
import {
  BaseComponent,
  IFormComponent
} from '@/lib/communication/ComponentInterfaces';
import {
  getServiceAdapter,
  ActivityServiceAdapter,
  TaskServiceAdapter,
  NotificationServiceAdapter
} from '@/lib/communication/ServiceAdapters';
import {
  useFormState as useDecoupledFormState,
  useModalState,
  useComponentState,
  useBusinessState
} from '@/lib/communication/StateManagement';
import {
  useComponentMediator,
  registerComponent
} from '@/lib/communication/ComponentMediator.tsx';

import { ActionGrid } from './ActionGrid';
import { TaskForm } from './TaskForm';
import { ActivityForms, OutboundForm } from './ActivityForms';
import { RoadmapForm } from './RoadmapForm';
import { useFormState } from './hooks/useFormState';
import { useQuickAddValidation } from './hooks/useQuickAddValidation';
import type { QuickAddFormData } from './types';

interface QuickAddProps {
  isOpen: boolean;
  onClose: () => void;
  variant?: 'v1' | 'v2';
  renderMode?: 'modal' | 'embedded';
  hideHeader?: boolean;
  prefill?: {
    preselectAction?: string;
    initialData?: Partial<QuickAddFormData>;
  };
}

function QuickAddComponent({
  isOpen,
  onClose,
  variant = 'v1',
  renderMode = 'modal',
  hideHeader = false,
  prefill,
}: QuickAddProps) {
  const { userData } = useUser();
  const { findDealsByClient, moveDealToStage } = useDealsActions();
  const { contacts, createContact, findContactByEmail } = useContacts();
  const { addActivity, addSale } = useActivitiesActions();
  const { createTask } = useTasks(undefined, { autoFetch: false });
  const { createSuggestion } = useRoadmapActions();
  const { validateForm } = useQuickAddValidation();
  
  // Original form state for backward compatibility
  const originalFormState = useFormState();
  
  // Decoupled state management (gradual migration)
  const decoupledFormState = useDecoupledFormState('quick-add');
  const componentState = useComponentState('quick-add');
  const businessState = useBusinessState();
  const emit = useEventEmitter();

  // Service adapters for gradual decoupling
  const taskServiceRef = useRef<TaskServiceAdapter>();
  const activityServiceRef = useRef<ActivityServiceAdapter>();
  const notificationServiceRef = useRef<NotificationServiceAdapter>();

  // Initialize service adapters
  useEffect(() => {
    try {
      taskServiceRef.current = getServiceAdapter<TaskServiceAdapter>('task');
      activityServiceRef.current = getServiceAdapter<ActivityServiceAdapter>('activity');
      notificationServiceRef.current = getServiceAdapter<NotificationServiceAdapter>('notification');
    } catch (error) {
      // Service adapters not available - fall back to original implementation
    }
  }, []);

  // Component registration with mediator
  // IMPORTANT: notify must NOT re-emit events to the EventBus.
  // The ComponentMediator subscribes to events and calls notify() on this component.
  // If notify() re-emits, it creates an infinite loop: emit → mediator → notify → emit → ...
  // QuickAdd already handles events via its own useEventListener subscriptions.
  const componentRef = useRef<IFormComponent>({
    async notify(_event, _data) {
      // No-op: events are handled by useEventListener subscriptions above.
      // Do NOT call emit() here — it causes an infinite event loop.
    },
    subscribe(event, handler) {
      return eventBus.on(event, handler);
    },
    async validate() {
      return validateForm(selectedAction, formData, selectedContact);
    },
    async submit() {
      return handleSubmit(new Event('submit') as any);
    },
    reset() {
      resetForm();
    },
    getData() {
      return formData;
    },
    updateField(field, value) {
      updateFormData({ [field]: value });
    }
  });

  // Register component once and keep registration stable
  useComponentMediator('quick-add', componentRef.current, {
    type: 'form',
    capabilities: ['form', 'modal', 'business-logic'],
    dependencies: ['deals', 'contacts', 'activities', 'tasks']
  });

  // Use original state management (maintained for compatibility)
  const {
    formData,
    setFormData,
    updateFormData,
    validationErrors,
    setValidationErrors,
    submitStatus,
    setSubmitStatus,
    isSubmitting,
    setIsSubmitting,
    resetForm
  } = originalFormState;

  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [existingDeal, setExistingDeal] = useState<any>(null);
  const [showDealChoice, setShowDealChoice] = useState(false);
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [showContactSearch, setShowContactSearch] = useState(false);
  
  // Ref to track if contact was just selected (to prevent race condition with onClose)
  const contactJustSelectedRef = useRef(false);

  // ============================================================
  // V2 (Chat-style UI) local state (presentation only)
  // ============================================================
  const [chatInput, setChatInput] = useState('');
  const [showQuickActionsV2, setShowQuickActionsV2] = useState(true);
  const [chatMessages, setChatMessages] = useState<Array<any>>([
    {
      type: 'ai',
      content: "Hey! I'm your AI assistant. Tell me what you need and I'll help you get it done. Try something like:",
      suggestions: [
        'Add a meeting with Jeremy Thomson',
        'Create a task to follow up by Friday',
        'Log 10 outbound calls today'
      ]
    }
  ]);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);

  const v2QuickActions = [
    { id: 'task', icon: CheckSquare, label: 'Add Task', color: 'text-blue-400', bg: 'bg-blue-500/10', shortcut: 'T' },
    { id: 'outbound', icon: PhoneCall, label: 'Add Outbound', color: 'text-sky-400', bg: 'bg-sky-500/10', shortcut: 'O' },
    { id: 'meeting', icon: Users, label: 'Add Meeting', color: 'text-violet-400', bg: 'bg-violet-500/10', shortcut: 'M' },
    { id: 'proposal', icon: FileText, label: 'Add Proposal', color: 'text-amber-400', bg: 'bg-amber-500/10', shortcut: 'P' },
    { id: 'sale', icon: PoundSterling, label: 'Add Sale', color: 'text-emerald-400', bg: 'bg-emerald-500/10', shortcut: 'S' },
    { id: 'roadmap', icon: Map, label: 'Add Roadmap', color: 'text-purple-400', bg: 'bg-purple-500/10', shortcut: 'R' },
  ] as const;

  const scrollChatToBottom = useCallback(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (variant !== 'v2') return;
    scrollChatToBottom();
  }, [variant, chatMessages, scrollChatToBottom]);

  useEffect(() => {
    if (variant !== 'v2') return;
    if (!isOpen) return;
    // Avoid stealing focus from form inputs when an action is active
    if (selectedAction || showContactSearch) return;
    setTimeout(() => chatInputRef.current?.focus(), 50);
  }, [variant, isOpen, selectedAction, showContactSearch]);

  // Prefill from external trigger
  useEventListener('modal:opened', ({ type, context }) => {
    if (type !== 'quick-add' || !context) return;
    if (context.preselectAction) {
      setSelectedAction(context.preselectAction);
    }
    if (context.initialData) {
      // Merge initial data into form
      updateFormData({
        ...(formData || {}),
        ...context.initialData
      });
    }

    // Best-effort: preselect contact if provided, otherwise do NOT force contact search.
    // We'll allow proceeding when meeting_id or company is present and show inline change contact.
    const initial = context.initialData || {};
    if (initial.contact_id) {
      (async () => {
        try {
          const { data: contact } = await supabase
            .from('contacts')
            .select('id, full_name, first_name, last_name, email')
            .eq('id', initial.contact_id)
            .single();
          if (contact) setSelectedContact(contact);
        } catch {
          // ignore; user can proceed without explicit contact
        }
      })();
    }
  }, [formData]);

  // Prefill from direct props (used for embedded Quick Add in Assistant overlay)
  const lastPrefillKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    if (!prefill) return;
    const key = JSON.stringify(prefill);
    if (lastPrefillKeyRef.current === key) return;
    lastPrefillKeyRef.current = key;

    if (prefill.preselectAction) {
      setSelectedAction(prefill.preselectAction);
      // For meeting/proposal/sale, also trigger contact search
      if (['meeting', 'proposal', 'sale'].includes(prefill.preselectAction)) {
        setShowContactSearch(true);
        if (variant === 'v2') {
          setShowQuickActionsV2(false);
        }
      }
    }
    if (prefill.initialData) {
      updateFormData({
        ...(formData || {}),
        ...prefill.initialData,
      });
    }
  }, [isOpen, prefill, formData, variant]);

  // Event-driven communication for decoupling
  useEventListener('contact:selected', ({ contact, context }) => {
    if (context === 'quick-add' || !context) {
      setSelectedContact(contact);
      businessState.setSelectedContact(contact);
      
      // Auto-populate form data directly
      setFormData(prev => ({
        ...prev,
        contact_name: contact.full_name || contact.email,
        contactIdentifier: contact.email,
        contactIdentifierType: 'email',
        client_name: contact.company || contact.companies?.name || ''
      }));
    }
  });

  useEventListener('deal:created', ({ id, name, stage }) => {
    updateFormData({ deal_id: id, selectedDeal: { id, name, stage } });
    emit('business:workflow-step', {
      workflow: 'quick-add-deal-creation',
      step: 'deal-linked',
      data: { dealId: id }
    });
  });

  useEventListener('ui:notification', ({ message, type }) => {
    // Integrate with existing toast system for backward compatibility
    const toastConfig = {
      duration: type === 'error' ? 5000 : 3000,
      icon: type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : 
            type === 'error' ? <AlertCircle className="w-4 h-4" /> :
            <Info className="w-4 h-4" />
    };

    switch (type) {
      case 'success':
        toast.success(message, toastConfig);
        break;
      case 'error':
        toast.error(message, toastConfig);
        break;
      case 'warning':
        toast.warning(message, toastConfig);
        break;
      default:
        toast(message, toastConfig);
    }
  });

  // Enhanced error handling with user-friendly messages
  const handleError = useCallback((error: any, actionType: string) => {
    logger.error(`Error in QuickAdd submission (${actionType}):`, error);
    
    setSubmitStatus('error');
    setIsSubmitting(false);
    
    // Handle authentication/authorization errors with specific guidance
    if (authUtils.isAuthError(error)) {
      const userMessage = authUtils.formatAuthError(error);
      toast.error(userMessage, { 
        duration: 6000,
        icon: <AlertCircle className="w-4 h-4" />,
      });
      
      // Provide specific guidance for contact/deal creation issues
      if (error.message?.includes('contacts') || error.message?.includes('permission')) {
        toast.error('Contact creation failed due to permissions. You may need to sign in again or contact support.', {
          duration: 8000,
          icon: <Info className="w-4 h-4" />,
          action: {
            label: 'Refresh Page',
            onClick: () => window.location.reload()
          }
        });
      }
      
      // If session appears to be invalid, offer to diagnose
      if (error.message?.includes('JWT') || error.message?.includes('session')) {
        authUtils.diagnoseSession().then(diagnosis => {
          if (!diagnosis.isValid) {
            logger.warn('Session diagnosis in QuickAdd:', diagnosis);
            toast.error(`Session issue detected: ${diagnosis.issues.join(', ')}. Please sign in again.`, {
              duration: 10000,
              icon: <AlertCircle className="w-4 h-4" />,
              action: {
                label: 'Sign Out',
                onClick: () => {
                  authUtils.clearAuthStorage();
                  window.location.href = '/auth';
                }
              }
            });
          }
        });
      }
    } else {
      // Generic error handling with better user experience
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast.error(`Failed to create ${actionType}: ${errorMessage}`, {
        duration: 5000,
        icon: <AlertCircle className="w-4 h-4" />,
      });
    }
  }, []);

  const handleClose = () => {
    setSelectedAction(null);
    setSelectedContact(null);
    setShowContactSearch(false);
    setSelectedDate(new Date());
    resetForm();
    // Reset V2 chat presentation state
    setChatInput('');
    setShowQuickActionsV2(true);
    setChatMessages([
      {
        type: 'ai',
        content: "Hey! I'm your AI assistant. Tell me what you need and I'll help you get it done. Try something like:",
        suggestions: [
          'Add a meeting with Jeremy Thomson',
          'Create a task to follow up by Friday',
          'Log 10 outbound calls today'
        ]
      }
    ]);
    onClose();
  };

  const handleActionSelect = (actionId: string) => {
    if (actionId === 'meeting' || actionId === 'proposal') {
      setSelectedAction(actionId);
      // Contact is required — show contact search first
      setShowContactSearch(true);
      if (variant === 'v2') {
        setShowQuickActionsV2(false);
        setChatMessages(prev => [
          ...prev,
          { type: 'user', content: `Add ${actionId}` },
          { type: 'ai', content: `Let's find a contact for your ${actionId}.` }
        ]);
      }
    } else if (actionId === 'sale') {
      setSelectedAction(actionId);
      // Contact is optional for sales
      if (variant === 'v2') {
        setShowQuickActionsV2(false);
        setChatMessages(prev => [
          ...prev,
          { type: 'user', content: `Add ${actionId}` },
          { type: 'ai', content: `Got it — fill in the details for your ${actionId}.` }
        ]);
      }
    } else if (actionId === 'outbound') {
      // Outbound can work with or without contacts
      setSelectedAction(actionId);
      // Don't automatically show contact search for outbound
      if (variant === 'v2') {
        setShowQuickActionsV2(false);
        setChatMessages(prev => [
          ...prev,
          { type: 'user', content: 'Add outbound' },
          { type: 'ai', content: 'Cool — tell me what outbound activity you did.' }
        ]);
      }
    } else {
      // Task, roadmap, and other actions don't need contact search
      setSelectedAction(actionId);
      if (variant === 'v2') {
        setShowQuickActionsV2(false);
        setChatMessages(prev => [
          ...prev,
          { type: 'user', content: `Add ${actionId}` },
          { type: 'ai', content: `Got it — let’s create your ${actionId}.` }
        ]);
      }
    }
  };

  const handleChatSend = () => {
    const text = chatInput.trim();
    if (!text) return;

    setChatMessages(prev => [...prev, { type: 'user', content: text }]);
    setChatInput('');
    setShowQuickActionsV2(false);

    const lower = text.toLowerCase();
    const inferredAction =
      lower.includes('outbound') || lower.includes('call') || lower.includes('calls') ? 'outbound' :
      lower.includes('meeting') ? 'meeting' :
      lower.includes('proposal') ? 'proposal' :
      lower.includes('sale') || lower.includes('won') || lower.includes('closed') ? 'sale' :
      lower.includes('roadmap') ? 'roadmap' :
      lower.includes('task') || lower.includes('todo') || lower.includes('to-do') ? 'task' :
      null;

    if (inferredAction) {
      // Use the existing flow — this is just a nicer entry point.
      handleActionSelect(inferredAction);
      return;
    }

    setChatMessages(prev => [
      ...prev,
      {
        type: 'ai',
        content: 'I can help with that — pick a Quick Add action below to continue.'
      }
    ]);
    setShowQuickActionsV2(true);
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSend();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clear previous errors
    setValidationErrors({});
    setSubmitStatus('idle');
    
    // Validate form
    const validation = validateForm(selectedAction, formData, selectedContact);
    if (!validation.isValid) {
      setValidationErrors(validation.errors);
      return;
    }
    
    setIsSubmitting(true);
    setSubmitStatus('idle');

    if (selectedAction === 'task') {
      try {
        // Sanitize task data for security
        const sanitizedFormData = sanitizeCrmForm(formData, 'activityForm');
        
        const taskData = {
          title: sanitizedFormData.title,
          description: sanitizedFormData.description,
          task_type: sanitizedFormData.task_type,
          priority: sanitizedFormData.priority,
          due_date: formData.due_date || undefined, // Date field - no sanitization needed
          assigned_to: userData?.id || '',
          contact_name: sanitizedFormData.contact_name || undefined,
          company_website: formData.company_website || undefined, // Will be URL sanitized if needed
        };

        // Try decoupled approach first, fallback to original
        if (taskServiceRef.current) {
          await taskServiceRef.current.execute('create', taskData);
          
          // Events will handle success notification
          await emit('task:created', {
            id: Date.now().toString(), // Temporary ID
            title: taskData.title,
            type: taskData.task_type
          });
        } else {
          // Fallback to original implementation
          await createTask(taskData);
          
          setSubmitStatus('success');
          setIsSubmitting(false);
          toast.success('Task created successfully!', {
            icon: <CheckCircle2 className="w-4 h-4" />,
          });
        }
        
        // Small delay to show success state
        setTimeout(() => {
          handleClose();
        }, 1000);
        
        return;
      } catch (error) {
        handleError(error, 'task');
        return;
      }
    }

    if (selectedAction === 'roadmap') {
      try {
        // Sanitize roadmap data for security
        const sanitizedFormData = sanitizeCrmForm(formData, 'activityForm');
        
        const roadmapData = {
          title: sanitizedFormData.title,
          description: sanitizedFormData.description,
          type: sanitizedFormData.roadmap_type,
          priority: (sanitizedFormData.priority === 'urgent' ? 'critical' : sanitizedFormData.priority || 'medium') as 'low' | 'high' | 'medium' | 'critical'
        };

        await createSuggestion(roadmapData);
        
        setSubmitStatus('success');
        setIsSubmitting(false);
        toast.success('Roadmap suggestion submitted successfully!', {
          icon: <CheckCircle2 className="w-4 h-4" />,
        });
        
        // Small delay to show success state
        setTimeout(() => {
          handleClose();
        }, 1000);
        
        return;
      } catch (error) {
        handleError(error, 'roadmap');
        return;
      }
    }
    
    // Contact is required for meeting and proposal
    if ((selectedAction === 'meeting' || selectedAction === 'proposal') && !selectedContact) {
      toast.error('Please select a contact for this activity');
      setShowContactSearch(true);
      return;
    }

    // Validation for meeting/proposal/sale - require company name OR website
    if ((selectedAction === 'meeting' || selectedAction === 'proposal' || selectedAction === 'sale')) {
      if ((!formData.client_name || formData.client_name.trim() === '') && 
          (!formData.company_website || formData.company_website.trim() === '')) {
        toast.error('Please enter either a company name or website');
        return;
      }
    }
    
    // Existing validation for other actions
    if (selectedAction === 'meeting' && !formData.details) {
      toast.error('Please select a meeting type');
      return;
    }
    
    // Outbound validation
    if (selectedAction === 'outbound') {
      if (!formData.outboundType) {
        toast.error('Please select an outbound activity type');
        return;
      }
      if (!formData.outboundCount || parseInt(formData.outboundCount) < 1) {
        toast.error('Please enter a valid quantity');
        return;
      }
    }
    
    // For unified flow (meeting/proposal/sale), use selected contact
    if ((selectedAction === 'meeting' || selectedAction === 'proposal' || selectedAction === 'sale') && selectedContact) {
      // Use selected contact info (if not already set)
      if (!formData.contactIdentifier) {
        updateFormData({
          contactIdentifier: selectedContact.email,
          contactIdentifierType: 'email'
        });
      }
      if (!formData.contact_name) {
        // Properly construct contact name with null checks
        const contactName = selectedContact.full_name || 
                           (selectedContact.first_name || selectedContact.last_name ? 
                            `${selectedContact.first_name || ''} ${selectedContact.last_name || ''}`.trim() : 
                            selectedContact.email);
        updateFormData({ contact_name: contactName });
      }
      // Set company info from contact if not already set
      if (!formData.client_name && selectedContact.company) {
        const companyName = typeof selectedContact.company === 'string' 
          ? selectedContact.company 
          : (selectedContact.company as any)?.name || '';
        updateFormData({ client_name: companyName });
      }
    }

    try {
      if (selectedAction === 'outbound') {
        const activityCount = parseInt(formData.outboundCount) || 1;
        logger.log(`📤 Creating outbound activity with quantity: ${activityCount}...`);
        
        // Build comprehensive details that shows the quantity
        const outboundDetails = [
          `${activityCount} ${formData.outboundType}${activityCount > 1 ? 's' : ''}`,
          formData.details
        ].filter(Boolean).join(' - ');

          await addActivity({
            type: 'outbound',
            client_name: formData.client_name || (selectedContact ? 
              `${selectedContact.first_name || ''} ${selectedContact.last_name || ''}`.trim() || selectedContact.email :
              'Bulk Outbound Session'),
            details: outboundDetails,
            quantity: activityCount, // Use 'quantity' field that Dashboard expects for stats
            date: selectedDate.toISOString(),
            deal_id: formData.deal_id,
            company_id: formData.company_id || null,
            contact_id: formData.contact_id || selectedContact?.id || null,
            // Only include identifier fields if contact is selected
            ...(selectedContact
              ? {
                  contactIdentifier: selectedContact.email,
                  contactIdentifierType: 'email' as const
                }
              : {})
          });
        
        logger.log(`✅ Outbound activity created with quantity: ${activityCount}`);
      } else if (selectedAction) {
        logger.log(`📝 Creating ${selectedAction} activity...`);
        
        // Store the final deal ID to use for activity creation
        let finalDealId = formData.deal_id;
        
        // For proposals, check if there's an existing deal in SQL stage for this client
        if (selectedAction === 'proposal' && !finalDealId && formData.client_name) {
          // Look for existing deals in SQL stage for this client
          const sqlStageId = '603b5020-aafc-4646-9195-9f041a9a3f14'; // SQL stage ID
          const existingDealsForClient = await findDealsByClient(formData.client_name, sqlStageId);
          
          if (existingDealsForClient.length > 0) {
            // Found an existing deal - ask user if they want to progress it
            const dealToProgress = existingDealsForClient[0]; // Take the first matching deal
            
            const shouldProgress = await new Promise<boolean>((resolve) => {
              // Create a modal to ask the user
              const modal = document.createElement('div');
              modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4';
              modal.innerHTML = `
                <div class="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-md w-full">
                  <h3 class="text-lg font-semibold text-white mb-3">Existing Deal Found</h3>
                  <p class="text-gray-300 mb-4">
                    Found an existing deal "<strong>${dealToProgress.name}</strong>" in SQL stage for ${formData.client_name}.
                  </p>
                  <p class="text-gray-400 text-sm mb-6">
                    Would you like to progress this deal to Opportunity stage, or create a new deal?
                  </p>
                  <div class="flex gap-3">
                    <button id="progress-deal" class="flex-1 py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors font-medium">
                      Progress Existing Deal
                    </button>
                    <button id="create-new" class="flex-1 py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors font-medium">
                      Create New Deal
                    </button>
                  </div>
                </div>
              `;
              
              document.body.appendChild(modal);
              
              const progressBtn = modal.querySelector('#progress-deal');
              const createNewBtn = modal.querySelector('#create-new');
              
              progressBtn?.addEventListener('click', () => {
                document.body.removeChild(modal);
                resolve(true);
              });
              
              createNewBtn?.addEventListener('click', () => {
                document.body.removeChild(modal);
                resolve(false);
              });
            });
            
            if (shouldProgress) {
              // Progress the existing deal to Opportunity stage
              const opportunityStageId = '8be6a854-e7d0-41b5-9057-03b2213e7697'; // Opportunity stage ID (corrected)
              
              try {
                await moveDealToStage(dealToProgress.id, opportunityStageId);
                finalDealId = dealToProgress.id;
                
                // Update the deal value if admin has provided revenue split
                if (canSplitDeals(userData)) {
                  const oneOff = parseFloat(formData.oneOffRevenue || '0') || 0;
                  const monthly = parseFloat(formData.monthlyMrr || '0') || 0;
                  if (oneOff > 0 || monthly > 0) {
                    const newValue = (monthly * 3) + oneOff; // LTV calculation
                    await ((supabase
                      .from('deals') as any)
                      .update({ value: newValue })
                      .eq('id', dealToProgress.id));
                  }
                }
                
                toast.success(`📈 Progressed "${dealToProgress.name}" to Opportunity stage`);
                logger.log(`✅ Progressed existing deal ${dealToProgress.id} to Opportunity stage`);
              } catch (error) {
                logger.error('Error progressing deal:', error);
                // Fall back to creating a new deal
              }
            }
          }
        }
        
        // For sales, check if there's an existing deal in Opportunity OR SQL stage for this client
        if (selectedAction === 'sale' && !finalDealId && formData.client_name) {
          // Look for existing deals in Opportunity stage first
          const opportunityStageId = '8be6a854-e7d0-41b5-9057-03b2213e7697'; // Opportunity stage ID
          const sqlStageId = '603b5020-aafc-4646-9195-9f041a9a3f14'; // SQL stage ID
          
          let existingDealsForClient = await findDealsByClient(formData.client_name, opportunityStageId);
          
          // If no deals in Opportunity, check SQL stage (meetings)
          if (existingDealsForClient.length === 0) {
            existingDealsForClient = await findDealsByClient(formData.client_name, sqlStageId);
          }
          
          if (existingDealsForClient.length > 0) {
            // Found an existing deal - ask user if they want to progress it
            const dealToProgress = existingDealsForClient[0]; // Take the first matching deal
            const isInSQL = dealToProgress.stage_id === sqlStageId;
            const currentStage = isInSQL ? 'SQL' : 'Opportunity';
            
            const shouldProgress = await new Promise<boolean>((resolve) => {
              // Create a modal to ask the user
              const modal = document.createElement('div');
              modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4';
              modal.innerHTML = `
                <div class="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-md w-full">
                  <h3 class="text-lg font-semibold text-white mb-3">Existing Deal Found</h3>
                  <p class="text-gray-300 mb-4">
                    Found an existing deal "<strong>${dealToProgress.name}</strong>" in ${currentStage} stage for ${formData.client_name}.
                  </p>
                  <p class="text-gray-400 text-sm mb-6">
                    Would you like to ${isInSQL ? 'fast-track this deal directly to Signed' : 'close this deal as won'} (move to Signed stage), or create a new deal?
                  </p>
                  <div class="flex gap-3">
                    <button id="progress-deal" class="flex-1 py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors font-medium">
                      ${isInSQL ? 'Fast-Track to Signed' : 'Close Existing Deal'}
                    </button>
                    <button id="create-new" class="flex-1 py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors font-medium">
                      Create New Deal
                    </button>
                  </div>
                </div>
              `;
              
              document.body.appendChild(modal);
              
              const progressBtn = modal.querySelector('#progress-deal');
              const createNewBtn = modal.querySelector('#create-new');
              
              progressBtn?.addEventListener('click', () => {
                document.body.removeChild(modal);
                resolve(true);
              });
              
              createNewBtn?.addEventListener('click', () => {
                document.body.removeChild(modal);
                resolve(false);
              });
            });
            
            if (shouldProgress) {
              // Progress the existing deal to Signed stage
              const signedStageId = '207a94db-abd8-43d8-ba21-411be66183d2'; // Signed stage ID
              
              try {
                await moveDealToStage(dealToProgress.id, signedStageId);
                finalDealId = dealToProgress.id;
                
                // Update the deal value with the actual sale amount
                const oneOff = parseFloat(formData.oneOffRevenue || '0') || 0;
                const monthly = parseFloat(formData.monthlyMrr || '0') || 0;
                let dealValue = 0;
                
                if (canSplitDeals(userData) && (oneOff > 0 || monthly > 0)) {
                  dealValue = (monthly * 3) + oneOff; // LTV calculation
                } else {
                  dealValue = parseFloat(formData.amount || '0') || 0;
                }
                
                if (dealValue > 0) {
                  await ((supabase
                    .from('deals') as any)
                    .update({ value: dealValue })
                    .eq('id', dealToProgress.id));
                }
                
                toast.success(`🎉 Closed "${dealToProgress.name}" as won!`);
                logger.log(`✅ Progressed existing deal ${dealToProgress.id} to Signed stage`);
              } catch (error) {
                logger.error('Error progressing deal to Signed:', error);
                // Fall back to creating a new deal
              }
            }
          }
        }
        
        // For meetings, proposals, and sales without a deal, create a deal first
        if ((selectedAction === 'meeting' || selectedAction === 'proposal' || selectedAction === 'sale') && !finalDealId) {
          logger.log(`🎯 No deal selected for ${selectedAction} - creating new deal automatically...`);
          
          try {
            // Determine the appropriate stage based on action type
            let stageName = 'SQL';
            let probability = 20;
            let dealValue = 0;
            
            if (selectedAction === 'proposal') {
              stageName = 'Opportunity';
              probability = 30;
              // For proposals, use the amount as the deal value
              dealValue = parseFloat(formData.amount || '0') || 0;
            } else if (selectedAction === 'sale') {
              stageName = 'Signed';
              probability = 100;
              // For sales, calculate LTV from subscription and one-off amounts
              const oneOff = parseFloat(formData.oneOffRevenue || '0') || 0;
              const monthly = parseFloat(formData.monthlyMrr || '0') || 0;
              dealValue = (monthly * 3) + oneOff; // LTV calculation
            }
            
            // Get the appropriate stage
            const { data: stages } = await supabase
              .from('deal_stages')
              .select('id')
              .eq('name', stageName)
              .single();
            
            if (!stages) {
              throw new Error(`Stage "${stageName}" not found`);
            }
            
            const stageId = (stages as any)?.id;

            if (stageId && userData?.id) {
              // Determine company name - use provided name or extract from website
              const companyName = formData.client_name ||
                                (formData.company_website ?
                                 formData.company_website.replace(/^(https?:\/\/)?(www\.)?/, '').split('.')[0] :
                                 'Unknown Company');

              // Ensure company and contact exist with auto-enrichment and fuzzy matching
              let companyId: string | undefined;
              let contactId: string | undefined;

              try {
                const contactEmail = formData.contactIdentifier || selectedContact?.email;
                const contactName = formData.contact_name || selectedContact?.full_name || companyName;

                if (!contactEmail) {
                  logger.warn('No contact email available for entity resolution');
                  toast.warning('Contact email is required for proper deal tracking');
                } else {
                  logger.log('🎯 Resolving entities for deal creation...');

                  const {
                    companyId: resolvedCompanyId,
                    contactId: resolvedContactId,
                    isNewCompany,
                    isNewContact
                  } = await ensureDealEntities({
                    contact_email: contactEmail,
                    contact_name: contactName,
                    company: companyName,
                    owner_id: userData.id
                  });

                  companyId = resolvedCompanyId;
                  contactId = resolvedContactId;

                  // Show feedback to user
                  if (isNewCompany) {
                    logger.log('✨ Auto-created company from domain, enriching in background...');
                    toast.success('✨ Company auto-created and enriching...', { duration: 2000 });
                  }
                  if (isNewContact) {
                    logger.log('✨ Auto-created contact record');
                    toast.success('✨ Contact auto-created', { duration: 2000 });
                  }
                }
              } catch (entityError) {
                logger.error('❌ Entity resolution failed (non-blocking):', entityError);
                // Don't block deal creation - continue without entity FKs
              }

              // Create a new deal (only if we have a user ID)
              const { data: newDeal, error: dealError } = await (supabase
                .from('deals')
                .insert({
                  name: `${companyName} - ${formData.details || selectedAction}`,
                  company: companyName,
                  company_website: formData.company_website || null,
                  value: dealValue,
                  stage_id: stageId,
                  owner_id: userData.id, // Now guaranteed to exist
                  probability: probability,
                  status: 'active',
                  expected_close_date: addDays(new Date(), 30).toISOString(),
                  contact_email: formData.contactIdentifier,
                  contact_name: formData.contact_name || companyName,
                  // Entity resolution ensures these FKs are set when possible
                  company_id: companyId || null,
                  primary_contact_id: contactId || null
                } as any)
                .select()
                .single() as any);

              if (!dealError && newDeal) {
                finalDealId = (newDeal as any).id;  // Use the local variable
                logger.log(`✅ Created deal ${(newDeal as any).id} for ${selectedAction}${companyId ? ' with company FK' : ''}${contactId ? ' with contact FK' : ''}`);
                toast.success(`📊 Deal created and linked to ${selectedAction}`);
              } else {
                logger.warn(`Failed to create deal for ${selectedAction}:`, dealError);
                finalDealId = null; // Clear any invalid deal ID
              }
            }
          } catch (error) {
            logger.error(`Error creating deal for ${selectedAction}:`, error);
            // Continue anyway - we can still create the activity without a deal
            finalDealId = null; // Clear any invalid deal ID
          }
        }
        
        // For proposals, use the amount field
        let proposalAmount;
        if (selectedAction === 'proposal') {
          proposalAmount = parseFloat(formData.amount || '0') || 0;
        }

        // Sanitize form data for security
        const sanitizedFormData = sanitizeCrmForm(formData, 'activityForm');
        
        // Create the appropriate activity or sale
        if (selectedAction === 'sale') {
          logger.log(`💰 Creating sale with deal_id: ${finalDealId}`);
          // Calculate total sale amount from subscription and one-off with sanitized numeric inputs
          const oneOff = sanitizeNumber(formData.oneOffRevenue, { min: 0, decimals: 2 }) || 0;
          const monthly = sanitizeNumber(formData.monthlyMrr, { min: 0, decimals: 2 }) || 0;
          const saleAmount = (monthly * 3) + oneOff; // LTV calculation
          
          // Ensure client_name is always a string for sales too
          const saleClientName = typeof sanitizedFormData.client_name === 'string' 
            ? sanitizedFormData.client_name 
            : (typeof sanitizedFormData.client_name === 'object' && sanitizedFormData.client_name !== null
                ? (sanitizedFormData.client_name as any).name || String(sanitizedFormData.client_name)
                : (sanitizedFormData.contact_name || 'Unknown'));
          
          await addSale({
            client_name: saleClientName,
            amount: saleAmount,
            details: sanitizedFormData.details || (monthly > 0 && oneOff > 0 ? 'Subscription + One-off Sale' : monthly > 0 ? 'Subscription Sale' : 'One-off Sale'),
            saleType: monthly > 0 ? 'subscription' : 'one-off',
            date: selectedDate.toISOString(),
            deal_id: finalDealId,
            company_id: formData.company_id || null,
            contact_id: formData.contact_id || selectedContact?.id || null,
            contactIdentifier: formData.contactIdentifier, // Already validated by system
            contactIdentifierType: formData.contactIdentifierType || 'email',
            // Pass the split values for proper recording
            oneOffRevenue: oneOff,
            monthlyMrr: monthly
          });
          logger.log(`✅ Sale created successfully with deal_id: ${finalDealId}`);
        } else {
          logger.log(`📝 About to create ${selectedAction} activity with deal_id: ${finalDealId}`);
          const sanitizedProposalAmount = selectedAction === 'proposal' ? 
            sanitizeNumber(formData.amount, { min: 0, decimals: 2 }) : undefined;
            
          // Ensure client_name is always a string, not an object
          const clientNameString = typeof sanitizedFormData.client_name === 'string' 
            ? sanitizedFormData.client_name 
            : (typeof sanitizedFormData.client_name === 'object' && sanitizedFormData.client_name !== null
                ? (sanitizedFormData.client_name as any).name || String(sanitizedFormData.client_name)
                : 'Unknown');
          
          await addActivity({
            type: selectedAction as 'meeting' | 'proposal',
            client_name: clientNameString,
            details: sanitizedFormData.details,
            amount: sanitizedProposalAmount,
            date: selectedDate.toISOString(),
            deal_id: finalDealId,  // Use the finalDealId which includes the newly created deal
            company_id: formData.company_id || null,
            contact_id: formData.contact_id || selectedContact?.id || null,
            meeting_id: formData.meeting_id || null,
            contactIdentifier: formData.contactIdentifier, // Already validated by system
            contactIdentifierType: formData.contactIdentifierType || 'email',
            status: selectedAction === 'meeting' ? (formData.status as 'completed' | 'pending' | 'cancelled' | 'no_show') : 'completed'
          });
          logger.log(`✅ ${selectedAction} activity created successfully with deal_id: ${finalDealId}`);
        }
      }
      
      setSubmitStatus('success');
      setIsSubmitting(false);
      
      // Create appropriate success message
      let successMessage = '';
      if (selectedAction === 'outbound') {
        const activityCount = parseInt(formData.outboundCount) || 1;
        successMessage = `${activityCount} ${formData.outboundType}${activityCount > 1 ? 's' : ''} added successfully!`;
      } else {
        successMessage = `${selectedAction === 'sale' ? 'Sale' : selectedAction} added successfully!`;
      }
      
      toast.success(successMessage, {
        icon: <CheckCircle2 className="w-4 h-4" />,
      });
      
      setTimeout(() => {
        handleClose();
      }, 1000);
    } catch (error) {
      handleError(error, selectedAction || 'item');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={
            renderMode === 'embedded'
              ? 'relative w-full h-full'
              : 'fixed inset-0 bg-gray-900/50 dark:bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center'
          }
          onClick={renderMode === 'embedded' ? undefined : handleClose}
        >
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{
              type: 'spring',
              damping: 30,
              stiffness: 300,
              mass: 0.8
            }}
            className={
              variant === 'v2'
                ? (renderMode === 'embedded'
                  ? 'relative w-full h-full bg-gray-900 rounded-2xl border border-gray-800 shadow-2xl shadow-black/50 overflow-hidden backdrop-blur-sm flex flex-col'
                  : 'relative w-full sm:max-w-2xl bg-gray-900 rounded-2xl border border-gray-800 shadow-2xl shadow-black/50 overflow-hidden backdrop-blur-sm sm:m-4 max-h-[85dvh] flex flex-col')
                : (renderMode === 'embedded'
                  ? 'relative w-full h-full bg-white dark:bg-gray-900/80 border border-gray-200 dark:border-gray-700/50 rounded-3xl p-6 sm:p-8 backdrop-blur-sm overflow-y-auto shadow-sm dark:shadow-none'
                  : 'relative bg-white dark:bg-gray-900/80 border border-gray-200 dark:border-gray-700/50 rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 w-full sm:max-w-2xl backdrop-blur-sm sm:m-4 max-h-[90vh] overflow-y-auto shadow-sm dark:shadow-none')
            }
            onClick={e => e.stopPropagation()}
          >
            {variant === 'v2' ? (
              <>
                {/* Header */}
                {!hideHeader && (
                  <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800/50">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                        <Brain className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h2 className="text-white font-semibold text-sm">Quick Add Assistant</h2>
                        <p className="text-gray-500 text-xs">Fast capture for meetings, tasks, sales, and more</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleClose}
                        className="p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
                        aria-label="Close Quick Add"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Body */}
                <div className="flex-1 min-h-0 flex flex-col">
                  {/* Messages / Content Area */}
                  <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
                    {!showContactSearch && !selectedAction ? (
                      <>
                        {chatMessages.map((message, index) => (
                          <div
                            key={index}
                            className={`flex gap-3 ${message.type === 'user' ? 'flex-row-reverse' : ''}`}
                          >
                            {message.type === 'ai' && (
                              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-purple-600/20 flex items-center justify-center">
                                <Sparkles className="w-4 h-4 text-violet-400" />
                              </div>
                            )}

                            <div className={`flex-1 ${message.type === 'user' ? 'flex justify-end' : ''}`}>
                              <div
                                className={`inline-block max-w-md ${
                                  message.type === 'user'
                                    ? 'bg-blue-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5'
                                    : ''
                                }`}
                              >
                                <p
                                  className={`text-sm leading-relaxed ${
                                    message.type === 'ai' ? 'text-gray-300' : ''
                                  }`}
                                >
                                  {message.content}
                                </p>

                                {/* Suggestions */}
                                {message.suggestions && (
                                  <div className="mt-3 space-y-2">
                                    {message.suggestions.map((suggestion: string, i: number) => (
                                      <button
                                        key={i}
                                        type="button"
                                        onClick={() => setChatInput(suggestion)}
                                        className="w-full text-left text-sm px-3 py-2 rounded-lg bg-gray-800/50 text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-all duration-200 flex items-center gap-2 group"
                                      >
                                        <ChevronRight className="w-3 h-3 text-gray-600 group-hover:text-violet-400 transition-colors" />
                                        <span>{suggestion}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                        <div ref={chatMessagesEndRef} />
                      </>
                    ) : (
                      <>
                        {/* When an action is active, reuse the existing forms/flows */}
                        {!showContactSearch && selectedAction === 'task' && (
                          <TaskForm
                            formData={formData}
                            setFormData={setFormData}
                            validationErrors={validationErrors}
                            isSubmitting={isSubmitting}
                            submitStatus={submitStatus}
                            onSubmit={handleSubmit}
                            onBack={() => {
                              setSelectedAction(null);
                              setShowQuickActionsV2(true);
                            }}
                          />
                        )}
                        {!showContactSearch && selectedAction === 'roadmap' && (
                          <RoadmapForm
                            formData={formData}
                            setFormData={setFormData}
                            validationErrors={validationErrors}
                            isSubmitting={isSubmitting}
                            submitStatus={submitStatus}
                            onSubmit={handleSubmit}
                            onBack={() => {
                              setSelectedAction(null);
                              setShowQuickActionsV2(true);
                            }}
                          />
                        )}
                        {!showContactSearch &&
                          (selectedAction === 'meeting' || selectedAction === 'proposal' || selectedAction === 'sale') && (
                            <ActivityForms
                              selectedAction={selectedAction}
                              selectedContact={selectedContact}
                              selectedDate={selectedDate}
                              setSelectedDate={setSelectedDate}
                              formData={formData}
                              setFormData={setFormData}
                              validationErrors={validationErrors}
                              isSubmitting={isSubmitting}
                              submitStatus={submitStatus}
                              onSubmit={handleSubmit}
                              onBack={() => {
                                setSelectedAction(null);
                                setShowQuickActionsV2(true);
                              }}
                              onChangeContact={() => {
                                setSelectedContact(null);
                                setShowContactSearch(true);
                              }}
                            />
                          )}
                        {!showContactSearch && selectedAction === 'outbound' && (
                          <OutboundForm
                            formData={formData}
                            setFormData={setFormData}
                            validationErrors={validationErrors}
                            isSubmitting={isSubmitting}
                            submitStatus={submitStatus}
                            onSubmit={handleSubmit}
                            onBack={() => {
                              setSelectedAction(null);
                              setShowQuickActionsV2(true);
                            }}
                            onAddContact={() => setShowContactSearch(true)}
                            selectedContact={selectedContact}
                            onChangeContact={() => {
                              setSelectedContact(null);
                              setShowContactSearch(true);
                            }}
                          />
                        )}
                      </>
                    )}
                  </div>

                  {/* Quick Actions */}
                  {!selectedAction && !showContactSearch && showQuickActionsV2 && (
                    <div className="px-5 pb-3">
                      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        {v2QuickActions.map((action) => (
                          <button
                            key={action.id}
                            type="button"
                            onClick={() => handleActionSelect(action.id)}
                            className="flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 hover:border-gray-600 transition-all duration-200 group"
                          >
                            <div className={`w-6 h-6 rounded-lg ${action.bg} flex items-center justify-center`}>
                              <action.icon className={`w-3.5 h-3.5 ${action.color}`} />
                            </div>
                            <span className="text-sm text-gray-400 group-hover:text-gray-200 whitespace-nowrap">
                              {action.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Input (only when no form is active) */}
                  {!selectedAction && !showContactSearch && (
                    <div className="p-4 border-t border-gray-800/50">
                      <div className="flex items-end gap-3">
                        <div className="flex-1 relative">
                          <div className="flex items-end bg-gray-800/50 rounded-xl border border-gray-700/50 focus-within:border-violet-500/50 transition-colors">
                            <textarea
                              ref={chatInputRef}
                              value={chatInput}
                              onChange={(e) => setChatInput(e.target.value)}
                              onKeyDown={handleChatKeyDown}
                              placeholder="Ask me to create, find, or log anything..."
                              rows={1}
                              className="flex-1 bg-transparent text-white placeholder-gray-500 text-sm py-3 px-4 resize-none outline-none max-h-32"
                              style={{ minHeight: '44px' }}
                            />
                            <div className="flex items-center gap-1 pr-2 pb-2">
                              <button
                                type="button"
                                className="p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-700/50 transition-colors"
                                title="Attach"
                              >
                                <Paperclip className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                className="p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-700/50 transition-colors"
                                title="Voice"
                              >
                                <Mic className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={handleChatSend}
                          disabled={!chatInput.trim()}
                          className={`flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 ${
                            chatInput.trim()
                              ? 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/25'
                              : 'bg-gray-800 text-gray-600 cursor-not-allowed'
                          }`}
                        >
                          <ArrowUp className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                {renderMode !== 'embedded' && (
                  <motion.div
                    className="w-12 h-1 rounded-full bg-gray-400 dark:bg-gray-800 absolute -top-8 left-1/2 -translate-x-1/2 sm:hidden"
                    initial={{ width: '2rem' }}
                    animate={{ width: '3rem' }}
                    transition={{
                      type: 'spring',
                      stiffness: 400,
                      damping: 30,
                      repeat: Infinity,
                      repeatType: 'reverse'
                    }}
                  />
                )}

                {!hideHeader && (
                  <div className="flex justify-between items-center mb-6 sm:mb-8">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white tracking-wide">Quick Add</h2>
                    <button
                      type="button"
                      onClick={handleClose}
                      className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800/50 rounded-xl transition-colors"
                    >
                      <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    </button>
                  </div>
                )}

                {!showContactSearch && !selectedAction && (
                  <ActionGrid onActionSelect={handleActionSelect} />
                )}

                {!showContactSearch && selectedAction === 'task' && (
                  <TaskForm
                    formData={formData}
                    setFormData={setFormData}
                    validationErrors={validationErrors}
                    isSubmitting={isSubmitting}
                    submitStatus={submitStatus}
                    onSubmit={handleSubmit}
                    onBack={() => setSelectedAction(null)}
                  />
                )}
                {!showContactSearch && selectedAction === 'roadmap' && (
                  <RoadmapForm
                    formData={formData}
                    setFormData={setFormData}
                    validationErrors={validationErrors}
                    isSubmitting={isSubmitting}
                    submitStatus={submitStatus}
                    onSubmit={handleSubmit}
                    onBack={() => setSelectedAction(null)}
                  />
                )}

                {!showContactSearch &&
                  (selectedAction === 'meeting' || selectedAction === 'proposal' || selectedAction === 'sale') && (
                    <ActivityForms
                      selectedAction={selectedAction}
                      selectedContact={selectedContact}
                      selectedDate={selectedDate}
                      setSelectedDate={setSelectedDate}
                      formData={formData}
                      setFormData={setFormData}
                      validationErrors={validationErrors}
                      isSubmitting={isSubmitting}
                      submitStatus={submitStatus}
                      onSubmit={handleSubmit}
                      onBack={() => setSelectedAction(null)}
                      onChangeContact={() => {
                        setSelectedContact(null);
                        setShowContactSearch(true);
                      }}
                    />
                  )}

                {/* Outbound Form - Works with or without contacts */}
                {!showContactSearch && selectedAction === 'outbound' && (
                  <OutboundForm
                    formData={formData}
                    setFormData={setFormData}
                    validationErrors={validationErrors}
                    isSubmitting={isSubmitting}
                    submitStatus={submitStatus}
                    onSubmit={handleSubmit}
                    onBack={() => setSelectedAction(null)}
                    onAddContact={() => setShowContactSearch(true)}
                    selectedContact={selectedContact}
                    onChangeContact={() => {
                      setSelectedContact(null);
                      setShowContactSearch(true);
                    }}
                  />
                )}
              </>
            )}
          </motion.div>

          {/* Contact Search Modal */}
          {showContactSearch && (
            <ContactSearchModal
              isOpen={showContactSearch}
              onClose={() => {
                setShowContactSearch(false);
                // If user cancels contact selection for actions that require a contact,
                // return them to the action picker instead of leaving an empty modal state.
                // Skip this if a contact was just selected (ref prevents race condition with async state)
                if (!contactJustSelectedRef.current && (selectedAction === 'meeting' || selectedAction === 'proposal' || selectedAction === 'sale') && !selectedContact) {
                  setSelectedAction(null);
                  if (variant === 'v2') {
                    setShowQuickActionsV2(true);
                  }
                }
                // Reset the ref after processing
                contactJustSelectedRef.current = false;
              }}
              onContactSelect={(contact) => {
                // Mark that a contact was just selected (prevents onClose from resetting action)
                contactJustSelectedRef.current = true;
                
                // Pre-populate form data with contact info
                const contactName = contact.full_name || 
                                  (contact.first_name || contact.last_name ? 
                                   `${contact.first_name || ''} ${contact.last_name || ''}`.trim() : 
                                   contact.email);
                
                // Extract company information
                // Priority order:
                // 1. contact.company (object) -> company.name and company.website
                // 2. contact.companies (joined relation) -> companies.name and companies.website
                // 3. contact.company_name (string)
                // 4. contact._form_website or contact.company_website (string)
                // 5. Extract from email domain
                let companyName = '';
                let websiteUrl = '';
                
                // Check if contact.company is an object (from includeCompany join)
                if (contact.company && typeof contact.company === 'object') {
                  companyName = contact.company.name || '';
                  websiteUrl = contact.company.website || '';
                }
                // Check contact.companies (joined relation from API)
                else if (contact.companies) {
                  if (typeof contact.companies === 'object') {
                    companyName = contact.companies.name || '';
                    websiteUrl = contact.companies.website || '';
                  } else {
                    // Fallback if companies is a string
                    companyName = contact.companies;
                  }
                }
                // Check company_name field (string)
                else if (contact.company_name) {
                  companyName = contact.company_name;
                }
                // Check if company is a string (legacy format)
                else if (contact.company && typeof contact.company === 'string') {
                  companyName = contact.company;
                }
                
                // If we still don't have a website, check other sources
                if (!websiteUrl) {
                  if (contact._form_website) {
                    websiteUrl = contact._form_website;
                  } else if (contact.company_website) {
                    websiteUrl = contact.company_website;
                  }
                }
                
                // If we have a website but no company name, extract from website
                if (!companyName && websiteUrl) {
                  const cleanUrl = websiteUrl.replace(/^(https?:\/\/)?(www\.)?/, '');
                  const domain = cleanUrl.split('.')[0];
                  companyName = domain.charAt(0).toUpperCase() + domain.slice(1);
                }
                
                // Fallback: Extract from email domain if no company info found
                if (!companyName && contact.email) {
                  const domain = contact.email.split('@')[1];
                  if (domain && !['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'protonmail.com', 'aol.com'].includes(domain.toLowerCase())) {
                    const domainParts = domain.split('.');
                    if (domainParts.length >= 2) {
                      companyName = domainParts[0].charAt(0).toUpperCase() + domainParts[0].slice(1);
                      if (!websiteUrl) {
                        websiteUrl = `www.${domain}`;
                      }
                    }
                  }
                }
                
                updateFormData({
                  contact_name: contactName,
                  contactIdentifier: contact.email,
                  contactIdentifierType: 'email',
                  client_name: companyName || formData.client_name,
                  company_website: websiteUrl || formData.company_website
                });
                
                setSelectedContact(contact);
                setShowContactSearch(false);
              }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const QuickAdd = React.memo(QuickAddComponent);