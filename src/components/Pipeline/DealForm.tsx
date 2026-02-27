import React, { useState, useEffect } from 'react';
import { X, Calendar, Users, Building, FileText, Trash2, PieChart, Check, Search, ChevronDown } from 'lucide-react';
import { useDealStages } from '@/lib/hooks/useDealStages';
import { ContactSearchModal } from '@/components/ContactSearchModal';
import DealSplitModal from '@/components/DealSplitModal';
import { useAuth } from '@/lib/contexts/AuthContext';
import { toast } from 'sonner';
import { isUserAdmin } from '@/lib/utils/adminUtils';
import { useOrgMoney } from '@/lib/hooks/useOrgMoney';

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
  const { symbol: currencySymbol, formatMoney: fmtMoney } = useOrgMoney();
  const [showContactModal, setShowContactModal] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedContact, setSelectedContact] = useState<any>(() => {
    try {
      if (!deal) {
        const saved = localStorage.getItem('dealForm_selectedContact');
        if (saved) return JSON.parse(saved);
      }
    } catch {}
    return null;
  });

  const [formData, setFormData] = useState<FormData>(() => {
    try {
      const saved = localStorage.getItem('dealForm_draft');
      if (saved && !deal) {
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
    } catch {}

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

  const extractDomainFromEmail = (email: string): string => {
    if (!email || !email.includes('@')) return '';
    const domain = email.split('@')[1];
    return domain ? `https://${domain}` : '';
  };

  const extractCompanyNameFromDomain = (domain: string): string => {
    if (!domain) return '';
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '');
    const companyName = cleanDomain.split('.')[0];
    return companyName.charAt(0).toUpperCase() + companyName.slice(1);
  };

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
      if (deal.contact_name || deal.contact_email) {
        setSelectedContact({
          full_name: deal.contact_name,
          email: deal.contact_email,
          phone: deal.contact_phone,
          company_website: deal.company_website
        });
      }
    } else if (initialStageId) {
      setFormData(prev => ({ ...prev, stage_id: initialStageId }));
    }
  }, [deal, initialStageId]);

  useEffect(() => {
    if (formData.stage_id && !formData.probability) {
      const selectedStage = stages?.find(s => s.id === formData.stage_id);
      if (selectedStage) {
        setFormData(prev => ({ ...prev, probability: selectedStage.default_probability }));
      }
    }
  }, [formData.stage_id, stages, formData.probability]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const newFormData = { ...formData, [name]: value };
    setFormData(newFormData);
    if (!deal) {
      try { localStorage.setItem('dealForm_draft', JSON.stringify(newFormData)); } catch {}
    }
  };

  const handleContactSelect = (contact: any) => {
    setSelectedContact(contact);
    let companyWebsite = '';
    if (contact.company_website || contact._form_website) {
      companyWebsite = contact.company_website || contact._form_website;
    } else if (contact.email) {
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
    if (!deal) {
      try {
        localStorage.setItem('dealForm_draft', JSON.stringify(newFormData));
        localStorage.setItem('dealForm_selectedContact', JSON.stringify(contact));
      } catch {}
    }
  };

  const clearFormDraft = () => {
    try {
      localStorage.removeItem('dealForm_draft');
      localStorage.removeItem('dealForm_selectedContact');
    } catch {}
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) { toast.error('You must be logged in to create a deal'); return; }
    if (!selectedContact && !formData.contact_email) {
      toast.error('Please select or create a contact for this deal');
      return;
    }
    let finalCompanyWebsite = formData.company_website;
    if (!finalCompanyWebsite && selectedContact?.email) {
      finalCompanyWebsite = extractDomainFromEmail(selectedContact.email);
    }
    const parseNumericField = (value: string | number): number | null => {
      if (value === '' || value === undefined || value === null) return null;
      const parsed = typeof value === 'string' ? parseFloat(value) : value;
      return isNaN(parsed) ? null : parsed;
    };
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
      primary_contact_id: selectedContact?.id || null,
      company: finalCompanyWebsite ? extractCompanyNameFromDomain(finalCompanyWebsite) : '',
      owner_id: userId
    };
    clearFormDraft();
    onSave(dataToSave);
  };

  const handleDelete = async () => {
    if (!onDelete || !deal?.id) return;
    if (window.confirm('Are you sure you want to delete this deal? This action cannot be undone.')) {
      try {
        setIsDeleting(true);
        await onDelete(deal.id);
        toast.success('Deal deleted successfully');
        onCancel();
      } catch { toast.error('Failed to delete deal'); }
      finally { setIsDeleting(false); }
    }
  };

  const inputClass = "w-full px-3 py-2.5 bg-gray-800/60 border border-gray-700/40 rounded-xl text-sm text-gray-100 placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/50 transition-all";
  const labelClass = "block text-xs font-medium text-gray-400 mb-1";

  return (
    <>
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-100">
            {deal ? 'Edit Deal' : 'New Deal'}
          </h2>
          {!deal && formData.name && (
            <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
              <Check className="w-3 h-3" /> Saved
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => { clearFormDraft(); onCancel(); }}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Contact + Deal Name row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Contact */}
        <div>
          <label className={labelClass}>
            Contact <span className="text-red-400">*</span>
          </label>
          {!selectedContact ? (
            <button
              type="button"
              onClick={() => setShowContactModal(true)}
              className="w-full px-3 py-2.5 bg-gray-800/60 border border-dashed border-gray-700/40 rounded-xl text-sm text-gray-500 hover:border-violet-500/50 hover:text-violet-400 transition-all flex items-center gap-2"
            >
              <Search className="w-3.5 h-3.5" />
              Search contacts...
            </button>
          ) : (
            <div
              className="w-full px-3 py-2.5 bg-emerald-500/[0.08] border border-emerald-500/20 rounded-xl flex items-center justify-between cursor-pointer hover:bg-emerald-500/[0.12] transition-all"
              onClick={() => setShowContactModal(true)}
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-emerald-300 truncate">
                  {selectedContact.full_name || `${selectedContact.first_name || ''} ${selectedContact.last_name || ''}`.trim()}
                </div>
                {selectedContact.email && (
                  <div className="text-[11px] text-emerald-400/60 truncate">{selectedContact.email}</div>
                )}
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-emerald-400/50 flex-shrink-0" />
            </div>
          )}
        </div>

        {/* Deal Name */}
        <div>
          <label className={labelClass}>Deal Name <span className="text-red-400">*</span></label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            placeholder="e.g. Website Redesign"
            className={inputClass}
          />
        </div>
      </div>

      {/* Company Website */}
      <div>
        <label className={labelClass}>
          Company Website
          {selectedContact?.email && !formData.company_website && (
            <span className="text-[10px] text-amber-400/70 ml-1.5 font-normal">
              Auto-fills from email domain
            </span>
          )}
        </label>
        <div className="relative">
          <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            name="company_website"
            value={formData.company_website}
            onChange={handleChange}
            placeholder="https://company.com"
            className={`${inputClass} pl-8`}
          />
        </div>
      </div>

      {/* Revenue row */}
      <div>
        <label className={labelClass}>Revenue</label>
        <div className="grid grid-cols-2 gap-2">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-gray-400 font-medium">{currencySymbol}</span>
            <input
              type="number"
              name="one_off_revenue"
              value={formData.one_off_revenue || ''}
              onChange={handleChange}
              min="0"
              step="0.01"
              placeholder="One-off"
              className={`${inputClass} pl-8`}
            />
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-gray-400 font-medium">{currencySymbol}</span>
            <input
              type="number"
              name="monthly_mrr"
              value={formData.monthly_mrr || ''}
              onChange={handleChange}
              min="0"
              step="0.01"
              placeholder="Monthly MRR"
              className={`${inputClass} pl-8`}
            />
          </div>
        </div>
        {(formData.one_off_revenue || formData.monthly_mrr) && (
          <div className="mt-1.5 text-xs text-emerald-400 font-medium">
            Total: {fmtMoney(
              (parseFloat(formData.one_off_revenue as string) || 0) +
              ((parseFloat(formData.monthly_mrr as string) || 0) * 3)
            )}
            {formData.monthly_mrr && parseFloat(formData.monthly_mrr as string) > 0 && (
              <span className="text-gray-500 ml-2">
                Annual: {fmtMoney(
                  (parseFloat(formData.one_off_revenue as string) || 0) +
                  ((parseFloat(formData.monthly_mrr as string) || 0) * 12)
                )}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Pipeline Stage — horizontal scroll */}
      <div>
        <label className={labelClass}>Pipeline Stage</label>
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {stages && stages.map(stage => (
            <button
              key={stage.id}
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, stage_id: stage.id, probability: stage.default_probability }))}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                formData.stage_id === stage.id
                  ? 'bg-violet-500/15 border-violet-500/30 text-violet-300 ring-1 ring-violet-400/20'
                  : 'bg-gray-800/40 border-gray-700/40 text-gray-400 hover:bg-gray-800/60 hover:text-gray-300'
              }`}
            >
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: stage.color || '#6366f1' }}
              />
              {stage.name}
            </button>
          ))}
        </div>
        {!formData.stage_id && (
          <p className="text-red-400 text-xs mt-1">Select a stage</p>
        )}
      </div>

      {/* Close Date + Probability row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Expected Close</label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="date"
              name="expected_close_date"
              value={formData.expected_close_date}
              onChange={handleChange}
              className={`${inputClass} pl-8`}
            />
          </div>
        </div>
        <div>
          <label className={labelClass}>
            Win Probability
            {formData.probability ? (
              <span className="ml-1 text-violet-400">{formData.probability}%</span>
            ) : null}
          </label>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={formData.probability || 0}
            onChange={(e) => setFormData(prev => ({ ...prev, probability: e.target.value }))}
            className="w-full mt-1.5 h-1.5 bg-gray-700/50 rounded-full appearance-none outline-none cursor-pointer accent-violet-500"
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <label className={labelClass}>Notes</label>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
          rows={2}
          placeholder="Key context, next steps..."
          className={`${inputClass} resize-none`}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-800/50">
        <div className="flex items-center gap-2">
          {deal && onDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex items-center gap-1.5 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {isDeleting ? 'Deleting...' : 'Delete'}
            </button>
          )}
          {deal && isUserAdmin(userData) && (
            <button
              type="button"
              onClick={() => setShowSplitModal(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              <PieChart className="w-3.5 h-3.5" />
              Split
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-medium text-gray-400 bg-gray-800/50 hover:bg-gray-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-1.5 text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors shadow-sm"
          >
            {deal ? 'Update Deal' : 'Create Deal'}
          </button>
        </div>
      </div>
    </form>

    <ContactSearchModal
      isOpen={showContactModal}
      onClose={() => setShowContactModal(false)}
      onContactSelect={handleContactSelect}
    />

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
