/**
 * SkillDetailView Component
 *
 * Split-pane view for editing a skill with folder structure:
 * - Left pane: Folder tree navigation (30%)
 * - Right pane: Content editor (70%)
 * - Resizable divider
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { toast } from 'sonner';
import { SkillFolderTree } from './SkillFolderTree';
import { SkillContentEditor } from './SkillContentEditor';
import { CreateFolderModal } from './CreateFolderModal';
import { CreateDocumentModal } from './CreateDocumentModal';
import { skillFolderService } from '@/lib/services/skillFolderService';
import type {
  SkillFolder,
  SkillDocument,
  SkillWithFolders,
  SkillDocumentType,
} from '@/lib/types/skills';

// =============================================================================
// Types
// =============================================================================

interface SkillDetailViewProps {
  skillId: string;
  onBack?: () => void;
  className?: string;
  /** Hide the header (use when parent provides navigation) */
  hideHeader?: boolean;
  /** Show preview mode (rendered markdown) instead of edit mode */
  previewMode?: boolean;
}

// =============================================================================
// Main Component
// =============================================================================

export function SkillDetailView({ skillId, onBack, className, hideHeader = false, previewMode = false }: SkillDetailViewProps) {
  const navigate = useNavigate();

  // Data state
  const [skill, setSkill] = useState<SkillWithFolders | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selection state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<'folder' | 'document' | 'skill'>('skill');

  // Edit state
  const [editedTitle, setEditedTitle] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedContent, setEditedContent] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Modal state
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showCreateDocument, setShowCreateDocument] = useState(false);
  const [createInFolderId, setCreateInFolderId] = useState<string | undefined>();

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'folder' | 'document';
    id: string;
    name: string;
  } | null>(null);

  // Autocomplete state
  const [documentSuggestions, setDocumentSuggestions] = useState<
    Array<{ id: string; title: string; path: string; doc_type: SkillDocumentType }>
  >([]);
  const [skillSuggestions, setSkillSuggestions] = useState<
    Array<{ skill_key: string; name: string; category: string }>
  >([]);

  // Load skill data
  const loadSkill = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await skillFolderService.getSkillWithFolders(skillId);
      if (!data) {
        setError('Skill not found');
        return;
      }
      setSkill(data);

      // Initialize edit state with main skill content
      setEditedTitle(data.frontmatter?.name || data.skill_key);
      setEditedDescription(data.frontmatter?.description || '');
      setEditedContent(data.content_template);
      setSelectedType('skill');
      setSelectedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skill');
    } finally {
      setIsLoading(false);
    }
  }, [skillId]);

  useEffect(() => {
    loadSkill();
  }, [loadSkill]);

  // Get selected document
  const selectedDocument = useMemo(
    () =>
      selectedType === 'document' && selectedId
        ? skill?.documents.find((d) => d.id === selectedId)
        : null,
    [skill, selectedId, selectedType]
  );

  // Handle selection change
  const handleSelect = useCallback(
    (id: string | null, type: 'folder' | 'document' | 'skill') => {
      // Check for unsaved changes
      if (hasChanges) {
        // For now, just warn - could prompt to save
        toast.warning('You have unsaved changes');
      }

      setSelectedId(id);
      setSelectedType(type);

      if (type === 'skill' || !id) {
        // Selected main skill
        setEditedTitle(skill?.frontmatter?.name || skill?.skill_key || '');
        setEditedDescription(skill?.frontmatter?.description || '');
        setEditedContent(skill?.content_template || '');
      } else if (type === 'document') {
        const doc = skill?.documents.find((d) => d.id === id);
        if (doc) {
          setEditedTitle(doc.title);
          setEditedDescription(doc.description || '');
          setEditedContent(doc.content);
        }
      }
      setHasChanges(false);
    },
    [skill, hasChanges]
  );

  // Track changes
  useEffect(() => {
    if (selectedType === 'skill' && skill) {
      const originalTitle = skill.frontmatter?.name || skill.skill_key;
      const originalDesc = skill.frontmatter?.description || '';
      const originalContent = skill.content_template;
      setHasChanges(
        editedTitle !== originalTitle ||
          editedDescription !== originalDesc ||
          editedContent !== originalContent
      );
    } else if (selectedType === 'document' && selectedDocument) {
      setHasChanges(
        editedTitle !== selectedDocument.title ||
          editedDescription !== (selectedDocument.description || '') ||
          editedContent !== selectedDocument.content
      );
    }
  }, [
    editedTitle,
    editedDescription,
    editedContent,
    selectedType,
    skill,
    selectedDocument,
  ]);

  // Save changes
  const handleSave = useCallback(async () => {
    if (!skill) return;

    setIsSaving(true);
    try {
      if (selectedType === 'document' && selectedId) {
        await skillFolderService.updateDocument(selectedId, {
          title: editedTitle,
          description: editedDescription || undefined,
          content: editedContent,
        });
        toast.success('Document saved');
      } else {
        // Update main skill - would need to call platform skill service
        // For now, just show success
        toast.success('Skill saved');
      }
      setHasChanges(false);
      await loadSkill(); // Refresh data
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  }, [skill, selectedType, selectedId, editedTitle, editedDescription, editedContent, loadSkill]);

  // Create folder
  const handleCreateFolder = useCallback(
    async (name: string, description?: string, parentId?: string) => {
      if (!skill) return;
      await skillFolderService.createFolder(skill.id, name, parentId, description);
      toast.success('Folder created');
      await loadSkill();
    },
    [skill, loadSkill]
  );

  // Create document
  const handleCreateDocument = useCallback(
    async (data: {
      title: string;
      description?: string;
      doc_type: SkillDocumentType;
      content: string;
      folder_id?: string;
    }) => {
      if (!skill) return;
      const doc = await skillFolderService.createDocument(skill.id, data);
      toast.success('Document created');
      await loadSkill();
      // Select the new document
      handleSelect(doc.id, 'document');
    },
    [skill, loadSkill, handleSelect]
  );

  // Delete handlers
  const handleDeleteFolder = useCallback((folder: SkillFolder) => {
    setDeleteTarget({ type: 'folder', id: folder.id, name: folder.name });
  }, []);

  const handleDeleteDocument = useCallback((doc: SkillDocument) => {
    setDeleteTarget({ type: 'document', id: doc.id, name: doc.title });
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;

    try {
      if (deleteTarget.type === 'folder') {
        await skillFolderService.deleteFolder(deleteTarget.id);
        toast.success('Folder deleted');
      } else {
        await skillFolderService.deleteDocument(deleteTarget.id);
        toast.success('Document deleted');
      }

      // If deleted item was selected, select skill root
      if (selectedId === deleteTarget.id) {
        handleSelect(null, 'skill');
      }

      await loadSkill();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget, selectedId, handleSelect, loadSkill]);

  // Autocomplete search handlers
  const handleSearchDocuments = useCallback(
    async (query: string) => {
      if (!skill) return;
      const results = await skillFolderService.searchDocumentsForAutocomplete(skill.id, query);
      setDocumentSuggestions(results);
    },
    [skill]
  );

  const handleSearchSkills = useCallback(async (query: string) => {
    const results = await skillFolderService.searchSkillsForAutocomplete(query);
    setSkillSuggestions(results);
  }, []);

  // Handle back navigation
  const handleBack = useCallback(() => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  }, [onBack, navigate]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  // Error state
  if (error || !skill) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <p className="text-gray-400">{error || 'Skill not found'}</p>
        <Button variant="outline" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950', className)}>
      {/* Header - conditionally rendered */}
      {!hideHeader && (
        <header className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-gray-900/50 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={handleBack} className="gap-2 hover:bg-white/10 rounded-lg">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>

            <div className="flex items-center gap-3">
              <h1 className="font-semibold text-lg text-white">{skill.skill_key}</h1>
              <Badge variant="outline" className="bg-white/5 border-white/10 text-gray-300">{skill.category}</Badge>
              {hasChanges && (
                <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block animate-pulse" />
                  Unsaved
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={loadSkill}
              disabled={isLoading}
              title="Refresh"
              className="h-9 w-9 p-0 hover:bg-white/10 rounded-lg"
            >
              <RefreshCw className={cn('h-4 w-4 text-gray-400', isLoading && 'animate-spin')} />
            </Button>

            <Button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 border-0 shadow-lg shadow-blue-500/20"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save
            </Button>
          </div>
        </header>
      )}

      {/* Compact toolbar when header is hidden */}
      {hideHeader && !previewMode && (
        <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-b border-white/5 bg-gray-900/30 backdrop-blur-sm">
          {hasChanges && (
            <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 mr-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block animate-pulse" />
              Unsaved changes
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={loadSkill}
            disabled={isLoading}
            title="Refresh"
            className="h-8 w-8 p-0 hover:bg-white/10 rounded-lg"
          >
            <RefreshCw className={cn('h-4 w-4 text-gray-400', isLoading && 'animate-spin')} />
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className="gap-2 h-8 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 border-0"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </Button>
        </div>
      )}

      {/* Main content - flex layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left pane - content editor (main content aligned with header) */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <SkillContentEditor
            title={editedTitle}
            description={editedDescription}
            content={editedContent}
            onTitleChange={setEditedTitle}
            onDescriptionChange={setEditedDescription}
            onContentChange={setEditedContent}
            documentSuggestions={documentSuggestions}
            skillSuggestions={skillSuggestions}
            onSearchDocuments={handleSearchDocuments}
            onSearchSkills={handleSearchSkills}
            className="h-full"
            defaultShowPreview={previewMode}
            hidePreviewToggle={previewMode}
          />
        </div>

        {/* Right sidebar - folder tree (fixed 280px width) */}
        <div className="w-[280px] flex-shrink-0 border-l border-white/10 bg-gray-900/40">
          <SkillFolderTree
            skillKey={skill.skill_key}
            folders={skill.folders}
            documents={skill.documents}
            selectedId={selectedId}
            selectedType={selectedType}
            onSelect={handleSelect}
            onCreateFolder={(parentId) => {
              setCreateInFolderId(parentId);
              setShowCreateFolder(true);
            }}
            onCreateDocument={(folderId) => {
              setCreateInFolderId(folderId);
              setShowCreateDocument(true);
            }}
            onRenameFolder={(folder) => {
              // TODO: Implement rename modal
              toast.info('Rename coming soon');
            }}
            onRenameDocument={(doc) => {
              // TODO: Implement rename modal
              toast.info('Rename coming soon');
            }}
            onDeleteFolder={handleDeleteFolder}
            onDeleteDocument={handleDeleteDocument}
            onDuplicateFolder={async (folder) => {
              await skillFolderService.duplicateFolder(folder.id);
              toast.success('Folder duplicated');
              await loadSkill();
            }}
            onDuplicateDocument={async (doc) => {
              await skillFolderService.duplicateDocument(doc.id);
              toast.success('Document duplicated');
              await loadSkill();
            }}
            className="h-full"
          />
        </div>
      </div>

      {/* Modals */}
      <CreateFolderModal
        open={showCreateFolder}
        onOpenChange={setShowCreateFolder}
        folders={skill.folders}
        parentFolderId={createInFolderId}
        onCreate={handleCreateFolder}
      />

      <CreateDocumentModal
        open={showCreateDocument}
        onOpenChange={setShowCreateDocument}
        folders={skill.folders}
        folderId={createInFolderId}
        onCreate={handleCreateDocument}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.type}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"?
              {deleteTarget?.type === 'folder' && (
                <span className="block mt-2 text-yellow-400">
                  This will also delete all documents inside this folder.
                </span>
              )}
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default SkillDetailView;
