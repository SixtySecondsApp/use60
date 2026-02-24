import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  getProposalTemplates,
  updateProposalTemplate,
  createProposalTemplate,
  getProposalModelSettings,
  saveProposalModelSettings,
  type ProposalTemplate,
  type ProposalModelSettings
} from '@/lib/services/proposalService';
import { AIProviderService } from '@/lib/services/aiProvider';
import { toast } from 'sonner';
import { Save, Plus, Upload, FileText, Palette, Target, FileCode, Sparkles, Info, Copy, Check, LayoutTemplate } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import TemplateManager from '@/components/proposals/TemplateManager';

// Template type descriptions and guidance
const TEMPLATE_GUIDANCE = {
  goals: {
    title: 'Goals & Objectives Template',
    icon: Target,
    description: 'This template teaches the AI how to structure a Goals & Objectives document extracted from call transcripts.',
    guidance: [
      'Include example categories (Marketing Goals, Operations Goals, Revenue Goals, etc.)',
      'Show how to format bullet points and sub-items',
      'Demonstrate timeline and metric formatting',
      'Include example success metrics and KPIs',
    ],
    placeholder: `# Goals & Objectives

## Client Overview
Brief description of the client's current situation and needs.

## Strategic Goals

### Marketing & Brand Awareness
- **Goal 1**: Increase brand visibility by 40% in Q1
  - Timeline: 3 months
  - Success Metrics: Social media reach, website traffic
- **Goal 2**: Launch content marketing strategy
  - Timeline: Ongoing
  - Success Metrics: Blog engagement, newsletter signups

### Operations & Efficiency
- **Goal 1**: Streamline internal processes
  - Timeline: 6 months
  - Success Metrics: Time saved, cost reduction

### Revenue Growth
- **Goal 1**: Increase MRR by 25%
  - Timeline: 12 months
  - Success Metrics: Monthly recurring revenue

## Immediate Action Items
1. Schedule kickoff meeting
2. Conduct audit of current systems
3. Develop initial roadmap

## Success Metrics Summary
| Goal | Metric | Target | Timeline |
|------|--------|--------|----------|
| Brand Awareness | Social reach | +40% | Q1 |
| Revenue | MRR | +25% | 12 months |`,
  },
  sow: {
    title: 'Statement of Work Template',
    icon: FileText,
    description: 'This template shows the AI how to format a professional Statement of Work in Markdown format.',
    guidance: [
      'Use clear section headers (Introduction, Scope, Deliverables, Timeline, Pricing)',
      'Include example pricing structures and payment terms',
      'Show how to format project phases and milestones',
      'Demonstrate professional legal/terms language',
    ],
    placeholder: `# Statement of Work

## Introduction
This Statement of Work outlines the scope, deliverables, and terms for [Project Name] between [Your Company] and [Client Company].

## Project Objectives
- Primary objective description
- Secondary objectives

## Scope of Work

### Phase 1: Discovery & Planning
**Duration**: 2 weeks
**Deliverables**:
- Requirements documentation
- Project roadmap
- Technical specifications

### Phase 2: Development
**Duration**: 6 weeks
**Deliverables**:
- Core feature implementation
- Integration setup
- Testing and QA

### Phase 3: Launch & Support
**Duration**: 2 weeks
**Deliverables**:
- Production deployment
- Training documentation
- 30-day support

## Timeline
| Phase | Duration | Start | End |
|-------|----------|-------|-----|
| Discovery | 2 weeks | Week 1 | Week 2 |
| Development | 6 weeks | Week 3 | Week 8 |
| Launch | 2 weeks | Week 9 | Week 10 |

## Investment

### Project Fee
- **Total Investment**: $XX,XXX
- **Payment Schedule**:
  - 50% upon signing
  - 25% at Phase 2 completion
  - 25% upon project completion

### Monthly Retainer (Optional)
- **Monthly Fee**: $X,XXX/month
- **Includes**: Ongoing support, updates, maintenance

## Terms & Conditions
- Standard terms apply
- 30-day cancellation notice required`,
  },
  proposal: {
    title: 'HTML Proposal Example',
    icon: FileCode,
    description: 'Paste a complete HTML proposal that showcases your desired styling, animations, and structure.',
    guidance: [
      'Include complete HTML with embedded CSS and JavaScript',
      'Use dark glassmorphic design (or your preferred style)',
      'Include navigation, animations, and interactive elements',
      'Show your company branding and color scheme',
    ],
    placeholder: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Proposal - [Client Name]</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    /* Custom styles */
    body {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      font-family: 'Inter', sans-serif;
    }
    .glass-card {
      background: rgba(30, 41, 59, 0.8);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(148, 163, 184, 0.1);
    }
    .slide {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  </style>
</head>
<body class="text-gray-100">
  <!-- Opening Slide -->
  <section class="slide">
    <div class="glass-card rounded-2xl p-12 max-w-4xl mx-auto text-center">
      <h1 class="text-5xl font-bold mb-4">Your Proposal Title</h1>
      <p class="text-xl text-gray-400">Prepared for [Client Name]</p>
    </div>
  </section>

  <!-- Problem/Opportunity -->
  <section class="slide">
    <div class="glass-card rounded-2xl p-12 max-w-4xl mx-auto">
      <h2 class="text-3xl font-bold mb-6">The Opportunity</h2>
      <p class="text-lg text-gray-300">
        Description of the client's situation and opportunity...
      </p>
    </div>
  </section>

  <!-- Solution -->
  <section class="slide">
    <div class="glass-card rounded-2xl p-12 max-w-4xl mx-auto">
      <h2 class="text-3xl font-bold mb-6">Our Solution</h2>
      <div class="grid grid-cols-2 gap-6">
        <div class="bg-gray-800/50 rounded-xl p-6">
          <h3 class="text-xl font-semibold mb-2">Feature 1</h3>
          <p class="text-gray-400">Description...</p>
        </div>
        <div class="bg-gray-800/50 rounded-xl p-6">
          <h3 class="text-xl font-semibold mb-2">Feature 2</h3>
          <p class="text-gray-400">Description...</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Investment -->
  <section class="slide">
    <div class="glass-card rounded-2xl p-12 max-w-4xl mx-auto">
      <h2 class="text-3xl font-bold mb-6">Investment</h2>
      <div class="text-4xl font-bold text-blue-400">$XX,XXX</div>
      <p class="text-gray-400 mt-4">Payment terms and details...</p>
    </div>
  </section>

  <script>
    // Add any interactivity here
  </script>
</body>
</html>`,
  },
  design_system: {
    title: 'Design System Guidelines',
    icon: Palette,
    description: 'Define your brand colors, typography, component styles, and design principles for proposals.',
    guidance: [
      'Define your color palette (primary, secondary, accent colors)',
      'Specify typography choices (fonts, sizes, weights)',
      'Describe component styles (cards, buttons, navigation)',
      'Include CSS class patterns or design tokens',
    ],
    placeholder: `# Design System Guidelines

## Brand Colors

### Primary Palette
- **Primary Blue**: #3DA8F4 - Main brand color for CTAs and highlights
- **Primary Dark**: #1e40af - Darker shade for hover states
- **Primary Light**: #60a5fa - Lighter shade for backgrounds

### Dark Theme Colors
- **Background**: #030712 (gray-950) - Main background
- **Surface**: #111827 (gray-900) - Card and container backgrounds
- **Border**: rgba(75, 85, 99, 0.5) - Subtle borders

### Text Colors
- **Primary Text**: #f3f4f6 (gray-100) - Main readable text
- **Secondary Text**: #9ca3af (gray-400) - Supporting text
- **Muted Text**: #6b7280 (gray-500) - Less important text

### Status Colors
- **Success**: #10B981 (emerald-500)
- **Warning**: #F59E0B (amber-500)
- **Error**: #EF4444 (red-500)
- **Info**: #3B82F6 (blue-500)

## Typography

### Font Family
- **Primary**: Inter, system-ui, sans-serif
- **Monospace**: 'JetBrains Mono', monospace

### Font Sizes
- **Display**: 3rem (48px) - Hero headlines
- **H1**: 2.25rem (36px) - Main titles
- **H2**: 1.5rem (24px) - Section headers
- **H3**: 1.25rem (20px) - Sub-sections
- **Body**: 1rem (16px) - Main content
- **Small**: 0.875rem (14px) - Supporting text

## Component Styles

### Glassmorphic Cards
\`\`\`css
.glass-card {
  background: rgba(17, 24, 39, 0.8);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(75, 85, 99, 0.3);
  border-radius: 1rem;
}
\`\`\`

### Buttons
- Primary: Blue background, white text, rounded-lg
- Secondary: Transparent with border, light text
- Ghost: No background, hover shows subtle fill

### Animations
- Transitions: 200ms ease-out default
- Hover effects: Scale 1.02, subtle shadow
- Page transitions: Fade in with slide up

## Layout Principles
- Mobile-first responsive design
- Max content width: 1280px
- Consistent spacing: 4px base unit (p-4 = 16px)
- Card padding: 1.5rem (24px) minimum`,
  },
};

export default function ProposalSettings() {
  const [templates, setTemplates] = useState<ProposalTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<ProposalTemplate | null>(null);
  const [modelSettings, setModelSettings] = useState<ProposalModelSettings>({
    sow_model: 'anthropic/claude-3-5-sonnet-20241022',
    proposal_model: 'anthropic/claude-3-5-sonnet-20241022',
    focus_model: 'anthropic/claude-haiku-4.5',
    goals_model: 'anthropic/claude-3-5-sonnet-20241022',
  });
  const [availableModels, setAvailableModels] = useState<Array<{ value: string; label: string }>>([]);
  const [savingModels, setSavingModels] = useState(false);
  const [copiedStarter, setCopiedStarter] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadTemplates();
    loadModelSettings();
    loadAvailableModels();
  }, []);

  const loadModelSettings = async () => {
    try {
      const settings = await getProposalModelSettings();
      setModelSettings(settings);
    } catch (error) {
      toast.error('Failed to load model settings');
    }
  };

  const loadAvailableModels = async () => {
    try {
      const aiService = AIProviderService.getInstance();
      const models = await aiService.fetchOpenRouterModels(true);
      setAvailableModels(models);
    } catch (error) {
      toast.error('Failed to load available models');
      setAvailableModels([
        { value: 'anthropic/claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
        { value: 'anthropic/claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
        { value: 'anthropic/claude-3-opus-20240229', label: 'Claude 3 Opus' },
        { value: 'openai/gpt-4o', label: 'GPT-4o' },
        { value: 'openai/gpt-4-turbo', label: 'GPT-4 Turbo' },
      ]);
    }
  };

  const handleSaveModelSettings = async () => {
    setSavingModels(true);
    try {
      const success = await saveProposalModelSettings(modelSettings);
      if (success) {
        toast.success('Model settings saved');
      } else {
        toast.error('Failed to save model settings');
      }
    } catch (error) {
      toast.error('Error saving model settings');
    } finally {
      setSavingModels(false);
    }
  };

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const data = await getProposalTemplates();
      setTemplates(data);
    } catch (error) {
      toast.error('Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (template: ProposalTemplate) => {
    setSaving(template.id);
    try {
      const success = await updateProposalTemplate(template.id, {
        name: template.name,
        content: template.content,
        is_default: template.is_default,
      });

      if (success) {
        toast.success('Template saved - AI will now use this as reference');
        await loadTemplates();
        setEditingTemplate(null);
      } else {
        toast.error('Failed to save template');
      }
    } catch (error) {
      toast.error('Error saving template');
    } finally {
      setSaving(null);
    }
  };

  const handleCreateNew = async (type: 'goals' | 'sow' | 'proposal' | 'design_system') => {
    const guidance = TEMPLATE_GUIDANCE[type];
    const newTemplate: Omit<ProposalTemplate, 'id' | 'created_at' | 'updated_at' | 'user_id'> = {
      name: `Custom ${guidance.title}`,
      type,
      content: guidance.placeholder,
      is_default: false,
    };

    const created = await createProposalTemplate(newTemplate);
    if (created) {
      toast.success('Template created with example content');
      await loadTemplates();
      setEditingTemplate(created);
    } else {
      toast.error('Failed to create template');
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, templateId: string) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const template = templates.find(t => t.id === templateId);
      if (template) {
        setEditingTemplate({ ...template, content });
        toast.success(`Imported ${file.name} - click Save to apply`);
      }
    } catch (error) {
      toast.error('Failed to read file');
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUseStarter = (type: 'goals' | 'sow' | 'proposal' | 'design_system', templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    const guidance = TEMPLATE_GUIDANCE[type];
    if (template && guidance) {
      setEditingTemplate({ ...template, content: guidance.placeholder });
      toast.success('Starter template loaded - customize and save');
    }
  };

  const copyStarterToClipboard = async (type: 'goals' | 'sow' | 'proposal' | 'design_system') => {
    const guidance = TEMPLATE_GUIDANCE[type];
    await navigator.clipboard.writeText(guidance.placeholder);
    setCopiedStarter(type);
    setTimeout(() => setCopiedStarter(null), 2000);
    toast.success('Starter template copied to clipboard');
  };

  const groupedTemplates = {
    goals: templates.filter(t => t.type === 'goals'),
    sow: templates.filter(t => t.type === 'sow'),
    proposal: templates.filter(t => t.type === 'proposal'),
    design_system: templates.filter(t => t.type === 'design_system'),
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">Loading templates...</p>
        </div>
      </div>
    );
  }

  const renderTemplateTab = (type: 'goals' | 'sow' | 'proposal' | 'design_system') => {
    const guidance = TEMPLATE_GUIDANCE[type];
    const Icon = guidance.icon;
    const templatesOfType = groupedTemplates[type];

    return (
      <TabsContent key={type} value={type} className="space-y-6">
        {/* Guidance Card */}
        <Card className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-500/10 dark:to-purple-500/10 border-blue-200 dark:border-blue-500/20">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-500/20">
                <Icon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-lg">{guidance.title}</CardTitle>
                <CardDescription className="mt-1">{guidance.description}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-start gap-2 text-sm">
                <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-gray-800 dark:text-gray-200 mb-2">What to include:</p>
                  <ul className="space-y-1 text-gray-600 dark:text-gray-400">
                    {guidance.guidance.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-blue-600 dark:text-blue-400">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyStarterToClipboard(type)}
                  className="text-xs"
                >
                  {copiedStarter === type ? (
                    <><Check className="w-3 h-3 mr-1" /> Copied!</>
                  ) : (
                    <><Copy className="w-3 h-3 mr-1" /> Copy Starter Template</>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Templates List */}
        {templatesOfType.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Icon className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                No {type.replace('_', ' ')} templates found.
              </p>
              <Button onClick={() => handleCreateNew(type)} variant="default">
                <Sparkles className="w-4 h-4 mr-2" />
                Create {guidance.title}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex justify-end">
              <Button onClick={() => handleCreateNew(type)} variant="outline" size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Another Template
              </Button>
            </div>
            {templatesOfType.map((template) => (
              <Card key={template.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg flex items-center gap-2">
                        {editingTemplate?.id === template.id ? (
                          <Input
                            value={editingTemplate.name}
                            onChange={(e) =>
                              setEditingTemplate({ ...editingTemplate, name: e.target.value })
                            }
                            className="max-w-md"
                          />
                        ) : (
                          <>
                            <Icon className="w-4 h-4 text-gray-400" />
                            {template.name}
                          </>
                        )}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {template.is_default && (
                          <span className="inline-block px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs font-semibold mr-2">
                            Active
                          </span>
                        )}
                        {template.content.length > 100
                          ? `${template.content.length.toLocaleString()} characters`
                          : 'Needs content'}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      {editingTemplate?.id === template.id ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleSave(editingTemplate)}
                            disabled={saving === template.id}
                          >
                            <Save className="w-4 h-4 mr-2" />
                            {saving === template.id ? 'Saving...' : 'Save'}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setEditingTemplate(null)}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setEditingTemplate(template)}
                        >
                          Edit
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {editingTemplate?.id === template.id ? (
                    <div className="space-y-4">
                      {/* Action buttons */}
                      <div className="flex flex-wrap gap-2 pb-3 border-b border-gray-200 dark:border-gray-800">
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={(e) => handleFileUpload(e, template.id)}
                          accept={type === 'proposal' ? '.html,.htm' : '.md,.txt'}
                          className="hidden"
                          id={`file-upload-${template.id}`}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => document.getElementById(`file-upload-${template.id}`)?.click()}
                        >
                          <Upload className="w-3 h-3 mr-2" />
                          Import from File
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleUseStarter(type, template.id)}
                        >
                          <Sparkles className="w-3 h-3 mr-2" />
                          Use Starter Template
                        </Button>
                      </div>

                      <div>
                        <Label htmlFor={`content-${template.id}`}>Content</Label>
                        <Textarea
                          id={`content-${template.id}`}
                          value={editingTemplate.content}
                          onChange={(e) =>
                            setEditingTemplate({ ...editingTemplate, content: e.target.value })
                          }
                          rows={25}
                          className="font-mono text-sm mt-2"
                          placeholder={guidance.placeholder}
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                          {type === 'proposal'
                            ? 'Paste a complete HTML proposal. The AI will learn from its structure, styling, and content organization.'
                            : type === 'design_system'
                            ? 'Define your brand colors, fonts, and component styles. The AI will apply these to generated proposals.'
                            : 'Provide an example document. The AI will match its structure and tone when generating new content.'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 pt-2">
                        <input
                          type="checkbox"
                          id={`default-${template.id}`}
                          checked={editingTemplate.is_default}
                          onChange={(e) =>
                            setEditingTemplate({
                              ...editingTemplate,
                              is_default: e.target.checked,
                            })
                          }
                          className="rounded"
                        />
                        <Label htmlFor={`default-${template.id}`} className="cursor-pointer">
                          Set as active template (AI will use this for generation)
                        </Label>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {template.content.length < 100 ? (
                        <div className="text-center py-8">
                          <p className="text-sm text-amber-500 dark:text-amber-400 mb-3">
                            ⚠️ This template needs content. Click Edit to add your example.
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingTemplate(template)}
                          >
                            Add Content
                          </Button>
                        </div>
                      ) : (
                        <>
                          <pre className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 overflow-x-auto text-sm font-mono whitespace-pre-wrap max-h-64 overflow-y-auto">
                            {template.content.substring(0, 1000)}
                            {template.content.length > 1000 && '...'}
                          </pre>
                          {template.content.length > 1000 && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Showing first 1000 of {template.content.length.toLocaleString()} characters
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </TabsContent>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Proposal Training</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Train the AI to generate proposals that match your brand, style, and preferences
          </p>
        </div>
      </div>

      {/* Quick Start Guide */}
      <Card className="bg-gradient-to-r from-emerald-50 to-blue-50 dark:from-emerald-500/10 dark:to-blue-500/10 border-emerald-200 dark:border-emerald-500/20">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-gray-800 dark:text-gray-200 mb-1">How it works</p>
              <p className="text-gray-600 dark:text-gray-400">
                Add example documents and design guidelines below. The AI will learn from these examples
                to generate proposals that match your style, branding, and structure preferences.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="design_system" className="space-y-6">
        <TabsList className="bg-white border border-transparent shadow-sm dark:bg-gray-900/50 dark:backdrop-blur-xl dark:border-gray-800/50">
          <TabsTrigger value="models">AI Models</TabsTrigger>
          <TabsTrigger value="structured_templates" className="flex items-center gap-1">
            <LayoutTemplate className="w-3 h-3" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="design_system" className="flex items-center gap-1">
            <Palette className="w-3 h-3" />
            Design System
          </TabsTrigger>
          <TabsTrigger value="proposal" className="flex items-center gap-1">
            <FileCode className="w-3 h-3" />
            HTML Example
          </TabsTrigger>
          <TabsTrigger value="goals" className="flex items-center gap-1">
            <Target className="w-3 h-3" />
            Goals
          </TabsTrigger>
          <TabsTrigger value="sow" className="flex items-center gap-1">
            <FileText className="w-3 h-3" />
            SOW
          </TabsTrigger>
        </TabsList>

        <TabsContent value="models" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>OpenRouter Model Selection</CardTitle>
              <CardDescription>
                Choose which AI models to use for each proposal generation step.
                <br />
                <span className="text-xs text-muted-foreground mt-1 block">
                  💡 Tip: Add your personal OpenRouter API key in <strong>Settings → AI Provider Settings</strong> to increase rate limits.
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="focus_model">Focus Area Analysis Model</Label>
                <Select
                  value={modelSettings.focus_model}
                  onValueChange={(value) =>
                    setModelSettings({ ...modelSettings, focus_model: value })
                  }
                >
                  <SelectTrigger id="focus_model">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModels.map((model) => (
                      <SelectItem key={model.value} value={model.value}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Used for analyzing meeting transcripts to extract focus areas. Recommended: Fast, cost-effective models like Claude Haiku.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="goals_model">Goals Generation Model</Label>
                <Select
                  value={modelSettings.goals_model}
                  onValueChange={(value) =>
                    setModelSettings({ ...modelSettings, goals_model: value })
                  }
                >
                  <SelectTrigger id="goals_model">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModels.map((model) => (
                      <SelectItem key={model.value} value={model.value}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Used for generating goals and objectives documents. Recommended: Claude Sonnet or GPT-4.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sow_model">SOW Generation Model</Label>
                <Select
                  value={modelSettings.sow_model}
                  onValueChange={(value) =>
                    setModelSettings({ ...modelSettings, sow_model: value })
                  }
                >
                  <SelectTrigger id="sow_model">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModels.map((model) => (
                      <SelectItem key={model.value} value={model.value}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Used for generating Statement of Work documents. Recommended: Claude Sonnet or GPT-4.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="proposal_model">Proposal Generation Model</Label>
                <Select
                  value={modelSettings.proposal_model}
                  onValueChange={(value) =>
                    setModelSettings({ ...modelSettings, proposal_model: value })
                  }
                >
                  <SelectTrigger id="proposal_model">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModels.map((model) => (
                      <SelectItem key={model.value} value={model.value}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Used for generating HTML proposal presentations. Recommended: Claude Sonnet or GPT-4 Turbo for long context.
                </p>
              </div>

              <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-800">
                <Button
                  onClick={handleSaveModelSettings}
                  disabled={savingModels}
                  variant="default"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {savingModels ? 'Saving...' : 'Save Model Settings'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="structured_templates">
          <TemplateManager />
        </TabsContent>

        {renderTemplateTab('design_system')}
        {renderTemplateTab('proposal')}
        {renderTemplateTab('goals')}
        {renderTemplateTab('sow')}
      </Tabs>
    </div>
  );
}
