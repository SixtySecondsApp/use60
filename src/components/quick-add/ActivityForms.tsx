import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Users, FileText, PoundSterling, Calendar, Loader2, CheckCircle2, AlertCircle, Phone } from 'lucide-react';
import { format, addDays, addWeeks } from 'date-fns';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import type { QuickAddFormData, ValidationErrors } from './types';

interface ActivityFormsProps {
  selectedAction: 'meeting' | 'proposal' | 'sale' | 'outbound';
  selectedContact: any;
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  formData: QuickAddFormData;
  setFormData: (data: QuickAddFormData) => void;
  validationErrors: ValidationErrors;
  isSubmitting: boolean;
  submitStatus: 'idle' | 'success' | 'error';
  onSubmit: (e: React.FormEvent) => Promise<void>;
  onBack: () => void;
  onChangeContact: () => void;
}

export function ActivityForms({
  selectedAction,
  selectedContact,
  selectedDate,
  setSelectedDate,
  formData,
  setFormData,
  validationErrors,
  isSubmitting,
  submitStatus,
  onSubmit,
  onBack,
  onChangeContact
}: ActivityFormsProps) {
  const [showCalendar, setShowCalendar] = useState(false);

  const getActionIcon = () => {
    switch (selectedAction) {
      case 'meeting': return <Users className="w-4 h-4 text-violet-400" />;
      case 'proposal': return <FileText className="w-4 h-4 text-orange-400" />;
      case 'sale': return <PoundSterling className="w-4 h-4 text-emerald-400" />;
      case 'outbound': return <Phone className="w-4 h-4 text-blue-400" />;
    }
  };

  const getActionTitle = () => {
    switch (selectedAction) {
      case 'meeting': return 'Meeting';
      case 'proposal': return 'Proposal';
      case 'sale': return 'Sale';
      case 'outbound': return 'Outbound';
    }
  };

  const getActionColor = () => {
    switch (selectedAction) {
      case 'meeting': return 'violet';
      case 'proposal': return 'orange';
      case 'sale': return 'emerald';
      case 'outbound': return 'blue';
    }
  };

  const calculateDealValue = () => {
    const oneOff = parseFloat(formData.oneOffRevenue || '0') || 0;
    const monthly = parseFloat(formData.monthlyMrr || '0') || 0;
    return ((monthly * 3) + oneOff).toFixed(2);
  };

  const color = getActionColor();

  return (
    <motion.form
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.15 }}
      onSubmit={onSubmit}
      className="flex flex-col h-full"
    >
      {/* Compact header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800/30">
        <button type="button" onClick={onBack} className="p-1 hover:bg-gray-800 rounded-md transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-500" />
        </button>
        {getActionIcon()}
        <span className="text-sm font-medium text-gray-300">{getActionTitle()}</span>
        {selectedContact ? (
          <>
            <span className="text-gray-600">•</span>
            <span className="text-xs text-emerald-400 truncate max-w-[150px]">
              {selectedContact.full_name || selectedContact.first_name || selectedContact.email}
            </span>
            <button type="button" onClick={onChangeContact} className="text-[10px] text-gray-500 hover:text-gray-300 ml-auto">
              Change
            </button>
          </>
        ) : (
          <span className="text-[10px] text-red-400/70 ml-auto">Contact required</span>
        )}
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {/* Contact selection - required for meeting/proposal */}
        {!selectedContact && (selectedAction === 'meeting' || selectedAction === 'proposal') && (
          <button
            type="button"
            onClick={onChangeContact}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed rounded-lg transition-colors text-sm",
              validationErrors.contact
                ? "border-red-500/50 text-red-400 hover:border-red-400/70"
                : `border-${color}-500/30 text-${color}-400 hover:border-${color}-500/60 hover:text-${color}-300`
            )}
          >
            <Users className="w-4 h-4" />
            Select Contact
          </button>
        )}

        {/* Date Selection */}
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Date</label>
          <div className="flex gap-1.5 mb-2">
            {[
              { label: 'Today', date: new Date() },
              { label: 'Yesterday', date: addDays(new Date(), -1) },
              { label: 'Last Week', date: addWeeks(new Date(), -1) }
            ].map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => { setSelectedDate(opt.date); setShowCalendar(false); }}
                className={cn(
                  "flex-1 py-2 rounded-md border text-sm transition-all",
                  format(selectedDate, 'yyyy-MM-dd') === format(opt.date, 'yyyy-MM-dd')
                    ? `bg-${color}-500/20 border-${color}-500/50 text-${color}-300`
                    : "bg-gray-800/30 border-gray-700/30 text-gray-500 hover:bg-gray-800/50"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowCalendar(!showCalendar)}
            className="w-full flex items-center justify-between bg-gray-800/30 border border-gray-700/30 rounded-md px-3 py-2 text-sm text-gray-400 hover:bg-gray-800/50"
          >
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {format(selectedDate, 'EEE, MMM d')}
            </span>
            <span className="text-gray-600">▾</span>
          </button>
          {showCalendar && (
            <div className="mt-1 bg-gray-900 border border-gray-700/50 rounded-lg p-2 z-20">
              <CalendarComponent
                mode="single"
                selected={selectedDate}
                onSelect={(date) => { if (date) { setSelectedDate(date); setShowCalendar(false); } }}
                className="text-xs [&_.rdp-day]:text-white [&_.rdp-day_selected]:!bg-emerald-600"
              />
            </div>
          )}
        </div>

        {/* Meeting-specific */}
        {selectedAction === 'meeting' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Type</label>
              <select
                required
                className="w-full bg-gray-800/30 border border-gray-700/30 rounded-md px-3 py-2 text-sm text-white"
                value={formData.details}
                onChange={(e) => setFormData({ ...formData, details: e.target.value })}
              >
                <option value="">Select</option>
                <option value="Discovery">Discovery</option>
                <option value="Demo">Demo</option>
                <option value="Follow-up">Follow-up</option>
                <option value="Proposal">Proposal</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Status</label>
              <select
                className="w-full bg-gray-800/30 border border-gray-700/30 rounded-md px-3 py-2 text-sm text-white"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                <option value="completed">Completed</option>
                <option value="pending">Scheduled</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
        )}

        {/* Proposal-specific */}
        {selectedAction === 'proposal' && (
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Value (£)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              className="w-full bg-gray-800/30 border border-gray-700/30 rounded-md px-3 py-2 text-sm text-white placeholder:text-gray-600"
              value={formData.amount || ''}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
            />
          </div>
        )}

        {/* Sale-specific */}
        {selectedAction === 'sale' && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Monthly (£)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="w-full bg-gray-800/30 border border-gray-700/30 rounded-md px-3 py-2 text-sm text-white placeholder:text-gray-600"
                  value={formData.monthlyMrr || ''}
                  onChange={(e) => setFormData({ ...formData, monthlyMrr: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">One-off (£)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="w-full bg-gray-800/30 border border-gray-700/30 rounded-md px-3 py-2 text-sm text-white placeholder:text-gray-600"
                  value={formData.oneOffRevenue || ''}
                  onChange={(e) => setFormData({ ...formData, oneOffRevenue: e.target.value })}
                />
              </div>
            </div>
            {(formData.monthlyMrr || formData.oneOffRevenue) && (
              <div className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded text-xs text-emerald-400">
                Deal: £{calculateDealValue()} <span className="text-emerald-300/60">(3mo)</span>
              </div>
            )}
          </div>
        )}

        {/* Company info */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Company</label>
            <input
              type="text"
              placeholder="Acme Inc."
              className={cn(
                "w-full bg-gray-800/30 border rounded-md px-3 py-2 text-sm text-white placeholder:text-gray-600",
                validationErrors.client_name ? "border-red-500/50" : "border-gray-700/30"
              )}
              value={formData.client_name || ''}
              onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
            />
            {validationErrors.client_name && (
              <p className="text-red-400 text-[10px] mt-0.5 flex items-center gap-0.5">
                <AlertCircle className="w-2.5 h-2.5" />
                {validationErrors.client_name}
              </p>
            )}
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Website</label>
            <input
              type="text"
              placeholder="acme.com"
              className="w-full bg-gray-800/30 border border-gray-700/30 rounded-md px-3 py-2 text-sm text-white placeholder:text-gray-600"
              value={formData.company_website || ''}
              onChange={(e) => {
                let val = e.target.value.trim();
                if (val && !val.startsWith('www.') && !val.startsWith('http') && val.includes('.')) {
                  val = `www.${val}`;
                }
                setFormData({ ...formData, company_website: val });
              }}
            />
          </div>
        </div>

        {/* Notes */}
        <textarea
          rows={2}
          placeholder="Notes (optional)..."
          className="w-full bg-gray-800/30 border border-gray-700/30 rounded-md px-3 py-2 text-sm text-white placeholder:text-gray-600 resize-none"
          value={formData.description || ''}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        />
      </div>

      {/* Footer */}
      <div className="flex gap-2 px-4 py-3 border-t border-gray-800/30">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 bg-gray-800/50 border border-gray-700/30 text-gray-400 rounded-lg hover:bg-gray-800 text-xs font-medium"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className={cn(
            "flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all",
            submitStatus === 'success'
              ? "bg-emerald-600 text-white"
              : isSubmitting
                ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                : `bg-${color}-600 text-white hover:bg-${color}-500`
          )}
        >
          {isSubmitting ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating...</>
          ) : submitStatus === 'success' ? (
            <><CheckCircle2 className="w-3.5 h-3.5" /> Created!</>
          ) : (
            <>Create {getActionTitle()}</>
          )}
        </button>
      </div>
    </motion.form>
  );
}

interface OutboundFormProps {
  formData: QuickAddFormData;
  setFormData: (data: QuickAddFormData) => void;
  validationErrors: ValidationErrors;
  isSubmitting: boolean;
  submitStatus: 'idle' | 'success' | 'error';
  onSubmit: (e: React.FormEvent) => Promise<void>;
  onBack: () => void;
  onAddContact: () => void;
  selectedContact: any;
  onChangeContact: () => void;
}

export function OutboundForm({
  formData,
  setFormData,
  validationErrors,
  isSubmitting,
  submitStatus,
  onSubmit,
  onBack,
  onAddContact,
  selectedContact,
  onChangeContact
}: OutboundFormProps) {
  return (
    <motion.form
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.15 }}
      onSubmit={onSubmit}
      className="flex flex-col h-full"
    >
      {/* Compact header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800/30">
        <button type="button" onClick={onBack} className="p-1 hover:bg-gray-800 rounded-md transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-500" />
        </button>
        <Phone className="w-4 h-4 text-sky-400" />
        <span className="text-sm font-medium text-gray-300">Outbound</span>
        {selectedContact && (
          <>
            <span className="text-gray-600">•</span>
            <span className="text-xs text-sky-400 truncate max-w-[120px]">
              {selectedContact.full_name || selectedContact.first_name || selectedContact.email}
            </span>
            <button type="button" onClick={onChangeContact} className="text-[10px] text-gray-500 hover:text-gray-300">
              Change
            </button>
          </>
        )}
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {!selectedContact && (
          <button
            type="button"
            onClick={onAddContact}
            className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-700 rounded-lg text-gray-400 hover:border-sky-500/50 hover:text-sky-400 transition-colors text-sm"
          >
            Select Contact
          </button>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Type</label>
            <select
              className="w-full bg-gray-800/30 border border-gray-700/30 rounded-md px-3 py-2 text-sm text-white"
              value={formData.outboundType || 'Call'}
              onChange={(e) => setFormData({ ...formData, outboundType: e.target.value })}
            >
              <option value="Call">📞 Call</option>
              <option value="Email">✉️ Email</option>
              <option value="LinkedIn">💼 LinkedIn</option>
              <option value="SMS">💬 SMS</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Count</label>
            <input
              type="number"
              min="1"
              max="50"
              placeholder="1"
              className="w-full bg-gray-800/30 border border-gray-700/30 rounded-md px-3 py-2 text-sm text-white"
              value={formData.outboundCount || '1'}
              onChange={(e) => setFormData({ ...formData, outboundCount: e.target.value })}
            />
          </div>
        </div>

        <textarea
          rows={2}
          placeholder="Details (optional)..."
          className="w-full bg-gray-800/30 border border-gray-700/30 rounded-md px-3 py-2 text-sm text-white placeholder:text-gray-600 resize-none"
          value={formData.details || ''}
          onChange={(e) => setFormData({ ...formData, details: e.target.value })}
        />
      </div>

      {/* Footer */}
      <div className="flex gap-2 px-4 py-3 border-t border-gray-800/30">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 bg-gray-800/50 border border-gray-700/30 text-gray-400 rounded-lg hover:bg-gray-800 text-xs font-medium"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className={cn(
            "flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all",
            submitStatus === 'success'
              ? "bg-emerald-600 text-white"
              : isSubmitting
                ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                : "bg-sky-600 text-white hover:bg-sky-500"
          )}
        >
          {isSubmitting ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Logging...</>
          ) : submitStatus === 'success' ? (
            <><CheckCircle2 className="w-3.5 h-3.5" /> Logged!</>
          ) : (
            <>Log Outbound</>
          )}
        </button>
      </div>
    </motion.form>
  );
}
