/**
 * BulkGrantAccessModal Component
 * Modal for granting access to multiple users with email template selection
 */

import React, { useState } from 'react';
import DOMPurify from 'dompurify';
import { X, Send, ChevronDown, Eye, AlertCircle, CheckCircle } from 'lucide-react';
import type { WaitlistEntry } from '@/lib/types/waitlist';
import type { BulkGrantAccessResult } from '@/lib/services/waitlistAdminService';
import { useEmailTemplates, useEmailTemplatePreview } from '@/lib/hooks/useEmailTemplates';

export interface BulkGrantAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedEntries: WaitlistEntry[];
  onGrantAccess: (params: {
    emailTemplateId?: string;
    adminNotes?: string;
  }) => Promise<BulkGrantAccessResult>;
  adminName: string;
}

export function BulkGrantAccessModal({
  isOpen,
  onClose,
  selectedEntries,
  onGrantAccess,
  adminName,
}: BulkGrantAccessModalProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<BulkGrantAccessResult | null>(null);

  const { data: templates, isLoading: isLoadingTemplates } = useEmailTemplates('access_grant');
  const { data: preview } = useEmailTemplatePreview(
    selectedTemplateId,
    selectedEntries.length > 0
      ? {
          user_name: selectedEntries[0].full_name || 'John Doe',
          user_email: selectedEntries[0].email,
          company_name: selectedEntries[0].company_name || 'Acme Corp',
          referral_code: selectedEntries[0].referral_code || 'REF123',
          waitlist_position: selectedEntries[0].effective_position || 42,
          admin_name: adminName,
          custom_message: adminNotes || undefined,
          current_date: new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          expiry_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
        }
      : undefined
  );

  if (!isOpen) return null;

  const handleGrantAccess = async () => {
    setIsProcessing(true);
    setResult(null);

    try {
      const grantResult = await onGrantAccess({
        emailTemplateId: selectedTemplateId || undefined,
        adminNotes: adminNotes || undefined,
      });

      setResult(grantResult);

      // If all succeeded, close after 2 seconds
      if (grantResult.success && grantResult.failed === 0) {
        setTimeout(() => {
          onClose();
          resetState();
        }, 2000);
      }
    } catch (error: any) {
      setResult({
        success: false,
        granted: 0,
        failed: selectedEntries.length,
        total: selectedEntries.length,
        errors: [{ entryId: '', email: '', error: error.message || 'Unknown error' }],
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const resetState = () => {
    setSelectedTemplateId(null);
    setAdminNotes('');
    setShowPreview(false);
    setResult(null);
  };

  const handleClose = () => {
    if (!isProcessing) {
      onClose();
      resetState();
    }
  };

  // Get default template
  const defaultTemplate = templates?.find((t) => t.is_default);
  const currentTemplateId = selectedTemplateId || defaultTemplate?.id || null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-hidden bg-white dark:bg-gray-900 rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Grant Access to {selectedEntries.length} {selectedEntries.length === 1 ? 'User' : 'Users'}
          </h2>
          <button
            onClick={handleClose}
            disabled={isProcessing}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-6 space-y-6" style={{ maxHeight: 'calc(90vh - 140px)' }}>
          {/* Selected Users List */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Selected Users
            </h3>
            <div className="max-h-48 overflow-y-auto bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
              {selectedEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between text-sm"
                >
                  <div>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {entry.full_name || entry.email}
                    </span>
                    {entry.company_name && (
                      <span className="text-gray-500 dark:text-gray-400 ml-2">
                        @ {entry.company_name}
                      </span>
                    )}
                  </div>
                  <span className="text-gray-600 dark:text-gray-400">{entry.email}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Email Template Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Email Template
            </label>
            <div className="relative">
              <select
                value={currentTemplateId || ''}
                onChange={(e) => setSelectedTemplateId(e.target.value || null)}
                disabled={isLoadingTemplates || isProcessing}
                className="
                  w-full px-4 py-2 pr-10
                  bg-white dark:bg-gray-800
                  border border-gray-300 dark:border-gray-600
                  rounded-lg
                  text-gray-900 dark:text-white
                  focus:ring-2 focus:ring-blue-500 focus:border-transparent
                  disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed
                  appearance-none
                "
              >
                {isLoadingTemplates ? (
                  <option>Loading templates...</option>
                ) : (
                  templates?.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.template_name} {template.is_default && '(Default)'}
                    </option>
                  ))
                )}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
            </div>

            {/* Preview Button */}
            <button
              onClick={() => setShowPreview(!showPreview)}
              disabled={!currentTemplateId || isProcessing}
              className="mt-2 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              <Eye className="w-4 h-4" />
              {showPreview ? 'Hide' : 'Show'} Email Preview
            </button>
          </div>

          {/* Email Preview */}
          {showPreview && preview && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email Preview (with sample data)
              </h4>
              <div className="space-y-3">
                <div>
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Subject:
                  </span>
                  <p className="text-sm text-gray-900 dark:text-white mt-1">{preview.subject}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Body Preview:
                  </span>
                  <div
                    className="mt-1 max-h-64 overflow-y-auto text-xs bg-white dark:bg-gray-900 rounded p-3 border border-gray-200 dark:border-gray-600"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(preview.body) }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Admin Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Admin Notes (Optional)
              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                Will be included in the email as a personal message
              </span>
            </label>
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              disabled={isProcessing}
              rows={3}
              placeholder="Add a personal message to include in the invitation email..."
              className="
                w-full px-4 py-2
                bg-white dark:bg-gray-800
                border border-gray-300 dark:border-gray-600
                rounded-lg
                text-gray-900 dark:text-white
                placeholder-gray-400 dark:placeholder-gray-500
                focus:ring-2 focus:ring-blue-500 focus:border-transparent
                disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed
                resize-none
              "
            />
          </div>

          {/* Result Display */}
          {result && (
            <div
              className={`
                p-4 rounded-lg border
                ${
                  result.success && result.failed === 0
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                    : result.success && result.failed > 0
                    ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                }
              `}
            >
              <div className="flex items-start gap-3">
                {result.success && result.failed === 0 ? (
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />
                ) : (
                  <AlertCircle
                    className={`w-5 h-5 mt-0.5 ${
                      result.success && result.failed > 0
                        ? 'text-yellow-600 dark:text-yellow-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  />
                )}
                <div className="flex-1">
                  <h4
                    className={`text-sm font-medium ${
                      result.success && result.failed === 0
                        ? 'text-green-900 dark:text-green-200'
                        : result.success && result.failed > 0
                        ? 'text-yellow-900 dark:text-yellow-200'
                        : 'text-red-900 dark:text-red-200'
                    }`}
                  >
                    {result.success && result.failed === 0
                      ? 'All users granted access successfully!'
                      : result.success && result.failed > 0
                      ? 'Partial success'
                      : 'Failed to grant access'}
                  </h4>
                  <p
                    className={`text-sm mt-1 ${
                      result.success && result.failed === 0
                        ? 'text-green-700 dark:text-green-300'
                        : result.success && result.failed > 0
                        ? 'text-yellow-700 dark:text-yellow-300'
                        : 'text-red-700 dark:text-red-300'
                    }`}
                  >
                    Granted: {result.granted} | Failed: {result.failed} | Total: {result.total}
                  </p>

                  {/* Error Details */}
                  {result.errors && result.errors.length > 0 && (
                    <div className="mt-3 space-y-1">
                      <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                        Errors:
                      </p>
                      {result.errors.map((error, index) => (
                        <div key={index} className="text-xs text-gray-600 dark:text-gray-400">
                          • {error.email || 'Unknown'}: {error.error}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleClose}
            disabled={isProcessing}
            className="
              px-4 py-2
              text-gray-700 dark:text-gray-300
              hover:bg-gray-100 dark:hover:bg-gray-800
              disabled:opacity-50 disabled:cursor-not-allowed
              rounded-lg
              font-medium text-sm
              transition-colors
            "
          >
            {result && result.success ? 'Close' : 'Cancel'}
          </button>
          {(!result || !result.success || result.failed > 0) && (
            <button
              onClick={handleGrantAccess}
              disabled={isProcessing || selectedEntries.length === 0}
              className="
                flex items-center gap-2
                px-6 py-2
                bg-blue-600 text-white
                hover:bg-blue-700
                disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed
                rounded-lg
                font-medium text-sm
                transition-colors
                shadow-sm
              "
            >
              <Send className="w-4 h-4" />
              {isProcessing ? 'Processing...' : 'Grant Access & Send Invites'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
