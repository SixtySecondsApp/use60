/**
 * AgentSequencesPage
 *
 * Platform admin page for managing agent sequences - "mega skills" that
 * orchestrate multiple other skills via @skill-name links in the folder tree.
 *
 * Sequences use the same editor UI as regular skills (PlatformSkillViewPage),
 * but with category: 'agent-sequence'. They can link to other skills which
 * appear as read-only previews in the folder tree.
 *
 * Copilot checks sequences first before falling back to individual skills.
 */

import { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Plus,
  Edit2,
  Trash2,
  Play,
  Search,
  ToggleLeft,
  ToggleRight,
  GitBranch,
  Copy,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  AlertCircle,
  FileCode,
  Link2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  useAgentSequences,
  useAgentSequenceOperations,
  useSequenceExecutions,
  type AgentSequence,
} from '@/lib/hooks/useAgentSequences';
import { useAuth } from '@/lib/contexts/AuthContext';
import { toast } from 'sonner';

// =============================================================================
// Sequence Card Component
// =============================================================================

interface SequenceCardProps {
  sequence: AgentSequence;
  onEdit: () => void;
  onTest: () => void;
  onClone: () => void;
  onDelete: () => void;
  onToggleActive: (isActive: boolean) => void;
}

function SequenceCard({
  sequence,
  onEdit,
  onTest,
  onClone,
  onDelete,
  onToggleActive,
}: SequenceCardProps) {
  const { frontmatter, is_active, skill_key } = sequence;
  const steps = frontmatter.sequence_steps || [];
  const { data: executions } = useSequenceExecutions(skill_key, { limit: 5 });

  // Calculate test status
  const lastExecution = executions?.[0];
  const testStatus = lastExecution?.status;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'rounded-lg border bg-card p-4 transition-all hover:shadow-md',
        !is_active && 'opacity-60'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-primary/10 p-2">
            <GitBranch className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-sm line-clamp-1">{frontmatter.name}</h3>
            <code className="text-xs text-muted-foreground">{skill_key}</code>
          </div>
        </div>
        <button
          onClick={() => onToggleActive(!is_active)}
          className="shrink-0"
          title={is_active ? 'Disable sequence' : 'Enable sequence'}
        >
          {is_active ? (
            <ToggleRight className="h-5 w-5 text-green-500" />
          ) : (
            <ToggleLeft className="h-5 w-5 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
        {frontmatter.description || 'No description'}
      </p>

      {/* Steps Preview */}
      <div className="flex items-center gap-1 mb-3 overflow-hidden">
        {steps.slice(0, 4).map((step, idx) => (
          <div key={idx} className="flex items-center">
            <Badge variant="outline" className="text-xs shrink-0">
              {step.skill_key?.split('-')[0] || `Step ${idx + 1}`}
            </Badge>
            {idx < Math.min(steps.length - 1, 3) && (
              <ArrowRight className="h-3 w-3 text-muted-foreground mx-0.5 shrink-0" />
            )}
          </div>
        ))}
        {steps.length > 4 && (
          <span className="text-xs text-muted-foreground ml-1">+{steps.length - 4} more</span>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
        {/* Show steps count if using old step-based sequences */}
        {steps.length > 0 && (
          <span className="flex items-center gap-1">
            <GitBranch className="h-3 w-3" />
            {steps.length} steps
          </span>
        )}
        {/* Show linked skills count for new link-based sequences */}
        {frontmatter.linked_skills_count !== undefined && (
          <span className="flex items-center gap-1">
            <Link2 className="h-3 w-3" />
            {frontmatter.linked_skills_count} linked skills
          </span>
        )}
        {testStatus && (
          <span
            className={cn(
              'flex items-center gap-1',
              testStatus === 'completed' && 'text-green-600',
              testStatus === 'failed' && 'text-red-600',
              testStatus === 'running' && 'text-yellow-600'
            )}
          >
            {testStatus === 'completed' && <CheckCircle2 className="h-3 w-3" />}
            {testStatus === 'failed' && <XCircle className="h-3 w-3" />}
            {testStatus === 'running' && <Clock className="h-3 w-3" />}
            {testStatus === 'completed' ? 'Tested' : testStatus === 'failed' ? 'Failed' : 'Testing'}
          </span>
        )}
        {!testStatus && (
          <span className="flex items-center gap-1 text-amber-600">
            <AlertCircle className="h-3 w-3" />
            Not tested
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 pt-2 border-t">
        <Button variant="ghost" size="sm" onClick={onTest} className="h-8 gap-1">
          <Play className="h-3 w-3" />
          Test
        </Button>
        <Button variant="ghost" size="sm" onClick={onEdit} className="h-8 gap-1">
          <Edit2 className="h-3 w-3" />
          Edit
        </Button>
        <Button variant="ghost" size="sm" onClick={onClone} className="h-8 gap-1">
          <Copy className="h-3 w-3" />
          Clone
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="h-8 gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </motion.div>
  );
}

// =============================================================================
// Empty State Component
// =============================================================================

function EmptyState({ onCreateNew }: { onCreateNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="rounded-full bg-primary/10 p-4 mb-4">
        <GitBranch className="h-8 w-8 text-primary" />
      </div>
      <h3 className="text-lg font-semibold mb-2">No Agent Sequences Yet</h3>
      <p className="text-muted-foreground text-center max-w-md mb-6">
        Agent sequences let you chain multiple skills together, passing context between steps. Create
        your first sequence to automate complex workflows.
      </p>
      <Button onClick={onCreateNew} className="gap-2">
        <Plus className="h-4 w-4" />
        Create Your First Sequence
      </Button>
    </div>
  );
}

// =============================================================================
// Main Page Component
// =============================================================================

export default function AgentSequencesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<AgentSequence | null>(null);

  const { data: sequences, isLoading, refetch } = useAgentSequences();
  const operations = useAgentSequenceOperations(user?.id || '');

  // Filter sequences by search query
  const filteredSequences = useMemo(() => {
    if (!sequences) return [];
    if (!searchQuery.trim()) return sequences;

    const query = searchQuery.toLowerCase();
    return sequences.filter(
      (seq) =>
        seq.skill_key.toLowerCase().includes(query) ||
        seq.frontmatter.name.toLowerCase().includes(query) ||
        seq.frontmatter.description?.toLowerCase().includes(query)
    );
  }, [sequences, searchQuery]);

  // Handlers
  const handleCreateNew = () => {
    // Navigate to skills page with category preset for agent-sequence
    navigate('/platform/skills/agent-sequence/new');
  };

  const handleEdit = (sequence: AgentSequence) => {
    // Use the standard skill view page (same editor as skills)
    // Route format: /platform/skills/:category/:skillKey
    navigate(`/platform/skills/agent-sequence/${sequence.skill_key}`);
  };

  const handleTest = (sequence: AgentSequence) => {
    // Use the standard skill view page with simulate mode
    navigate(`/platform/skills/agent-sequence/${sequence.skill_key}?tab=test`);
  };

  const handleClone = async (sequence: AgentSequence) => {
    try {
      await operations.clone.mutateAsync(sequence.id);
      toast.success('Sequence cloned successfully');
    } catch (error) {
      toast.error('Failed to clone sequence');
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await operations.delete.mutateAsync(confirmDelete.id);
      toast.success('Sequence deleted');
      setConfirmDelete(null);
    } catch (error) {
      toast.error('Failed to delete sequence');
    }
  };

  const handleToggleActive = async (sequence: AgentSequence, isActive: boolean) => {
    try {
      await operations.toggleActive.mutateAsync({ id: sequence.id, isActive });
      toast.success(isActive ? 'Sequence enabled' : 'Sequence disabled');
    } catch (error) {
      toast.error('Failed to update sequence');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <GitBranch className="h-6 w-6 text-primary" />
                Agent Sequences
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Create and manage skill chains for automated workflows
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/platform/skills">
                <Button variant="outline" className="gap-2">
                  <FileCode className="h-4 w-4" />
                  Platform Skills
                </Button>
              </Link>
              <Button onClick={handleCreateNew} className="gap-2">
                <Plus className="h-4 w-4" />
                New Sequence
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Search Bar */}
      <div className="container mx-auto px-4 py-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search sequences..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Content */}
      <main className="container mx-auto px-4 pb-8">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="rounded-lg border bg-card p-4 animate-pulse">
                <div className="flex items-start gap-2 mb-3">
                  <div className="rounded-lg bg-muted h-9 w-9" />
                  <div className="flex-1">
                    <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                  </div>
                </div>
                <div className="h-10 bg-muted rounded mb-3" />
                <div className="h-6 bg-muted rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : filteredSequences.length === 0 && !searchQuery ? (
          <EmptyState onCreateNew={handleCreateNew} />
        ) : filteredSequences.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No sequences found matching "{searchQuery}"
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSequences.map((sequence) => (
              <SequenceCard
                key={sequence.id}
                sequence={sequence}
                onEdit={() => handleEdit(sequence)}
                onTest={() => handleTest(sequence)}
                onClone={() => handleClone(sequence)}
                onDelete={() => setConfirmDelete(sequence)}
                onToggleActive={(isActive) => handleToggleActive(sequence, isActive)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Sequence</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{confirmDelete?.frontmatter.name}"? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={operations.delete.isPending}
            >
              {operations.delete.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
