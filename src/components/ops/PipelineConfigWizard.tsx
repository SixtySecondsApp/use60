import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Filter,
  Settings,
  Eye,
  ChevronDown,
  ChevronUp,
  Database,
  Users,
  Calendar,
  Code,
  LayoutList,
  Trash2,
  Plus,
  Mail,
  Zap,
  Clock,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { useOrg } from '@/lib/contexts/OrgContext';
import { supabase } from '@/lib/supabase/clientV2';
import { useInstantlyIntegration } from '@/lib/hooks/useInstantlyIntegration';
import { useHubSpotIntegration } from '@/lib/hooks/useHubSpotIntegration';
import { useAttioIntegration } from '@/lib/hooks/useAttioIntegration';
import type { PipelineTemplate, PipelineColumnDef } from '@/lib/config/pipelineTemplates';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PipelineConfigWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: PipelineTemplate;
  onComplete?: (tableId: string) => void;
}

interface Filters {
  dateRange: '30' | '60' | '90' | 'all';
  sentiment: 'all' | 'positive' | 'neutral' | 'negative';
  search: string;
  useSampleData: boolean;
}

interface EmailStepConfig {
  signOff: string;
  exampleMessage: string;
  useSpintax: boolean;
}

// Detect if a pipeline step is an email/message writing step
function isEmailStep(stepTitle: string, actionKey: string): boolean {
  const t = stepTitle.toLowerCase();
  const k = actionKey.toLowerCase();
  return t.includes('email') || t.includes('message') || t.includes('draft') || t.includes('follow-up')
    || k.includes('email') || k.includes('message') || k.includes('followup');
}

const SPINTAX_INSTRUCTION = `\n\nIMPORTANT: Use spintax throughout the email for A/B variation. Wrap alternatives in curly braces separated by pipes. Examples:
- {Hi|Hey|Hello} {{first_name}}
- {I wanted to|Thought I'd|Just wanted to} reach out
- {Let me know|Drop me a line|Happy to chat} if {that sounds interesting|you'd like to explore this|you're open to it}
Use spintax for greetings, transitions, CTAs, and closing lines. Aim for 4-6 spintax blocks per email.`;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

function getWizardSteps(hasSendStep: boolean) {
  if (hasSendStep) {
    return [
      { id: 1, label: 'Data' },
      { id: 2, label: 'Configure' },
      { id: 3, label: 'Send' },
      { id: 4, label: 'Review' },
    ] as const;
  }
  return [
    { id: 1, label: 'Data' },
    { id: 2, label: 'Configure' },
    { id: 3, label: 'Review' },
  ] as const;
}

const DATE_RANGE_OPTIONS = [
  { value: '30', label: 'Last 30 days' },
  { value: '60', label: 'Last 60 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
] as const;

const SENTIMENT_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'positive', label: 'Positive' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'negative', label: 'Negative' },
] as const;

const SOURCE_ICONS: Record<string, React.ComponentType<any>> = {
  meetings: Calendar,
  contacts: Users,
  deals: Database,
};

// Parse "- field_name (type) — description" lines from system prompts
interface OutputField {
  name: string;
  type: string;
  description: string;
}

function parseOutputFields(systemPrompt: string): OutputField[] {
  const fields: OutputField[] = [];
  const lines = systemPrompt.split('\n');
  for (const line of lines) {
    // Match: - field_name (type) — description  OR  - field_name (type) - description
    const match = line.match(/^-\s+(\w+)\s+\(([^)]+)\)\s*[—-]\s*(.+)$/);
    if (match) {
      fields.push({ name: match[1], type: match[2].trim(), description: match[3].trim() });
    }
  }
  return fields;
}

// Rebuild a system prompt from the instruction preamble + edited fields
function rebuildPrompt(original: string, fields: OutputField[]): string {
  const lines = original.split('\n');
  // Find where the field list starts (first line matching "- field (type) —")
  const firstFieldIdx = lines.findIndex(l => /^-\s+\w+\s+\([^)]+\)\s*[—-]/.test(l));
  if (firstFieldIdx === -1) return original;
  // Find where field list ends (first non-field, non-empty line after fields)
  let lastFieldIdx = firstFieldIdx;
  for (let i = firstFieldIdx; i < lines.length; i++) {
    if (/^-\s+\w+\s+\([^)]+\)\s*[—-]/.test(lines[i])) lastFieldIdx = i;
    else if (lines[i].trim() !== '') break;
  }
  const before = lines.slice(0, firstFieldIdx);
  const after = lines.slice(lastFieldIdx + 1);
  const fieldLines = fields.map(f => `- ${f.name} (${f.type}) — ${f.description}`);
  return [...before, ...fieldLines, ...after].join('\n');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PipelineConfigWizard({ open, onOpenChange, template, onComplete }: PipelineConfigWizardProps) {
  const { activeOrg } = useOrg();

  const [step, setStep] = useState(1);
  const [creating, setCreating] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    dateRange: '90',
    sentiment: 'all',
    search: '',
    useSampleData: false,
  });
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [promptViewSteps, setPromptViewSteps] = useState<Set<number>>(new Set());
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);

  // Step enabled/disabled — all enabled by default
  const [disabledSteps, setDisabledSteps] = useState<Set<number>>(new Set());

  // Multi-email sequence state
  const [emailStageCount, setEmailStageCount] = useState(1);
  const [stageDelays, setStageDelays] = useState([0, 2, 3]);
  const [followUpConfigs, setFollowUpConfigs] = useState<Record<number, EmailStepConfig>>({});

  // Send integration state
  const { isConnected: instantlyConnected } = useInstantlyIntegration();
  const { isConnected: hubspotConnected, hasSequenceScopes, getSequences, connectHubSpot } = useHubSpotIntegration();
  const { isConnected: attioConnected } = useAttioIntegration();

  type SendProvider = 'instantly' | 'hubspot' | 'attio' | null;
  const [sendProvider, setSendProvider] = useState<SendProvider>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [createNewCampaign, setCreateNewCampaign] = useState(true);
  const [newCampaignName, setNewCampaignName] = useState(template.name);
  const [instantlyCampaigns, setInstantlyCampaigns] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);

  // HubSpot Sequences state
  const [selectedSequenceId, setSelectedSequenceId] = useState<string | null>(null);
  const [hubspotSequences, setHubspotSequences] = useState<Array<{ id: string; name: string; stepsCount: number }>>([]);
  const [loadingSequences, setLoadingSequences] = useState(false);
  const [hubspotSenderEmail, setHubspotSenderEmail] = useState('');

  const hasEmailStep = !!template.instantlyConfig?.supported;
  const anySendConnected = instantlyConnected || hubspotConnected || attioConnected;
  const showSendStep = hasEmailStep && anySendConnected;
  const wizardSteps = getWizardSteps(showSendStep);
  const maxStep = wizardSteps.length;
  const isReviewStep = step === maxStep;
  const isSendStep = showSendStep && step === 3;

  // Email-specific config per step index
  const [emailConfigs, setEmailConfigs] = useState<Record<number, EmailStepConfig>>(() => {
    const initial: Record<number, EmailStepConfig> = {};
    template.steps.forEach((pipeStep, idx) => {
      if (isEmailStep(pipeStep.title, pipeStep.action_column_key)) {
        initial[idx] = { signOff: '', exampleMessage: '', useSpintax: false };
      }
    });
    return initial;
  });

  // Editable fields per step — parsed from system prompts, keyed by step index
  const [editedFields, setEditedFields] = useState<Record<number, OutputField[]>>(() => {
    const initial: Record<number, OutputField[]> = {};
    template.steps.forEach((pipeStep, idx) => {
      const actionCol = template.columns.find(c => c.key === pipeStep.action_column_key);
      const prompt = actionCol?.action_config?.actions?.[0]?.config;
      if (prompt?.system_prompt) {
        initial[idx] = parseOutputFields(prompt.system_prompt);
      }
    });
    return initial;
  });

  // Editable system prompts (raw text) per step
  const [editedPrompts, setEditedPrompts] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    template.steps.forEach((pipeStep, idx) => {
      const actionCol = template.columns.find(c => c.key === pipeStep.action_column_key);
      const prompt = actionCol?.action_config?.actions?.[0]?.config;
      if (prompt?.system_prompt) {
        initial[idx] = prompt.system_prompt;
      }
    });
    return initial;
  });

  const togglePromptView = (idx: number) => {
    setPromptViewSteps(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        // Switching back to fields view — re-parse fields from edited prompt
        const prompt = editedPrompts[idx];
        if (prompt) {
          setEditedFields(ef => ({ ...ef, [idx]: parseOutputFields(prompt) }));
        }
        next.delete(idx);
      } else {
        // Switching to prompt view — rebuild prompt from edited fields
        const fields = editedFields[idx];
        const originalPrompt = editedPrompts[idx];
        if (fields && originalPrompt) {
          setEditedPrompts(ep => ({ ...ep, [idx]: rebuildPrompt(originalPrompt, fields) }));
        }
        next.add(idx);
      }
      return next;
    });
  };

  const updateField = useCallback((stepIdx: number, fieldIdx: number, key: keyof OutputField, value: string) => {
    setEditedFields(prev => {
      const fields = [...(prev[stepIdx] || [])];
      fields[fieldIdx] = { ...fields[fieldIdx], [key]: value };
      return { ...prev, [stepIdx]: fields };
    });
  }, []);

  const removeField = useCallback((stepIdx: number, fieldIdx: number) => {
    setEditedFields(prev => {
      const fields = [...(prev[stepIdx] || [])];
      fields.splice(fieldIdx, 1);
      return { ...prev, [stepIdx]: fields };
    });
  }, []);

  const addField = useCallback((stepIdx: number) => {
    setEditedFields(prev => {
      const fields = [...(prev[stepIdx] || [])];
      fields.push({ name: 'new_field', type: 'string', description: 'Description...' });
      return { ...prev, [stepIdx]: fields };
    });
  }, []);

  // Fetch preview count when filters change on step 1
  const fetchPreviewCount = async () => {
    if (!activeOrg?.id || filters.useSampleData) {
      setPreviewCount(template.dataSource.synthetic_rows?.length ?? 0);
      return;
    }
    setCountLoading(true);
    try {
      const dsType = template.dataSource.type;
      let query;
      if (dsType === 'meetings') {
        query = supabase.from('meetings').select('id', { count: 'exact', head: true })
          .eq('org_id', activeOrg.id)
          .not('transcript_text', 'is', null);
        if (filters.dateRange !== 'all') {
          const daysAgo = new Date();
          daysAgo.setDate(daysAgo.getDate() - parseInt(filters.dateRange));
          query = query.gte('meeting_start', daysAgo.toISOString());
        }
        if (filters.sentiment !== 'all') {
          if (filters.sentiment === 'positive') query = query.gte('sentiment_score', 0.6);
          else if (filters.sentiment === 'negative') query = query.lte('sentiment_score', -0.3);
          else query = query.gt('sentiment_score', -0.3).lt('sentiment_score', 0.6);
        }
      } else if (dsType === 'contacts') {
        query = supabase.from('contacts').select('id', { count: 'exact', head: true })
          .eq('owner_id', (await supabase.auth.getUser()).data.user?.id ?? '');
        if (filters.search) {
          query = query.or(`first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,company.ilike.%${filters.search}%`);
        }
      } else {
        query = supabase.from('deals').select('id', { count: 'exact', head: true })
          .eq('owner_id', (await supabase.auth.getUser()).data.user?.id ?? '');
      }
      const { count } = await query!;
      const rawCount = count ?? 0;
      const limit = template.dataSource.limit ?? 500;
      setPreviewCount(Math.min(rawCount, limit));
    } catch {
      setPreviewCount(null);
    } finally {
      setCountLoading(false);
    }
  };

  const fetchInstantlyCampaigns = async () => {
    if (!activeOrg?.id) return;
    setLoadingCampaigns(true);
    try {
      const { data, error } = await supabase.functions.invoke('instantly-admin', {
        body: { action: 'list_campaigns', org_id: activeOrg.id },
      });
      if (!error && data?.campaigns) {
        setInstantlyCampaigns(data.campaigns.map((c: any) => ({ id: c.id, name: c.name })));
      }
    } catch { /* ignore */ }
    finally { setLoadingCampaigns(false); }
  };

  const fetchHubspotSequences = async () => {
    setLoadingSequences(true);
    try {
      const sequences = await getSequences();
      setHubspotSequences(sequences.map(s => ({ id: s.id, name: s.name, stepsCount: s.stepsCount })));
    } catch { /* ignore — scope error handled in UI */ }
    finally { setLoadingSequences(false); }
  };

  // Fetch count on step 1 mount
  React.useEffect(() => {
    if (step === 1 && open) fetchPreviewCount();
  }, [step, open, filters.dateRange, filters.sentiment, filters.search, filters.useSampleData]);

  const toggleStepExpand = (idx: number) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!activeOrg?.id) {
      toast.error('No active organisation');
      return;
    }
    setCreating(true);
    try {
      // Build final template config with any edited prompts
      const finalConfig = structuredClone(template);

      // Remove disabled steps — filter columns and steps
      const disabledKeys = new Set<string>();
      template.steps.forEach((pipeStep, idx) => {
        if (disabledSteps.has(idx)) {
          disabledKeys.add(pipeStep.action_column_key);
          // Also find the output column for this step
          const actionCol = template.columns.find(c => c.key === pipeStep.action_column_key);
          const outputKey = actionCol?.action_config?.actions?.[0]?.config?.output_column_key;
          if (outputKey) disabledKeys.add(outputKey);
        }
      });
      if (disabledKeys.size > 0) {
        finalConfig.steps = finalConfig.steps.filter(s => !disabledKeys.has(s.action_column_key));
        finalConfig.columns = finalConfig.columns.filter(c => !disabledKeys.has(c.key));
      }

      // Apply prompt edits and email configs
      template.steps.forEach((pipeStep, idx) => {
        if (disabledSteps.has(idx)) return;
        const actionCol = finalConfig.columns.find(c => c.key === pipeStep.action_column_key);
        const actionCfg = actionCol?.action_config?.actions?.[0]?.config;
        if (actionCfg) {
          // Apply either the raw prompt edits or rebuild from field edits
          if (promptViewSteps.has(idx)) {
            actionCfg.system_prompt = editedPrompts[idx] ?? actionCfg.system_prompt;
          } else {
            const fields = editedFields[idx];
            if (fields && editedPrompts[idx]) {
              actionCfg.system_prompt = rebuildPrompt(editedPrompts[idx], fields);
            }
          }

          // Apply email-specific config
          const emailCfg = emailConfigs[idx];
          if (emailCfg) {
            let prompt = actionCfg.system_prompt;
            if (emailCfg.signOff) {
              prompt += `\n\nSign off the email with: ${emailCfg.signOff}`;
            }
            if (emailCfg.exampleMessage) {
              prompt += `\n\nUse this example as a reference for tone, structure, and length:\n\n---\n${emailCfg.exampleMessage}\n---`;
            }
            if (emailCfg.useSpintax) {
              prompt += SPINTAX_INSTRUCTION;
            }
            actionCfg.system_prompt = prompt;
          }
        }
      });

      // ── Generate follow-up email columns for multi-email sequences ──
      if (hasEmailStep && emailStageCount > 1) {
        const emailStep = template.steps[template.instantlyConfig!.emailStepIndex];
        const emailActionCol = finalConfig.columns.find(c => c.key === emailStep.action_column_key);
        const basePromptConfig = emailActionCol?.action_config?.actions?.[0]?.config;
        let maxPosition = Math.max(...finalConfig.columns.map(c => c.position));

        for (let n = 2; n <= emailStageCount; n++) {
          const prevN = n - 1;
          maxPosition++;

          // Follow-up action button
          const followUpSystemPrompt = `You are an AI email writer. Write follow-up email #${n} in the sequence. This is a follow-up to a previous email that was already sent. Be shorter and more casual than the first email. Reference the previous email without repeating it.

Return ONLY a JSON object with:
- subject (string) — follow-up subject line, under 60 chars. Can use "Re: " prefix or be a fresh angle
- body (string) — follow-up email body, plain text, under 100 words, reference the previous email naturally`;

          const followUpUserTemplate = `Write follow-up email #${n} to {{first_name}} at {{company}}.

Previous email subject: {{email_${prevN}_subject}}
Previous email body: {{email_${prevN}_body}}`;

          // Apply follow-up specific config
          let finalFollowUpPrompt = followUpSystemPrompt;
          const fuCfg = followUpConfigs[n];
          if (fuCfg) {
            if (fuCfg.signOff) finalFollowUpPrompt += `\n\nSign off the email with: ${fuCfg.signOff}`;
            if (fuCfg.exampleMessage) finalFollowUpPrompt += `\n\nUse this example as a reference for tone, structure, and length:\n\n---\n${fuCfg.exampleMessage}\n---`;
            if (fuCfg.useSpintax) finalFollowUpPrompt += SPINTAX_INSTRUCTION;
          }

          const followUpBtnCol: PipelineColumnDef = {
            key: `email_${n}_btn`,
            label: `Email ${n}`,
            column_type: 'action',
            position: maxPosition,
            action_config: {
              label: `Write Email ${n}`,
              color: '#f59e0b',
              actions: [{
                type: 'run_prompt',
                config: {
                  system_prompt: finalFollowUpPrompt,
                  user_message_template: followUpUserTemplate,
                  model: basePromptConfig?.model || 'claude-sonnet-4-5-20250929',
                  provider: basePromptConfig?.provider || 'anthropic',
                  temperature: 0.7,
                  max_tokens: 1024,
                  output_column_key: `email_${n}_output`,
                },
              }],
              condition: { column_key: `email_${prevN}_output`, operator: 'is_not_empty' },
            },
          };

          maxPosition++;
          const outputCol: PipelineColumnDef = {
            key: `email_${n}_output`, label: `Email ${n} (JSON)`, column_type: 'text', position: maxPosition,
          };

          maxPosition++;
          const subjectCol: PipelineColumnDef = {
            key: `email_${n}_subject`, label: `Email ${n} Subject`, column_type: 'formula', position: maxPosition,
            formula_expression: `JSON_GET(@email_${n}_output, "subject")`,
            integration_config: { instantly_subtype: 'sequence_step', step_config: { step_number: n, field: 'subject' } },
          };

          maxPosition++;
          const bodyCol: PipelineColumnDef = {
            key: `email_${n}_body`, label: `Email ${n} Body`, column_type: 'formula', position: maxPosition,
            formula_expression: `JSON_GET(@email_${n}_output, "body")`,
            integration_config: { instantly_subtype: 'sequence_step', step_config: { step_number: n, field: 'body' } },
          };

          finalConfig.columns.push(followUpBtnCol, outputCol, subjectCol, bodyCol);

          // Add corresponding step
          finalConfig.steps.push({
            title: `Follow-up ${n}`,
            description: `Writes follow-up email #${n}, sent ${stageDelays[n - 1]} days after email ${prevN}.`,
            icon: 'Mail',
            color: 'amber',
            action_column_key: `email_${n}_btn`,
          });
        }
      }

      const body: Record<string, unknown> = {
        org_id: activeOrg.id,
        template_key: template.key,
        template_config: finalConfig,
      };

      // Build filters for edge function
      if (!filters.useSampleData) {
        const ef: Record<string, unknown> = {};
        if (template.dataSource.type === 'meetings') {
          if (filters.dateRange !== 'all') {
            const daysAgo = new Date();
            daysAgo.setDate(daysAgo.getDate() - parseInt(filters.dateRange));
            ef.date_from = daysAgo.toISOString();
          }
          if (filters.sentiment !== 'all') ef.sentiment = filters.sentiment;
        }
        if (filters.search) ef.search = filters.search;
        if (Object.keys(ef).length > 0) body.filters = ef;
      } else {
        body.use_synthetic = true;
      }

      // Instantly integration config
      if (sendProvider === 'instantly') {
        body.instantly_config = {
          enabled: true,
          create_new: createNewCampaign,
          campaign_id: selectedCampaignId,
          campaign_name: newCampaignName || template.name,
          field_mapping: { email: 'email', first_name: 'first_name', last_name: 'last_name', company_name: 'company' },
          steps: Array.from({ length: emailStageCount }, (_, i) => ({
            step_number: i + 1,
            delay: stageDelays[i],
          })),
        };
      }

      // HubSpot Sequences config
      if (sendProvider === 'hubspot' && selectedSequenceId) {
        body.hubspot_sequence_config = {
          enabled: true,
          sequence_id: selectedSequenceId,
          sender_email: hubspotSenderEmail,
        };
      }

      const { data, error } = await supabase.functions.invoke('setup-pipeline-template', { body });

      if (error) {
        let msg = error?.message || 'Edge function error';
        try {
          const b = await (error as any)?.context?.json?.();
          if (b?.error) msg = b.error + (b.detail ? ` (${b.detail})` : '');
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error + (data.detail ? ` (${data.detail})` : ''));
      if (!data?.table_id) throw new Error('No table ID returned');

      const suffix = data.used_synthetic ? ' (sample data)' : '';
      toast.success(`${template.name} created${suffix}`);
      onOpenChange(false);
      onComplete?.(data.table_id);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create pipeline');
    } finally {
      setCreating(false);
    }
  };

  const SourceIcon = SOURCE_ICONS[template.dataSource.type] || Database;
  const sourceLabel = template.dataSource.type === 'meetings' ? 'meetings with transcripts'
    : template.dataSource.type === 'contacts' ? 'contacts'
    : 'deals';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] flex flex-col p-0 bg-zinc-950 border-zinc-800">
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle className="text-base font-semibold text-zinc-100">
            {template.name}
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-500">
            {template.description}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-zinc-800/60">
          {wizardSteps.map((s, i) => (
            <React.Fragment key={s.id}>
              {i > 0 && <div className="flex-1 h-px bg-zinc-800" />}
              <div className="flex items-center gap-1.5">
                {s.id < step ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                ) : (
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                    s.id === step ? 'border-violet-500 text-violet-400 bg-violet-500/10' : 'border-zinc-700 text-zinc-600'
                  }`}>
                    {s.id}
                  </div>
                )}
                <span className={`text-xs font-medium ${s.id === step ? 'text-zinc-200' : s.id < step ? 'text-emerald-400' : 'text-zinc-600'}`}>
                  {s.label}
                </span>
              </div>
            </React.Fragment>
          ))}
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
          {/* ── Step 1: Choose & Filter Data ── */}
          {step === 1 && (
            <>
              <div className="flex items-center gap-2 text-sm text-zinc-300">
                <SourceIcon className="w-4 h-4 text-zinc-500" />
                <span>Data source: <strong className="text-zinc-100">{template.dataSource.type}</strong></span>
              </div>

              {/* Preview count */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm">
                {countLoading ? (
                  <span className="flex items-center gap-2 text-zinc-500">
                    <Loader2 className="w-3 h-3 animate-spin" /> Counting...
                  </span>
                ) : previewCount !== null ? (
                  <span className="text-zinc-300">
                    Found <strong className="text-violet-400">{previewCount}</strong> {sourceLabel}
                    {previewCount === 0 && !filters.useSampleData && (
                      <span className="text-zinc-500"> — try sample data below</span>
                    )}
                  </span>
                ) : (
                  <span className="text-zinc-500">Unable to count records</span>
                )}
              </div>

              {/* Filters */}
              {template.dataSource.type === 'meetings' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
                    <Filter className="w-3 h-3" /> Filters
                  </div>

                  {/* Date range */}
                  <div>
                    <label className="text-xs text-zinc-500 mb-1 block">Date range</label>
                    <div className="flex gap-1.5">
                      {DATE_RANGE_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setFilters(f => ({ ...f, dateRange: opt.value as Filters['dateRange'] }))}
                          className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                            filters.dateRange === opt.value
                              ? 'bg-violet-600/20 text-violet-300 border border-violet-500/40'
                              : 'bg-zinc-800/60 text-zinc-500 border border-zinc-800 hover:border-zinc-700'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sentiment */}
                  <div>
                    <label className="text-xs text-zinc-500 mb-1 block">Sentiment</label>
                    <div className="flex gap-1.5">
                      {SENTIMENT_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setFilters(f => ({ ...f, sentiment: opt.value as Filters['sentiment'] }))}
                          className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                            filters.sentiment === opt.value
                              ? 'bg-violet-600/20 text-violet-300 border border-violet-500/40'
                              : 'bg-zinc-800/60 text-zinc-500 border border-zinc-800 hover:border-zinc-700'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Contact/deal search */}
              {(template.dataSource.type === 'contacts' || template.dataSource.type === 'deals') && (
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Search</label>
                  <input
                    type="text"
                    value={filters.search}
                    onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
                    placeholder="Filter by name or company..."
                    className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-800 bg-zinc-900/50 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50"
                  />
                </div>
              )}

              {/* Sample data toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.useSampleData}
                  onChange={(e) => setFilters(f => ({ ...f, useSampleData: e.target.checked }))}
                  className="rounded border-zinc-700 bg-zinc-900 text-violet-500 focus:ring-violet-500/30"
                />
                <span className="text-xs text-zinc-400">Use sample data instead</span>
              </label>
            </>
          )}

          {/* ── Step 2: Configure Pipeline ── */}
          {step === 2 && (
            <>
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-400 mb-2">
                <Settings className="w-3 h-3" /> Pipeline Steps
              </div>

              <div className="space-y-3">
                {template.steps.map((pipeStep, idx) => {
                  const isDisabled = disabledSteps.has(idx);
                  const isOpen = expandedSteps.has(idx) && !isDisabled;
                  const isPromptView = promptViewSteps.has(idx);
                  const fields = editedFields[idx] || [];
                  const hasFields = fields.length > 0;
                  const isEmail = isEmailStep(pipeStep.title, pipeStep.action_column_key);
                  const emailCfg = emailConfigs[idx];
                  const stepColor = { violet: 'bg-violet-500/20 text-violet-400', emerald: 'bg-emerald-500/20 text-emerald-400', amber: 'bg-amber-500/20 text-amber-400' }[pipeStep.color] || 'bg-zinc-500/20 text-zinc-400';

                  return (
                    <div key={pipeStep.action_column_key} className={`rounded-lg border bg-zinc-900/30 overflow-hidden transition-opacity ${isDisabled ? 'border-zinc-800/40 opacity-50' : 'border-zinc-800'}`}>
                      {/* Step header — always visible */}
                      <div className="flex items-center gap-3 px-4 py-3">
                        {/* Optional toggle for email steps */}
                        {isEmail && (
                          <button
                            type="button"
                            onClick={() => setDisabledSteps(prev => {
                              const next = new Set(prev);
                              if (next.has(idx)) next.delete(idx); else next.add(idx);
                              return next;
                            })}
                            className={`w-8 h-[18px] rounded-full relative transition-colors shrink-0 ${isDisabled ? 'bg-zinc-800' : 'bg-violet-600'}`}
                            title={isDisabled ? 'Enable this step' : 'Disable this step'}
                          >
                            <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all ${isDisabled ? 'left-[2px]' : 'left-[14px]'}`} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => !isDisabled && toggleStepExpand(idx)}
                          className={`flex-1 flex items-center gap-3 text-left ${isDisabled ? 'cursor-default' : 'hover:opacity-80'}`}
                          disabled={isDisabled}
                        >
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${stepColor}`}>
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-zinc-200">
                              {pipeStep.title}
                              {isEmail && <span className="ml-1.5 text-[10px] text-zinc-600 font-normal">optional</span>}
                            </div>
                            <div className="text-xs text-zinc-500 truncate">{pipeStep.description}</div>
                          </div>
                          {!isDisabled && hasFields && <span className="text-[10px] text-zinc-600 shrink-0">{fields.length} outputs</span>}
                          {!isDisabled && (isOpen ? <ChevronUp className="w-4 h-4 text-zinc-600" /> : <ChevronDown className="w-4 h-4 text-zinc-600" />)}
                        </button>
                      </div>

                      {/* Expanded content */}
                      {isOpen && (
                        <div className="border-t border-zinc-800/50">
                          {/* Email config section */}
                          {isEmail && emailCfg && (
                            <div className="px-4 pt-3 pb-2 space-y-3 border-b border-zinc-800/40">
                              {/* Sign-off */}
                              <div>
                                <label className="text-[10px] uppercase tracking-wider text-zinc-600 block mb-1">Sign-off</label>
                                <input
                                  type="text"
                                  value={emailCfg.signOff}
                                  onChange={(e) => setEmailConfigs(prev => ({ ...prev, [idx]: { ...prev[idx], signOff: e.target.value } }))}
                                  placeholder="e.g. Best, James  |  Cheers, The 60 Team"
                                  className="w-full px-3 py-1.5 text-xs rounded-md border border-zinc-800 bg-zinc-950/50 text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-violet-500/50"
                                />
                              </div>

                              {/* Example message */}
                              <div>
                                <label className="text-[10px] uppercase tracking-wider text-zinc-600 block mb-1">
                                  Example message <span className="normal-case text-zinc-700">(AI matches this tone & style)</span>
                                </label>
                                <textarea
                                  value={emailCfg.exampleMessage}
                                  onChange={(e) => setEmailConfigs(prev => ({ ...prev, [idx]: { ...prev[idx], exampleMessage: e.target.value } }))}
                                  rows={4}
                                  placeholder={"Paste an example email here...\n\nThe AI will use this as a reference for tone, structure, and length."}
                                  className="w-full px-3 py-2 text-xs rounded-md border border-zinc-800 bg-zinc-950/50 text-zinc-200 placeholder:text-zinc-700 leading-relaxed resize-y focus:outline-none focus:border-violet-500/50"
                                />
                              </div>

                              {/* Spintax toggle */}
                              <label className="flex items-center gap-2 cursor-pointer">
                                <button
                                  type="button"
                                  onClick={() => setEmailConfigs(prev => ({ ...prev, [idx]: { ...prev[idx], useSpintax: !prev[idx].useSpintax } }))}
                                  className={`w-8 h-[18px] rounded-full relative transition-colors shrink-0 ${emailCfg.useSpintax ? 'bg-violet-600' : 'bg-zinc-800'}`}
                                >
                                  <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all ${emailCfg.useSpintax ? 'left-[14px]' : 'left-[2px]'}`} />
                                </button>
                                <div>
                                  <span className="text-xs text-zinc-300">Spintax variation</span>
                                  <p className="text-[10px] text-zinc-600 leading-snug">
                                    AI writes {'{'}Hi|Hey|Hello{'}'} style alternatives so each email is unique
                                  </p>
                                </div>
                              </label>
                            </div>
                          )}

                          {/* View toggle */}
                          <div className="flex items-center justify-between px-4 pt-3 pb-1">
                            <span className="text-[10px] uppercase tracking-wider text-zinc-600">
                              {isPromptView ? 'System Prompt' : isEmail ? 'AI Instructions' : 'AI Output Fields'}
                            </span>
                            <button
                              type="button"
                              onClick={() => togglePromptView(idx)}
                              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-colors"
                            >
                              {isPromptView ? <LayoutList className="w-3 h-3" /> : <Code className="w-3 h-3" />}
                              {isPromptView ? 'Fields view' : 'Prompt view'}
                            </button>
                          </div>

                          {/* Fields config view (default) */}
                          {!isPromptView && (
                            <div className="px-4 pb-3 space-y-2">
                              {hasFields ? (
                                <>
                                  <p className="text-[11px] text-zinc-600 leading-relaxed">
                                    Configure what the AI returns. Each field becomes a column you can use in later steps.
                                  </p>
                                  {fields.map((field, fIdx) => (
                                    <div key={fIdx} className="flex items-start gap-2 group/field">
                                      <div className="flex-1 grid grid-cols-[120px_1fr] gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950/50 p-2">
                                        <input
                                          type="text"
                                          value={field.name}
                                          onChange={(e) => updateField(idx, fIdx, 'name', e.target.value)}
                                          className="px-2 py-1 text-xs font-mono text-violet-300 bg-transparent border border-zinc-800 rounded focus:outline-none focus:border-violet-500/50"
                                          title="Field name"
                                        />
                                        <input
                                          type="text"
                                          value={field.description}
                                          onChange={(e) => updateField(idx, fIdx, 'description', e.target.value)}
                                          className="px-2 py-1 text-xs text-zinc-300 bg-transparent border border-zinc-800 rounded focus:outline-none focus:border-violet-500/50"
                                          title="Description — tells the AI what to output"
                                        />
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => removeField(idx, fIdx)}
                                        className="mt-2 p-1 rounded text-zinc-700 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover/field:opacity-100 transition-all"
                                        title="Remove field"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => addField(idx)}
                                    className="flex items-center gap-1 px-2 py-1 text-[11px] text-zinc-600 hover:text-violet-400 hover:bg-violet-500/5 rounded transition-colors"
                                  >
                                    <Plus className="w-3 h-3" /> Add field
                                  </button>
                                </>
                              ) : (
                                <p className="text-[11px] text-zinc-600 leading-relaxed py-1">
                                  This step outputs free-form text. Switch to prompt view to edit the full instructions.
                                </p>
                              )}
                            </div>
                          )}

                          {/* Prompt text view */}
                          {isPromptView && (
                            <div className="px-4 pb-3">
                              <textarea
                                value={editedPrompts[idx] ?? ''}
                                onChange={(e) => setEditedPrompts(prev => ({ ...prev, [idx]: e.target.value }))}
                                rows={8}
                                className="w-full mt-1 p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-300 font-mono leading-relaxed resize-y focus:outline-none focus:border-violet-500/50 placeholder:text-zinc-700"
                                placeholder="System prompt..."
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ── Email Sequence ── */}
              {hasEmailStep && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
                    <Mail className="w-3 h-3" /> Email Sequence
                  </div>

                  {/* Stage count */}
                  <div>
                    <label className="text-xs text-zinc-500 mb-1 block">Number of emails</label>
                    <div className="flex gap-1.5">
                      {[1, 2, 3].map(n => (
                        <button
                          key={n}
                          onClick={() => setEmailStageCount(n)}
                          className={`px-3 py-1 rounded-md text-xs transition-colors ${
                            emailStageCount === n
                              ? 'bg-violet-600/20 text-violet-300 border border-violet-500/40'
                              : 'bg-zinc-800/60 text-zinc-500 border border-zinc-800 hover:border-zinc-700'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Follow-up configs */}
                  {Array.from({ length: emailStageCount - 1 }, (_, i) => i + 2).map(n => (
                    <div key={n} className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-sm font-medium text-zinc-200">Follow-up {n}</span>
                      </div>

                      {/* Delay */}
                      <div>
                        <label className="text-xs text-zinc-500 mb-1 block">Send after previous email</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            max={30}
                            value={stageDelays[n - 1]}
                            onChange={(e) => setStageDelays(prev => {
                              const next = [...prev];
                              next[n - 1] = parseInt(e.target.value) || 1;
                              return next;
                            })}
                            className="w-16 px-2 py-1.5 text-sm rounded-md border border-zinc-800 bg-zinc-900/50 text-zinc-200 focus:outline-none focus:border-violet-500/50"
                          />
                          <span className="text-xs text-zinc-500">days</span>
                        </div>
                      </div>

                      {/* Sign-off */}
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-zinc-600 block mb-1">Sign-off</label>
                        <input
                          type="text"
                          value={followUpConfigs[n]?.signOff || ''}
                          onChange={(e) => setFollowUpConfigs(prev => ({
                            ...prev,
                            [n]: { ...prev[n] || { signOff: '', exampleMessage: '', useSpintax: false }, signOff: e.target.value },
                          }))}
                          placeholder="e.g. Best, James"
                          className="w-full px-3 py-1.5 text-xs rounded-md border border-zinc-800 bg-zinc-950/50 text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-violet-500/50"
                        />
                      </div>

                      {/* Example message */}
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-zinc-600 block mb-1">Example message</label>
                        <textarea
                          value={followUpConfigs[n]?.exampleMessage || ''}
                          onChange={(e) => setFollowUpConfigs(prev => ({
                            ...prev,
                            [n]: { ...prev[n] || { signOff: '', exampleMessage: '', useSpintax: false }, exampleMessage: e.target.value },
                          }))}
                          rows={3}
                          placeholder="Paste an example follow-up email..."
                          className="w-full px-3 py-2 text-xs rounded-md border border-zinc-800 bg-zinc-950/50 text-zinc-200 placeholder:text-zinc-700 leading-relaxed resize-y focus:outline-none focus:border-violet-500/50"
                        />
                      </div>

                      {/* Spintax */}
                      <label className="flex items-center gap-2 cursor-pointer">
                        <button
                          type="button"
                          onClick={() => setFollowUpConfigs(prev => ({
                            ...prev,
                            [n]: { ...prev[n] || { signOff: '', exampleMessage: '', useSpintax: false }, useSpintax: !prev[n]?.useSpintax },
                          }))}
                          className={`w-8 h-[18px] rounded-full relative transition-colors shrink-0 ${followUpConfigs[n]?.useSpintax ? 'bg-violet-600' : 'bg-zinc-800'}`}
                        >
                          <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all ${followUpConfigs[n]?.useSpintax ? 'left-[14px]' : 'left-[2px]'}`} />
                        </button>
                        <span className="text-xs text-zinc-300">Spintax variation</span>
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Step 3: Send via Integration ── */}
          {isSendStep && (
            <>
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-400 mb-2">
                <Zap className="w-3 h-3" /> Send Sequence
              </div>

              <p className="text-[11px] text-zinc-600 mb-3">
                Choose a sending platform or skip to create the pipeline without sending.
              </p>

              {/* Provider cards */}
              <div className="space-y-2">
                {/* Instantly */}
                {instantlyConnected && (
                  <button
                    type="button"
                    onClick={() => setSendProvider(sendProvider === 'instantly' ? null : 'instantly')}
                    className={`w-full text-left rounded-lg border p-3 transition-colors ${
                      sendProvider === 'instantly'
                        ? 'border-violet-500/50 bg-violet-500/5'
                        : 'border-zinc-800 bg-zinc-900/30 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                        sendProvider === 'instantly' ? 'bg-violet-500/20 text-violet-400' : 'bg-zinc-800 text-zinc-500'
                      }`}>
                        <Zap className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-zinc-200">Instantly</div>
                        <div className="text-[11px] text-zinc-500">Cold email sequences with deliverability optimization</div>
                      </div>
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        sendProvider === 'instantly' ? 'border-violet-500' : 'border-zinc-700'
                      }`}>
                        {sendProvider === 'instantly' && <div className="w-2 h-2 rounded-full bg-violet-500" />}
                      </div>
                    </div>
                  </button>
                )}

                {/* HubSpot */}
                {hubspotConnected && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = sendProvider === 'hubspot' ? null : 'hubspot';
                      setSendProvider(next);
                      if (next === 'hubspot' && hasSequenceScopes && hubspotSequences.length === 0) {
                        fetchHubspotSequences();
                      }
                    }}
                    className={`w-full text-left rounded-lg border p-3 transition-colors ${
                      sendProvider === 'hubspot'
                        ? 'border-violet-500/50 bg-violet-500/5'
                        : 'border-zinc-800 bg-zinc-900/30 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                        sendProvider === 'hubspot' ? 'bg-violet-500/20 text-violet-400' : 'bg-zinc-800 text-zinc-500'
                      }`}>
                        <Mail className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-zinc-200">HubSpot Sequences</div>
                        <div className="text-[11px] text-zinc-500">Enroll contacts into HubSpot email sequences</div>
                      </div>
                      {!hasSequenceScopes && (
                        <div className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-900/40 text-amber-400">Re-auth needed</div>
                      )}
                    </div>
                  </button>
                )}

                {/* Attio */}
                {attioConnected && (
                  <button
                    type="button"
                    onClick={() => setSendProvider(sendProvider === 'attio' ? null : 'attio')}
                    className={`w-full text-left rounded-lg border p-3 transition-colors ${
                      sendProvider === 'attio'
                        ? 'border-violet-500/50 bg-violet-500/5'
                        : 'border-zinc-800 bg-zinc-900/30 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                        sendProvider === 'attio' ? 'bg-violet-500/20 text-violet-400' : 'bg-zinc-800 text-zinc-500'
                      }`}>
                        <Mail className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-zinc-200">Attio Sequences</div>
                        <div className="text-[11px] text-zinc-500">Enroll contacts into Attio email sequences</div>
                      </div>
                      <div className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-zinc-800 text-zinc-500">Soon</div>
                    </div>
                  </button>
                )}
              </div>

              {/* Instantly config (expanded when selected) */}
              {sendProvider === 'instantly' && (
                <div className="space-y-4 mt-3">
                  {/* New vs existing campaign */}
                  <div className="space-y-2">
                    <label className="text-xs text-zinc-500 block">Campaign</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCreateNewCampaign(true)}
                        className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
                          createNewCampaign
                            ? 'bg-violet-600/20 text-violet-300 border border-violet-500/40'
                            : 'bg-zinc-800/60 text-zinc-500 border border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        Create new
                      </button>
                      <button
                        onClick={() => { setCreateNewCampaign(false); fetchInstantlyCampaigns(); }}
                        className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
                          !createNewCampaign
                            ? 'bg-violet-600/20 text-violet-300 border border-violet-500/40'
                            : 'bg-zinc-800/60 text-zinc-500 border border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        Use existing
                      </button>
                    </div>
                  </div>

                  {createNewCampaign ? (
                    <div>
                      <label className="text-xs text-zinc-500 mb-1 block">Campaign name</label>
                      <input
                        type="text"
                        value={newCampaignName}
                        onChange={(e) => setNewCampaignName(e.target.value)}
                        placeholder="Campaign name..."
                        className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-800 bg-zinc-900/50 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="text-xs text-zinc-500 mb-1 block">Select campaign</label>
                      {loadingCampaigns ? (
                        <div className="flex items-center gap-2 text-xs text-zinc-500 py-2">
                          <Loader2 className="w-3 h-3 animate-spin" /> Loading campaigns...
                        </div>
                      ) : (
                        <select
                          value={selectedCampaignId || ''}
                          onChange={(e) => setSelectedCampaignId(e.target.value || null)}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-800 bg-zinc-900/50 text-zinc-200 focus:outline-none focus:border-violet-500/50"
                        >
                          <option value="">Choose a campaign...</option>
                          {instantlyCampaigns.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}

                  {/* Sequence preview */}
                  <div>
                    <label className="text-xs text-zinc-500 mb-2 block">Email sequence</label>
                    <div className="flex items-center gap-2 flex-wrap">
                      {Array.from({ length: emailStageCount }, (_, i) => (
                        <React.Fragment key={i}>
                          {i > 0 && (
                            <div className="flex items-center gap-1 text-[10px] text-zinc-600">
                              <Clock className="w-3 h-3" />
                              <span>{stageDelays[i]}d</span>
                              <ArrowRight className="w-3 h-3" />
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/50">
                            <Mail className="w-3 h-3 text-amber-400" />
                            <span className="text-xs text-zinc-300">Email {i + 1}</span>
                          </div>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>

                  {/* Field mapping preview */}
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-3">
                    <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-2">Auto-detected field mapping</div>
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      <span className="text-zinc-500">Email</span><span className="text-zinc-300">email</span>
                      <span className="text-zinc-500">First Name</span><span className="text-zinc-300">first_name</span>
                      <span className="text-zinc-500">Last Name</span><span className="text-zinc-300">last_name</span>
                      <span className="text-zinc-500">Company</span><span className="text-zinc-300">company</span>
                    </div>
                  </div>
                </div>
              )}

              {/* HubSpot Sequences config */}
              {sendProvider === 'hubspot' && (
                <div className="space-y-4 mt-3">
                  {!hasSequenceScopes ? (
                    <div className="rounded-lg border border-amber-800/40 bg-amber-900/10 px-4 py-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                        <div className="space-y-2">
                          <p className="text-sm text-zinc-300">
                            HubSpot needs additional permissions for Sequences. Re-connect to grant the required scopes.
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-amber-700/50 text-amber-300 hover:bg-amber-900/20"
                            onClick={async (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              try { await connectHubSpot(); }
                              catch (err: any) {
                                console.error('[PipelineWizard] connectHubSpot error:', err);
                                toast.error(err?.message || 'Failed to connect HubSpot');
                              }
                            }}
                          >
                            <RefreshCw className="w-3 h-3 mr-1.5" />
                            Re-connect HubSpot
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Sequence picker */}
                      <div>
                        <label className="text-xs text-zinc-500 mb-1 block">Select sequence</label>
                        {loadingSequences ? (
                          <div className="flex items-center gap-2 text-xs text-zinc-500 py-2">
                            <Loader2 className="w-3 h-3 animate-spin" /> Loading sequences...
                          </div>
                        ) : hubspotSequences.length === 0 ? (
                          <div className="text-xs text-zinc-500 py-2">
                            No sequences found. Create one in HubSpot first.
                          </div>
                        ) : (
                          <select
                            value={selectedSequenceId || ''}
                            onChange={(e) => setSelectedSequenceId(e.target.value || null)}
                            className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-800 bg-zinc-900/50 text-zinc-200 focus:outline-none focus:border-violet-500/50"
                          >
                            <option value="">Choose a sequence...</option>
                            {hubspotSequences.map(s => (
                              <option key={s.id} value={s.id}>{s.name} ({s.stepsCount} steps)</option>
                            ))}
                          </select>
                        )}
                      </div>

                      {/* Sender email */}
                      <div>
                        <label className="text-xs text-zinc-500 mb-1 block">Sender email (must be a connected sending user in HubSpot)</label>
                        <input
                          type="email"
                          value={hubspotSenderEmail}
                          onChange={(e) => setHubspotSenderEmail(e.target.value)}
                          placeholder="you@company.com"
                          className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-800 bg-zinc-900/50 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50"
                        />
                      </div>

                      {/* Info */}
                      <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-3">
                        <p className="text-[11px] text-zinc-500">
                          Contacts with matching HubSpot records will be enrolled into this sequence after the pipeline is created. Contacts not found in HubSpot will be skipped.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Attio coming soon message */}
              {sendProvider === 'attio' && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-3 mt-3">
                  <p className="text-sm text-zinc-400">
                    Attio sequence integration is coming soon. For now, the pipeline will generate the emails — you can manually enroll contacts after.
                  </p>
                </div>
              )}
            </>
          )}

          {/* ── Review & Create ── */}
          {isReviewStep && (
            <>
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-400 mb-2">
                <Eye className="w-3 h-3" /> Review
              </div>

              <div className="space-y-3">
                {/* Source summary */}
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-3">
                  <div className="text-xs text-zinc-500">Data Source</div>
                  <div className="text-sm text-zinc-200 mt-0.5">
                    {filters.useSampleData ? (
                      <>{template.dataSource.synthetic_rows?.length ?? 0} sample records</>
                    ) : (
                      <>{previewCount ?? '?'} {sourceLabel}</>
                    )}
                  </div>
                  {template.dataSource.type === 'meetings' && !filters.useSampleData && (
                    <div className="flex gap-2 mt-1 text-[10px] text-zinc-600">
                      <span>Range: {DATE_RANGE_OPTIONS.find(o => o.value === filters.dateRange)?.label}</span>
                      {filters.sentiment !== 'all' && <span>Sentiment: {filters.sentiment}</span>}
                    </div>
                  )}
                </div>

                {/* Steps summary */}
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-3">
                  <div className="text-xs text-zinc-500">Pipeline Steps</div>
                  <div className="mt-1.5 space-y-1">
                    {template.steps.map((s, i) => {
                      const stepDisabled = disabledSteps.has(i);
                      const emailCfg = emailConfigs[i];
                      return (
                        <div key={s.action_column_key}>
                          <div className={`flex items-center gap-2 text-sm ${stepDisabled ? 'text-zinc-600 line-through' : 'text-zinc-300'}`}>
                            <span className="text-xs text-zinc-600">{i + 1}.</span>
                            {s.title}
                            {stepDisabled && <span className="text-[10px] text-zinc-700 no-underline">(skipped)</span>}
                          </div>
                          {!stepDisabled && emailCfg && (emailCfg.signOff || emailCfg.exampleMessage || emailCfg.useSpintax) && (
                            <div className="ml-5 mt-0.5 flex flex-wrap gap-2 text-[10px] text-zinc-600">
                              {emailCfg.signOff && <span>Sign-off: {emailCfg.signOff}</span>}
                              {emailCfg.exampleMessage && <span>Example provided</span>}
                              {emailCfg.useSpintax && <span className="text-violet-500">Spintax enabled</span>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Email sequence summary */}
                {hasEmailStep && emailStageCount > 1 && (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-3">
                    <div className="text-xs text-zinc-500">Email Sequence</div>
                    <div className="text-sm text-zinc-200 mt-0.5 flex items-center gap-1 flex-wrap">
                      {Array.from({ length: emailStageCount }, (_, i) => (
                        <React.Fragment key={i}>
                          {i > 0 && <span className="text-zinc-600 text-xs">&rarr; {stageDelays[i]}d &rarr;</span>}
                          <span>Email {i + 1}</span>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                )}

                {/* Send provider summary */}
                {sendProvider && (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-3">
                    <div className="text-xs text-zinc-500">Send via</div>
                    <div className="text-sm text-zinc-200 mt-0.5">
                      {sendProvider === 'instantly' && (
                        createNewCampaign
                          ? <>Instantly — New campaign: <strong>{newCampaignName || template.name}</strong></>
                          : <>Instantly — Existing: <strong>{instantlyCampaigns.find(c => c.id === selectedCampaignId)?.name || 'Selected'}</strong></>
                      )}
                      {sendProvider === 'hubspot' && (
                        <>HubSpot Sequence: <strong>{hubspotSequences.find(s => s.id === selectedSequenceId)?.name || 'Selected'}</strong></>
                      )}
                      {sendProvider === 'attio' && <>Attio Sequences <span className="text-zinc-600">(coming soon)</span></>}
                    </div>
                    {sendProvider === 'instantly' && <div className="text-[10px] text-zinc-600 mt-0.5">Auto-push enabled</div>}
                    {sendProvider === 'hubspot' && hubspotSenderEmail && <div className="text-[10px] text-zinc-600 mt-0.5">Sender: {hubspotSenderEmail}</div>}
                  </div>
                )}

                {/* Stats */}
                <div className="flex gap-4 text-xs text-zinc-500">
                  <span>{template.columns.length} columns</span>
                  <span>{template.columns.filter(c => c.column_type === 'formula').length} formulas</span>
                  <span>{template.steps.length - disabledSteps.size} AI steps</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800/60">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => step > 1 ? setStep(step - 1) : onOpenChange(false)}
            className="text-zinc-400 hover:text-zinc-200"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
            {step > 1 ? 'Back' : 'Cancel'}
          </Button>

          {step < maxStep ? (
            <Button
              size="sm"
              onClick={() => setStep(step + 1)}
              className="bg-violet-600 hover:bg-violet-500 text-white"
            >
              Next
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={creating}
              className="bg-violet-600 hover:bg-violet-500 text-white"
            >
              {creating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 mr-1" />
                  Create Pipeline
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
