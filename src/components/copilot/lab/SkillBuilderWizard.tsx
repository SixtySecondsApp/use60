/**
 * SkillBuilderWizard Component
 *
 * Multi-step wizard for AI-powered skill generation.
 * Steps: Describe Intent → Select Capabilities → Review AI Draft → Test & Deploy
 */

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Wand2,
  ChevronRight,
  ChevronLeft,
  Check,
  X,
  Loader2,
  Play,
  Save,
  AlertCircle,
  Code,
  FileText,
  Zap,
  Calendar,
  Mail,
  MessageSquare,
  Database,
  ListTodo,
  Plus,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { useSkillBuilder, type GeneratedSkill } from '@/lib/hooks/useSkillBuilder';
import type { QueryIntent } from '@/lib/hooks/useQueryAnalytics';

interface SkillBuilderWizardProps {
  isOpen: boolean;
  onClose: () => void;
  prefillIntent?: QueryIntent | null;
  onSkillDeployed?: (skillKey: string) => void;
}

type WizardStep = 'describe' | 'capabilities' | 'review' | 'test';

const STEPS: { id: WizardStep; label: string; description: string }[] = [
  { id: 'describe', label: 'Describe', description: 'What should this skill do?' },
  { id: 'capabilities', label: 'Capabilities', description: 'What data does it need?' },
  { id: 'review', label: 'Review', description: 'Review AI-generated skill' },
  { id: 'test', label: 'Test & Deploy', description: 'Test and save' },
];

interface Capability {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
}

const CAPABILITIES: Capability[] = [
  { id: 'crm', name: 'CRM Data', description: 'Contacts, companies, deals, activities', icon: Database },
  { id: 'calendar', name: 'Calendar', description: 'Events and meetings', icon: Calendar },
  { id: 'email', name: 'Email', description: 'Read and draft emails', icon: Mail },
  { id: 'transcript', name: 'Transcripts', description: 'Meeting recordings and transcripts', icon: FileText },
  { id: 'messaging', name: 'Messaging', description: 'Slack/Teams messages', icon: MessageSquare },
  { id: 'task', name: 'Tasks', description: 'Create and manage tasks', icon: ListTodo },
];

export function SkillBuilderWizard({
  isOpen,
  onClose,
  prefillIntent,
  onSkillDeployed,
}: SkillBuilderWizardProps) {
  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>('describe');
  const [skillType, setSkillType] = useState<'skill' | 'sequence'>('skill');

  // Form state - Step 1: Describe
  const [intent, setIntent] = useState(prefillIntent?.normalized_query || '');
  const [exampleQueries, setExampleQueries] = useState<string[]>(
    prefillIntent?.example_queries || ['']
  );

  // Form state - Step 2: Capabilities
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>([]);

  // Form state - Step 3: Generated Skill
  const [generatedSkill, setGeneratedSkill] = useState<GeneratedSkill | null>(null);

  // Form state - Step 4: Testing
  const [testQuery, setTestQuery] = useState('');
  const [testResult, setTestResult] = useState<{
    success: boolean;
    response?: string;
    error?: string;
  } | null>(null);

  // Hooks
  const {
    generateSkill,
    testSkill,
    deploySkill,
    isGenerating,
    isTesting,
    isDeploying,
  } = useSkillBuilder();

  // Reset wizard state
  const handleClose = useCallback(() => {
    setCurrentStep('describe');
    setSkillType('skill');
    setIntent('');
    setExampleQueries(['']);
    setSelectedCapabilities([]);
    setGeneratedSkill(null);
    setTestQuery('');
    setTestResult(null);
    onClose();
  }, [onClose]);

  // Navigation
  const goNext = useCallback(() => {
    const stepIndex = STEPS.findIndex((s) => s.id === currentStep);
    if (stepIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[stepIndex + 1].id);
    }
  }, [currentStep]);

  const goPrev = useCallback(() => {
    const stepIndex = STEPS.findIndex((s) => s.id === currentStep);
    if (stepIndex > 0) {
      setCurrentStep(STEPS[stepIndex - 1].id);
    }
  }, [currentStep]);

  // Example query management
  const addExampleQuery = useCallback(() => {
    if (exampleQueries.length < 5) {
      setExampleQueries([...exampleQueries, '']);
    }
  }, [exampleQueries]);

  const removeExampleQuery = useCallback(
    (index: number) => {
      if (exampleQueries.length > 1) {
        setExampleQueries(exampleQueries.filter((_, i) => i !== index));
      }
    },
    [exampleQueries]
  );

  const updateExampleQuery = useCallback(
    (index: number, value: string) => {
      const updated = [...exampleQueries];
      updated[index] = value;
      setExampleQueries(updated);
    },
    [exampleQueries]
  );

  // Generate skill
  const handleGenerate = useCallback(async () => {
    try {
      const result = await generateSkill({
        intent,
        exampleQueries: exampleQueries.filter((q) => q.trim()),
        capabilities: selectedCapabilities,
        type: skillType,
      });
      setGeneratedSkill(result);
      goNext();
    } catch (error) {
      console.error('Generation failed:', error);
    }
  }, [intent, exampleQueries, selectedCapabilities, skillType, generateSkill, goNext]);

  // Test skill
  const handleTest = useCallback(async () => {
    if (!generatedSkill || !testQuery.trim()) return;

    try {
      const result = await testSkill({
        skillKey: generatedSkill.skillKey,
        frontmatter: generatedSkill.frontmatter,
        contentTemplate: generatedSkill.contentTemplate,
        testQuery,
      });
      setTestResult(result);
    } catch (error) {
      setTestResult({
        success: false,
        error: error instanceof Error ? error.message : 'Test failed',
      });
    }
  }, [generatedSkill, testQuery, testSkill]);

  // Deploy skill
  const handleDeploy = useCallback(async () => {
    if (!generatedSkill) return;

    try {
      const result = await deploySkill({
        skillKey: generatedSkill.skillKey,
        name: generatedSkill.name,
        category: generatedSkill.category,
        frontmatter: generatedSkill.frontmatter,
        contentTemplate: generatedSkill.contentTemplate,
        isActive: false, // Deploy as inactive for review
      });
      onSkillDeployed?.(result.skill_key);
      handleClose();
    } catch (error) {
      console.error('Deploy failed:', error);
    }
  }, [generatedSkill, deploySkill, onSkillDeployed, handleClose]);

  // Validation
  const canProceedFromDescribe = intent.trim().length > 10 && exampleQueries.some((q) => q.trim());
  const canProceedFromCapabilities = selectedCapabilities.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-1.5 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg">
              <Wand2 className="w-4 h-4 text-white" />
            </div>
            AI Skill Builder
          </DialogTitle>
          <DialogDescription>
            {STEPS.find((s) => s.id === currentStep)?.description}
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center justify-between px-2 py-3 border-b border-gray-200 dark:border-gray-700">
          {STEPS.map((step, index) => {
            const isActive = step.id === currentStep;
            const isPast = STEPS.findIndex((s) => s.id === currentStep) > index;
            return (
              <div key={step.id} className="flex items-center">
                <div
                  className={cn(
                    'flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-purple-600 text-white'
                      : isPast
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                  )}
                >
                  {isPast ? <Check className="w-4 h-4" /> : index + 1}
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={cn(
                      'w-12 h-0.5 mx-2',
                      isPast
                        ? 'bg-green-500'
                        : 'bg-gray-200 dark:bg-gray-700'
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <AnimatePresence mode="wait">
            {/* Step 1: Describe */}
            {currentStep === 'describe' && (
              <motion.div
                key="describe"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div>
                  <Label htmlFor="intent">What should this skill do?</Label>
                  <Textarea
                    id="intent"
                    value={intent}
                    onChange={(e) => setIntent(e.target.value)}
                    placeholder="e.g., Help sales reps understand a company's org chart and identify key decision makers before meetings"
                    className="mt-1.5 min-h-[100px]"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Example queries users might ask</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={addExampleQuery}
                      disabled={exampleQueries.length >= 5}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {exampleQueries.map((query, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          value={query}
                          onChange={(e) => updateExampleQuery(index, e.target.value)}
                          placeholder={`Example query ${index + 1}`}
                        />
                        {exampleQueries.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeExampleQuery(index)}
                            className="shrink-0"
                          >
                            <Trash2 className="w-4 h-4 text-gray-400" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <Label>Skill type</Label>
                  <div className="flex gap-3 mt-2">
                    <button
                      onClick={() => setSkillType('skill')}
                      className={cn(
                        'flex-1 p-3 border rounded-lg text-left transition-colors',
                        skillType === 'skill'
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Zap className="w-4 h-4 text-purple-600" />
                        <span className="font-medium">Single Skill</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        One-step action or response
                      </p>
                    </button>
                    <button
                      onClick={() => setSkillType('sequence')}
                      className={cn(
                        'flex-1 p-3 border rounded-lg text-left transition-colors',
                        skillType === 'sequence'
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Sparkles className="w-4 h-4 text-purple-600" />
                        <span className="font-medium">Sequence</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        Multi-step workflow
                      </p>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 2: Capabilities */}
            {currentStep === 'capabilities' && (
              <motion.div
                key="capabilities"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Select the data sources and capabilities this skill needs to access:
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {CAPABILITIES.map((cap) => {
                    const isSelected = selectedCapabilities.includes(cap.id);
                    const Icon = cap.icon;
                    return (
                      <button
                        key={cap.id}
                        onClick={() => {
                          setSelectedCapabilities(
                            isSelected
                              ? selectedCapabilities.filter((c) => c !== cap.id)
                              : [...selectedCapabilities, cap.id]
                          );
                        }}
                        className={cn(
                          'flex items-start gap-3 p-3 border rounded-lg text-left transition-colors',
                          isSelected
                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                        )}
                      >
                        <Checkbox checked={isSelected} className="mt-0.5" />
                        <div>
                          <div className="flex items-center gap-2">
                            <Icon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                            <span className="font-medium text-sm">{cap.name}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{cap.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Step 3: Review */}
            {currentStep === 'review' && (
              <motion.div
                key="review"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                {isGenerating ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 text-purple-600 animate-spin mb-4" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Generating skill with Claude Sonnet 4...
                    </p>
                  </div>
                ) : generatedSkill ? (
                  <div className="space-y-4">
                    {/* Skill Header */}
                    <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                          {generatedSkill.name}
                        </h3>
                        <Badge variant="outline">{generatedSkill.category}</Badge>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Skill key: <code className="text-xs bg-gray-200 dark:bg-gray-700 px-1 py-0.5 rounded">{generatedSkill.skillKey}</code>
                      </p>
                    </div>

                    {/* Tabs for frontmatter/content */}
                    <Tabs defaultValue="template" className="w-full">
                      <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="template">Template</TabsTrigger>
                        <TabsTrigger value="frontmatter">Config</TabsTrigger>
                        <TabsTrigger value="rationale">Rationale</TabsTrigger>
                      </TabsList>
                      <TabsContent value="template" className="mt-2">
                        <pre className="p-3 bg-gray-900 text-gray-100 rounded-lg text-xs overflow-auto max-h-[200px]">
                          {generatedSkill.contentTemplate}
                        </pre>
                      </TabsContent>
                      <TabsContent value="frontmatter" className="mt-2">
                        <pre className="p-3 bg-gray-900 text-gray-100 rounded-lg text-xs overflow-auto max-h-[200px]">
                          {JSON.stringify(generatedSkill.frontmatter, null, 2)}
                        </pre>
                      </TabsContent>
                      <TabsContent value="rationale" className="mt-2">
                        <p className="text-sm text-gray-600 dark:text-gray-400 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                          {generatedSkill.rationale}
                        </p>
                      </TabsContent>
                    </Tabs>

                    {/* Test Cases */}
                    {generatedSkill.testCases && generatedSkill.testCases.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Suggested Test Cases
                        </h4>
                        <div className="space-y-2">
                          {generatedSkill.testCases.map((tc, idx) => (
                            <div
                              key={idx}
                              className="p-2 border border-gray-200 dark:border-gray-700 rounded text-sm"
                            >
                              <p className="text-gray-900 dark:text-gray-100">"{tc.query}"</p>
                              <p className="text-xs text-gray-500 mt-1">→ {tc.expectedBehavior}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <AlertCircle className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">No skill generated yet</p>
                  </div>
                )}
              </motion.div>
            )}

            {/* Step 4: Test & Deploy */}
            {currentStep === 'test' && generatedSkill && (
              <motion.div
                key="test"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div>
                  <Label htmlFor="test-query">Test query</Label>
                  <div className="flex gap-2 mt-1.5">
                    <Input
                      id="test-query"
                      value={testQuery}
                      onChange={(e) => setTestQuery(e.target.value)}
                      placeholder="Enter a test query..."
                      className="flex-1"
                    />
                    <Button
                      onClick={handleTest}
                      disabled={!testQuery.trim() || isTesting}
                    >
                      {isTesting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-1" />
                          Test
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {testResult && (
                  <div
                    className={cn(
                      'p-4 rounded-lg',
                      testResult.success
                        ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                        : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {testResult.success ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <X className="w-4 h-4 text-red-600" />
                      )}
                      <span
                        className={cn(
                          'text-sm font-medium',
                          testResult.success ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'
                        )}
                      >
                        {testResult.success ? 'Test Passed' : 'Test Failed'}
                      </span>
                    </div>
                    <pre className="text-xs whitespace-pre-wrap overflow-auto max-h-[150px] text-gray-700 dark:text-gray-300">
                      {testResult.response || testResult.error}
                    </pre>
                  </div>
                )}

                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    Deploy this skill to make it available in the copilot. It will be saved as
                    inactive for review.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700">
          <Button variant="outline" onClick={goPrev} disabled={currentStep === 'describe'}>
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>

          {currentStep === 'describe' && (
            <Button onClick={goNext} disabled={!canProceedFromDescribe}>
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}

          {currentStep === 'capabilities' && (
            <Button onClick={handleGenerate} disabled={!canProceedFromCapabilities || isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Skill
                </>
              )}
            </Button>
          )}

          {currentStep === 'review' && generatedSkill && (
            <Button onClick={goNext}>
              Next: Test
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}

          {currentStep === 'test' && (
            <Button onClick={handleDeploy} disabled={isDeploying}>
              {isDeploying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deploying...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Deploy Skill
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SkillBuilderWizard;
