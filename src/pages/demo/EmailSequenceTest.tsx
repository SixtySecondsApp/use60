/**
 * Email Sequence Test — demonstrates the real two-tier production flow:
 *
 *   Tier 1 (Claude): Writes emails for Prospect #1
 *   Tier 2 (Gemini 3 Flash): Clones that style for Prospects #2, #3, etc.
 *
 * Uses the test-email-sequence edge function which imports the same shared
 * emailPromptRules.ts module as the production generate-email-sequence function.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Mail,
  Loader2,
  Play,
  Clock,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  AlertCircle,
  Sparkles,
  Zap,
  Plus,
  Trash2,
  User,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

// ============================================================================
// Types
// ============================================================================

interface ProspectData {
  name: string;
  title: string;
  company: string;
  company_description: string;
  city: string;
  industry: string;
  employees: string;
  seniority: string;
  headline: string;
  funding_stage: string;
}

interface EmailStep {
  subject: string;
  body: string;
}

interface ProspectResult {
  prospect: { name: string; title: string; company: string };
  tier: 'claude' | 'gemini';
  emails: EmailStep[];
  duration_ms: number;
  error?: string;
}

interface TestResult {
  system_prompt: string;
  user_prompt: string;
  results: ProspectResult[];
}

// ============================================================================
// Sample Data
// ============================================================================

const SAMPLE_PROSPECT_SETS: Record<string, ProspectData[]> = {
  'SaaS Sales Team': [
    {
      name: 'Sarah Chen',
      title: 'VP of Sales',
      company: 'Dataflow Systems',
      company_description: 'B2B SaaS platform for sales pipeline analytics and forecasting. Series B, 120 employees.',
      city: 'Austin, TX',
      industry: 'Software / SaaS',
      employees: '120',
      seniority: 'VP',
      headline: 'Building the future of sales analytics',
      funding_stage: 'Series B',
    },
    {
      name: 'Marcus Thompson',
      title: 'Head of Revenue Operations',
      company: 'CloudMetrics',
      company_description: 'Cloud-native observability platform for DevOps teams. Series A, 65 employees.',
      city: 'San Francisco, CA',
      industry: 'Software / SaaS',
      employees: '65',
      seniority: 'Director',
      headline: 'Scaling RevOps from 0 to $10M ARR',
      funding_stage: 'Series A',
    },
    {
      name: 'Emma Wilson',
      title: 'Sales Director',
      company: 'Pronto AI',
      company_description: 'AI-powered customer support automation for e-commerce. Seed stage, 22 employees.',
      city: 'London, UK',
      industry: 'Artificial Intelligence',
      employees: '22',
      seniority: 'Director',
      headline: 'Making customer support actually work',
      funding_stage: 'Seed',
    },
  ],
  'Construction Tech': [
    {
      name: 'James Morrison',
      title: 'CTO',
      company: 'NovaBuild',
      company_description: 'Construction tech startup automating project scheduling with AI. Seed stage, 15 employees.',
      city: 'London, UK',
      industry: 'Construction Technology',
      employees: '15',
      seniority: 'C-Suite',
      headline: 'Ex-Google engineer building AI for construction',
      funding_stage: 'Seed',
    },
    {
      name: 'Rachel Adams',
      title: 'Operations Manager',
      company: 'SitePlan Pro',
      company_description: 'Digital project management for mid-size construction firms. Bootstrap, 30 employees.',
      city: 'Birmingham, UK',
      industry: 'Construction',
      employees: '30',
      seniority: 'Manager',
      headline: 'Bringing construction into the digital age',
      funding_stage: '',
    },
  ],
  'Agency Leaders': [
    {
      name: 'Maria Rodriguez',
      title: 'Director of Marketing',
      company: 'Elevation Digital',
      company_description: 'Full-service digital marketing agency specialising in B2B lead generation. 45 employees.',
      city: 'Manchester, UK',
      industry: 'Marketing & Advertising',
      employees: '45',
      seniority: 'Director',
      headline: 'Helping B2B companies fill their pipeline',
      funding_stage: '',
    },
    {
      name: 'David Okafor',
      title: 'Founder & CEO',
      company: 'BrightPath Media',
      company_description: 'Creative agency focused on tech startups. 12 employees, growing fast.',
      city: 'Bristol, UK',
      industry: 'Marketing & Advertising',
      employees: '12',
      seniority: 'C-Suite',
      headline: 'Building brands that startups actually need',
      funding_stage: '',
    },
    {
      name: 'Lily Patel',
      title: 'Head of Partnerships',
      company: 'GrowthLoop Agency',
      company_description: 'Performance marketing agency for DTC brands. 28 employees.',
      city: 'Leeds, UK',
      industry: 'Marketing & Advertising',
      employees: '28',
      seniority: 'Director',
      headline: 'Turning ad spend into revenue',
      funding_stage: '',
    },
  ],
};

const EMPTY_PROSPECT: ProspectData = {
  name: '', title: '', company: '', company_description: '', city: '',
  industry: '', employees: '', seniority: '', headline: '', funding_stage: '',
};

// ============================================================================
// Sub-components
// ============================================================================

function EmailCard({ step, index }: { step: EmailStep; index: number }) {
  const [copied, setCopied] = useState(false);
  const wordCount = step.body.split(/\s+/).filter(Boolean).length;

  const handleCopy = () => {
    navigator.clipboard.writeText(`Subject: ${step.subject}\n\n${step.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-gray-700/60 bg-gray-800/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-gray-600 text-gray-400">
            Email {index + 1}
          </Badge>
          <Badge
            variant="outline"
            className={
              wordCount <= 75
                ? 'border-emerald-600/50 text-emerald-400'
                : wordCount <= 100
                  ? 'border-amber-600/50 text-amber-400'
                  : 'border-red-600/50 text-red-400'
            }
          >
            {wordCount} words
          </Badge>
        </div>
        <button
          onClick={handleCopy}
          className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-700 hover:text-gray-300"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      <p className="mb-2 text-xs font-medium text-gray-400">
        Subject: <span className="text-gray-200">{step.subject}</span>
      </p>
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
        {step.body}
      </div>
    </div>
  );
}

function ProspectForm({
  prospect,
  index,
  onChange,
  onRemove,
  canRemove,
}: {
  prospect: ProspectData;
  index: number;
  onChange: (field: keyof ProspectData, value: string) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-700/60 bg-gray-800/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-300">
            Prospect {index + 1}
          </span>
          {index === 0 ? (
            <Badge className="bg-amber-600/20 text-amber-400 border-amber-600/40">
              <Sparkles className="mr-1 h-3 w-3" /> Claude (Tier 1)
            </Badge>
          ) : (
            <Badge className="bg-blue-600/20 text-blue-400 border-blue-600/40">
              <Zap className="mr-1 h-3 w-3" /> Gemini (Tier 2)
            </Badge>
          )}
        </div>
        {canRemove && (
          <button
            onClick={onRemove}
            className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-700 hover:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="mb-0.5 block text-[10px] uppercase tracking-wider text-gray-500">Name</label>
          <Input value={prospect.name} onChange={e => onChange('name', e.target.value)} className="h-8 border-gray-700 bg-gray-800 text-xs" />
        </div>
        <div>
          <label className="mb-0.5 block text-[10px] uppercase tracking-wider text-gray-500">Title</label>
          <Input value={prospect.title} onChange={e => onChange('title', e.target.value)} className="h-8 border-gray-700 bg-gray-800 text-xs" />
        </div>
        <div>
          <label className="mb-0.5 block text-[10px] uppercase tracking-wider text-gray-500">Company</label>
          <Input value={prospect.company} onChange={e => onChange('company', e.target.value)} className="h-8 border-gray-700 bg-gray-800 text-xs" />
        </div>
        <div className="col-span-2">
          <label className="mb-0.5 block text-[10px] uppercase tracking-wider text-gray-500">Company Description</label>
          <Input value={prospect.company_description} onChange={e => onChange('company_description', e.target.value)} className="h-8 border-gray-700 bg-gray-800 text-xs" />
        </div>
        <div>
          <label className="mb-0.5 block text-[10px] uppercase tracking-wider text-gray-500">Industry</label>
          <Input value={prospect.industry} onChange={e => onChange('industry', e.target.value)} className="h-8 border-gray-700 bg-gray-800 text-xs" />
        </div>
        <div>
          <label className="mb-0.5 block text-[10px] uppercase tracking-wider text-gray-500">City</label>
          <Input value={prospect.city} onChange={e => onChange('city', e.target.value)} className="h-8 border-gray-700 bg-gray-800 text-xs" />
        </div>
        <div>
          <label className="mb-0.5 block text-[10px] uppercase tracking-wider text-gray-500">Employees</label>
          <Input value={prospect.employees} onChange={e => onChange('employees', e.target.value)} className="h-8 border-gray-700 bg-gray-800 text-xs" />
        </div>
        <div>
          <label className="mb-0.5 block text-[10px] uppercase tracking-wider text-gray-500">Seniority</label>
          <Input value={prospect.seniority} onChange={e => onChange('seniority', e.target.value)} className="h-8 border-gray-700 bg-gray-800 text-xs" />
        </div>
      </div>
    </div>
  );
}

function ResultCard({ result }: { result: ProspectResult }) {
  const isClaude = result.tier === 'claude';
  const TierIcon = isClaude ? Sparkles : Zap;
  const tierColor = isClaude ? 'text-amber-400' : 'text-blue-400';
  const tierLabel = isClaude ? 'Claude Sonnet 4.5 (Tier 1)' : 'Gemini 3 Flash (Tier 2)';

  if (result.error) {
    return (
      <Card className="border-gray-700 bg-gray-900">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TierIcon className={`h-4 w-4 ${tierColor}`} />
              {result.prospect.name}
              <span className="text-xs font-normal text-gray-500">
                {result.prospect.title} at {result.prospect.company}
              </span>
            </CardTitle>
            <Badge variant="outline" className={isClaude ? 'border-amber-600/40 text-amber-400' : 'border-blue-600/40 text-blue-400'}>
              {tierLabel}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 rounded-lg border border-red-800/50 bg-red-900/20 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <p className="text-sm text-red-300">{result.error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-gray-700 bg-gray-900">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <TierIcon className={`h-4 w-4 ${tierColor}`} />
            {result.prospect.name}
            <span className="text-xs font-normal text-gray-500">
              {result.prospect.title} at {result.prospect.company}
            </span>
          </CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <Clock className="h-3 w-3" />
              {(result.duration_ms / 1000).toFixed(1)}s
            </div>
            <Badge variant="outline" className={isClaude ? 'border-amber-600/40 text-amber-400' : 'border-blue-600/40 text-blue-400'}>
              {tierLabel}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {result.emails.map((step, i) => (
          <EmailCard key={i} step={step} index={i} />
        ))}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Quality Helpers
// ============================================================================

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const DEAD_PHRASES = [
  "i'm reaching out because", "i hope this email finds you well",
  "allow me to introduce myself", "i'd love to explore potential synergies",
  "leverage our best-in-class", "drive meaningful engagement",
  "transforming prospect engagement", "industry-leading solution",
  "streamline your workflow", "empower your team", "cutting-edge technology",
  "just following up", "just checking in", "bumping this to the top",
  "i'd love to", "i wanted to reach out", "hoping to connect",
  "best-in-class", "cutting-edge", "revolutionize",
];

function hasDeadLanguage(emails: EmailStep[]): boolean {
  const allText = emails.map(e => `${e.subject} ${e.body}`).join(' ').toLowerCase();
  return DEAD_PHRASES.some(phrase => allText.includes(phrase));
}

function startsWithSelfIntro(body: string): boolean {
  const lower = body.trim().toLowerCase();
  return (
    lower.startsWith("i'm reaching out") || lower.startsWith('my name is') ||
    lower.startsWith('i hope this') || lower.startsWith('allow me to') ||
    lower.startsWith("i'm writing to") || lower.startsWith('we are ')
  );
}

function hasJustFollowingUp(followUps: EmailStep[]): boolean {
  return followUps.some(e => {
    const lower = e.body.toLowerCase();
    return lower.includes('just following up') || lower.includes('just checking in') || lower.includes('bumping this');
  });
}

function QualityRow({ label, results }: { label: string; results: Array<{ name: string; pass: boolean | null }> }) {
  return (
    <tr className="border-b border-gray-800 last:border-0">
      <td className="py-2 pr-4 text-xs text-gray-400">{label}</td>
      {results.map((r, i) => (
        <td key={i} className="py-2 px-2 text-center">
          {r.pass === null ? (
            <span className="text-xs text-gray-600">-</span>
          ) : r.pass ? (
            <Badge variant="outline" className="border-emerald-600/50 text-emerald-400 text-[10px]">Pass</Badge>
          ) : (
            <Badge variant="outline" className="border-red-600/50 text-red-400 text-[10px]">Fail</Badge>
          )}
        </td>
      ))}
    </tr>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function EmailSequenceTest() {
  const [prospects, setProspects] = useState<ProspectData[]>(SAMPLE_PROSPECT_SETS['SaaS Sales Team']);
  const [numSteps, setNumSteps] = useState(3);
  const [angle, setAngle] = useState('');
  const [signOff, setSignOff] = useState('');
  const [emailType, setEmailType] = useState('cold_outreach');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [showPrompts, setShowPrompts] = useState(false);

  const updateProspect = (index: number, field: keyof ProspectData, value: string) => {
    setProspects(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
  };

  const removeProspect = (index: number) => {
    if (prospects.length <= 1) return;
    setProspects(prev => prev.filter((_, i) => i !== index));
  };

  const addProspect = () => {
    setProspects(prev => [...prev, { ...EMPTY_PROSPECT }]);
  };

  const loadSampleSet = (key: string) => {
    const set = SAMPLE_PROSPECT_SETS[key];
    if (set) setProspects(set.map(p => ({ ...p })));
  };

  const runTest = async () => {
    const valid = prospects.filter(p => p.name && p.title && p.company);
    if (valid.length === 0) {
      toast.error('Add at least one prospect with name, title, and company');
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('test-email-sequence', {
        body: {
          prospects: valid,
          sequence_config: {
            num_steps: numSteps,
            angle: angle || undefined,
            email_type: emailType,
          },
          sign_off: signOff || undefined,
        },
      });

      if (error) throw error;
      setResult(data as TestResult);

      const claudeCount = (data as TestResult).results.filter(r => r.tier === 'claude' && !r.error).length;
      const geminiCount = (data as TestResult).results.filter(r => r.tier === 'gemini' && !r.error).length;
      toast.success(`Generated: ${claudeCount} Claude + ${geminiCount} Gemini`);
    } catch (err) {
      toast.error(`Failed: ${(err as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Build quality checks from results
  const qualityResults = result?.results.filter(r => r.emails.length > 0) || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <Mail className="h-8 w-8 text-violet-400" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Email Sequence Test
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Two-tier flow: <span className="text-amber-400">Claude</span> writes for Prospect #1, then <span className="text-blue-400">Gemini 3 Flash</span> clones that style for rows #2+
              </p>
            </div>
          </div>
        </div>

        {/* Config Section */}
        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-4">
          {/* Prospects */}
          <div className="lg:col-span-3 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-300">Prospects</h2>
              <div className="flex gap-1.5">
                {Object.keys(SAMPLE_PROSPECT_SETS).map(key => (
                  <button
                    key={key}
                    onClick={() => loadSampleSet(key)}
                    className="rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1 text-xs text-gray-400 transition-colors hover:border-violet-600 hover:text-violet-300"
                  >
                    {key}
                  </button>
                ))}
              </div>
            </div>
            {prospects.map((p, i) => (
              <ProspectForm
                key={i}
                prospect={p}
                index={i}
                onChange={(field, value) => updateProspect(i, field, value)}
                onRemove={() => removeProspect(i)}
                canRemove={prospects.length > 1}
              />
            ))}
            <button
              onClick={addProspect}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-700 py-2 text-xs text-gray-500 transition-colors hover:border-gray-600 hover:text-gray-400"
            >
              <Plus className="h-3.5 w-3.5" /> Add Prospect (Gemini Tier 2)
            </button>
          </div>

          {/* Sequence Config */}
          <Card className="border-gray-700 bg-gray-900">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Sequence Config</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs text-gray-400">Steps per prospect</label>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => setNumSteps(n)}
                      className={`flex-1 rounded-md border px-2 py-1.5 text-sm font-medium transition-colors ${
                        numSteps === n
                          ? 'border-violet-600 bg-violet-600/20 text-violet-300'
                          : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-gray-400">Email Type</label>
                <select
                  value={emailType}
                  onChange={e => setEmailType(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 outline-none focus:border-violet-500"
                >
                  <option value="cold_outreach">Cold Outreach</option>
                  <option value="event_invitation">Event Invitation</option>
                  <option value="meeting_request">Meeting Request</option>
                  <option value="follow_up">Follow Up</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-gray-400">Campaign Angle</label>
                <textarea
                  value={angle}
                  onChange={e => setAngle(e.target.value)}
                  placeholder="Optional angle..."
                  rows={3}
                  className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-gray-400">Sign-off</label>
                <Input
                  value={signOff}
                  onChange={e => setSignOff(e.target.value)}
                  placeholder="e.g. Best, Sarah"
                  className="border-gray-700 bg-gray-800 text-sm"
                />
              </div>

              <Button
                onClick={runTest}
                disabled={isLoading}
                className="w-full bg-violet-600 hover:bg-violet-500"
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                {isLoading ? 'Generating...' : `Run Two-Tier Test (${prospects.filter(p => p.name).length} prospects)`}
              </Button>

              {isLoading && (
                <div className="space-y-1.5 rounded-lg border border-gray-700/60 bg-gray-800/30 p-3 text-xs text-gray-400">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-3 w-3 text-amber-400 animate-pulse" />
                    Tier 1: Claude writing for Prospect #1...
                  </div>
                  {prospects.length > 1 && (
                    <div className="flex items-center gap-2">
                      <Zap className="h-3 w-3 text-blue-400" />
                      Tier 2: Gemini will clone style for {prospects.length - 1} more...
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Prompt Inspector */}
        {result && (
          <div className="mb-6">
            <button
              onClick={() => setShowPrompts(!showPrompts)}
              className="flex w-full items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-4 py-2.5 text-left text-sm text-gray-400 transition-colors hover:border-gray-600"
            >
              {showPrompts ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <span className="font-medium">Prompt Inspector</span>
              <span className="text-xs text-gray-500">
                (system: {result.system_prompt.length.toLocaleString()} chars, user: {result.user_prompt.length.toLocaleString()} chars)
              </span>
            </button>
            {showPrompts && (
              <div className="mt-2 grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">System Prompt (shared rules from emailPromptRules.ts)</h3>
                  <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-gray-300">
                    {result.system_prompt}
                  </pre>
                </div>
                <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">User Prompt (Claude Tier 1 — Prospect #1)</h3>
                  <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-gray-300">
                    {result.user_prompt}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-300">
              Results ({result.results.length} prospects)
            </h2>
            {result.results.map((r, i) => (
              <ResultCard key={i} result={r} />
            ))}
          </div>
        )}

        {/* Quality Comparison Table */}
        {qualityResults.length > 0 && (
          <Card className="mt-6 border-gray-700 bg-gray-900">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quality Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="pb-2 pr-4 text-left text-xs font-medium text-gray-500">Check</th>
                      {qualityResults.map((r, i) => (
                        <th key={i} className="pb-2 px-2 text-center text-xs font-medium text-gray-500">
                          <div className="flex items-center justify-center gap-1">
                            {r.tier === 'claude'
                              ? <Sparkles className="h-3 w-3 text-amber-400" />
                              : <Zap className="h-3 w-3 text-blue-400" />
                            }
                            {r.prospect.name.split(' ')[0]}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <QualityRow
                      label="Email 1 under 75 words?"
                      results={qualityResults.map(r => ({
                        name: r.prospect.name,
                        pass: r.emails[0] ? countWords(r.emails[0].body) <= 75 : null,
                      }))}
                    />
                    <QualityRow
                      label="Subject under 5 words?"
                      results={qualityResults.map(r => ({
                        name: r.prospect.name,
                        pass: r.emails[0] ? countWords(r.emails[0].subject) <= 5 : null,
                      }))}
                    />
                    <QualityRow
                      label="No dead language?"
                      results={qualityResults.map(r => ({
                        name: r.prospect.name,
                        pass: !hasDeadLanguage(r.emails),
                      }))}
                    />
                    <QualityRow
                      label="Opens with observation?"
                      results={qualityResults.map(r => ({
                        name: r.prospect.name,
                        pass: r.emails[0] ? !startsWithSelfIntro(r.emails[0].body) : null,
                      }))}
                    />
                    <QualityRow
                      label="Follow-ups change angle?"
                      results={qualityResults.map(r => ({
                        name: r.prospect.name,
                        pass: r.emails.length > 1 ? !hasJustFollowingUp(r.emails.slice(1)) : null,
                      }))}
                    />
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
