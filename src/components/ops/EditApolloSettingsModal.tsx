import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface EditApolloSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: { reveal_personal_emails: boolean; reveal_phone_number: boolean }) => void;
  columnLabel: string;
  apolloPropertyName: string;
  currentConfig?: { reveal_personal_emails?: boolean; reveal_phone_number?: boolean };
}

export function EditApolloSettingsModal({
  isOpen,
  onClose,
  onSave,
  columnLabel,
  apolloPropertyName,
  currentConfig,
}: EditApolloSettingsModalProps) {
  const [revealEmails, setRevealEmails] = useState(false);
  const [revealPhone, setRevealPhone] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setRevealEmails(currentConfig?.reveal_personal_emails ?? false);
      setRevealPhone(currentConfig?.reveal_phone_number ?? false);
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

  const handleSave = () => {
    onSave({ reveal_personal_emails: revealEmails, reveal_phone_number: revealPhone });
    onClose();
  };

  if (!isOpen) return null;

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
            Edit Apollo Column: {columnLabel}
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
          {/* Apollo Property (read-only) */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-300">
              Apollo Property
            </label>
            <div className="rounded-lg border border-gray-700/60 bg-gray-800/50 px-3.5 py-2.5 text-sm text-gray-400 font-mono">
              {apolloPropertyName}
            </div>
          </div>

          {/* Enrichment Options */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              Enrichment Options
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2.5 cursor-pointer hover:border-gray-600 transition-colors">
              <input
                type="checkbox"
                checked={revealEmails}
                onChange={(e) => setRevealEmails(e.target.checked)}
                className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500/30"
              />
              <div className="flex-1">
                <span className="text-sm text-gray-200">Reveal personal emails</span>
                <span className="ml-2 text-xs text-gray-500">+1 credit/row</span>
              </div>
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2.5 cursor-pointer hover:border-gray-600 transition-colors">
              <input
                type="checkbox"
                checked={revealPhone}
                onChange={(e) => setRevealPhone(e.target.checked)}
                className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500/30"
              />
              <div className="flex-1">
                <span className="text-sm text-gray-200">Reveal phone numbers</span>
                <span className="ml-2 text-xs text-gray-500">+8 credits/row</span>
              </div>
            </label>
          </div>

          <p className="text-xs text-gray-500">
            Changes apply to future enrichment runs. Use &quot;Re-enrich all rows&quot; from the column menu to apply to existing rows.
          </p>
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
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default EditApolloSettingsModal;
