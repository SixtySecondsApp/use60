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
          'group flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer transition-colors',
          'hover:bg-white/5',
          isSelected && 'bg-white/10 border border-white/20'
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
      >
        {/* Expand/collapse chevron for folders */}
        {isFolder ? (
          <button
            className="p-0.5 hover:bg-white/10 rounded"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(node.id);
            }}
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
            )}
          </button>
        ) : (
          <span className="w-5" /> // Spacer for alignment
        )}

        {/* Icon */}
        <Icon className={cn('h-4 w-4 flex-shrink-0', iconColor)} />

        {/* Name */}
        <span className="flex-1 truncate text-sm text-gray-200">{node.name}</span>

        {/* Context menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {isFolder && (
              <>
                <DropdownMenuItem onClick={() => handleContextAction('add-folder')}>
                  <FolderPlus className="h-4 w-4 mr-2" />
                  New Folder
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleContextAction('add-document')}>
                  <FilePlus className="h-4 w-4 mr-2" />
                  New Document
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={() => handleContextAction('rename')}>
              <Pencil className="h-4 w-4 mr-2" />
              Rename
            </DropdownMenuItem>
            {onDuplicate && (
              <DropdownMenuItem onClick={() => handleContextAction('duplicate')}>
                <Copy className="h-4 w-4 mr-2" />
                Duplicate
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => handleContextAction('delete')}
              className="text-red-400 focus:text-red-400"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Children */}
      {isFolder && isExpanded && node.children && node.children.length > 0 && (
        <div>
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
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <button
          className={cn(
            'flex items-center gap-2 px-2 py-1 rounded-md transition-colors flex-1 text-left',
            'hover:bg-white/5',
            isSkillSelected && 'bg-white/10 border border-white/20'
          )}
          onClick={() => onSelect(null, 'skill')}
        >
          <FileCode className="h-4 w-4 text-blue-400" />
          <span className="font-medium text-sm text-gray-100">SKILL.md</span>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
              <Plus className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onCreateFolder()}>
              <FolderPlus className="h-4 w-4 mr-2" />
              New Folder
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onCreateDocument()}>
              <FilePlus className="h-4 w-4 mr-2" />
              New Document
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Tree content */}
      <ScrollArea className="flex-1">
        <div className="py-2">
          {tree.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              <p>No folders or documents yet.</p>
              <p className="mt-1">Click + to add content.</p>
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
