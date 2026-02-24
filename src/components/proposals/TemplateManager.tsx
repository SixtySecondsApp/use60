import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  getStructuredTemplates,
  updateStructuredTemplate,
  deleteStructuredTemplate,
  duplicateStructuredTemplate,
  type StructuredTemplate,
  type TemplateExtraction,
} from '@/lib/services/proposalService';
import TemplateUploader from './TemplateUploader';
import TemplateExtractReview from './TemplateExtractReview';
import { useOrgId } from '@/lib/contexts/OrgContext';
import { toast } from 'sonner';
import {
  FileText,
  Copy,
  Trash2,
  Pencil,
  Save,
  X,
  Globe,
  Building2,
  Loader2,
  Palette,
  Upload,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function categoryLabel(cat: string): string {
  switch (cat) {
    case 'starter': return 'Built-in';
    case 'org': return 'Organisation';
    case 'personal': return 'Personal';
    default: return cat;
  }
}

function categoryIcon(cat: string) {
  return cat === 'starter' ? Globe : Building2;
}

function sectionSummary(sections: StructuredTemplate['sections']): string {
  if (!sections || sections.length === 0) return 'No sections';
  return `${sections.length} section${sections.length === 1 ? '' : 's'}`;
}

function colorSwatch(hex: string | undefined) {
  if (!hex) return null;
  return (
    <span
      className="inline-block w-3 h-3 rounded-full border border-gray-300 dark:border-gray-600"
      style={{ backgroundColor: hex }}
    />
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function TemplateManager() {
  const orgId = useOrgId();
  const [templates, setTemplates] = useState<StructuredTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; description: string }>({ name: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StructuredTemplate | null>(null);
  const [duplicating, setDuplicating] = useState<string | null>(null);

  // Upload flow state
  const [showUpload, setShowUpload] = useState(false);
  const [uploadExtraction, setUploadExtraction] = useState<{
    extraction: TemplateExtraction;
    assetId: string;
    fileName: string;
  } | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getStructuredTemplates();
      setTemplates(data);
    } catch {
      toast.error('Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleEdit = (t: StructuredTemplate) => {
    setEditingId(t.id);
    setEditForm({ name: t.name, description: t.description || '' });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({ name: '', description: '' });
  };

  const handleSave = async (id: string) => {
    setSaving(true);
    try {
      const ok = await updateStructuredTemplate(id, {
        name: editForm.name,
        description: editForm.description || null,
      });
      if (ok) {
        toast.success('Template updated');
        setEditingId(null);
        await loadTemplates();
      } else {
        toast.error('Failed to update template');
      }
    } catch {
      toast.error('Error updating template');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const ok = await deleteStructuredTemplate(deleteTarget.id);
      if (ok) {
        toast.success('Template deleted');
        await loadTemplates();
      } else {
        toast.error('Failed to delete template');
      }
    } catch {
      toast.error('Error deleting template');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleDuplicate = async (t: StructuredTemplate) => {
    if (!orgId) {
      toast.error('No organisation selected');
      return;
    }
    setDuplicating(t.id);
    try {
      const copy = await duplicateStructuredTemplate(t.id, orgId);
      if (copy) {
        toast.success(`Duplicated as "${copy.name}"`);
        await loadTemplates();
      } else {
        toast.error('Failed to duplicate template');
      }
    } catch {
      toast.error('Error duplicating template');
    } finally {
      setDuplicating(null);
    }
  };

  // Group templates
  const starters = templates.filter((t) => t.category === 'starter');
  const orgTemplates = templates.filter((t) => t.category === 'org' || t.category === 'personal');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-blue-600 dark:text-blue-400" />
        <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading templates...</span>
      </div>
    );
  }

  const renderCard = (t: StructuredTemplate) => {
    const isEditing = editingId === t.id;
    const isStarter = t.category === 'starter';
    const CatIcon = categoryIcon(t.category);
    const primary = (t.brand_config as Record<string, string> | null)?.primary_color;

    return (
      <Card key={t.id} className="group">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <div className="space-y-2">
                  <Input
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Template name"
                    className="text-base font-semibold"
                  />
                  <Textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Description (optional)"
                    rows={2}
                    className="text-sm"
                  />
                </div>
              ) : (
                <>
                  <CardTitle className="text-base flex items-center gap-2">
                    {t.name}
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                      <CatIcon className="w-2.5 h-2.5" />
                      {categoryLabel(t.category)}
                    </span>
                  </CardTitle>
                  {t.description && (
                    <CardDescription className="mt-1 line-clamp-2">
                      {t.description}
                    </CardDescription>
                  )}
                </>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {isEditing ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleCancelEdit}
                    disabled={saving}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleSave(t.id)}
                    disabled={saving || !editForm.name.trim()}
                  >
                    <Save className="w-3.5 h-3.5 mr-1" />
                    {saving ? 'Saving...' : 'Save'}
                  </Button>
                </>
              ) : (
                <>
                  {!isStarter && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleEdit(t)}
                      title="Edit"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDuplicate(t)}
                    disabled={duplicating === t.id}
                    title="Duplicate to your organisation"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    {duplicating === t.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </Button>
                  {!isStarter && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteTarget(t)}
                      title="Delete"
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <FileText className="w-3 h-3" />
              {sectionSummary(t.sections)}
            </span>
            {primary && (
              <span className="flex items-center gap-1">
                <Palette className="w-3 h-3" />
                {colorSwatch(primary)}
                {primary}
              </span>
            )}
            <span>
              Updated {new Date(t.updated_at).toLocaleDateString()}
            </span>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Upload flow: show review screen
  if (uploadExtraction) {
    return (
      <TemplateExtractReview
        extraction={uploadExtraction.extraction}
        sourceAssetId={uploadExtraction.assetId}
        sourceFileName={uploadExtraction.fileName}
        orgId={orgId || ''}
        onSaved={() => {
          setUploadExtraction(null);
          setShowUpload(false);
          loadTemplates();
        }}
        onBack={() => {
          setUploadExtraction(null);
        }}
      />
    );
  }

  // Upload flow: show uploader
  if (showUpload) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setShowUpload(false)}>
            <X className="w-4 h-4 mr-1" />
            Cancel
          </Button>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Upload Example Proposal
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Upload a .docx or .pdf and we will extract its structure as a reusable template.
            </p>
          </div>
        </div>
        <TemplateUploader
          orgId={orgId || ''}
          onExtractionComplete={(extraction, assetId, fileName) => {
            setUploadExtraction({ extraction, assetId, fileName });
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Structured Templates
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage section-based proposal templates. Duplicate a starter to customise it for your organisation.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowUpload(true)}
        >
          <Upload className="w-4 h-4 mr-1.5" />
          Upload Example
        </Button>
      </div>

      {/* Org templates */}
      {orgTemplates.length > 0 && (
        <div className="space-y-3">
          <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Your Templates
          </Label>
          <div className="grid gap-3">
            {orgTemplates.map(renderCard)}
          </div>
        </div>
      )}

      {/* Starters */}
      {starters.length > 0 && (
        <div className="space-y-3">
          <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Built-in Starters
          </Label>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Global templates available to all organisations. Duplicate one to make it your own.
          </p>
          <div className="grid gap-3">
            {starters.map(renderCard)}
          </div>
        </div>
      )}

      {templates.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No structured templates found. Upload an example proposal or generate one and save it as a template.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setShowUpload(true)}
            >
              <Upload className="w-4 h-4 mr-1.5" />
              Upload Example Proposal
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &ldquo;{deleteTarget?.name}&rdquo;. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
