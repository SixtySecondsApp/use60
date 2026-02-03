/**
 * SkillFolderTree Component
 *
 * Tree view for skill folder structure with:
 * - Expandable/collapsible folders
 * - Document icons by type
 * - Click to select
 * - Context menu for actions
 * - Drag and drop (future)
 */

import { useState, useCallback, useMemo } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  FileCode,
  FileType,
  Lightbulb,
  Link2,
  MoreVertical,
  Plus,
  Pencil,
  Trash2,
  Copy,
  FolderPlus,
  FilePlus,
  ExternalLink,
  LinkIcon,
  Unlink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import type {
  SkillFolder,
  SkillDocument,
  SkillTreeNode,
  SkillDocumentType,
  LinkedSkillPreview,
} from '@/lib/types/skills';
import { buildSkillTree } from '@/lib/types/skills';

// =============================================================================
// Types
// =============================================================================

interface SkillFolderTreeProps {
  skillKey: string;
  folders: SkillFolder[];
  documents: SkillDocument[];
  linkedSkills?: LinkedSkillPreview[];
  selectedId: string | null;
  selectedType: 'folder' | 'document' | 'skill' | 'linked-skill' | null;
  onSelect: (id: string | null, type: 'folder' | 'document' | 'skill' | 'linked-skill') => void;
  onCreateFolder: (parentId?: string) => void;
  onCreateDocument: (folderId?: string) => void;
  onAddSkillLink?: (folderId?: string) => void;
  onRenameFolder: (folder: SkillFolder) => void;
  onRenameDocument: (document: SkillDocument) => void;
  onDeleteFolder: (folder: SkillFolder) => void;
  onDeleteDocument: (document: SkillDocument) => void;
  onDuplicateFolder?: (folder: SkillFolder) => void;
  onDuplicateDocument?: (document: SkillDocument) => void;
  onRemoveSkillLink?: (link: LinkedSkillPreview) => void;
  onEditOriginalSkill?: (link: LinkedSkillPreview) => void;
  className?: string;
}

// =============================================================================
// Icon Mapping
// =============================================================================

const DOC_TYPE_ICONS: Record<SkillDocumentType, typeof FileText> = {
  prompt: FileCode,
  example: Lightbulb,
  asset: FileText,
  reference: Link2,
  template: FileType,
};

const DOC_TYPE_COLORS: Record<SkillDocumentType, string> = {
  prompt: 'text-blue-400',
  example: 'text-yellow-400',
  asset: 'text-gray-400',
  reference: 'text-purple-400',
  template: 'text-green-400',
};

// =============================================================================
// Tree Node Component
// =============================================================================

interface TreeNodeProps {
  node: SkillTreeNode;
  level: number;
  selectedId: string | null;
  selectedType: 'folder' | 'document' | 'skill' | 'linked-skill' | null;
  expandedFolders: Set<string>;
  onToggleExpand: (id: string) => void;
  onSelect: (id: string, type: 'folder' | 'document' | 'skill' | 'linked-skill') => void;
  onCreateFolder: (parentId?: string) => void;
  onCreateDocument: (folderId?: string) => void;
  onAddSkillLink?: (folderId?: string) => void;
  onRename: (node: SkillTreeNode) => void;
  onDelete: (node: SkillTreeNode) => void;
  onDuplicate?: (node: SkillTreeNode) => void;
  onRemoveLink?: (node: SkillTreeNode) => void;
  onEditOriginal?: (node: SkillTreeNode) => void;
  folders: SkillFolder[];
  documents: SkillDocument[];
  linkedSkills?: LinkedSkillPreview[];
}

function TreeNode({
  node,
  level,
  selectedId,
  selectedType,
  expandedFolders,
  onToggleExpand,
  onSelect,
  onCreateFolder,
  onCreateDocument,
  onAddSkillLink,
  onRename,
  onDelete,
  onDuplicate,
  onRemoveLink,
  onEditOriginal,
  folders,
  documents,
  linkedSkills,
}: TreeNodeProps) {
  const isFolder = node.type === 'folder';
  const isLinkedSkill = node.type === 'linked-skill';
  const isExpanded = expandedFolders.has(node.id);
  const isSelected = selectedId === node.id && selectedType === node.type;

  // Determine icon based on node type
  const Icon = isLinkedSkill
    ? LinkIcon
    : isFolder
    ? isExpanded
      ? FolderOpen
      : Folder
    : DOC_TYPE_ICONS[node.doc_type as SkillDocumentType] || FileText;

  // Determine icon color - linked skills get a special gradient look
  const iconColor = isLinkedSkill
    ? 'text-indigo-400'
    : isFolder
    ? 'text-amber-400'
    : DOC_TYPE_COLORS[node.doc_type as SkillDocumentType] || 'text-gray-400';

  const handleClick = useCallback(() => {
    if (isFolder) {
      onToggleExpand(node.id);
    }
    onSelect(node.id, node.type);
  }, [isFolder, node.id, node.type, onToggleExpand, onSelect]);

  const handleContextAction = useCallback(
    (action: 'rename' | 'delete' | 'duplicate' | 'add-folder' | 'add-document' | 'add-skill-link' | 'remove-link' | 'edit-original') => {
      switch (action) {
        case 'rename':
          onRename(node);
          break;
        case 'delete':
          onDelete(node);
          break;
        case 'duplicate':
          onDuplicate?.(node);
          break;
        case 'add-folder':
          onCreateFolder(node.id);
          break;
        case 'add-document':
          onCreateDocument(node.id);
          break;
        case 'add-skill-link':
          onAddSkillLink?.(node.id);
          break;
        case 'remove-link':
          onRemoveLink?.(node);
          break;
        case 'edit-original':
          onEditOriginal?.(node);
          break;
      }
    },
    [node, onRename, onDelete, onDuplicate, onCreateFolder, onCreateDocument, onAddSkillLink, onRemoveLink, onEditOriginal]
  );

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-1.5 px-2 py-2 mx-2 rounded-lg cursor-pointer transition-all duration-200',
          'hover:bg-white/5',
          isSelected && 'bg-gradient-to-r from-blue-600/15 to-indigo-600/15 ring-1 ring-blue-500/30',
          // Special styling for linked skills
          isLinkedSkill && !isSelected && 'bg-indigo-500/5 border border-indigo-500/20'
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
      >
        {/* Expand/collapse chevron for folders */}
        {isFolder ? (
          <button
            className="p-1 hover:bg-white/10 rounded-md transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(node.id);
            }}
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-gray-500" />
            )}
          </button>
        ) : (
          <span className="w-6" /> // Spacer for alignment
        )}

        {/* Icon */}
        <Icon className={cn('h-4 w-4 flex-shrink-0 transition-transform duration-200', iconColor, isSelected && 'scale-110')} />

        {/* Name - linked skills show with special formatting */}
        <span className={cn(
          'flex-1 truncate text-sm transition-colors',
          isSelected ? 'text-white font-medium' : 'text-gray-300',
          isLinkedSkill && 'font-mono text-indigo-300'
        )}>
          {node.name}
        </span>

        {/* Category badge for linked skills */}
        {isLinkedSkill && node.linked_skill_category && (
          <span className="px-1.5 py-0.5 text-[10px] bg-indigo-500/20 text-indigo-300 rounded font-medium uppercase tracking-wide">
            {node.linked_skill_category}
          </span>
        )}

        {/* Context menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-white/10 rounded-md"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-3.5 w-3.5 text-gray-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-gray-900 border-white/10">
            {/* Folder-specific actions */}
            {isFolder && (
              <>
                <DropdownMenuItem onClick={() => handleContextAction('add-folder')} className="hover:bg-white/10">
                  <FolderPlus className="h-4 w-4 mr-2 text-amber-400" />
                  New Folder
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleContextAction('add-document')} className="hover:bg-white/10">
                  <FilePlus className="h-4 w-4 mr-2 text-blue-400" />
                  New Document
                </DropdownMenuItem>
                {onAddSkillLink && (
                  <DropdownMenuItem onClick={() => handleContextAction('add-skill-link')} className="hover:bg-white/10">
                    <LinkIcon className="h-4 w-4 mr-2 text-indigo-400" />
                    Link Skill
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator className="bg-white/10" />
              </>
            )}

            {/* Linked skill-specific actions */}
            {isLinkedSkill ? (
              <>
                {onEditOriginal && (
                  <DropdownMenuItem onClick={() => handleContextAction('edit-original')} className="hover:bg-white/10">
                    <ExternalLink className="h-4 w-4 mr-2 text-indigo-400" />
                    Edit Original
                  </DropdownMenuItem>
                )}
                {onRemoveLink && (
                  <>
                    <DropdownMenuSeparator className="bg-white/10" />
                    <DropdownMenuItem
                      onClick={() => handleContextAction('remove-link')}
                      className="text-red-400 focus:text-red-400 hover:bg-red-500/10"
                    >
                      <Unlink className="h-4 w-4 mr-2" />
                      Remove Link
                    </DropdownMenuItem>
                  </>
                )}
              </>
            ) : (
              <>
                {/* Regular item actions */}
                <DropdownMenuItem onClick={() => handleContextAction('rename')} className="hover:bg-white/10">
                  <Pencil className="h-4 w-4 mr-2 text-gray-400" />
                  Rename
                </DropdownMenuItem>
                {onDuplicate && (
                  <DropdownMenuItem onClick={() => handleContextAction('duplicate')} className="hover:bg-white/10">
                    <Copy className="h-4 w-4 mr-2 text-gray-400" />
                    Duplicate
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem
                  onClick={() => handleContextAction('delete')}
                  className="text-red-400 focus:text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Children */}
      {isFolder && isExpanded && node.children && node.children.length > 0 && (
        <div className="relative">
          {/* Vertical connection line */}
          <div
            className="absolute left-0 top-0 bottom-0 border-l border-white/5"
            style={{ marginLeft: `${level * 16 + 20}px` }}
          />
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              selectedId={selectedId}
              selectedType={selectedType}
              expandedFolders={expandedFolders}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
              onCreateFolder={onCreateFolder}
              onCreateDocument={onCreateDocument}
              onAddSkillLink={onAddSkillLink}
              onRename={onRename}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onRemoveLink={onRemoveLink}
              onEditOriginal={onEditOriginal}
              folders={folders}
              documents={documents}
              linkedSkills={linkedSkills}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function SkillFolderTree({
  skillKey,
  folders,
  documents,
  linkedSkills,
  selectedId,
  selectedType,
  onSelect,
  onCreateFolder,
  onCreateDocument,
  onAddSkillLink,
  onRenameFolder,
  onRenameDocument,
  onDeleteFolder,
  onDeleteDocument,
  onDuplicateFolder,
  onDuplicateDocument,
  onRemoveSkillLink,
  onEditOriginalSkill,
  className,
}: SkillFolderTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    // Start with all folders expanded
    return new Set(folders.map((f) => f.id));
  });

  // Build tree structure including linked skills
  const tree = useMemo(
    () => buildSkillTree(folders, documents, skillKey, linkedSkills),
    [folders, documents, skillKey, linkedSkills]
  );

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleRename = useCallback(
    (node: SkillTreeNode) => {
      if (node.type === 'folder') {
        const folder = folders.find((f) => f.id === node.id);
        if (folder) onRenameFolder(folder);
      } else if (node.type === 'document') {
        const doc = documents.find((d) => d.id === node.id);
        if (doc) onRenameDocument(doc);
      }
      // Note: linked skills can't be renamed (they inherit from original)
    },
    [folders, documents, onRenameFolder, onRenameDocument]
  );

  const handleDelete = useCallback(
    (node: SkillTreeNode) => {
      if (node.type === 'folder') {
        const folder = folders.find((f) => f.id === node.id);
        if (folder) onDeleteFolder(folder);
      } else if (node.type === 'document') {
        const doc = documents.find((d) => d.id === node.id);
        if (doc) onDeleteDocument(doc);
      }
      // Note: linked skills use handleRemoveLink instead
    },
    [folders, documents, onDeleteFolder, onDeleteDocument]
  );

  const handleDuplicate = useCallback(
    (node: SkillTreeNode) => {
      if (node.type === 'folder') {
        const folder = folders.find((f) => f.id === node.id);
        if (folder && onDuplicateFolder) onDuplicateFolder(folder);
      } else if (node.type === 'document') {
        const doc = documents.find((d) => d.id === node.id);
        if (doc && onDuplicateDocument) onDuplicateDocument(doc);
      }
      // Note: linked skills can't be duplicated
    },
    [folders, documents, onDuplicateFolder, onDuplicateDocument]
  );

  const handleRemoveLink = useCallback(
    (node: SkillTreeNode) => {
      if (node.type === 'linked-skill' && node.link_id && linkedSkills && onRemoveSkillLink) {
        const link = linkedSkills.find((l) => l.link_id === node.link_id);
        if (link) onRemoveSkillLink(link);
      }
    },
    [linkedSkills, onRemoveSkillLink]
  );

  const handleEditOriginal = useCallback(
    (node: SkillTreeNode) => {
      if (node.type === 'linked-skill' && node.link_id && linkedSkills && onEditOriginalSkill) {
        const link = linkedSkills.find((l) => l.link_id === node.link_id);
        if (link) onEditOriginalSkill(link);
      }
    },
    [linkedSkills, onEditOriginalSkill]
  );

  // Check if skill root is selected
  const isSkillSelected = selectedType === 'skill';

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header with skill root and actions */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-white/5 bg-gray-900/50">
        <button
          className={cn(
            'flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-200 flex-1 text-left',
            'hover:bg-white/5',
            isSkillSelected && 'bg-gradient-to-r from-blue-600/15 to-indigo-600/15 ring-1 ring-blue-500/30'
          )}
          onClick={() => onSelect(null, 'skill')}
        >
          <FileCode className={cn('h-4 w-4 transition-transform duration-200', isSkillSelected ? 'text-blue-400 scale-110' : 'text-blue-400/70')} />
          <span className={cn('font-medium text-sm', isSkillSelected ? 'text-white' : 'text-gray-300')}>SKILL.md</span>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-white/10 rounded-lg ml-2">
              <Plus className="h-4 w-4 text-gray-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-gray-900 border-white/10">
            <DropdownMenuItem onClick={() => onCreateFolder()} className="hover:bg-white/10">
              <FolderPlus className="h-4 w-4 mr-2 text-amber-400" />
              New Folder
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onCreateDocument()} className="hover:bg-white/10">
              <FilePlus className="h-4 w-4 mr-2 text-blue-400" />
              New Document
            </DropdownMenuItem>
            {onAddSkillLink && (
              <>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem onClick={() => onAddSkillLink()} className="hover:bg-white/10">
                  <LinkIcon className="h-4 w-4 mr-2 text-indigo-400" />
                  Link Skill
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Tree content */}
      <ScrollArea className="flex-1">
        <div className="py-3">
          {tree.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-white/5 flex items-center justify-center">
                <Folder className="w-6 h-6 text-gray-500" />
              </div>
              <p className="text-sm text-gray-400 font-medium">No content yet</p>
              <p className="text-xs text-gray-500 mt-1">Click + to add folders or documents</p>
            </div>
          ) : (
            tree.map((node) => (
              <TreeNode
                key={node.id}
                node={node}
                level={0}
                selectedId={selectedId}
                selectedType={selectedType}
                expandedFolders={expandedFolders}
                onToggleExpand={handleToggleExpand}
                onSelect={onSelect}
                onCreateFolder={onCreateFolder}
                onCreateDocument={onCreateDocument}
                onAddSkillLink={onAddSkillLink}
                onRename={handleRename}
                onDelete={handleDelete}
                onDuplicate={onDuplicateFolder || onDuplicateDocument ? handleDuplicate : undefined}
                onRemoveLink={onRemoveSkillLink ? handleRemoveLink : undefined}
                onEditOriginal={onEditOriginalSkill ? handleEditOriginal : undefined}
                folders={folders}
                documents={documents}
                linkedSkills={linkedSkills}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export default SkillFolderTree;
