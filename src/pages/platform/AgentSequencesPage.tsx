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
  Eye,
  Search,
  ToggleLeft,
  ToggleRight,
  GitBranch,
  Copy,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  FileCode,
  Link2,
  RefreshCw,
  Play,
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
  index: number;
  onView: () => void;
  onEdit: () => void;
  onTest: () => void;
  onClone: () => void;
  onDelete: () => void;
  onToggleActive: (isActive: boolean) => void;
  isProcessing: boolean;
}

function SequenceCard({
  sequence,
  index,
  onView,
  onEdit,
  onTest,
  onClone,
  onDelete,
  onToggleActive,
  isProcessing,
}: SequenceCardProps) {
  const { frontmatter, is_active, skill_key, version } = sequence;
  const steps = Array.isArray(frontmatter.sequence_steps) ? frontmatter.sequence_steps : [];
  const safeSteps = steps.filter(Boolean);

  // Fetch mock and live runs separately to ensure we get both
  const { data: mockExecutions } = useSequenceExecutions(skill_key, { isSimulation: true, limit: 1 });
  const { data: liveExecutions } = useSequenceExecutions(skill_key, { isSimulation: false, limit: 1 });

  // Calculate test status based on both mock and live runs
  const latestMockRun = mockExecutions?.[0];
  const latestLiveRun = liveExecutions?.[0];

  // Determine combined test status
  type TestStatusType = 'passed' | 'failed' | 'partial' | 'running' | 'not_tested';
  let testStatus: TestStatusType = 'not_tested';
  let testStatusLabel = 'Not tested';

  const mockPassed = latestMockRun?.status === 'completed';
  const livePassed = latestLiveRun?.status === 'completed';
  const mockFailed = latestMockRun?.status === 'failed';
  const liveFailed = latestLiveRun?.status === 'failed';
  const isRunning = latestMockRun?.status === 'running' || latestLiveRun?.status === 'running';

  if (isRunning) {
    testStatus = 'running';
    testStatusLabel = 'Testing';
  } else if (mockFailed || liveFailed) {
    testStatus = 'failed';
    testStatusLabel = mockFailed && liveFailed ? 'Both failed' : liveFailed ? 'Live failed' : 'Mock failed';
  } else if (mockPassed && livePassed) {
    testStatus = 'passed';
    testStatusLabel = 'Tested';
  } else if (mockPassed || livePassed) {
    testStatus = 'partial';
    testStatusLabel = mockPassed ? 'Mock only' : 'Live only';
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.05 }}
      className={cn(
        'bg-white dark:bg-gray-900/80 dark:backdrop-blur-sm',
        'border border-gray-200 dark:border-gray-700/50',
        'rounded-xl p-6 shadow-sm dark:shadow-none',
        'hover:border-gray-300 dark:hover:border-gray-600/50',
        'transition-colors'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-primary/10 p-2">
            <GitBranch className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm line-clamp-1">{frontmatter.name || 'Untitled sequence'}</h3>
              <Badge
                variant="outline"
                className={cn(
                  'text-xs shrink-0',
                  is_active
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                )}
              >
                {is_active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 font-mono">
              {skill_key}
            </p>
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2 mb-4">
        {frontmatter.description || 'No description'}
      </p>

      {/* Metadata */}
      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mb-4 flex-wrap">
        <div className="flex items-center gap-1">
          <GitBranch className="w-3.5 h-3.5" />
          <span>Sequence</span>
        </div>
        <span className="text-gray-300 dark:text-gray-600">|</span>
        <span>v{version}</span>
        {/* Show steps count if using old step-based sequences */}
        {safeSteps.length > 0 && (
          <>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <span>{safeSteps.length} steps</span>
          </>
        )}
        {/* Show linked skills count for new link-based sequences */}
        {frontmatter.linked_skills_count !== undefined && frontmatter.linked_skills_count > 0 && (
          <>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <span className="flex items-center gap-1">
              <Link2 className="w-3 h-3" />
              {frontmatter.linked_skills_count} linked
            </span>
          </>
        )}
        {/* Test status */}
        <span className="text-gray-300 dark:text-gray-600">|</span>
        <span
          className={cn(
            'flex items-center gap-1',
            testStatus === 'passed' && 'text-green-600 dark:text-green-400',
            testStatus === 'failed' && 'text-red-600 dark:text-red-400',
            testStatus === 'running' && 'text-yellow-600 dark:text-yellow-400',
            testStatus === 'partial' && 'text-blue-600 dark:text-blue-400',
            testStatus === 'not_tested' && 'text-amber-600 dark:text-amber-400'
          )}
        >
          {testStatus === 'passed' && <CheckCircle2 className="h-3 w-3" />}
          {testStatus === 'failed' && <XCircle className="h-3 w-3" />}
          {testStatus === 'running' && <Clock className="h-3 w-3" />}
          {testStatus === 'partial' && <AlertCircle className="h-3 w-3" />}
          {testStatus === 'not_tested' && <AlertCircle className="h-3 w-3" />}
          {testStatusLabel}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onView}
          disabled={isProcessing}
          className="flex-1 gap-1.5"
        >
          <Eye className="w-3.5 h-3.5" />
          View
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onTest}
          disabled={isProcessing}
          className="flex-1 gap-1.5"
        >
          <Play className="w-3.5 h-3.5" />
          Test
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClone}
          disabled={isProcessing}
          className="p-2"
          title="Clone"
        >
          <Copy className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onToggleActive(!is_active)}
          disabled={isProcessing}
          className="p-2"
          title={is_active ? 'Deactivate' : 'Activate'}
        >
          {is_active ? (
            <ToggleRight className="w-4 h-4 text-green-600" />
          ) : (
            <ToggleLeft className="w-4 h-4 text-gray-400" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          disabled={isProcessing}
          className="p-2 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </motion.div>
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
    navigate('/platform/skills/agent-sequence/new');
  };

  const handleView = (sequence: AgentSequence) => {
    navigate(`/platform/skills/agent-sequence/${sequence.skill_key}`);
  };

  const handleEdit = (sequence: AgentSequence) => {
    navigate(`/platform/skills/agent-sequence/${sequence.skill_key}/edit`);
  };

  const handleTest = (sequence: AgentSequence) => {
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

  const isProcessing = operations.delete.isPending || operations.clone.isPending || operations.toggleActive.isPending;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-700/50 px-6 py-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg">
                <GitBranch className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                  Agent Sequences
                </h1>
                <p className="text-gray-700 dark:text-gray-300 mt-1">
                  Mega skills that orchestrate multiple skills for complex workflows
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => refetch()}
                disabled={isLoading}
                className="gap-2"
              >
                <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
                Refresh
              </Button>
              <Link to="/platform/skills">
                <Button variant="outline" className="gap-2">
                  <FileCode className="w-4 h-4" />
                  Platform Skills
                </Button>
              </Link>
              <Button onClick={handleCreateNew} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
                <Plus className="w-4 h-4" />
                New Sequence
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="border-b border-gray-200 dark:border-gray-700/50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-end">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search sequences..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-white dark:bg-gray-800/50 border-gray-300 dark:border-gray-700/50"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-48 bg-white dark:bg-gray-900/80 rounded-xl border border-gray-200 dark:border-gray-700/50 animate-pulse"
              />
            ))}
          </div>
        ) : filteredSequences.length === 0 && !searchQuery ? (
          <div className="text-center py-16">
            <GitBranch className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              No sequences found
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
              Agent sequences let you chain multiple skills together, passing context between steps.
              Create your first sequence to automate complex workflows.
            </p>
            <Button onClick={handleCreateNew} className="gap-2">
              <Plus className="w-4 h-4" />
              Create Your First Sequence
            </Button>
          </div>
        ) : filteredSequences.length === 0 ? (
          <div className="text-center py-16">
            <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              No sequences found
            </h3>
            <p className="text-gray-500 dark:text-gray-400">
              Try adjusting your search query
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredSequences.map((sequence, index) => (
              <SequenceCard
                key={sequence.id}
                sequence={sequence}
                index={index}
                onView={() => handleView(sequence)}
                onEdit={() => handleEdit(sequence)}
                onTest={() => handleTest(sequence)}
                onClone={() => handleClone(sequence)}
                onDelete={() => setConfirmDelete(sequence)}
                onToggleActive={(isActive) => handleToggleActive(sequence, isActive)}
                isProcessing={isProcessing}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent className="max-w-md bg-white dark:bg-gray-900">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-gray-100">
              Delete Sequence?
            </DialogTitle>
            <DialogDescription className="text-gray-600 dark:text-gray-400">
              Are you sure you want to delete &ldquo;{confirmDelete?.frontmatter.name}&rdquo;? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => setConfirmDelete(null)}
              disabled={operations.delete.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={operations.delete.isPending}
            >
              {operations.delete.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
