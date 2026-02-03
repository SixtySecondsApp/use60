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
} from '@/lib/types/skills';
import { buildSkillTree } from '@/lib/types/skills';

// =============================================================================
// Types
// =============================================================================

interface SkillFolderTreeProps {
  skillKey: string;
  folders: SkillFolder[];
  documents: SkillDocument[];
  selectedId: string | null;
  selectedType: 'folder' | 'document' | 'skill' | null;
  onSelect: (id: string | null, type: 'folder' | 'document' | 'skill') => void;
  onCreateFolder: (parentId?: string) => void;
  onCreateDocument: (folderId?: string) => void;
  onRenameFolder: (folder: SkillFolder) => void;
  onRenameDocument: (document: SkillDocument) => void;
  onDeleteFolder: (folder: SkillFolder) => void;
  onDeleteDocument: (document: SkillDocument) => void;
  onDuplicateFolder?: (folder: SkillFolder) => void;
  onDuplicateDocument?: (document: SkillDocument) => void;
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
  selectedType: 'folder' | 'document' | 'skill' | null;
  expandedFolders: Set<string>;
  onToggleExpand: (id: string) => void;
  onSelect: (id: string, type: 'folder' | 'document' | 'skill') => void;
  onCreateFolder: (parentId?: string) => void;
  onCreateDocument: (folderId?: string) => void;
  onRename: (node: SkillTreeNode) => void;
  onDelete: (node: SkillTreeNode) => void;
  onDuplicate?: (node: SkillTreeNode) => void;
  folders: SkillFolder[];
  documents: SkillDocument[];
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
  onRename,
  onDelete,
  onDuplicate,
  folders,
  documents,
}: TreeNodeProps) {
  const isFolder = node.type === 'folder';
  const isExpanded = expandedFolders.has(node.id);
  const isSelected = selectedId === node.id && selectedType === node.type;

  const Icon = isFolder
    ? isExpanded
      ? FolderOpen
      : Folder
    : DOC_TYPE_ICONS[node.doc_type as SkillDocumentType] || FileText;

  const iconColor = isFolder
    ? 'text-amber-400'
    : DOC_TYPE_COLORS[node.doc_type as SkillDocumentType] || 'text-gray-400';

  const handleClick = useCallback(() => {
    if (isFolder) {
      onToggleExpand(node.id);
    }
    onSelect(node.id, node.type);
  }, [isFolder, node.id, node.type, onToggleExpand, onSelect]);

  const handleContextAction = useCallback(
    (action: 'rename' | 'delete' | 'duplicate' | 'add-folder' | 'add-document') => {
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
      }
    },
    [node, onRename, onDelete, onDuplicate, onCreateFolder, onCreateDocument]
  );

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-1.5 px-2 py-2 mx-2 rounded-lg cursor-pointer transition-all duration-200',
          'hover:bg-white/5',
          isSelected && 'bg-gradient-to-r from-blue-600/15 to-indigo-600/15 ring-1 ring-blue-500/30'
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

        {/* Name */}
        <span className={cn(
          'flex-1 truncate text-sm transition-colors',
          isSelected ? 'text-white font-medium' : 'text-gray-300'
        )}>
          {node.name}
        </span>

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
                <DropdownMenuSeparator className="bg-white/10" />
              </>
            )}
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
              onRename={onRename}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              folders={folders}
              documents={documents}
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
  selectedId,
  selectedType,
  onSelect,
  onCreateFolder,
  onCreateDocument,
  onRenameFolder,
  onRenameDocument,
  onDeleteFolder,
  onDeleteDocument,
  onDuplicateFolder,
  onDuplicateDocument,
  className,
}: SkillFolderTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    // Start with all folders expanded
    return new Set(folders.map((f) => f.id));
  });

  // Build tree structure
  const tree = useMemo(
    () => buildSkillTree(folders, documents, skillKey),
    [folders, documents, skillKey]
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
      } else {
        const doc = documents.find((d) => d.id === node.id);
        if (doc) onRenameDocument(doc);
      }
    },
    [folders, documents, onRenameFolder, onRenameDocument]
  );

  const handleDelete = useCallback(
    (node: SkillTreeNode) => {
      if (node.type === 'folder') {
        const folder = folders.find((f) => f.id === node.id);
        if (folder) onDeleteFolder(folder);
      } else {
        const doc = documents.find((d) => d.id === node.id);
        if (doc) onDeleteDocument(doc);
      }
    },
    [folders, documents, onDeleteFolder, onDeleteDocument]
  );

  const handleDuplicate = useCallback(
    (node: SkillTreeNode) => {
      if (node.type === 'folder') {
        const folder = folders.find((f) => f.id === node.id);
        if (folder && onDuplicateFolder) onDuplicateFolder(folder);
      } else {
        const doc = documents.find((d) => d.id === node.id);
        if (doc && onDuplicateDocument) onDuplicateDocument(doc);
      }
    },
    [folders, documents, onDuplicateFolder, onDuplicateDocument]
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
                onRename={handleRename}
                onDelete={handleDelete}
                onDuplicate={onDuplicateFolder || onDuplicateDocument ? handleDuplicate : undefined}
                folders={folders}
                documents={documents}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export default SkillFolderTree;
