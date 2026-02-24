/**
 * CreateFolderModal Component
 *
 * Modal for creating new folders within a skill.
 * Only allows the 3 standard folder names: references, scripts, assets.
 */

import { useState, useMemo } from 'react';
import { FolderPlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
import type { SkillFolder } from '@/lib/types/skills';

/** The only allowed root-level folder names for skills */
const STANDARD_FOLDERS: { name: string; description: string }[] = [
  { name: 'references', description: 'Linked skill content and external references' },
  { name: 'scripts', description: 'Automation scripts and helpers' },
  { name: 'assets', description: 'Images, data files, and other static assets' },
];

interface CreateFolderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: SkillFolder[];
  parentFolderId?: string;
  onCreate: (name: string, description?: string, parentId?: string) => Promise<void>;
}

export function CreateFolderModal({
  open,
  onOpenChange,
  folders,
  parentFolderId,
  onCreate,
}: CreateFolderModalProps) {
  const [selectedFolder, setSelectedFolder] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter out standard folders that already exist at root level
  const existingRootNames = useMemo(
    () => new Set(
      folders
        .filter((f) => !f.parent_folder_id)
        .map((f) => f.name.toLowerCase())
    ),
    [folders]
  );

  const availableFolders = useMemo(
    () => STANDARD_FOLDERS.filter((sf) => !existingRootNames.has(sf.name)),
    [existingRootNames]
  );

  const selectedDescription = STANDARD_FOLDERS.find(
    (sf) => sf.name === selectedFolder
  )?.description;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedFolder) {
      setError('Please select a folder to create');
      return;
    }

    setIsLoading(true);
    try {
      const desc = STANDARD_FOLDERS.find((sf) => sf.name === selectedFolder)?.description;
      await onCreate(selectedFolder, desc, undefined);
      setSelectedFolder('');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create folder');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="h-5 w-5 text-amber-400" />
            Create Standard Folder
          </DialogTitle>
          <DialogDescription>
            Skills use a standard folder structure. Select which folder to add.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {availableFolders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              All standard folders already exist for this skill.
            </p>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="folder-select">Folder</Label>
              <Select value={selectedFolder} onValueChange={setSelectedFolder}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a standard folder" />
                </SelectTrigger>
                <SelectContent>
                  {availableFolders.map((sf) => (
                    <SelectItem key={sf.name} value={sf.name}>
                      {sf.name}/
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedDescription && (
                <p className="text-xs text-muted-foreground">{selectedDescription}</p>
              )}
            </div>
          )}

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
            <Button
              type="submit"
              disabled={isLoading || availableFolders.length === 0 || !selectedFolder}
            >
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Folder
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CreateFolderModal;
