/**
 * AddSkillLinkModal Component
 *
 * Modal for linking skills to a parent skill (sequence/mega skill).
 * Features:
 * - Skill search input
 * - Results grouped by category
 * - Preview of selected skill before linking
 * - Folder selector for placement
 * - Prevents linking to self or already-linked skills
 */

import { useState, useEffect, useCallback } from 'react';
import { Link2, Loader2, Search, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { cn } from '@/lib/utils';
import type { SkillFolder, SkillSearchResult } from '@/lib/types/skills';
import { searchSkillsForLinking } from '@/lib/services/skillFolderService';
import { useDebounce } from '@/lib/hooks/useDebounce';

// =============================================================================
// Types
// =============================================================================

interface AddSkillLinkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentSkillId: string;
  parentSkillKey: string;
  folders: SkillFolder[];
  targetFolderId?: string;
  onAddLink: (linkedSkillId: string, folderId?: string) => Promise<void>;
}

// Category display names and colors
const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  'sales-ai': { label: 'Sales AI', color: 'bg-blue-500/20 text-blue-300' },
  'writing': { label: 'Writing', color: 'bg-green-500/20 text-green-300' },
  'enrichment': { label: 'Enrichment', color: 'bg-purple-500/20 text-purple-300' },
  'workflows': { label: 'Workflows', color: 'bg-orange-500/20 text-orange-300' },
  'data-access': { label: 'Data Access', color: 'bg-cyan-500/20 text-cyan-300' },
  'output-format': { label: 'Output', color: 'bg-pink-500/20 text-pink-300' },
  'agent-sequence': { label: 'Sequence', color: 'bg-amber-500/20 text-amber-300' },
  'hitl': { label: 'HITL', color: 'bg-red-500/20 text-red-300' },
};

// =============================================================================
// Skill Search Result Item
// =============================================================================

interface SkillSearchItemProps {
  skill: SkillSearchResult;
  isSelected: boolean;
  onSelect: () => void;
}

function SkillSearchItem({ skill, isSelected, onSelect }: SkillSearchItemProps) {
  const categoryConfig = CATEGORY_CONFIG[skill.category] || {
    label: skill.category,
    color: 'bg-gray-500/20 text-gray-300',
  };

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={skill.is_already_linked}
      className={cn(
        'w-full text-left px-3 py-2.5 rounded-lg transition-all duration-200',
        'border',
        skill.is_already_linked
          ? 'opacity-50 cursor-not-allowed border-transparent'
          : isSelected
          ? 'bg-indigo-500/20 border-indigo-500/50 ring-1 ring-indigo-500/30'
          : 'hover:bg-white/5 border-transparent hover:border-white/10'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-white truncate">
              @{skill.skill_key}
            </span>
            {skill.is_already_linked && (
              <Badge variant="outline" className="text-[10px] text-gray-500 border-gray-500/30">
                Already linked
              </Badge>
            )}
          </div>
          <p className="text-sm text-gray-400 mt-0.5 truncate">{skill.name}</p>
          {skill.description && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{skill.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge className={cn('text-[10px] uppercase tracking-wide', categoryConfig.color)}>
            {categoryConfig.label}
          </Badge>
          {isSelected && <Check className="h-4 w-4 text-indigo-400" />}
        </div>
      </div>
    </button>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function AddSkillLinkModal({
  open,
  onOpenChange,
  parentSkillId,
  parentSkillKey,
  folders,
  targetFolderId,
  onAddLink,
}: AddSkillLinkModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSkill, setSelectedSkill] = useState<SkillSearchResult | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string>(targetFolderId || 'root');
  const [searchResults, setSearchResults] = useState<SkillSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedQuery = useDebounce(searchQuery, 300);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setSearchQuery('');
      setSelectedSkill(null);
      setSelectedFolder(targetFolderId || 'root');
      setSearchResults([]);
      setError(null);
    }
  }, [open, targetFolderId]);

  // Search for skills when query changes
  useEffect(() => {
    const search = async () => {
      setIsSearching(true);
      setError(null);
      try {
        const results = await searchSkillsForLinking(parentSkillId, debouncedQuery, undefined, 20);
        setSearchResults(results);
      } catch (err) {
        setError('Failed to search skills');
        console.error('[AddSkillLinkModal] Search error:', err);
      } finally {
        setIsSearching(false);
      }
    };

    if (open) {
      search();
    }
  }, [open, parentSkillId, debouncedQuery]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedSkill) {
      setError('Please select a skill to link');
      return;
    }

    setIsLinking(true);
    try {
      await onAddLink(
        selectedSkill.id,
        selectedFolder === 'root' ? undefined : selectedFolder
      );
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link skill');
    } finally {
      setIsLinking(false);
    }
  };

  // Group results by category
  const groupedResults = searchResults.reduce<Record<string, SkillSearchResult[]>>(
    (acc, skill) => {
      const category = skill.category;
      if (!acc[category]) acc[category] = [];
      acc[category].push(skill);
      return acc;
    },
    {}
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-indigo-400" />
            Link a Skill
          </DialogTitle>
          <DialogDescription>
            Add a skill reference to <code className="px-1 py-0.5 bg-white/10 rounded font-mono text-xs">{parentSkillKey}</code>.
            Linked skills appear in the folder tree and can be previewed read-only.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Search input */}
          <div className="space-y-2">
            <Label htmlFor="skill-search">Search Skills</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                id="skill-search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, key, or description..."
                className="pl-9"
                autoFocus
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 animate-spin" />
              )}
            </div>
          </div>

          {/* Search results */}
          <div className="space-y-2">
            <Label>Select Skill</Label>
            <ScrollArea className="h-64 rounded-lg border border-white/10 bg-gray-900/50">
              {searchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-8 text-gray-500">
                  {isSearching ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : debouncedQuery ? (
                    <>
                      <AlertCircle className="h-6 w-6 mb-2" />
                      <p className="text-sm">No skills found matching "{debouncedQuery}"</p>
                    </>
                  ) : (
                    <p className="text-sm">Start typing to search for skills</p>
                  )}
                </div>
              ) : (
                <div className="p-2 space-y-3">
                  {Object.entries(groupedResults).map(([category, skills]) => {
                    const config = CATEGORY_CONFIG[category] || { label: category };
                    return (
                      <div key={category}>
                        <div className="px-2 py-1 text-xs text-gray-500 uppercase tracking-wide font-medium">
                          {config.label}
                        </div>
                        <div className="space-y-1">
                          {skills.map((skill) => (
                            <SkillSearchItem
                              key={skill.id}
                              skill={skill}
                              isSelected={selectedSkill?.id === skill.id}
                              onSelect={() => setSelectedSkill(skill)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Selected skill preview */}
          {selectedSkill && (
            <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/30">
              <div className="flex items-center gap-2 mb-1">
                <Check className="h-4 w-4 text-indigo-400" />
                <span className="text-sm font-medium text-white">Selected:</span>
                <code className="px-1.5 py-0.5 bg-indigo-500/20 rounded font-mono text-xs text-indigo-300">
                  @{selectedSkill.skill_key}
                </code>
              </div>
              {selectedSkill.description && (
                <p className="text-xs text-gray-400 ml-6">{selectedSkill.description}</p>
              )}
            </div>
          )}

          {/* Folder selector */}
          <div className="space-y-2">
            <Label htmlFor="link-folder">Place in Folder (optional)</Label>
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

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-400">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isLinking}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLinking || !selectedSkill}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500"
            >
              {isLinking && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Link Skill
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default AddSkillLinkModal;
