/**
 * AgentSequenceBuilderPage
 *
 * Full-page editor for creating or editing agent sequences.
 * URL: /platform/agent-sequences/new (create new)
 * URL: /platform/agent-sequences/:sequenceKey (edit existing)
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  GitBranch,
  Save,
  Play,
  Loader2,
  AlertCircle,
  History,
} from 'lucide-react';
import { BackToPlatform } from '@/components/platform/BackToPlatform';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SequenceBuilder } from '@/components/platform/SequenceBuilder';
import { SequenceSimulator } from '@/components/platform/SequenceSimulator';
import { SequenceExecutionViewer } from '@/components/platform/SequenceExecutionViewer';
import {
  useAgentSequenceByKey,
  useAgentSequenceOperations,
  useSequenceExecutions,
  type AgentSequence,
  type SequenceStep,
  type SequenceFrontmatter,
  type SequenceExecution,
} from '@/lib/hooks/useAgentSequences';
import { useAuth } from '@/lib/contexts/AuthContext';

// =============================================================================
// Types
// =============================================================================

interface SequenceFormData {
  name: string;
  description: string;
  skill_key: string;
  is_active: boolean;
  triggers: string[];
  requires_context: string[];
  outputs: Record<string, string>;
  sequence_steps: SequenceStep[];
}

// =============================================================================
// Helper Functions
// =============================================================================

function generateSkillKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function createDefaultFormData(): SequenceFormData {
  return {
    name: '',
    description: '',
    skill_key: '',
    is_active: false,
    triggers: [],
    requires_context: [],
    outputs: {},
    sequence_steps: [],
  };
}

function sequenceToFormData(sequence: AgentSequence): SequenceFormData {
  return {
    name: sequence.frontmatter.name || '',
    description: sequence.frontmatter.description || '',
    skill_key: sequence.skill_key,
    is_active: sequence.is_active,
    triggers: sequence.frontmatter.triggers || [],
    requires_context: sequence.frontmatter.requires_context || [],
    outputs: sequence.frontmatter.outputs || {},
    sequence_steps: sequence.frontmatter.sequence_steps || [],
  };
}

// =============================================================================
// Tags Input Component
// =============================================================================

interface TagsInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}

function TagsInput({ value, onChange, placeholder }: TagsInputProps) {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      if (!value.includes(inputValue.trim())) {
        onChange([...value, inputValue.trim()]);
      }
      setInputValue('');
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter((tag) => tag !== tagToRemove));
  };

  return (
    <div className="flex flex-wrap gap-1.5 p-2 border rounded-md bg-background min-h-[42px]">
      {value.map((tag) => (
        <Badge
          key={tag}
          variant="secondary"
          className="gap-1 cursor-pointer hover:bg-secondary/80"
          onClick={() => removeTag(tag)}
        >
          {tag}
          <span className="text-muted-foreground hover:text-foreground">×</span>
        </Badge>
      ))}
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={value.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[120px] bg-transparent outline-none text-sm"
      />
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export default function AgentSequenceBuilderPage() {
  const { sequenceKey } = useParams<{ sequenceKey: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const isNewSequence = !sequenceKey || sequenceKey === 'new';

  // Form state
  const [formData, setFormData] = useState<SequenceFormData>(createDefaultFormData());
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [selectedExecution, setSelectedExecution] = useState<SequenceExecution | null>(null);

  // Query existing sequence
  const {
    data: existingSequence,
    isLoading: isLoadingSequence,
    error: sequenceError,
  } = useAgentSequenceByKey(isNewSequence ? undefined : sequenceKey);

  // Query executions for this sequence
  const { data: executions } = useSequenceExecutions(
    isNewSequence ? undefined : sequenceKey,
    10
  );

  // Operations
  const operations = useAgentSequenceOperations(user?.id || '');

  // Initialize form data from existing sequence
  useEffect(() => {
    if (existingSequence) {
      setFormData(sequenceToFormData(existingSequence));
    }
  }, [existingSequence]);

  // Auto-generate skill_key from name for new sequences
  useEffect(() => {
    if (isNewSequence && formData.name && !formData.skill_key) {
      setFormData((prev) => ({
        ...prev,
        skill_key: generateSkillKey(prev.name),
      }));
    }
  }, [isNewSequence, formData.name, formData.skill_key]);

  // Track unsaved changes
  const updateFormData = useCallback(
    <K extends keyof SequenceFormData>(key: K, value: SequenceFormData[K]) => {
      setFormData((prev) => ({ ...prev, [key]: value }));
      setHasUnsavedChanges(true);
    },
    []
  );

  // Handle save
  const handleSave = async () => {
    // Validation
    if (!formData.name.trim()) {
      toast.error('Please enter a sequence name');
      return;
    }
    if (!formData.skill_key.trim()) {
      toast.error('Please enter a skill key');
      return;
    }
    if (formData.sequence_steps.length === 0) {
      toast.error('Please add at least one step to the sequence');
      return;
    }

    // Check all steps have skills selected
    const invalidSteps = formData.sequence_steps.filter((s) => !s.skill_key);
    if (invalidSteps.length > 0) {
      toast.error('All steps must have a skill selected');
      return;
    }

    try {
      const frontmatter: SequenceFrontmatter = {
        name: formData.name,
        description: formData.description,
        triggers: formData.triggers,
        requires_context: formData.requires_context,
        outputs: formData.outputs,
        sequence_steps: formData.sequence_steps,
      };

      if (isNewSequence) {
        await operations.create({
          skill_key: formData.skill_key,
          category: 'agent-sequence',
          frontmatter,
          body: `# ${formData.name}\n\n${formData.description}`,
          is_active: formData.is_active,
        });
        toast.success('Sequence created successfully');
        navigate(`/platform/agent-sequences/${formData.skill_key}`);
      } else if (existingSequence) {
        await operations.update(existingSequence.id, {
          frontmatter,
          body: `# ${formData.name}\n\n${formData.description}`,
          is_active: formData.is_active,
        });
        toast.success('Sequence updated successfully');
        setHasUnsavedChanges(false);
      }
    } catch (error) {
      console.error('Error saving sequence:', error);
      toast.error('Failed to save sequence');
    }
  };

  // Build current sequence object for simulator
  // Show simulator as soon as there's a name (steps can be added after)
  const currentSequence: AgentSequence | null =
    formData.name.trim()
      ? {
          id: existingSequence?.id || 'preview',
          skill_key: formData.skill_key || 'preview-sequence',
          category: 'agent-sequence',
          frontmatter: {
            name: formData.name,
            description: formData.description,
            triggers: formData.triggers,
            requires_context: formData.requires_context,
            outputs: formData.outputs,
            sequence_steps: formData.sequence_steps,
          },
          body: '',
          is_active: formData.is_active,
          created_at: existingSequence?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by_user_id: existingSequence?.created_by_user_id || user?.id || '',
        }
      : null;

  // Loading state
  if (!isNewSequence && isLoadingSequence) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-32 bg-muted rounded" />
            <div className="h-12 w-3/4 bg-muted rounded" />
            <div className="h-[600px] bg-muted rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (!isNewSequence && (sequenceError || (!isLoadingSequence && !existingSequence))) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <AlertCircle className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Sequence not found</h2>
          <p className="text-muted-foreground mb-6">
            The sequence "{sequenceKey}" could not be found.
          </p>
          <Button onClick={() => navigate('/platform/agent-sequences')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Sequences
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b shrink-0">
        <div className="px-6 py-3">
          <BackToPlatform />
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-4">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg">
                <GitBranch className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">
                  {isNewSequence ? 'Create Agent Sequence' : `Edit: ${formData.name}`}
                </h1>
                {!isNewSequence && (
                  <p className="text-sm text-muted-foreground font-mono">{sequenceKey}</p>
                )}
              </div>
              {hasUnsavedChanges && (
                <Badge variant="outline" className="text-yellow-600 border-yellow-300">
                  Unsaved changes
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Execution History */}
              {!isNewSequence && executions && executions.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedExecution(executions[0])}
                >
                  <History className="w-4 h-4 mr-2" />
                  History ({executions.length})
                </Button>
              )}

              {/* Active Toggle */}
              <div className="flex items-center gap-2 px-3 py-1 rounded-lg border bg-card">
                <Label htmlFor="is-active" className="text-sm">
                  Active
                </Label>
                <Switch
                  id="is-active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => updateFormData('is_active', checked)}
                />
              </div>

              {/* Save Button */}
              <Button
                onClick={handleSave}
                disabled={operations.isCreating || operations.isUpdating}
              >
                {operations.isCreating || operations.isUpdating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                {isNewSequence ? 'Create' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Left Panel - Sequence Editor */}
        <ResizablePanel defaultSize={60} minSize={40}>
          <ScrollArea className="h-full">
            <div className="p-6 space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Basic Information
                </h2>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => updateFormData('name', e.target.value)}
                      placeholder="Meeting Preparation Brief"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="skill-key">Skill Key</Label>
                    <Input
                      id="skill-key"
                      value={formData.skill_key}
                      onChange={(e) => updateFormData('skill_key', e.target.value)}
                      placeholder="meeting-preparation-brief"
                      className="font-mono"
                      disabled={!isNewSequence}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => updateFormData('description', e.target.value)}
                    placeholder="Describe what this sequence does..."
                    rows={2}
                  />
                </div>
              </div>

              {/* Context Configuration */}
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Context Configuration
                </h2>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Triggers</Label>
                    <TagsInput
                      value={formData.triggers}
                      onChange={(v) => updateFormData('triggers', v)}
                      placeholder="Enter trigger events..."
                    />
                    <p className="text-xs text-muted-foreground">
                      Events that activate this sequence
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Required Context</Label>
                    <TagsInput
                      value={formData.requires_context}
                      onChange={(v) => updateFormData('requires_context', v)}
                      placeholder="Enter required context..."
                    />
                    <p className="text-xs text-muted-foreground">
                      Input variables needed to start
                    </p>
                  </div>
                </div>
              </div>

              {/* Sequence Steps */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Sequence Steps
                  </h2>
                  <Badge variant="secondary">
                    {formData.sequence_steps.length} step
                    {formData.sequence_steps.length !== 1 ? 's' : ''}
                  </Badge>
                </div>

                <SequenceBuilder
                  steps={formData.sequence_steps}
                  onChange={(steps) => updateFormData('sequence_steps', steps)}
                />
              </div>
            </div>
          </ScrollArea>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right Panel - Simulator */}
        <ResizablePanel defaultSize={40} minSize={30}>
          <div className="h-full border-l">
            {currentSequence ? (
              <SequenceSimulator sequence={currentSequence} className="h-full" />
            ) : (
              <div className="h-full flex items-center justify-center text-center p-8">
                <div className="max-w-xs">
                  <Play className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-medium mb-2">No sequence to simulate</h3>
                  <p className="text-sm text-muted-foreground">
                    Add a name and at least one step to enable simulation.
                  </p>
                </div>
              </div>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Execution Viewer Modal */}
      <SequenceExecutionViewer
        execution={selectedExecution}
        open={!!selectedExecution}
        onOpenChange={(open) => !open && setSelectedExecution(null)}
      />
    </div>
  );
}
