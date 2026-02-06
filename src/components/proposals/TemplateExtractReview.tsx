import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  createTemplateFromExtraction,
  type TemplateExtraction,
  type StructuredTemplate,
} from '@/lib/services/proposalService';
import { toast } from 'sonner';
import {
  Save,
  GripVertical,
  Loader2,
  FileText,
  Palette,
  ArrowLeft,
} from 'lucide-react';

export interface TemplateExtractReviewProps {
  extraction: TemplateExtraction;
  sourceAssetId: string;
  sourceFileName: string;
  orgId: string;
  onSaved: (template: StructuredTemplate) => void;
  onBack: () => void;
}

const SECTION_TYPES = [
  { value: 'cover', label: 'Cover Page' },
  { value: 'executive_summary', label: 'Executive Summary' },
  { value: 'problem', label: 'Problem / Challenges' },
  { value: 'solution', label: 'Solution' },
  { value: 'approach', label: 'Approach' },
  { value: 'scope', label: 'Scope of Work' },
  { value: 'timeline', label: 'Timeline' },
  { value: 'pricing', label: 'Pricing / Investment' },
  { value: 'terms', label: 'Terms & Conditions' },
  { value: 'team', label: 'Team' },
  { value: 'case_study', label: 'Case Study' },
  { value: 'custom', label: 'Custom' },
];

export default function TemplateExtractReview({
  extraction,
  sourceAssetId,
  sourceFileName,
  orgId,
  onSaved,
  onBack,
}: TemplateExtractReviewProps) {
  const defaultName = sourceFileName
    .replace(/\.(docx|pdf)$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const [templateName, setTemplateName] = useState(defaultName);
  const [description, setDescription] = useState(
    `Auto-created from ${sourceFileName} — ${extraction.metadata.detected_type}`
  );
  const [sections, setSections] = useState(extraction.sections);
  const [primaryColor, setPrimaryColor] = useState(extraction.brand_config.primary_color || '');
  const [secondaryColor, setSecondaryColor] = useState(extraction.brand_config.secondary_color || '');
  const [saving, setSaving] = useState(false);

  const updateSection = (index: number, field: string, value: string) => {
    setSections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  };

  const removeSection = (index: number) => {
    setSections((prev) => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i + 1 })));
  };

  const moveSection = (from: number, to: number) => {
    if (to < 0 || to >= sections.length) return;
    setSections((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next.map((s, i) => ({ ...s, order: i + 1 }));
    });
  };

  const handleSave = async () => {
    if (!templateName.trim()) {
      toast.error('Template name is required');
      return;
    }

    setSaving(true);
    try {
      // Build modified extraction with user edits
      const editedExtraction: TemplateExtraction = {
        ...extraction,
        sections,
        brand_config: {
          primary_color: primaryColor || null,
          secondary_color: secondaryColor || null,
          font_family: extraction.brand_config.font_family,
        },
      };

      const template = await createTemplateFromExtraction(
        templateName.trim(),
        description.trim(),
        editedExtraction,
        orgId,
        sourceAssetId
      );

      if (template) {
        toast.success(`Template "${template.name}" created`);
        onSaved(template);
      } else {
        toast.error('Failed to create template');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to save template';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Review Extracted Template
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {extraction.metadata.word_count.toLocaleString()} words &middot;{' '}
            {extraction.metadata.detected_type} &middot;{' '}
            {sections.length} sections detected
          </p>
        </div>
      </div>

      {/* Template name & description */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Template Name</Label>
          <Input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="My Proposal Template"
          />
        </div>
        <div className="space-y-2">
          <Label>Description</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description..."
          />
        </div>
      </div>

      {/* Brand config */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Palette className="w-4 h-4" />
            Brand Colours
            {extraction.brand_config.font_family && (
              <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                Font: {extraction.brand_config.font_family}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-gray-500">Primary</Label>
              <input
                type="color"
                value={primaryColor || '#1e40af'}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="w-8 h-8 rounded border border-gray-200 dark:border-gray-700 cursor-pointer"
              />
              <Input
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                placeholder="#1e40af"
                className="w-24 h-8 text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-gray-500">Secondary</Label>
              <input
                type="color"
                value={secondaryColor || '#64748b'}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="w-8 h-8 rounded border border-gray-200 dark:border-gray-700 cursor-pointer"
              />
              <Input
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                placeholder="#64748b"
                className="w-24 h-8 text-xs"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sections list */}
      <div className="space-y-3">
        <Label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Sections ({sections.length})
        </Label>

        {sections.map((section, index) => (
          <Card key={section.id} className="overflow-hidden">
            <CardContent className="p-3">
              <div className="flex items-start gap-2">
                {/* Drag handle + order */}
                <div className="flex flex-col items-center gap-1 pt-1">
                  <button
                    onClick={() => moveSection(index, index - 1)}
                    disabled={index === 0}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs"
                    title="Move up"
                  >
                    ▲
                  </button>
                  <GripVertical className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                  <button
                    onClick={() => moveSection(index, index + 1)}
                    disabled={index === sections.length - 1}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs"
                    title="Move down"
                  >
                    ▼
                  </button>
                </div>

                {/* Section fields */}
                <div className="flex-1 grid gap-2 sm:grid-cols-[140px_1fr]">
                  <Select
                    value={section.type}
                    onValueChange={(val) => updateSection(index, 'type', val)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SECTION_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Input
                    value={section.title}
                    onChange={(e) => updateSection(index, 'title', e.target.value)}
                    placeholder="Section title"
                    className="h-8 text-sm"
                  />

                  <div className="sm:col-span-2">
                    <Input
                      value={section.content_hint}
                      onChange={(e) => updateSection(index, 'content_hint', e.target.value)}
                      placeholder="Content hint for AI generation..."
                      className="h-8 text-xs text-gray-500"
                    />
                  </div>
                </div>

                {/* Remove */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeSection(index)}
                  className="text-gray-400 hover:text-red-500 h-8 w-8 p-0"
                  title="Remove section"
                >
                  ×
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Save button */}
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="outline" onClick={onBack}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving || !templateName.trim() || sections.length === 0}
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating Template...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Save as Template
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
