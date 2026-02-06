/**
 * Prompt Library Component
 * 
 * LAB-004: Save prompts with expected outputs for regression testing.
 * 
 * Features:
 * - Save prompt with name and expected_response_type
 * - List saved prompts with search/filter
 * - Run prompt and compare to expected
 * - Mark as regression test for automated runs
 * 
 * @see docs/PRD_PROACTIVE_AI_TEAMMATE.md
 */

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Plus,
  Search,
  Play,
  Trash2,
  Edit2,
  Check,
  X,
  Clock,
  Tag,
  Loader2,
  CheckCircle,
  XCircle,
  FlaskConical,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import { useActiveOrganization } from '@/lib/hooks/useActiveOrganization';

// ============================================================================
// Types
// ============================================================================

interface SavedPrompt {
  id: string;
  name: string;
  description?: string;
  prompt: string;
  tags: string[];
  expected_response_type?: string;
  expected_sequence_key?: string;
  last_run_at?: string;
  last_run_success?: boolean;
  last_run_duration_ms?: number;
  is_regression_test: boolean;
  run_count: number;
  created_at: string;
}

interface PromptLibraryProps {
  onRunPrompt?: (prompt: string) => void;
}

// ============================================================================
// Component
// ============================================================================

export function PromptLibrary({ onRunPrompt }: PromptLibraryProps) {
  const { organizationId } = useActiveOrganization();
  const queryClient = useQueryClient();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<SavedPrompt | null>(null);
  const [runningPromptId, setRunningPromptId] = useState<string | null>(null);

  // New prompt form state
  const [newPrompt, setNewPrompt] = useState({
    name: '',
    description: '',
    prompt: '',
    tags: '',
    expected_response_type: '',
    is_regression_test: false,
  });

  // Fetch saved prompts
  const { data: prompts, isLoading } = useQuery({
    queryKey: ['prompt-library', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('copilot_prompt_library')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as SavedPrompt[];
    },
    enabled: !!organizationId,
  });

  // Save prompt mutation
  const saveMutation = useMutation({
    mutationFn: async (prompt: Partial<SavedPrompt>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const payload = {
        ...prompt,
        organization_id: organizationId,
        created_by: user.id,
        tags: typeof prompt.tags === 'string' 
          ? (prompt.tags as string).split(',').map(t => t.trim()).filter(Boolean)
          : prompt.tags,
      };

      if (editingPrompt) {
        const { error } = await supabase
          .from('copilot_prompt_library')
          .update(payload)
          .eq('id', editingPrompt.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('copilot_prompt_library')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingPrompt ? 'Prompt updated' : 'Prompt saved');
      queryClient.invalidateQueries({ queryKey: ['prompt-library'] });
      setShowAddDialog(false);
      setEditingPrompt(null);
      setNewPrompt({ name: '', description: '', prompt: '', tags: '', expected_response_type: '', is_regression_test: false });
    },
    onError: (error) => {
      toast.error(`Failed to save: ${error.message}`);
    },
  });

  // Delete prompt mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('copilot_prompt_library')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Prompt deleted');
      queryClient.invalidateQueries({ queryKey: ['prompt-library'] });
    },
  });

  // Filter prompts
  const filteredPrompts = useMemo(() => {
    if (!prompts) return [];
    if (!searchQuery) return prompts;
    
    const q = searchQuery.toLowerCase();
    return prompts.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.prompt.toLowerCase().includes(q) ||
      p.tags?.some(t => t.toLowerCase().includes(q))
    );
  }, [prompts, searchQuery]);

  // Handle run prompt
  const handleRunPrompt = async (prompt: SavedPrompt) => {
    if (onRunPrompt) {
      setRunningPromptId(prompt.id);
      onRunPrompt(prompt.prompt);
      
      // Update run count and last_run_at
      await supabase
        .from('copilot_prompt_library')
        .update({
          run_count: prompt.run_count + 1,
          last_run_at: new Date().toISOString(),
        })
        .eq('id', prompt.id);
      
      queryClient.invalidateQueries({ queryKey: ['prompt-library'] });
      setRunningPromptId(null);
    }
  };

  // Handle edit
  const handleEdit = (prompt: SavedPrompt) => {
    setEditingPrompt(prompt);
    setNewPrompt({
      name: prompt.name,
      description: prompt.description || '',
      prompt: prompt.prompt,
      tags: prompt.tags?.join(', ') || '',
      expected_response_type: prompt.expected_response_type || '',
      is_regression_test: prompt.is_regression_test,
    });
    setShowAddDialog(true);
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <BookOpen className="w-5 h-5" />
            Prompt Library
          </CardTitle>
          <Button size="sm" onClick={() => setShowAddDialog(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
        </div>
        
        {/* Search */}
        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
          <Input
            placeholder="Search prompts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
            ))}
          </div>
        ) : filteredPrompts.length > 0 ? (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {filteredPrompts.map((prompt) => (
              <div
                key={prompt.id}
                className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                        {prompt.name}
                      </span>
                      {prompt.is_regression_test && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <FlaskConical className="w-3 h-3" />
                          Test
                        </Badge>
                      )}
                      {prompt.last_run_success !== undefined && (
                        prompt.last_run_success ? (
                          <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-red-500" />
                        )
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-0.5">
                      {prompt.prompt}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {prompt.tags?.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                      {prompt.run_count > 0 && (
                        <span className="text-xs text-gray-400">
                          {prompt.run_count} runs
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRunPrompt(prompt)}
                      disabled={runningPromptId === prompt.id}
                      className="h-7 w-7 p-0"
                    >
                      {runningPromptId === prompt.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(prompt)}
                      className="h-7 w-7 p-0"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(prompt.id)}
                      className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No saved prompts yet</p>
            <Button
              variant="link"
              size="sm"
              onClick={() => setShowAddDialog(true)}
              className="mt-1"
            >
              Add your first prompt
            </Button>
          </div>
        )}
      </CardContent>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingPrompt ? 'Edit Prompt' : 'Add Prompt to Library'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">Name *</label>
              <Input
                value={newPrompt.name}
                onChange={(e) => setNewPrompt({ ...newPrompt, name: e.target.value })}
                placeholder="e.g., Meeting Prep - Standard"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">Prompt *</label>
              <Textarea
                value={newPrompt.prompt}
                onChange={(e) => setNewPrompt({ ...newPrompt, prompt: e.target.value })}
                placeholder="Enter the test prompt..."
                rows={3}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">Description</label>
              <Input
                value={newPrompt.description}
                onChange={(e) => setNewPrompt({ ...newPrompt, description: e.target.value })}
                placeholder="What this prompt tests..."
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Tags</label>
                <Input
                  value={newPrompt.tags}
                  onChange={(e) => setNewPrompt({ ...newPrompt, tags: e.target.value })}
                  placeholder="meeting, prep, v1"
                />
              </div>
              
              <div>
                <label className="text-sm font-medium">Expected Response Type</label>
                <Input
                  value={newPrompt.expected_response_type}
                  onChange={(e) => setNewPrompt({ ...newPrompt, expected_response_type: e.target.value })}
                  placeholder="e.g., meeting_brief"
                />
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="regression-test"
                checked={newPrompt.is_regression_test}
                onChange={(e) => setNewPrompt({ ...newPrompt, is_regression_test: e.target.checked })}
                className="rounded border-gray-300"
              />
              <label htmlFor="regression-test" className="text-sm">
                Include in regression tests
              </label>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowAddDialog(false);
              setEditingPrompt(null);
            }}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate(newPrompt as any)}
              disabled={!newPrompt.name || !newPrompt.prompt || saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              {editingPrompt ? 'Update' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default PromptLibrary;
