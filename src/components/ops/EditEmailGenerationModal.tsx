import React, { useState, useEffect, useRef } from 'react';
import { X, Mail, Loader2 } from 'lucide-react';
import { OpenRouterModelPicker } from './OpenRouterModelPicker';

export interface EmailGenerationConfig {
  num_steps: number;
  angle: string;
  email_type: 'cold_outreach' | 'event_invitation' | 'meeting_request' | 'follow_up';
  event_details: {
    event_name?: string;
    date?: string;
    time?: string;
    venue?: string;
  } | null;
  sign_off: string;
  model: string;
  tier_strategy: 'two_tier' | 'single_tier';
}

interface EditEmailGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: EmailGenerationConfig) => void;
  onSaveAndRegenerate: (config: EmailGenerationConfig) => void;
  currentConfig: EmailGenerationConfig;
  columnLabel: string;
  isRegenerating?: boolean;
}

const EMAIL_TYPE_OPTIONS: { value: EmailGenerationConfig['email_type']; label: string }[] = [
  { value: 'cold_outreach', label: 'Cold Outreach' },
  { value: 'event_invitation', label: 'Event Invitation' },
  { value: 'meeting_request', label: 'Meeting Request' },
  { value: 'follow_up', label: 'Follow Up' },
];

export function EditEmailGenerationModal({
  isOpen,
  onClose,
  onSave,
  onSaveAndRegenerate,
  currentConfig,
  columnLabel,
  isRegenerating = false,
}: EditEmailGenerationModalProps) {
  const [angle, setAngle] = useState(currentConfig.angle);
  const [emailType, setEmailType] = useState(currentConfig.email_type);
  const [eventDetails, setEventDetails] = useState(currentConfig.event_details ?? {
    event_name: '',
    date: '',
    time: '',
    venue: '',
  });
  const [signOff, setSignOff] = useState(currentConfig.sign_off);
  const [model, setModel] = useState(currentConfig.model);
  const modalRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hasChanges =
    angle !== currentConfig.angle ||
    emailType !== currentConfig.email_type ||
    signOff !== currentConfig.sign_off ||
    model !== currentConfig.model ||
    JSON.stringify(eventDetails) !== JSON.stringify(currentConfig.event_details ?? {});

  useEffect(() => {
    if (isOpen) {
      setAngle(currentConfig.angle);
      setEmailType(currentConfig.email_type);
      setEventDetails(currentConfig.event_details ?? { event_name: '', date: '', time: '', venue: '' });
      setSignOff(currentConfig.sign_off);
      setModel(currentConfig.model);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen, currentConfig]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  const buildConfig = (): EmailGenerationConfig => ({
    num_steps: currentConfig.num_steps,
    angle: angle.trim(),
    email_type: emailType,
    event_details: emailType === 'event_invitation' ? eventDetails : null,
    sign_off: signOff.trim(),
    model,
    tier_strategy: (model.startsWith('google/') || model.startsWith('gemini')) ? 'single_tier' : 'two_tier',
  });

  const handleSave = () => {
    onSave(buildConfig());
    onClose();
  };

  const handleSaveAndRegenerate = () => {
    onSaveAndRegenerate(buildConfig());
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="w-full max-w-lg rounded-xl border border-gray-700 bg-gray-900 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700/60 px-6 py-4">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-violet-400" />
            <h2 className="text-lg font-semibold text-gray-100">Edit Email Generation</h2>
            <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
              {columnLabel}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] space-y-5 overflow-y-auto px-6 py-5">
          {/* Campaign Angle */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-300">
              Campaign Angle
            </label>
            <textarea
              ref={textareaRef}
              value={angle}
              onChange={(e) => setAngle(e.target.value)}
              placeholder="Describe the campaign angle or messaging direction..."
              rows={4}
              className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
            />
          </div>

          {/* Email Type */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-300">
              Email Type
            </label>
            <select
              value={emailType}
              onChange={(e) => setEmailType(e.target.value as EmailGenerationConfig['email_type'])}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-gray-100 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
            >
              {EMAIL_TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Event Details (conditional) */}
          {emailType === 'event_invitation' && (
            <div className="space-y-3 rounded-lg border border-gray-700/60 bg-gray-800/50 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Event Details</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-gray-400">Event Name</label>
                  <input
                    type="text"
                    value={eventDetails.event_name ?? ''}
                    onChange={(e) => setEventDetails(prev => ({ ...prev, event_name: e.target.value }))}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 outline-none transition-colors focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-400">Date</label>
                  <input
                    type="text"
                    value={eventDetails.date ?? ''}
                    onChange={(e) => setEventDetails(prev => ({ ...prev, date: e.target.value }))}
                    placeholder="e.g. 6th March"
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none transition-colors focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-400">Time</label>
                  <input
                    type="text"
                    value={eventDetails.time ?? ''}
                    onChange={(e) => setEventDetails(prev => ({ ...prev, time: e.target.value }))}
                    placeholder="e.g. 9am-11am"
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none transition-colors focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-400">Venue</label>
                  <input
                    type="text"
                    value={eventDetails.venue ?? ''}
                    onChange={(e) => setEventDetails(prev => ({ ...prev, venue: e.target.value }))}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 outline-none transition-colors focus:border-violet-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Sign-off */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-300">
              Sign-off
            </label>
            <input
              type="text"
              value={signOff}
              onChange={(e) => setSignOff(e.target.value)}
              placeholder="e.g. Best, Sarah"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
            />
          </div>

          {/* AI Model Selection */}
          <OpenRouterModelPicker
            value={model}
            onChange={setModel}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-700/60 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-700 hover:text-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className="rounded-lg border border-violet-600 bg-transparent px-4 py-2 text-sm font-medium text-violet-400 transition-colors hover:bg-violet-600/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save
          </button>
          <button
            onClick={handleSaveAndRegenerate}
            disabled={isRegenerating}
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRegenerating && <Loader2 className="h-4 w-4 animate-spin" />}
            {isRegenerating ? 'Regenerating...' : 'Save & Regenerate'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default EditEmailGenerationModal;
