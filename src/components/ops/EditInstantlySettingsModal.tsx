import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import type { InstantlyColumnConfig, InstantlyCampaign, InstantlyFieldMapping } from '@/lib/types/instantly';

interface EditInstantlySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: Partial<InstantlyColumnConfig>) => void;
  columnLabel: string;
  currentConfig?: InstantlyColumnConfig;
  orgId?: string;
}

export function EditInstantlySettingsModal({
  isOpen,
  onClose,
  onSave,
  columnLabel,
  currentConfig,
  orgId,
}: EditInstantlySettingsModalProps) {
  const [campaigns, setCampaigns] = useState<InstantlyCampaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [fieldMapping, setFieldMapping] = useState<InstantlyFieldMapping>({
    email: '',
  });
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && currentConfig) {
      setSelectedCampaignId(currentConfig.campaign_id ?? currentConfig.push_config?.campaign_id ?? '');
      setFieldMapping(currentConfig.field_mapping ?? { email: '' });
    }
  }, [isOpen, currentConfig]);

  useEffect(() => {
    if (isOpen && orgId) {
      loadCampaigns();
    }
  }, [isOpen, orgId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const loadCampaigns = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke('instantly-admin', {
        body: { action: 'list_campaigns', org_id: orgId },
      });
      if (data?.campaigns) {
        setCampaigns(data.campaigns);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  const handleSave = () => {
    const updates: Partial<InstantlyColumnConfig> = {};
    if (selectedCampaignId) {
      const campaign = campaigns.find((c) => c.id === selectedCampaignId);
      updates.campaign_id = selectedCampaignId;
      updates.campaign_name = campaign?.name ?? currentConfig?.campaign_name;
    }
    if (fieldMapping.email) {
      updates.field_mapping = fieldMapping;
    }
    onSave(updates);
    onClose();
  };

  if (!isOpen) return null;

  const subtype = currentConfig?.instantly_subtype ?? 'campaign_config';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700/60 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-100">
            Edit Instantly Column: {columnLabel}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-5">
          {/* Subtype (read-only) */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-300">
              Column Type
            </label>
            <div className="rounded-lg border border-gray-700/60 bg-gray-800/50 px-3.5 py-2.5 text-sm text-gray-400 font-mono">
              {subtype.replace(/_/g, ' ')}
            </div>
          </div>

          {/* Campaign selector — only for campaign_config and push_action */}
          {(subtype === 'campaign_config' || subtype === 'push_action') && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">
                Campaign
              </label>
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading campaigns...
                </div>
              ) : (
                <select
                  value={selectedCampaignId}
                  onChange={(e) => setSelectedCampaignId(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-200 outline-none focus:border-violet-500"
                >
                  <option value="">Select campaign...</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Field mapping — only for campaign_config */}
          {subtype === 'campaign_config' && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">
                Field Mapping
              </label>
              {(['email', 'first_name', 'last_name', 'company_name'] as const).map((field) => (
                <div key={field} className="flex items-center gap-2">
                  <label className="w-28 text-xs text-gray-400 capitalize">
                    {field.replace(/_/g, ' ')}
                  </label>
                  <input
                    type="text"
                    value={(fieldMapping as any)[field] ?? ''}
                    onChange={(e) => setFieldMapping({ ...fieldMapping, [field]: e.target.value })}
                    placeholder="Column key..."
                    className="flex-1 rounded border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-sm text-gray-200 outline-none focus:border-violet-500 placeholder-gray-600"
                  />
                </div>
              ))}
            </div>
          )}

          {subtype === 'campaign_config' && (
            <p className="text-xs text-gray-500">
              Changes will apply to future pushes. Existing leads in the campaign are not affected.
            </p>
          )}
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
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
          >
            <Send className="w-3.5 h-3.5" />
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default EditInstantlySettingsModal;
