/**
 * EmailTemplates Page
 * Admin page for managing waitlist invitation email templates
 */

import React, { useState } from 'react';
import { Plus, Eye, Edit2, Trash2, Star, ChevronDown } from 'lucide-react';
import { BackToPlatform } from '@/components/platform/BackToPlatform';
import {
  useEmailTemplates,
  useEmailTemplatePreview,
  useEmailTemplateOperations,
} from '@/lib/hooks/useEmailTemplates';
import type { EmailTemplate, TemplateType } from '@/lib/services/emailTemplateService';
import { useAuth } from '@/lib/contexts/AuthContext';

export default function EmailTemplatesPage() {
  const { user } = useAuth();
  const [selectedType, setSelectedType] = useState<TemplateType>('access_grant');
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const { data: templates, isLoading } = useEmailTemplates(selectedType);
  const { data: preview } = useEmailTemplatePreview(previewTemplateId);
  const operations = useEmailTemplateOperations(user?.id || '');

  const handleSetDefault = (templateId: string) => {
    operations.setDefault({ templateId, type: selectedType });
  };

  const handleDelete = (templateId: string) => {
    if (confirm('Are you sure you want to delete this template?')) {
      operations.delete(templateId);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <BackToPlatform />
          <div className="flex items-center justify-between mt-2">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Email Templates
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                Manage customizable templates for waitlist invitations and user communications
              </p>
            </div>
            <button
              onClick={() => setIsCreating(true)}
              className="
                flex items-center gap-2
                px-4 py-2
                bg-blue-600 text-white
                hover:bg-blue-700
                rounded-lg
                font-medium
                transition-colors
                shadow-sm
              "
            >
              <Plus className="w-5 h-5" />
              New Template
            </button>
          </div>

          {/* Type Selector */}
          <div className="flex gap-2 mt-6">
            {(['access_grant', 'reminder', 'welcome'] as TemplateType[]).map((type) => (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`
                  px-4 py-2
                  rounded-lg
                  font-medium text-sm
                  transition-colors
                  ${
                    selectedType === type
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }
                `}
              >
                {type === 'access_grant'
                  ? 'Access Grant'
                  : type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Templates List */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-64 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 animate-pulse"
              />
            ))}
          </div>
        ) : templates && templates.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onPreview={() => setPreviewTemplateId(template.id)}
                onEdit={() => setEditingTemplate(template)}
                onDelete={() => handleDelete(template.id)}
                onSetDefault={() => handleSetDefault(template.id)}
                isProcessing={operations.isProcessing}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">
              No templates found for this type. Create one to get started.
            </p>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewTemplateId && preview && (
        <PreviewModal
          preview={preview}
          onClose={() => setPreviewTemplateId(null)}
        />
      )}

      {/* Create/Edit Modal */}
      {(isCreating || editingTemplate) && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                {isCreating ? 'Create New Template' : 'Edit Template'}
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                Coming soon: Full template editor with variable insertion and live preview
              </p>
              <button
                onClick={() => {
                  setIsCreating(false);
                  setEditingTemplate(null);
                }}
                className="mt-6 px-4 py-2 bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Template Card Component
function TemplateCard({
  template,
  onPreview,
  onEdit,
  onDelete,
  onSetDefault,
  isProcessing,
}: {
  template: EmailTemplate;
  onPreview: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  isProcessing: boolean;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 hover:shadow-lg transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
              {template.template_name}
            </h3>
            {template.is_default && (
              <Star className="w-4 h-4 text-yellow-500 fill-yellow-500 flex-shrink-0" />
            )}
          </div>
          {template.description && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
              {template.description}
            </p>
          )}
        </div>
      </div>

      {/* Subject Line Preview */}
      <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
          Subject Line:
        </div>
        <div className="text-sm text-gray-900 dark:text-white line-clamp-2">
          {template.subject_line}
        </div>
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 mb-4">
        <span>Created {new Date(template.created_at).toLocaleDateString()}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onPreview}
          disabled={isProcessing}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          <Eye className="w-4 h-4" />
          Preview
        </button>
        <button
          onClick={onEdit}
          disabled={isProcessing}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/30 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          <Edit2 className="w-4 h-4" />
          Edit
        </button>
      </div>

      {/* Secondary Actions */}
      <div className="flex items-center gap-2 mt-2">
        {!template.is_default && (
          <button
            onClick={onSetDefault}
            disabled={isProcessing}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Star className="w-4 h-4" />
            Set Default
          </button>
        )}
        <button
          onClick={onDelete}
          disabled={isProcessing || template.is_default}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" />
          Delete
        </button>
      </div>
    </div>
  );
}

// Preview Modal Component
function PreviewModal({
  preview,
  onClose,
}: {
  preview: { subject: string; body: string };
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Email Preview
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            <div>
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                Subject:
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-gray-900 dark:text-white">
                {preview.subject}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                Email Body (with sample data):
              </div>
              <div
                className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-auto"
                dangerouslySetInnerHTML={{ __html: preview.body }}
              />
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
