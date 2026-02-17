import React, { useState, useEffect } from 'react';
import { X, Calendar, PoundSterling, Users, Building, FileText, UserPlus, Trash2, PieChart, Check } from 'lucide-react';
import { useDealStages } from '@/lib/hooks/useDealStages';
import { ContactSearchModal } from '@/components/ContactSearchModal';
import DealSplitModal from '@/components/DealSplitModal';
import { useAuth } from '@/lib/contexts/AuthContext';
import { toast } from 'sonner';
import { isUserAdmin } from '@/lib/utils/adminUtils';

interface DealFormProps {
  deal?: any;
  onSave: (formData: any) => void;
  onCancel: () => void;
  onDelete?: (dealId: string) => Promise<void>;
  initialStageId?: string | null;
}

interface FormData {
  name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  company_website: string;
  value: string | number;
  one_off_revenue?: string | number;
  monthly_mrr?: string | number;
  stage_id: string;
  expected_close_date: string;
  description: string;
  probability: string | number;
}

export function DealForm({ 
  deal = null, 
  onSave, 
  onCancel, 
  onDelete,
  initialStageId = null 
}: DealFormProps) {
  const { stages } = useDealStages();
  const { userId, userData } = useAuth();
  const [showContactModal, setShowContactModal] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedContact, setSelectedContact] = useState<any>(() => {
    // Try to restore selected contact from localStorage
    try {
      if (!deal) { // Only restore for new deals
        const saved = localStorage.getItem('dealForm_selectedContact');
        if (saved) {
          return JSON.parse(saved);
        }
      }
    } catch (error) {
    }
    return null;
  });
  
  const [formData, setFormData] = useState<FormData>(() => {
    // Try to restore from localStorage first
    try {
      const saved = localStorage.getItem('dealForm_draft');
      if (saved && !deal) { // Only restore if creating new deal, not editing
        const parsed = JSON.parse(saved);
        return {
          name: parsed.name || '',
          contact_name: parsed.contact_name || '',
          contact_email: parsed.contact_email || '',
          contact_phone: parsed.contact_phone || '',
          company_website: parsed.company_website || '',
          value: parsed.value || '',
          stage_id: parsed.stage_id || initialStageId || '',
          expected_close_date: parsed.expected_close_date || '',
          description: parsed.description || '',
          probability: parsed.probability || ''
        };
      }
    } catch (error) {
    }
    
    return {
      name: '',
      contact_name: '',
      contact_email: '',
      contact_phone: '',
      company_website: '',
      value: '',
      stage_id: initialStageId || '',
      expected_close_date: '',
      description: '',
      probability: ''
    };
  });
  
  // Helper function to extract domain from email
  const extractDomainFromEmail = (email: string): string => {
    if (!email || !email.includes('@')) return '';
    const domain = email.split('@')[1];
    // Convert domain to website URL
    return domain ? `https://${domain}` : '';
  };

  // Helper function to extract company name from domain
  const extractCompanyNameFromDomain = (domain: string): string => {
    if (!domain) return '';
    // Remove protocol and www
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '');
    // Extract company name (remove .com, .co.uk, etc.)
    const companyName = cleanDomain.split('.')[0];
    // Capitalize first letter
    return companyName.charAt(0).toUpperCase() + companyName.slice(1);
  };

  // Initialize form with deal data if editing
  useEffect(() => {
    if (deal) {
      setFormData({
        name: deal.name || '',
        contact_name: deal.contact_name || '',
        contact_email: deal.contact_email || '',
        contact_phone: deal.contact_phone || '',
        company_website: deal.company_website || '',
        value: deal.value || '',
        stage_id: deal.stage_id || '',
        expected_close_date: deal.expected_close_date || '',
        description: deal.description || '',
        probability: deal.probability || ''
      });
      
      // Set selected contact if editing existing deal
      if (deal.contact_name || deal.contact_email) {
        setSelectedContact({
          full_name: deal.contact_name,
          email: deal.contact_email,
          phone: deal.contact_phone,
          company_website: deal.company_website
        });
      }
    } else if (initialStageId) {
      setFormData(prev => ({
        ...prev,
        stage_id: initialStageId
      }));
    }
  }, [deal, initialStageId]);
  
  // Set default probability based on selected stage
  useEffect(() => {
    if (formData.stage_id && !formData.probability) {
      const selectedStage = stages?.find(s => s.id === formData.stage_id);
      if (selectedStage) {
        setFormData(prev => ({
          ...prev,
          probability: selectedStage.default_probability
        }));
      }
    }
  }, [formData.stage_id, stages, formData.probability]);
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const newFormData = {
      ...formData,
      [name]: value
    };
    setFormData(newFormData);
    
    // Auto-save to localStorage (but only for new deals, not edits)
    if (!deal) {
      try {
        localStorage.setItem('dealForm_draft', JSON.stringify(newFormData));
      } catch (error) {
      }
    }
  };
  
  const handleContactSelect = (contact: any) => {
    setSelectedContact(contact);
    
    // Determine company website from multiple sources
    let companyWebsite = '';
    
    // Priority 1: Contact has associated company website
    if (contact.company_website || contact._form_website) {
      companyWebsite = contact.company_website || contact._form_website;
    }
    // Priority 2: Extract from email domain if no company website
    else if (contact.email) {
      companyWebsite = extractDomainFromEmail(contact.email);
    }
    
    const newFormData = {
      ...formData,
      contact_name: contact.full_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
      contact_email: contact.email || '',
      contact_phone: contact.phone || '',
      company_website: companyWebsite
    };
    
    setFormData(newFormData);
    setShowContactModal(false);
    
    // Auto-save updated form data and selected contact
    if (!deal) {
      try {
        localStorage.setItem('dealForm_draft', JSON.stringify(newFormData));
        localStorage.setItem('dealForm_selectedContact', JSON.stringify(contact));
      } catch (error) {
      }
    }
  };
  
  // Cleanup localStorage data
  const clearFormDraft = () => {
    try {
      localStorage.removeItem('dealForm_draft');
      localStorage.removeItem('dealForm_selectedContact');
    } catch (error) {
    }
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check if user is authenticated
    if (!userId) {
      toast.error('You must be logged in to create a deal');
      return;
    }

    // Check if contact information is provided
    if (!selectedContact && !formData.contact_email) {
      toast.error('Please select or create a contact for this deal');
      return;
    }
    
    // Auto-populate company website from email if not provided
    let finalCompanyWebsite = formData.company_website;
    if (!finalCompanyWebsite && selectedContact?.email) {
      finalCompanyWebsite = extractDomainFromEmail(selectedContact.email);
    }
    
    // Helper function to convert empty strings to null for numeric fields
    const parseNumericField = (value: string | number): number | null => {
      if (value === '' || value === undefined || value === null) return null;
      const parsed = typeof value === 'string' ? parseFloat(value) : value;
      return isNaN(parsed) ? null : parsed;
    };

    // Prepare data for saving
    const dataToSave = {
      name: formData.name,
      contact_name: formData.contact_name,
      contact_email: formData.contact_email,
      contact_phone: formData.contact_phone,
      value: parseNumericField(formData.value),
      one_off_revenue: parseNumericField(formData.one_off_revenue),
      monthly_mrr: parseNumericField(formData.monthly_mrr),
      stage_id: formData.stage_id,
      expected_close_date: formData.expected_close_date === '' ? null : formData.expected_close_date,
      description: formData.description,
      probability: parseNumericField(formData.probability),
      // Include primary contact ID if we have a selected contact
      primary_contact_id: selectedContact?.id || null,
      // Auto-generate company name from domain for backend processing
      company: finalCompanyWebsite ? extractCompanyNameFromDomain(finalCompanyWebsite) : '',
      // Include owner_id (required field)
      owner_id: userId
    };
    
    // Clear form draft on successful submission
    clearFormDraft();
    
    onSave(dataToSave);
  };

  // Handle delete with confirmation
  const handleDelete = async () => {
    if (!onDelete || !deal?.id) return;
    
    if (window.confirm('Are you sure you want to delete this deal? This action cannot be undone.')) {
      try {
        setIsDeleting(true);
        await onDelete(deal.id);
        
        toast.success('Deal deleted successfully');
        onCancel(); // Close the form
      } catch (error) {
        toast.error('Failed to delete deal');
      } finally {
        setIsDeleting(false);
      }
    }
  };
  
  return (
    <>
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {deal ? 'Edit Deal' : 'New Deal'}
          </h2>
          {!deal && formData.name && (
            <p className="text-xs text-green-400 opacity-75 mt-1 flex items-center gap-1">
              <Check className="w-3 h-3" /> Progress saved automatically
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            clearFormDraft();
            onCancel();
          }}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      
      <div className="space-y-4">
        {/* Deal name */}
        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
            Deal Name
          </label>
          <div className="flex items-center border border-gray-300 dark:border-gray-700 rounded-lg
            bg-gray-50 dark:bg-gray-900/80 focus-within:border-violet-500/50 transition-colors"
          >
            <span className="pl-3 text-gray-500">
              <FileText className="w-5 h-5" />
            </span>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              placeholder="Enter deal name"
              className="w-full p-2.5 bg-transparent border-none
                outline-none text-gray-900 dark:text-white"
            />
          </div>
        </div>

        {/* Contact Selection */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-violet-400" />
              Contact Information
              <span className="text-red-500 ml-1">*</span>
            </label>
            {selectedContact && (
              <span className="text-xs px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded-full">
                Contact Selected
              </span>
            )}
          </div>

          {!selectedContact ? (
            <div className="p-4 bg-gray-100/50 dark:bg-gray-800/30 border border-gray-300/50 dark:border-gray-700/50 rounded-xl">
              <button
                type="button"
                onClick={() => setShowContactModal(true)}
                className="w-full px-4 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Users className="w-4 h-4" />
                Search Contacts
              </button>
            </div>
          ) : (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h5 className="font-medium text-emerald-400">
                    {selectedContact.full_name || `${selectedContact.first_name || ''} ${selectedContact.last_name || ''}`.trim()}
                  </h5>
                  <p className="text-sm text-emerald-300/70">{selectedContact.email}</p>
                  {selectedContact.phone && (
                    <p className="text-xs text-gray-400">{selectedContact.phone}</p>
                  )}
                  {selectedContact.company && (
                    <p className="text-sm text-gray-400">
                      {typeof selectedContact.company === 'string' 
                        ? selectedContact.company 
                        : selectedContact.company.name || 'Unknown Company'}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowContactModal(true)}
                  className="px-3 py-1 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded transition-colors"
                >
                  Change
                </button>
              </div>
            </div>
          )}
        </div>
        
        {/* Company Information */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">Company Information</h3>

          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
              Company Website
              <span className="text-xs text-gray-500 ml-1">(auto-populated from contact email)</span>
            </label>
            <div className="flex items-center border border-gray-300 dark:border-gray-700 rounded-lg
              bg-gray-50 dark:bg-gray-900/80 focus-within:border-violet-500/50 transition-colors"
            >
              <span className="pl-3 text-gray-500">
                <Building className="w-5 h-5" />
              </span>
              <input
                type="text"
                name="company_website"
                value={formData.company_website}
                onChange={handleChange}
                placeholder="https://company.com (auto-populated from email domain)"
                className="w-full p-2.5 bg-transparent border-none
                  outline-none text-gray-900 dark:text-white"
              />
            </div>
            {!formData.company_website && selectedContact?.email && (
              <p className="text-xs text-amber-400 mt-1">
                💡 Website will be auto-populated from email domain: {extractDomainFromEmail(selectedContact.email)}
              </p>
            )}
          </div>
        </div>
        
        {/* Revenue Model */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">Deal Revenue</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                One-off Revenue (£)
              </label>
              <div className="flex items-center border border-gray-300 dark:border-gray-700 rounded-lg
                bg-gray-50 dark:bg-gray-900/80 focus-within:border-violet-500/50 transition-colors"
              >
                <span className="pl-3 text-gray-500">
                  <PoundSterling className="w-5 h-5" />
                </span>
                <input
                  type="number"
                  name="one_off_revenue"
                  value={formData.one_off_revenue || ''}
                  onChange={handleChange}
                  min="0"
                  step="0.01"
                  placeholder="0"
                  className="w-full p-2.5 bg-transparent border-none
                    outline-none text-gray-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                Monthly Recurring Revenue (£)
              </label>
              <div className="flex items-center border border-gray-300 dark:border-gray-700 rounded-lg
                bg-gray-50 dark:bg-gray-900/80 focus-within:border-violet-500/50 transition-colors"
              >
                <span className="pl-3 text-gray-500">
                  <PoundSterling className="w-5 h-5" />
                </span>
                <input
                  type="number"
                  name="monthly_mrr"
                  value={formData.monthly_mrr || ''}
                  onChange={handleChange}
                  min="0"
                  step="0.01"
                  placeholder="0"
                  className="w-full p-2.5 bg-transparent border-none
                    outline-none text-gray-900 dark:text-white"
                />
              </div>
            </div>
          </div>
          
          {/* Total Deal Value Display */}
          {(formData.one_off_revenue || formData.monthly_mrr) && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <div className="text-sm text-emerald-400">
                <span className="font-medium">Total Deal Value: </span>
                £{(
                  (parseFloat(formData.one_off_revenue as string) || 0) + 
                  ((parseFloat(formData.monthly_mrr as string) || 0) * 3)
                ).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
              {formData.monthly_mrr && parseFloat(formData.monthly_mrr as string) > 0 && (
                <div className="text-xs text-gray-400 mt-1">
                  Annual Value: £{(
                    (parseFloat(formData.one_off_revenue as string) || 0) + 
                    ((parseFloat(formData.monthly_mrr as string) || 0) * 12)
                  ).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Pipeline Stage */}
        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
            Pipeline Stage
          </label>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {stages && stages.map(stage => (
              <button
                key={stage.id}
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, stage_id: stage.id }))}
                className={`p-3 rounded-xl border transition-all ${
                  formData.stage_id === stage.id
                    ? 'bg-violet-500/20 border-violet-500/50 text-violet-700 dark:text-violet-300 ring-2 ring-violet-500/30'
                    : 'bg-gray-100/50 dark:bg-gray-800/30 border-gray-300/50 dark:border-gray-600/30 text-gray-600 dark:text-gray-400 hover:bg-gray-200/50 dark:hover:bg-gray-700/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: stage.color || '#6366f1' }}
                  />
                  <span className="text-sm font-medium">{stage.name}</span>
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {stage.default_probability}% probability
                </div>
              </button>
            ))}
          </div>
          
          {!formData.stage_id && (
            <p className="text-red-400 text-sm mt-1">Please select a pipeline stage</p>
          )}
        </div>
        
        {/* Close Date and Probability side by side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
              Expected Close Date
            </label>
            <div className="flex items-center border border-gray-300 dark:border-gray-700 rounded-lg
              bg-gray-50 dark:bg-gray-900/80 focus-within:border-violet-500/50 transition-colors"
            >
              <span className="pl-3 text-gray-500">
                <Calendar className="w-5 h-5" />
              </span>
              <input
                type="date"
                name="expected_close_date"
                value={formData.expected_close_date}
                onChange={handleChange}
                className="w-full p-2.5 bg-transparent border-none
                  outline-none text-gray-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
              Win Probability (%)
            </label>
            <input
              type="number"
              name="probability"
              value={formData.probability}
              onChange={handleChange}
              min="0"
              max="100"
              step="1"
              placeholder="Enter probability"
              className="w-full p-2.5 bg-gray-50 dark:bg-gray-900/80 border border-gray-300 dark:border-gray-700
                rounded-lg text-gray-900 dark:text-white outline-none focus:border-violet-500/50
                transition-colors"
            />
            
            {/* Probability slider */}
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={formData.probability || 0}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                probability: e.target.value
              }))}
              className="w-full mt-2 bg-gray-700 rounded-lg appearance-none h-2 outline-none"
            />
          </div>
        </div>
        
        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
            Description
          </label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={3}
            placeholder="Enter deal description"
            className="w-full p-2.5 bg-gray-50 dark:bg-gray-900/80 border border-gray-300 dark:border-gray-700
              rounded-lg text-gray-900 dark:text-white outline-none focus:border-violet-500/50
              transition-colors resize-none"
          />
        </div>
      </div>
      
      <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-800">
        {/* Left side - Delete and Split buttons (only for existing deals) */}
        <div className="flex items-center gap-3">
          {deal && onDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 
                py-2 px-4 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              {isDeleting ? 'Deleting...' : 'Delete Deal'}
            </button>
          )}
          
          {deal && isUserAdmin(userData) && (
            <button
              type="button"
              onClick={() => setShowSplitModal(true)}
              className="flex items-center gap-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 
                py-2 px-4 rounded-lg text-sm font-medium transition-colors"
            >
              <PieChart className="w-4 h-4" />
              Split Deal
            </button>
          )}
        </div>

        {/* Right side - Cancel and Save buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg
              hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg
              border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors"
          >
            {deal ? 'Update Deal' : 'Create Deal'}
          </button>
        </div>
      </div>
    </form>
    
    {/* Contact Search Modal */}
    <ContactSearchModal
      isOpen={showContactModal}
      onClose={() => setShowContactModal(false)}
      onContactSelect={handleContactSelect}
    />
    
    {/* Deal Split Modal */}
    {deal && deal.id && (
      <DealSplitModal 
        open={showSplitModal}
        onOpenChange={setShowSplitModal}
        deal={deal}
      />
    )}
    </>
  );
} 