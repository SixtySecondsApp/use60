/**
 * CreateDocumentModal Component
 *
 * Modal for creating new documents within a skill.
 */

import { useState } from 'react';
import { FilePlus, Loader2, FileCode, Lightbulb, FileText, Link2, FileType } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SkillFolder, SkillDocumentType } from '@/lib/types/skills';

interface CreateDocumentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: SkillFolder[];
  folderId?: string;
  onCreate: (data: {
    title: string;
    description?: string;
    doc_type: SkillDocumentType;
    content: string;
    folder_id?: string;
  }) => Promise<void>;
}

const DOC_TYPES: Array<{
  value: SkillDocumentType;
  label: string;
  description: string;
  icon: typeof FileCode;
  color: string;
}> = [
  {
    value: 'prompt',
    label: 'Prompt',
    description: 'AI prompt templates',
    icon: FileCode,
    color: 'text-blue-400',
  },
  {
    value: 'example',
    label: 'Example',
    description: 'Sample inputs/outputs',
    icon: Lightbulb,
    color: 'text-yellow-400',
  },
  {
    value: 'asset',
    label: 'Asset',
    description: 'General content',
    icon: FileText,
    color: 'text-gray-400',
  },
  {
    value: 'reference',
    label: 'Reference',
    description: 'Links to other skills',
    icon: Link2,
    color: 'text-purple-400',
  },
  {
    value: 'template',
    label: 'Template',
    description: 'Reusable templates',
    icon: FileType,
    color: 'text-green-400',
  },
];

export function CreateDocumentModal({
  open,
  onOpenChange,
  folders,
  folderId,
  onCreate,
}: CreateDocumentModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [docType, setDocType] = useState<SkillDocumentType>('asset');
  const [content, setContent] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string>(folderId || 'root');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Document title is required');
      return;
    }

    setIsLoading(true);
    try {
      await onCreate({
        title: title.trim(),
        description: description.trim() || undefined,
        doc_type: docType,
        content: content.trim(),
        folder_id: selectedFolder === 'root' ? undefined : selectedFolder,
      });
      // Reset form
      setTitle('');
      setDescription('');
      setDocType('asset');
      setContent('');
      setSelectedFolder('root');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create document');
    } finally {
      setIsLoading(false);
    }
  };

  const selectedDocType = DOC_TYPES.find((t) => t.value === docType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FilePlus className="h-5 w-5 text-blue-400" />
            Create New Document
          </DialogTitle>
          <DialogDescription>
            Add a new document to your skill folder structure.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="doc-title">Title</Label>
            <Input
              id="doc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., qualification-prompt, b2b-example"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-description">Description (optional)</Label>
            <Input
              id="doc-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description..."
            />
          </div>

          <div className="space-y-2">
            <Label>Document Type</Label>
            <div className="grid grid-cols-5 gap-2">
              {DOC_TYPES.map((type) => {
                const Icon = type.icon;
                const isSelected = docType === type.value;
                return (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setDocType(type.value)}
                    className={cn(
                      'flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors',
                      isSelected
                        ? 'bg-white/10 border-white/30'
                        : 'border-white/10 hover:bg-white/5'
                    )}
                  >
                    <Icon className={cn('h-5 w-5', type.color)} />
                    <span className="text-xs">{type.label}</span>
                  </button>
                );
              })}
            </div>
            {selectedDocType && (
              <p className="text-xs text-gray-500">{selectedDocType.description}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-folder">Folder</Label>
            <Select value={selectedFolder} onValueChange={setSelectedFolder}>
              <SelectTrigger>
                <SelectValue placeholder="Select folder" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="root">Root (no folder)</SelectItem>
                {folders.map((folder) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    {folder.path || folder.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-content">Initial Content (optional)</Label>
            <Textarea
              id="doc-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Start writing your document content..."
              rows={4}
              className="font-mono text-sm"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Document
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CreateDocumentModal;
