import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Activity 
} from '@/lib/hooks/useActivities';
import { IdentifierType } from './IdentifierField';
import { Button } from '@/components/ui/button';
import { 
  Search, 
  User, 
  X,
  CheckCircle,
  Calendar,
  DollarSign,
  Target,
  MessageSquare,
  PhoneCall,
  FileText,
  TrendingUp,
  Clock,
  AlertCircle,
  Mail,
  Linkedin,
  Send,
  Hash,
  CalendarDays,
  UserCheck,
  RefreshCw
} from 'lucide-react';
import logger from '@/lib/utils/logger';
import { useDeals } from '@/lib/hooks/useDeals';
import { cn } from '@/lib/utils';
import { ContactSearchModal } from '@/components/ContactSearchModal';
import {
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

// Define props for the form component
interface EditActivityFormProps {
  activity: Activity; // The original activity data
  onSave: (activityId: string, updates: Partial<Activity>) => Promise<void>; // Callback to handle saving
  onCancel: () => void; // Callback to handle cancellation/closing
}

// Define the type for the form data state
type EditFormData = Omit<Partial<Activity>, 'id' | 'user_id'> & {
  // Revenue fields for sales
  monthlyMrr?: number;
  oneOffRevenue?: number;
  // Company information
  company_website?: string;
  // Proposal specific
  proposalValue?: number;
  proposalDate?: string;
  // Contact information
  selectedContact?: any;
  showContactSearch?: boolean;
  // Outbound specific
  outboundType?: 'email' | 'linkedin' | 'call';
  // Meeting specific
  isRebooking?: boolean;
  isSelfGenerated?: boolean;
  // Sale specific
  saleDate?: string;
};


// Activity type configurations
const ACTIVITY_TYPES = {
  meeting: {
    icon: Calendar,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
    label: 'Meeting',
    description: 'Schedule or record a meeting'
  },
  call: {
    icon: PhoneCall,
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/20',
    label: 'Call',
    description: 'Phone call or video call'
  },
  proposal: {
    icon: FileText,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/20',
    label: 'Proposal',
    description: 'Send or follow up on proposal'
  },
  sale: {
    icon: TrendingUp,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/20',
    label: 'Sale',
    description: 'Record a completed sale'
  },
  outbound: {
    icon: MessageSquare,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/20',
    label: 'Outbound',
    description: 'Outbound marketing or outreach'
  }
};

export function EditActivityForm({ activity, onSave, onCancel }: EditActivityFormProps) {
  const { updateDeal } = useDeals();
  
  // Contact search modal state
  const [showContactSearch, setShowContactSearch] = useState(false);

  // State to manage the form data, initialized with the activity data
  const [formData, setFormData] = useState<EditFormData>({
    client_name: activity.client_name,
    details: activity.details,
    amount: activity.amount,
    status: activity.status,
    contactIdentifier: activity.contactIdentifier,
    contactIdentifierType: activity.contactIdentifierType,
    type: activity.type,
    date: activity.date,
    priority: activity.priority,
    quantity: activity.quantity,
    sales_rep: activity.sales_rep,
    // Initialize revenue fields from linked deal
    monthlyMrr: activity.deals?.monthly_mrr || 0,
    oneOffRevenue: activity.deals?.one_off_revenue || 0,
    // Company website - we'll need to fetch this or initialize empty
    company_website: '',
    // Proposal value - use amount for proposals
    proposalValue: activity.type === 'proposal' ? activity.amount : 0,
    proposalDate: activity.proposal_date || (activity.type === 'proposal' ? activity.date : ''),
    // Outbound defaults
    outboundType: activity.outbound_type || 'email',
    // Meeting defaults
    isRebooking: activity.is_rebooking || false,
    isSelfGenerated: activity.is_self_generated || false,
    // Sale defaults
    saleDate: activity.sale_date || (activity.type === 'sale' ? activity.date : '')
  });

  // Handle contact selection from modal
  const handleContactSelect = (contact: any) => {
    setFormData(prev => ({
      ...prev,
      client_name: `${contact.first_name} ${contact.last_name}`,
      contactIdentifier: contact.email || contact.phone,
      contactIdentifierType: contact.email ? 'email' : 'phone',
      selectedContact: contact,
      company_website: contact.company_website || ''
    }));
  };

  // Update form data if the activity prop changes
  useEffect(() => {
    setFormData({
        client_name: activity.client_name,
        details: activity.details,
        amount: activity.amount,
        status: activity.status,
        contactIdentifier: activity.contactIdentifier,
        contactIdentifierType: activity.contactIdentifierType,
        type: activity.type,
        date: activity.date,
        priority: activity.priority,
        quantity: activity.quantity,
        sales_rep: activity.sales_rep,
        monthlyMrr: activity.deals?.monthly_mrr || 0,
        oneOffRevenue: activity.deals?.one_off_revenue || 0,
        company_website: '',
        proposalValue: activity.type === 'proposal' ? activity.amount : 0,
        proposalDate: activity.proposal_date || (activity.type === 'proposal' ? activity.date : ''),
        selectedContact: null,
        showContactSearch: false,
        // Outbound defaults
        outboundType: activity.outbound_type || 'email',
        // Meeting defaults
        isRebooking: activity.is_rebooking || false,
        isSelfGenerated: activity.is_self_generated || false,
        // Sale defaults
        saleDate: activity.sale_date || (activity.type === 'sale' ? activity.date : '')
    });
  }, [activity]);


  // Handle changes in general form inputs
  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prevData => ({
      ...prevData,
      [name]: value,
    }));
  };


  // Handle changes specifically for revenue fields (monthlyMrr, oneOffRevenue, proposalValue)
  const handleRevenueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const parsedValue = parseFloat(value);
    const newValue = value === '' || isNaN(parsedValue) ? 0 : parsedValue;
    setFormData(prevData => ({
      ...prevData,
      [name]: newValue,
    }));
  };

  // Handle checkbox changes
  const handleCheckboxChange = (name: string, checked: boolean) => {
    setFormData(prevData => ({
      ...prevData,
      [name]: checked,
    }));
  };

  // Handle the save action
  const handleSaveChanges = async () => {
    // Construct the updates object from the current form state
    const updates: Partial<Activity> = { 
      client_name: formData.client_name,
      details: formData.details,
      status: formData.status,
      priority: formData.priority,
      quantity: formData.quantity,
      date: formData.date
    };

    // Add enhanced form fields based on activity type
    if (formData.type === 'outbound') {
      updates.outbound_type = formData.outboundType || 'email'; // Default to email if not set
    }
    if (formData.type === 'proposal' && formData.proposalDate) {
      updates.proposal_date = formData.proposalDate;
    }
    if (formData.type === 'sale' && formData.saleDate) {
      updates.sale_date = formData.saleDate;
    }
    // Always include boolean fields for meetings
    if (formData.type === 'meeting') {
      updates.is_rebooking = formData.isRebooking || false;
      updates.is_self_generated = formData.isSelfGenerated || false;
    }

    // Conditionally manage contact identifier fields based on type
    if (formData.type !== 'outbound') {
      updates.contactIdentifier = formData.contactIdentifier;
      updates.contactIdentifierType = formData.contactIdentifierType as IdentifierType; // Ensure type casting if needed
    } else {
      updates.contactIdentifier = undefined;
      updates.contactIdentifierType = undefined;
    }
    
    // Handle activity-specific amounts and calculations
    if (formData.type === 'sale') {
      // For sales, calculate LTV and set amount
      const oneOff = formData.oneOffRevenue || 0;
      const monthly = formData.monthlyMrr || 0;
      const ltv = (monthly * 3) + oneOff; // LTV calculation
      updates.amount = ltv;
      
      // Note: Deal revenue fields (monthly_mrr, one_off_revenue) will be updated separately
      // through the linked deal record via activity.deal_id
    } else if (formData.type === 'proposal') {
      // For proposals, use proposal value
      updates.amount = formData.proposalValue;
    } else {
      // For other types, keep existing amount or use form amount
      updates.amount = formData.amount;
    }
    
    // Remove amount field if undefined before saving
    if (updates.amount === undefined) {
      delete updates.amount;
    }

    // Basic validation
    if (!updates.client_name || !updates.details || !updates.status) {
      // Consider using a local error state instead of toast here if needed
      // toast.error("Client Name, Details, and Status are required."); 
      logger.error("Validation failed: Client Name, Details, Status required.");
      return; 
    }

    // Update linked deal with revenue fields if this is a sale with deal_id
    if (formData.type === 'sale' && activity.deal_id) {
      try {
        const dealUpdates = {
          monthly_mrr: formData.monthlyMrr || null,
          one_off_revenue: formData.oneOffRevenue || null,
          value: updates.amount, // Update deal value to match LTV
          company: formData.client_name, // Update company name
          // Add company website if we have it in the deal structure
        };
        
        logger.log('Updating linked deal:', activity.deal_id, dealUpdates);
        await updateDeal(activity.deal_id, dealUpdates);
      } catch (error) {
        logger.error('Failed to update linked deal:', error);
        // Don't fail the entire operation if deal update fails
      }
    }
    
    // Debug logging to see what we're trying to save
    logger.log('[EditActivityForm] Attempting to save updates:', {
      activityId: activity.id,
      updates: updates,
      formData: formData
    });

    try {
      // Call the onSave prop (which wraps the API call and handles success/error)
      await onSave(activity.id, updates);
      // onSave should handle closing the dialog on success
    } catch (error) {
      logger.error('[EditActivityForm] Save failed:', error);
      // You can add user-friendly error handling here
    }
  };

  // Get current activity type info
  const currentActivityType = ACTIVITY_TYPES[formData.type as keyof typeof ACTIVITY_TYPES] || ACTIVITY_TYPES.meeting;
  const ActivityIcon = currentActivityType.icon;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-3">
          <div className={cn(
            "p-2 rounded-lg",
            currentActivityType.bgColor,
            currentActivityType.borderColor,
            "border"
          )}>
            <ActivityIcon className={cn("w-5 h-5", currentActivityType.color)} />
          </div>
          <div>
            <div className="text-white">Edit {currentActivityType.label}</div>
            <div className="text-sm text-gray-400 font-normal">{currentActivityType.description}</div>
          </div>
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-3 py-3 max-h-[70vh] overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700/60">
        {/* Contact Selection Section */}
        {formData.type !== 'outbound' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-300">Contact</label>
              <button
                type="button"
                onClick={() => setShowContactSearch(true)}
                className="text-xs text-[#37bd7e] hover:text-[#2ea368] flex items-center gap-1"
              >
                <Search className="w-3 h-3" />
                Search Contacts
              </button>
            </div>
            
            {formData.selectedContact ? (
              <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-[#37bd7e]/20 rounded-full flex items-center justify-center">
                      <User className="w-4 h-4 text-[#37bd7e]" />
                    </div>
                    <div>
                      <div className="text-white font-medium">
                        {formData.selectedContact.first_name} {formData.selectedContact.last_name}
                      </div>
                      <div className="text-sm text-gray-400">
                        {formData.selectedContact.email}
                        {formData.selectedContact.phone && (
                          <span className="ml-2">• {formData.selectedContact.phone}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, selectedContact: null }))}
                    className="text-gray-400 hover:text-red-400"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Client name"
                    name="client_name"
                    value={formData.client_name || ''}
                    onChange={handleFormChange}
                    className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl px-4 py-2 text-white placeholder-gray-500 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent"
                  />
                </div>
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Email or phone"
                    name="contactIdentifier"
                    value={formData.contactIdentifier || ''}
                    onChange={handleFormChange}
                    className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl px-4 py-2 text-white placeholder-gray-500 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Details and Company Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-400">Details</label>
            <input
              type="text"
              name="details"
              value={formData.details || ''}
              onChange={handleFormChange}
              placeholder="Activity details"
              className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl px-4 py-2 text-white placeholder-gray-500 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-400">Company Website</label>
            <input
              type="url"
              placeholder="https://company.com"
              name="company_website"
              value={formData.company_website || ''}
              onChange={handleFormChange}
              className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl px-4 py-2 text-white placeholder-gray-500 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent"
            />
          </div>
        </div>

        {/* Status Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-400">Status</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'completed', label: 'Completed', icon: CheckCircle, color: 'text-green-400', bgColor: 'bg-green-500/10', borderColor: 'border-green-500/30' },
              { value: 'pending', label: 'Scheduled', icon: Clock, color: 'text-blue-400', bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/30' },
              { value: 'cancelled', label: 'Cancelled', icon: X, color: 'text-red-400', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/30' },
              { value: 'no_show', label: 'No Show', icon: AlertCircle, color: 'text-orange-400', bgColor: 'bg-orange-500/10', borderColor: 'border-orange-500/30' },
              ...(formData.type === 'meeting' ? [
                { value: 'discovery', label: 'Discovery', icon: Search, color: 'text-purple-400', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500/30' }
              ] : [])
            ].map((status) => {
              const StatusIcon = status.icon;
              const isSelected = formData.status === status.value;
              return (
                <button
                  key={status.value}
                  type="button"
                  onClick={() => setFormData(prevData => ({ ...prevData, status: status.value as any }))}
                  className={cn(
                    "p-2 rounded-lg border transition-all flex items-center gap-1.5 text-sm",
                    isSelected
                      ? `${status.bgColor} ${status.color} ${status.borderColor} ring-2 ring-opacity-50`
                      : 'bg-gray-800/30 border-gray-600/30 text-gray-400 hover:bg-gray-700/50'
                  )}
                >
                  <StatusIcon className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">{status.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Activity Type-Specific Fields */}
        <AnimatePresence>
          {formData.type === 'sale' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 pb-2 border-b border-gray-700">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-medium text-gray-300">Revenue Details</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">Monthly MRR</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      name="monthlyMrr"
                      value={formData.monthlyMrr || ''}
                      onChange={handleRevenueChange}
                      className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl pl-10 pr-4 py-2 text-white placeholder-gray-500 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">One-Off Revenue</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      name="oneOffRevenue"
                      value={formData.oneOffRevenue || ''}
                      onChange={handleRevenueChange}
                      className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl pl-10 pr-4 py-2 text-white placeholder-gray-500 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
              
              {/* Sale Date */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400">Sale Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                  <input
                    type="date"
                    name="saleDate"
                    value={formData.saleDate || ''}
                    onChange={handleFormChange}
                    className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl pl-10 pr-4 py-2 text-white placeholder-gray-500 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent"
                  />
                </div>
              </div>
              
              {(formData.monthlyMrr || formData.oneOffRevenue) && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gradient-to-r from-emerald-500/10 to-green-500/10 border border-emerald-500/20 rounded-xl p-4"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="w-4 h-4 text-emerald-400" />
                    <div className="text-sm text-emerald-400 font-medium">Calculated LTV</div>
                  </div>
                  <div className="text-2xl font-bold text-emerald-400">
                    £{((formData.monthlyMrr || 0) * 3 + (formData.oneOffRevenue || 0)).toLocaleString()}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {formData.type === 'proposal' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 pb-2 border-b border-gray-700">
                <FileText className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-medium text-gray-300">Proposal Details</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">Proposal Value</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      name="proposalValue"
                      value={formData.proposalValue || ''}
                      onChange={handleRevenueChange}
                      className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl pl-10 pr-4 py-2 text-white placeholder-gray-500 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">Proposal Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                    <input
                      type="date"
                      name="proposalDate"
                      value={formData.proposalDate || ''}
                      onChange={handleFormChange}
                      className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl pl-10 pr-4 py-2 text-white placeholder-gray-500 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {formData.type === 'outbound' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 pb-2 border-b border-gray-700">
                <Send className="w-4 h-4 text-orange-400" />
                <h3 className="text-sm font-medium text-gray-300">Outbound Details</h3>
              </div>
              
              {/* Outbound Type Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400">Outreach Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { 
                      value: 'email', 
                      label: 'Email', 
                      icon: Mail, 
                      color: 'text-blue-400', 
                      bgColor: 'bg-blue-500/10', 
                      borderColor: 'border-blue-500/30' 
                    },
                    { 
                      value: 'linkedin', 
                      label: 'LinkedIn', 
                      icon: Linkedin, 
                      color: 'text-blue-500', 
                      bgColor: 'bg-blue-500/10', 
                      borderColor: 'border-blue-500/30' 
                    },
                    { 
                      value: 'call', 
                      label: 'Call', 
                      icon: PhoneCall, 
                      color: 'text-green-400', 
                      bgColor: 'bg-green-500/10', 
                      borderColor: 'border-green-500/30' 
                    }
                  ].map((type) => {
                    const TypeIcon = type.icon;
                    const isSelected = formData.outboundType === type.value;
                    return (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, outboundType: type.value as any }))}
                        className={cn(
                          "p-3 rounded-lg border transition-all flex flex-col items-center gap-1.5",
                          isSelected
                            ? `${type.bgColor} ${type.color} ${type.borderColor} ring-2 ring-opacity-50`
                            : 'bg-gray-800/30 border-gray-600/30 text-gray-400 hover:bg-gray-700/50'
                        )}
                      >
                        <TypeIcon className="w-4 h-4" />
                        <span className="text-xs font-medium">{type.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Number of Outreaches */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400">Number of Outreaches</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                  <input
                    type="number"
                    min="1"
                    max="100"
                    placeholder={
                      formData.outboundType === 'email' ? "How many emails sent?" :
                      formData.outboundType === 'linkedin' ? "How many LinkedIn messages?" :
                      "How many calls made?"
                    }
                    name="quantity"
                    value={formData.quantity || ''}
                    onChange={handleFormChange}
                    className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl pl-10 pr-4 py-2 text-white placeholder-gray-500 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent"
                  />
                </div>
              </div>
            </motion.div>
          )}

          {formData.type === 'meeting' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 pb-2 border-b border-gray-700">
                <Calendar className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-medium text-gray-300">Meeting Details</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Rescheduled Meeting Checkbox */}
                <div
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    formData.isRebooking 
                      ? 'bg-orange-500/10 border-orange-500/30 ring-1 ring-orange-500/20' 
                      : 'bg-gray-800/30 border-gray-700/50 hover:border-orange-500/40'
                  }`}
                  onClick={() => handleCheckboxChange('isRebooking', !formData.isRebooking)}
                  role="button"
                >
                  <div className="flex items-center gap-3">
                    <div className={`relative w-5 h-5 rounded border-2 transition-all ${
                      formData.isRebooking
                        ? 'bg-orange-500 border-orange-500'
                        : 'bg-transparent border-gray-600 hover:border-orange-500/60'
                    }`}>
                      {formData.isRebooking && (
                        <motion.div
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ duration: 0.2 }}
                        >
                          <RefreshCw className="w-3 h-3 text-white absolute top-0.5 left-0.5" />
                        </motion.div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className={`text-sm font-medium transition-colors ${
                        formData.isRebooking ? 'text-orange-400' : 'text-gray-300'
                      }`}>
                        Rescheduled Meeting
                      </div>
                      <div className="text-xs text-gray-500">
                        Mark as rebooked from previous no-show
                      </div>
                    </div>
                  </div>
                </div>

                {/* Self-Generated Meeting Checkbox */}
                <div
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    formData.isSelfGenerated
                      ? 'bg-emerald-500/10 border-emerald-500/30 ring-1 ring-emerald-500/20' 
                      : 'bg-gray-800/30 border-gray-700/50 hover:border-emerald-500/40'
                  }`}
                  onClick={() => handleCheckboxChange('isSelfGenerated', !formData.isSelfGenerated)}
                  role="button"
                >
                  <div className="flex items-center gap-3">
                    <div className={`relative w-5 h-5 rounded border-2 transition-all ${
                      formData.isSelfGenerated
                        ? 'bg-emerald-500 border-emerald-500'
                        : 'bg-transparent border-gray-600 hover:border-emerald-500/60'
                    }`}>
                      {formData.isSelfGenerated && (
                        <motion.div
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ duration: 0.2 }}
                        >
                          <UserCheck className="w-3 h-3 text-white absolute top-0.5 left-0.5" />
                        </motion.div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className={`text-sm font-medium transition-colors ${
                        formData.isSelfGenerated ? 'text-emerald-400' : 'text-gray-300'
                      }`}>
                        Self-Generated
                      </div>
                      <div className="text-xs text-gray-500">
                        Sales rep generated this meeting
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {(formData.isRebooking || formData.isSelfGenerated) && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-2 flex-wrap"
                >
                  {formData.isRebooking && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <CalendarDays className="w-3 h-3 mr-1" />
                      Rescheduled
                    </span>
                  )}
                  {formData.isSelfGenerated && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                      <UserCheck className="w-3 h-3 mr-1" />
                      Self-Generated
                    </span>
                  )}
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Contact Search Modal */}
      <ContactSearchModal
        isOpen={showContactSearch}
        onClose={() => setShowContactSearch(false)}
        onContactSelect={handleContactSelect}
        prefilledEmail={formData.contactIdentifier || ''}
        prefilledName={formData.client_name || ''}
      />

      <DialogFooter className="border-t border-gray-800 pt-4">
        <Button 
          variant="outline" 
          onClick={onCancel}
          className="border-gray-600 text-gray-300 hover:bg-gray-700"
        >
          Cancel 
        </Button>
        <Button 
          onClick={handleSaveChanges}
          className="bg-[#37bd7e] hover:bg-[#2ea368] text-white"
        >
          Save Changes
        </Button>
      </DialogFooter>
    </>
  );
} 