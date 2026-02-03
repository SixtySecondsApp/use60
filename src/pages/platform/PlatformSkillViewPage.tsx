/**
 * PlatformSkillViewPage
 *
 * Full-page view for previewing, testing, and editing a platform skill.
 * URL: /platform/skills/:category/:skillKey
 *
 * Features:
 * - Preview tab: View compiled skill content
 * - Test tab: Test skill with sample inputs
 * - Folders tab: Edit skill with folder structure (SkillDetailView)
 */

import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Edit2,
  Eye,
  Play,
  Sparkles,
  FileText,
  Database,
  Server,
  LayoutTemplate,
  Workflow,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  FolderTree,
  Zap,
  Settings2,
  Code2,
  FlaskConical,
  Building2,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SkillPreview } from '@/components/platform/SkillPreview';
import { SkillTestConsole } from '@/components/platform/SkillTestConsole';
import {
  type PlatformSkill,
  type SkillCategory,
  usePlatformSkillOperations,
} from '@/lib/hooks/usePlatformSkills';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase/clientV2';
import { SkillDetailView } from '@/components/platform/SkillDetailView';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';

const CATEGORY_ICONS: Record<SkillCategory | 'agent-sequence', React.ElementType> = {
  'sales-ai': Sparkles,
  writing: FileText,
  enrichment: Database,
  workflows: Workflow,
  'data-access': Server,
  'output-format': LayoutTemplate,
  'agent-sequence': Workflow,
};

const CATEGORY_COLORS: Record<SkillCategory | 'agent-sequence', string> = {
  'sales-ai': 'from-indigo-500 to-purple-600',
  writing: 'from-emerald-500 to-teal-600',
  enrichment: 'from-blue-500 to-cyan-600',
  workflows: 'from-orange-500 to-amber-600',
  'data-access': 'from-slate-500 to-gray-600',
  'output-format': 'from-pink-500 to-rose-600',
  'agent-sequence': 'from-orange-500 to-amber-600',
};

async function fetchSkillByKey(skillKey: string): Promise<PlatformSkill | null> {
  const { data, error } = await supabase
    .from('platform_skills')
    .select('*')
    .eq('skill_key', skillKey)
    .maybeSingle();

  if (error) {
    console.error('Error fetching skill:', error);
    throw error;
  }

  return data as PlatformSkill | null;
}

export default function PlatformSkillViewPage() {
  const { category, skillKey } = useParams<{ category: string; skillKey: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'folders' | 'edit' | 'test'>('folders');

  // Modal state
  const [showTriggersModal, setShowTriggersModal] = useState(false);
  const [showContextModal, setShowContextModal] = useState(false);
  const [showSimulateModal, setShowSimulateModal] = useState(false);

  const operations = usePlatformSkillOperations(user?.id || '');

  const {
    data: skill,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['platform-skill', skillKey],
    queryFn: () => fetchSkillByKey(skillKey!),
    enabled: !!skillKey,
  });

  const handleToggleActive = async () => {
    if (skill) {
      await operations.toggle(skill.id, !skill.is_active);
      refetch();
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-32 bg-gray-200 dark:bg-gray-800 rounded" />
            <div className="h-12 w-3/4 bg-gray-200 dark:bg-gray-800 rounded" />
            <div className="h-[500px] bg-gray-200 dark:bg-gray-800 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !skill) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <FileText className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Skill not found
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            The skill "{skillKey}" could not be found.
          </p>
          <Button onClick={() => navigate(`/platform/skills/${category || 'sales-ai'}`)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Skills
          </Button>
        </div>
      </div>
    );
  }

  const skillCategory = skill.category as SkillCategory;
  const CategoryIcon = CATEGORY_ICONS[skillCategory] || FileText;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      {/* Header */}
      <div className="border-b border-white/5 bg-gray-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            {/* Back & Title */}
            <div className="flex items-center gap-5">
              <Link
                to={`/platform/skills/${category || skill.category}`}
                className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all duration-200 hover:scale-105"
              >
                <ArrowLeft className="w-5 h-5 text-gray-400" />
              </Link>
              <div
                className={cn(
                  'p-3.5 rounded-2xl bg-gradient-to-br text-white shadow-xl shadow-black/20 ring-1 ring-white/10',
                  CATEGORY_COLORS[skillCategory] || 'from-gray-500 to-gray-600'
                )}
              >
                <CategoryIcon className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-white tracking-tight">
                    {skill.frontmatter.name}
                  </h1>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-xs font-medium px-2.5 py-0.5 flex items-center gap-1.5',
                      skill.is_active
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : 'bg-gray-500/15 text-gray-400 border-gray-500/30'
                    )}
                  >
                    <span className={cn(
                      'w-1.5 h-1.5 rounded-full inline-block',
                      skill.is_active ? 'bg-emerald-400' : 'bg-gray-400'
                    )} />
                    {skill.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                  {skill.frontmatter.version && (
                    <Badge className="text-xs font-mono bg-white/5 text-gray-400 border-white/10 hover:bg-white/10">
                      v{skill.frontmatter.version}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-2">
                  <p className="text-sm text-gray-500 font-mono bg-white/5 px-2 py-0.5 rounded-md">
                    {skill.skill_key}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowTriggersModal(true)}
                      className="h-7 px-2.5 text-xs gap-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg"
                    >
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      Triggers
                      {skill.frontmatter.triggers?.length > 0 && (
                        <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-full font-medium">
                          {skill.frontmatter.triggers.length}
                        </span>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowContextModal(true)}
                      className="h-7 px-2.5 text-xs gap-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg"
                    >
                      <Settings2 className="w-3.5 h-3.5 text-violet-400" />
                      Context
                      {(skill.frontmatter.required_context?.length > 0 || skill.frontmatter.optional_context?.length > 0) && (
                        <span className="text-[10px] bg-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded-full font-medium">
                          {(skill.frontmatter.required_context?.length || 0) + (skill.frontmatter.optional_context?.length || 0)}
                        </span>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowSimulateModal(true)}
                      className="h-7 px-2.5 text-xs gap-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg"
                    >
                      <FlaskConical className="w-3.5 h-3.5 text-cyan-400" />
                      Simulate
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
                className="h-9 w-9 p-0 bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
              >
                <RefreshCw className={cn('w-4 h-4 text-gray-400', isLoading && 'animate-spin')} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleToggleActive}
                disabled={operations.isProcessing}
                className="h-9 w-9 p-0 bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
              >
                {skill.is_active ? (
                  <ToggleRight className="w-4 h-4 text-emerald-400" />
                ) : (
                  <ToggleLeft className="w-4 h-4 text-gray-400" />
                )}
              </Button>
              <Link to={`/platform/skills/${category || skill.category}/${skillKey}/edit`}>
                <Button className="gap-2 h-9 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 border-0 shadow-lg shadow-blue-500/25 text-white">
                  <Edit2 className="w-4 h-4" />
                  Edit Skill
                </Button>
              </Link>
            </div>
          </div>

          {/* Description */}
          {skill.frontmatter.description && (
            <p className="text-gray-400 mt-4 max-w-3xl text-sm leading-relaxed">
              {skill.frontmatter.description}
            </p>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-white/5 bg-gray-900/30">
        <div className="max-w-7xl mx-auto px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="inline-flex bg-white/5 rounded-xl p-1 border border-white/5">
              <button
                onClick={() => setActiveTab('folders')}
                className={cn(
                  'px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 flex items-center gap-2',
                  activeTab === 'folders'
                    ? 'bg-gradient-to-r from-blue-600/20 to-indigo-600/20 text-white shadow-sm ring-1 ring-white/10'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                )}
              >
                <FolderTree className={cn('w-4 h-4', activeTab === 'folders' && 'text-blue-400')} />
                Folders
              </button>
              <button
                onClick={() => setActiveTab('edit')}
                className={cn(
                  'px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 flex items-center gap-2',
                  activeTab === 'edit'
                    ? 'bg-gradient-to-r from-blue-600/20 to-indigo-600/20 text-white shadow-sm ring-1 ring-white/10'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                )}
              >
                <Code2 className={cn('w-4 h-4', activeTab === 'edit' && 'text-blue-400')} />
                Edit
              </button>
              <button
                onClick={() => setActiveTab('test')}
                className={cn(
                  'px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 flex items-center gap-2',
                  activeTab === 'test'
                    ? 'bg-gradient-to-r from-blue-600/20 to-indigo-600/20 text-white shadow-sm ring-1 ring-white/10'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                )}
              >
                <Play className={cn('w-4 h-4', activeTab === 'test' && 'text-blue-400')} />
                Test
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      {activeTab === 'folders' ? (
        // Folders view - markdown preview with folder tree
        <div className="max-w-7xl mx-auto px-6 h-[calc(100vh-240px)] overflow-hidden">
          <SkillDetailView
            skillId={skill.id}
            onBack={() => {}}
            hideHeader
            previewMode
          />
        </div>
      ) : activeTab === 'edit' ? (
        // Edit view - raw markdown editor
        <div className="max-w-7xl mx-auto px-6 h-[calc(100vh-240px)] overflow-hidden">
          <SkillDetailView
            skillId={skill.id}
            onBack={() => setActiveTab('folders')}
            hideHeader
            previewMode={false}
          />
        </div>
      ) : (
        // Test view
        <div className="max-w-7xl mx-auto px-6 py-6">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="min-h-[600px]"
          >
            <SkillTestConsole skillKey={skill.skill_key} />
          </motion.div>
        </div>
      )}

      {/* Triggers Modal */}
      <TriggersModal
        open={showTriggersModal}
        onOpenChange={setShowTriggersModal}
        triggers={skill.frontmatter.triggers || []}
        onSave={async (triggers) => {
          // TODO: Save triggers via API
          toast.success('Triggers updated');
          setShowTriggersModal(false);
          refetch();
        }}
      />

      {/* Context Modal */}
      <ContextModal
        open={showContextModal}
        onOpenChange={setShowContextModal}
        requiredContext={skill.frontmatter.required_context || []}
        optionalContext={skill.frontmatter.optional_context || []}
        onSave={async (required, optional) => {
          // TODO: Save context via API
          toast.success('Context updated');
          setShowContextModal(false);
          refetch();
        }}
      />

      {/* Simulate Modal */}
      <SimulateModal
        open={showSimulateModal}
        onOpenChange={setShowSimulateModal}
        skillContent={skill.content_template}
        requiredContext={skill.frontmatter.required_context || []}
        optionalContext={skill.frontmatter.optional_context || []}
      />
    </div>
  );
}

// =============================================================================
// Triggers Modal Component
// =============================================================================

interface TriggersModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggers: Array<{ pattern: string; intent?: string; confidence?: number; examples?: string[] }>;
  onSave: (triggers: Array<{ pattern: string; intent?: string; confidence?: number; examples?: string[] }>) => void;
}

function TriggersModal({ open, onOpenChange, triggers, onSave }: TriggersModalProps) {
  const [editTriggers, setEditTriggers] = useState(triggers);

  // Sync state when modal opens with new data
  useEffect(() => {
    if (open) {
      setEditTriggers(triggers);
    }
  }, [open, triggers]);

  const addTrigger = () => {
    setEditTriggers([...editTriggers, { pattern: '', confidence: 0.7 }]);
  };

  const removeTrigger = (index: number) => {
    setEditTriggers(editTriggers.filter((_, i) => i !== index));
  };

  const updateTrigger = (index: number, field: string, value: any) => {
    const updated = [...editTriggers];
    updated[index] = { ...updated[index], [field]: value };
    setEditTriggers(updated);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-gray-900 border-white/10">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <div className="p-2 rounded-lg bg-amber-500/15">
              <Zap className="w-5 h-5 text-amber-400" />
            </div>
            Skill Triggers
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Define patterns that trigger this skill. Higher confidence = stricter match.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {editTriggers.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-white/5 flex items-center justify-center">
                <Zap className="w-6 h-6 text-gray-500" />
              </div>
              <p className="text-sm text-gray-400">No triggers defined</p>
              <p className="text-xs text-gray-500 mt-1">Add triggers to auto-activate this skill</p>
            </div>
          ) : (
            editTriggers.map((trigger, index) => (
              <div key={index} className="p-4 rounded-xl border border-white/5 bg-white/5 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <Label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Pattern</Label>
                    <Input
                      value={trigger.pattern}
                      onChange={(e) => updateTrigger(index, 'pattern', e.target.value)}
                      placeholder="e.g., write email, draft message"
                      className="mt-2 bg-white/5 border-white/10 focus:border-amber-500/50"
                    />
                  </div>
                  <div className="w-28">
                    <Label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Confidence</Label>
                    <Input
                      type="number"
                      min={0}
                      max={1}
                      step={0.1}
                      value={trigger.confidence || 0.7}
                      onChange={(e) => updateTrigger(index, 'confidence', parseFloat(e.target.value))}
                      className="mt-2 bg-white/5 border-white/10 focus:border-amber-500/50"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeTrigger(index)}
                    className="mt-7 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg"
                  >
                    Remove
                  </Button>
                </div>
                <div>
                  <Label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Intent (optional)</Label>
                  <Input
                    value={trigger.intent || ''}
                    onChange={(e) => updateTrigger(index, 'intent', e.target.value)}
                    placeholder="e.g., communication, research"
                    className="mt-2 bg-white/5 border-white/10 focus:border-amber-500/50"
                  />
                </div>
              </div>
            ))
          )}

          <Button variant="outline" onClick={addTrigger} className="w-full border-dashed border-white/10 hover:border-white/20 hover:bg-white/5">
            + Add Trigger
          </Button>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="bg-white/5 border-white/10 hover:bg-white/10">
            Cancel
          </Button>
          <Button onClick={() => onSave(editTriggers)} className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 border-0">
            Save Triggers
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Context Modal Component
// =============================================================================

interface ContextModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requiredContext: string[];
  optionalContext: string[];
  onSave: (required: string[], optional: string[]) => void;
}

function ContextModal({ open, onOpenChange, requiredContext, optionalContext, onSave }: ContextModalProps) {
  const [required, setRequired] = useState(requiredContext.join(', '));
  const [optional, setOptional] = useState(optionalContext.join(', '));

  // Sync state when modal opens with new data
  useEffect(() => {
    if (open) {
      setRequired(requiredContext.join(', '));
      setOptional(optionalContext.join(', '));
    }
  }, [open, requiredContext, optionalContext]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-gray-900 border-white/10">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <div className="p-2 rounded-lg bg-violet-500/15">
              <Settings2 className="w-5 h-5 text-violet-400" />
            </div>
            Context Variables
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Define variables this skill needs from organization context.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          <div className="p-4 rounded-xl bg-white/5 border border-white/5">
            <Label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Required Context</Label>
            <p className="text-xs text-gray-500 mt-1 mb-3">
              Variables that must be present (comma-separated)
            </p>
            <Textarea
              value={required}
              onChange={(e) => setRequired(e.target.value)}
              placeholder="ICP_profile, company_name, industry"
              className="h-24 bg-white/5 border-white/10 focus:border-violet-500/50 font-mono text-sm"
            />
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/5">
            <Label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Optional Context</Label>
            <p className="text-xs text-gray-500 mt-1 mb-3">
              Variables that enhance the skill if present (comma-separated)
            </p>
            <Textarea
              value={optional}
              onChange={(e) => setOptional(e.target.value)}
              placeholder="customer_logos, testimonials, tone_preference"
              className="h-24 bg-white/5 border-white/10 focus:border-violet-500/50 font-mono text-sm"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="bg-white/5 border-white/10 hover:bg-white/10">
            Cancel
          </Button>
          <Button
            onClick={() => {
              const reqArr = required.split(',').map(s => s.trim()).filter(Boolean);
              const optArr = optional.split(',').map(s => s.trim()).filter(Boolean);
              onSave(reqArr, optArr);
            }}
            className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 border-0"
          >
            Save Context
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Simulate Modal Component
// =============================================================================

interface SimulateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skillContent: string;
  requiredContext: string[];
  optionalContext: string[];
}

// Sample data templates for simulation
const SAMPLE_ORG_DATA: Record<string, string> = {
  company_name: 'Acme Corporation',
  company_description: 'A leading provider of innovative software solutions for enterprise businesses.',
  industry: 'Technology / SaaS',
  ICP_profile: 'Mid-market B2B SaaS companies with 50-500 employees, focused on digital transformation',
  customer_logos: 'Stripe, Notion, Figma, Linear',
  testimonials: '"Acme helped us increase productivity by 40%" - Jane Smith, CEO of TechCorp',
  value_proposition: 'Streamline your workflows and boost team productivity with our AI-powered platform',
  tone_preference: 'Professional yet approachable, confident but not arrogant',
  target_audience: 'CTOs, VPs of Engineering, and technical decision-makers',
  pain_points: 'Manual processes, siloed data, lack of visibility into team performance',
  competitive_advantage: 'AI-first approach, seamless integrations, world-class support',
  pricing_model: 'Per-seat pricing starting at $29/month with volume discounts',
};

const SAMPLE_USER_DATA: Record<string, string> = {
  user_name: 'John Smith',
  user_role: 'Account Executive',
  user_email: 'john.smith@acme.com',
  user_signature: 'John Smith | Account Executive | Acme Corporation',
  manager_name: 'Sarah Johnson',
  team_name: 'Enterprise Sales',
};

const SAMPLE_CONTACT_DATA: Record<string, string> = {
  contact_name: 'Alex Chen',
  contact_first_name: 'Alex',
  contact_title: 'VP of Engineering',
  contact_company: 'TechStartup Inc.',
  contact_email: 'alex.chen@techstartup.com',
  contact_industry: 'Software Development',
  contact_company_size: '150 employees',
};

function SimulateModal({ open, onOpenChange, skillContent, requiredContext, optionalContext }: SimulateModalProps) {
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [previewContent, setPreviewContent] = useState('');

  // Get all variables from the skill content
  const extractedVariables = useMemo(() => {
    const matches = skillContent.match(/\{[\w_]+\}|\$\{[\w_\.]+\}/g) || [];
    const uniqueVars = [...new Set(matches.map(m => m.replace(/[\{\}\$]/g, '')))];
    return uniqueVars;
  }, [skillContent]);

  // All context variables (required + optional + extracted)
  const allVariables = useMemo(() => {
    const vars = new Set([...requiredContext, ...optionalContext, ...extractedVariables]);
    return Array.from(vars);
  }, [requiredContext, optionalContext, extractedVariables]);

  // Initialize with sample data when modal opens
  useEffect(() => {
    if (open) {
      const initialVars: Record<string, string> = {};
      allVariables.forEach(varName => {
        // Try to find matching sample data
        const sampleValue = SAMPLE_ORG_DATA[varName] || SAMPLE_USER_DATA[varName] || SAMPLE_CONTACT_DATA[varName] || '';
        initialVars[varName] = sampleValue;
      });
      setVariables(initialVars);
    }
  }, [open, allVariables]);

  // Generate preview when variables change
  useEffect(() => {
    let content = skillContent;
    Object.entries(variables).forEach(([key, value]) => {
      // Replace both {var} and ${var} formats
      content = content.replace(new RegExp(`\\{${key}\\}`, 'g'), value || `{${key}}`);
      content = content.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value || `\${${key}}`);
    });
    setPreviewContent(content);
  }, [skillContent, variables]);

  const updateVariable = (key: string, value: string) => {
    setVariables(prev => ({ ...prev, [key]: value }));
  };

  const loadSampleData = (type: 'org' | 'user' | 'contact') => {
    const sampleData = type === 'org' ? SAMPLE_ORG_DATA : type === 'user' ? SAMPLE_USER_DATA : SAMPLE_CONTACT_DATA;
    setVariables(prev => {
      const updated = { ...prev };
      Object.entries(sampleData).forEach(([key, value]) => {
        if (allVariables.includes(key)) {
          updated[key] = value;
        }
      });
      return updated;
    });
    toast.success(`Loaded ${type === 'org' ? 'organization' : type === 'user' ? 'user' : 'contact'} sample data`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden bg-gray-900 border-white/10">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <div className="p-2 rounded-lg bg-cyan-500/15">
              <FlaskConical className="w-5 h-5 text-cyan-400" />
            </div>
            Simulate Variables
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Preview how your skill looks with real organization and user data.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-4 h-[60vh]">
          {/* Left side - Variable inputs */}
          <div className="w-1/2 flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Variables</span>
              <div className="flex-1" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadSampleData('org')}
                className="h-7 text-xs bg-white/5 border-white/10 hover:bg-white/10 gap-1"
              >
                <Building2 className="w-3 h-3" />
                Org
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadSampleData('user')}
                className="h-7 text-xs bg-white/5 border-white/10 hover:bg-white/10 gap-1"
              >
                <User className="w-3 h-3" />
                User
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadSampleData('contact')}
                className="h-7 text-xs bg-white/5 border-white/10 hover:bg-white/10 gap-1"
              >
                <User className="w-3 h-3" />
                Contact
              </Button>
            </div>
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-3">
                {allVariables.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-gray-400">No variables found in this skill</p>
                  </div>
                ) : (
                  allVariables.map(varName => (
                    <div key={varName} className="p-3 rounded-lg bg-white/5 border border-white/5">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-mono text-cyan-400">{`{${varName}}`}</span>
                        {requiredContext.includes(varName) && (
                          <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-medium">Required</span>
                        )}
                        {optionalContext.includes(varName) && (
                          <span className="text-[10px] bg-gray-500/20 text-gray-400 px-1.5 py-0.5 rounded font-medium">Optional</span>
                        )}
                      </div>
                      <Textarea
                        value={variables[varName] || ''}
                        onChange={(e) => updateVariable(varName, e.target.value)}
                        placeholder={`Enter value for ${varName}...`}
                        className="h-16 text-sm bg-white/5 border-white/10 focus:border-cyan-500/50 resize-none"
                      />
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Right side - Preview */}
          <div className="w-1/2 flex flex-col border-l border-white/10 pl-4">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Preview</span>
            <ScrollArea className="flex-1 rounded-lg bg-gray-950 border border-white/5 p-4">
              <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
                {previewContent || 'No content to preview'}
              </pre>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="bg-white/5 border-white/10 hover:bg-white/10">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
