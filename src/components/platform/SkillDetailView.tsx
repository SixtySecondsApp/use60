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
  Link2,
  ExternalLink,
  Globe,
  Tag,
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
import { updatePlatformSkill } from '@/lib/services/platformSkillService';
import type {
  SkillFolder,
  SkillDocument,
  SkillWithFolders,
  SkillDocumentType,
  LinkedSkillPreview,
} from '@/lib/types/skills';
import { AddSkillLinkModal } from './AddSkillLinkModal';

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
  /** This skill is being viewed as a linked skill (read-only) */
  isLinkedSkill?: boolean;
  /** Parent skill info when viewing as linked skill */
  linkedFrom?: {
    skillId: string;
    skillKey: string;
    skillName: string;
  };
  /** Callback when user wants to edit the original skill */
  onEditOriginal?: () => void;
}

// =============================================================================
// Main Component
// =============================================================================

export function SkillDetailView({
  skillId,
  onBack,
  className,
  hideHeader = false,
  previewMode = false,
  isLinkedSkill = false,
  linkedFrom,
  onEditOriginal,
}: SkillDetailViewProps) {
  const navigate = useNavigate();

  // When viewing as linked skill, force preview mode and disable editing
  const effectivePreviewMode = previewMode || isLinkedSkill;
  const isReadOnly = isLinkedSkill;

  // Data state
  const [skill, setSkill] = useState<SkillWithFolders | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selection state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<'folder' | 'document' | 'skill' | 'linked-skill'>('skill');

  // Skill link modal state
  const [showAddSkillLink, setShowAddSkillLink] = useState(false);
  const [addSkillLinkFolderId, setAddSkillLinkFolderId] = useState<string | undefined>();

  // For viewing linked skills within this skill
  const [viewingLinkedSkill, setViewingLinkedSkill] = useState<LinkedSkillPreview | null>(null);

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

  // Load skill data (ensures standard folders exist on first load)
  const loadSkill = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Ensure standard folders exist before loading tree
      await skillFolderService.ensureStandardFolders(skillId);

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

  // Initialize skill suggestions for sequences (linked skills only)
  useEffect(() => {
    if (skill && skill.category === 'agent-sequence' && skill.linked_skills) {
      setSkillSuggestions(
        skill.linked_skills.map((ls) => ({
          skill_key: ls.skill_key,
          name: ls.name,
          category: ls.category,
        }))
      );
    } else {
      setSkillSuggestions([]);
    }
  }, [skill]);

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
    (id: string | null, type: 'folder' | 'document' | 'skill' | 'linked-skill') => {
      // Check for unsaved changes (only if not read-only)
      if (hasChanges && !isReadOnly) {
        // For now, just warn - could prompt to save
        toast.warning('You have unsaved changes');
      }

      setSelectedId(id);
      setSelectedType(type);

      // Handle linked skill selection - show preview
      if (type === 'linked-skill' && id && skill?.linked_skills) {
        const linkedSkill = skill.linked_skills.find((l) => l.link_id === id);
        if (linkedSkill) {
          setViewingLinkedSkill(linkedSkill);
          return;
        }
      }

      // Clear linked skill view when selecting something else
      setViewingLinkedSkill(null);

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
    [skill, hasChanges, isReadOnly]
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
        // Update main skill content and frontmatter
        const result = await updatePlatformSkill(skill.id, {
          content_template: editedContent,
          frontmatter: {
            ...skill.frontmatter,
            name: editedTitle,
            description: editedDescription,
          },
        });
        if (!result.success) {
          throw new Error(result.error || 'Failed to save skill');
        }
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

  // Standard folder names that cannot be deleted
  const STANDARD_FOLDER_NAMES = ['references', 'scripts', 'assets'];

  // Delete handlers
  const handleDeleteFolder = useCallback((folder: SkillFolder) => {
    if (!folder.parent_folder_id && STANDARD_FOLDER_NAMES.includes(folder.name.toLowerCase())) {
      toast.error(`Cannot delete standard folder "${folder.name}"`);
      return;
    }
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

  // For sequences: @ mention can reference linked skills
  // For regular skills: @ mention only references documents (no external skills)
  const handleSearchSkills = useCallback(
    async (query: string) => {
      if (!skill) {
        setSkillSuggestions([]);
        return;
      }

      // Only sequences (agent-sequence category) can reference linked skills
      if (skill.category !== 'agent-sequence') {
        setSkillSuggestions([]);
        return;
      }

      // Filter linked skills by query
      const linkedSkills = skill.linked_skills || [];
      const lowerQuery = query.toLowerCase();
      const filtered = linkedSkills
        .filter(
          (ls) =>
            ls.skill_key.toLowerCase().includes(lowerQuery) ||
            ls.name.toLowerCase().includes(lowerQuery)
        )
        .map((ls) => ({
          skill_key: ls.skill_key,
          name: ls.name,
          category: ls.category,
        }));

      setSkillSuggestions(filtered);
    },
    [skill]
  );

  // Handle back navigation
  const handleBack = useCallback(() => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  }, [onBack, navigate]);

  // Handle adding a skill link
  const handleAddSkillLink = useCallback(
    async (linkedSkillId: string, folderId?: string) => {
      if (!skill) return;
      await skillFolderService.addSkillLink({
        parent_skill_id: skill.id,
        linked_skill_id: linkedSkillId,
        folder_id: folderId,
      });
      toast.success('Skill linked');
      await loadSkill();
    },
    [skill, loadSkill]
  );

  // Handle removing a skill link
  const handleRemoveSkillLink = useCallback(
    async (link: LinkedSkillPreview) => {
      await skillFolderService.removeSkillLink(link.link_id);
      toast.success('Skill unlinked');
      // If we were viewing this linked skill, clear the view
      if (viewingLinkedSkill?.link_id === link.link_id) {
        setViewingLinkedSkill(null);
        handleSelect(null, 'skill');
      }
      await loadSkill();
    },
    [viewingLinkedSkill, handleSelect, loadSkill]
  );

  // Handle editing original skill (for linked skills)
  const handleEditOriginalSkill = useCallback(
    (link: LinkedSkillPreview) => {
      navigate(`/platform/skills/${link.skill_key}`);
    },
    [navigate]
  );

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
      {/* Linked skill banner - shown when viewing a linked skill */}
      {isLinkedSkill && linkedFrom && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-indigo-600/20 to-purple-600/20 border-b border-indigo-500/30">
          <div className="flex items-center gap-2 text-sm">
            <Link2 className="h-4 w-4 text-indigo-400" />
            <span className="text-indigo-200">Linked from:</span>
            <code className="px-1.5 py-0.5 bg-indigo-500/20 rounded font-mono text-xs text-indigo-300">
              {linkedFrom.skillKey}
            </code>
            <span className="text-gray-400">({linkedFrom.skillName})</span>
            <Badge className="ml-2 bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px]">
              Read-only
            </Badge>
          </div>
          {onEditOriginal && (
            <Button
              size="sm"
              variant="outline"
              onClick={onEditOriginal}
              className="gap-1.5 h-7 text-xs border-indigo-500/30 hover:bg-indigo-500/20 text-indigo-300"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Edit Original
            </Button>
          )}
        </div>
      )}

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
              <Badge
                variant="outline"
                className="bg-white/5 border-white/10 text-gray-400 gap-1 text-[11px]"
                title="Namespace — controls which agents can discover this skill"
              >
                <Globe className="h-3 w-3" />
                {skill.namespace}
              </Badge>
              <Badge
                variant="outline"
                className="bg-white/5 border-white/10 text-gray-400 gap-1 text-[11px]"
                title="Skill version"
              >
                <Tag className="h-3 w-3" />
                v{skill.version}
              </Badge>
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
              className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 border-0 shadow-lg shadow-blue-500/20 !text-white"
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
            className="gap-2 h-8 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 border-0 !text-white"
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
          {/* If viewing a linked skill from this skill, show nested SkillDetailView */}
          {viewingLinkedSkill ? (
            <SkillDetailView
              skillId={viewingLinkedSkill.id}
              isLinkedSkill={true}
              linkedFrom={{
                skillId: skill.id,
                skillKey: skill.skill_key,
                skillName: skill.frontmatter?.name || skill.skill_key,
              }}
              onEditOriginal={() => handleEditOriginalSkill(viewingLinkedSkill)}
              onBack={() => {
                setViewingLinkedSkill(null);
                handleSelect(null, 'skill');
              }}
              hideHeader={true}
              className="h-full"
            />
          ) : (
            <SkillContentEditor
              title={editedTitle}
              description={editedDescription}
              content={editedContent}
              onTitleChange={isReadOnly ? undefined : setEditedTitle}
              onDescriptionChange={isReadOnly ? undefined : setEditedDescription}
              onContentChange={isReadOnly ? undefined : setEditedContent}
              documentSuggestions={documentSuggestions}
              skillSuggestions={skillSuggestions}
              onSearchDocuments={handleSearchDocuments}
              onSearchSkills={handleSearchSkills}
              className="h-full"
              defaultShowPreview={effectivePreviewMode}
              hidePreviewToggle={effectivePreviewMode}
              readOnly={isReadOnly}
            />
          )}
        </div>

        {/* Right sidebar - folder tree (fixed 280px width) - hidden when viewing linked skill */}
        {!viewingLinkedSkill && (
          <div className="w-[280px] flex-shrink-0 border-l border-white/10 bg-gray-900/40">
            <SkillFolderTree
              skillKey={skill.skill_key}
              folders={skill.folders}
              documents={skill.documents}
              linkedSkills={skill.linked_skills}
              selectedId={selectedId}
              selectedType={selectedType}
              onSelect={handleSelect}
              onCreateFolder={isReadOnly ? undefined : (parentId) => {
                setCreateInFolderId(parentId);
                setShowCreateFolder(true);
              }}
              onCreateDocument={isReadOnly ? undefined : (folderId) => {
                setCreateInFolderId(folderId);
                setShowCreateDocument(true);
              }}
              onAddSkillLink={isReadOnly ? undefined : (folderId) => {
                setAddSkillLinkFolderId(folderId);
                setShowAddSkillLink(true);
              }}
              onRenameFolder={isReadOnly ? () => {} : (folder) => {
                // TODO: Implement rename modal
                toast.info('Rename coming soon');
              }}
              onRenameDocument={isReadOnly ? () => {} : (doc) => {
                // TODO: Implement rename modal
                toast.info('Rename coming soon');
              }}
              onDeleteFolder={isReadOnly ? () => {} : handleDeleteFolder}
              onDeleteDocument={isReadOnly ? () => {} : handleDeleteDocument}
              onDuplicateFolder={isReadOnly ? undefined : async (folder) => {
                await skillFolderService.duplicateFolder(folder.id);
                toast.success('Folder duplicated');
                await loadSkill();
              }}
              onDuplicateDocument={isReadOnly ? undefined : async (doc) => {
                await skillFolderService.duplicateDocument(doc.id);
                toast.success('Document duplicated');
                await loadSkill();
              }}
              onRemoveSkillLink={isReadOnly ? undefined : handleRemoveSkillLink}
              onEditOriginalSkill={handleEditOriginalSkill}
              className="h-full"
            />
          </div>
        )}
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

      <AddSkillLinkModal
        open={showAddSkillLink}
        onOpenChange={setShowAddSkillLink}
        parentSkillId={skill.id}
        parentSkillKey={skill.skill_key}
        folders={skill.folders}
        targetFolderId={addSkillLinkFolderId}
        onAddLink={handleAddSkillLink}
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
