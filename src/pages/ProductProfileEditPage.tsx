import { Helmet } from 'react-helmet-async';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Loader2,
  Sparkles,
  ClipboardPaste,
  Wand2,
  FileJson,
  Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useProductProfile, useUpdateProductProfile } from '@/lib/hooks/useProductProfiles';
import type { ProductProfileResearchData } from '@/lib/types/productProfile';
import { useCopilot } from '@/lib/contexts/CopilotContext';

const CATEGORY_OPTIONS = [
  'SaaS',
  'Service',
  'Platform',
  'Hardware',
  'Consulting',
  'Other',
] as const;

export default function ProductProfileEditPage() {
  const navigate = useNavigate();
  const { id, productId } = useParams<{ id?: string; productId?: string }>();
  const resolvedProductId = productId ?? id;
  const { data: profile, isLoading } = useProductProfile(resolvedProductId);
  const updateMutation = useUpdateProductProfile();
  const { openCopilot } = useCopilot();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [productUrl, setProductUrl] = useState('');
  const [copilotPrompt, setCopilotPrompt] = useState('');
  const [pastedJson, setPastedJson] = useState('');
  const [isApplyingJson, setIsApplyingJson] = useState(false);

  const canSave = useMemo(() => Boolean(name.trim()), [name]);

  const sectionCount = useMemo(() => {
    if (!profile?.research_data) return { complete: 0, total: 10 };
    const rd = profile.research_data;
    const checks = [
      Boolean(rd.overview?.description || rd.overview?.tagline),
      Boolean(rd.target_market?.industries?.length || rd.target_market?.buyer_personas?.length),
      Boolean(rd.value_propositions?.primary_value_prop || rd.value_propositions?.supporting_points?.length),
      Boolean(rd.pricing?.model || rd.pricing?.tiers?.length || rd.pricing?.price_range),
      Boolean(rd.competitors?.direct_competitors?.length || rd.competitors?.indirect_competitors?.length),
      Boolean(rd.use_cases?.primary_use_cases?.length || rd.use_cases?.secondary_use_cases?.length),
      Boolean(rd.differentiators?.key_differentiators?.length || rd.differentiators?.unique_capabilities?.length),
      Boolean(rd.pain_points_solved?.pain_points?.length),
      Boolean(rd.key_features?.features?.length),
      Boolean(rd.integrations?.native_integrations?.length || rd.integrations?.platforms?.length),
    ];
    return { complete: checks.filter(Boolean).length, total: checks.length };
  }, [profile?.research_data]);

  const defaultCopilotPrompt = useMemo(() => {
    const safeName = name || profile?.name || 'this product/service';
    const safeDescription = description || profile?.description || 'No description provided yet.';
    const safeCategory = category || profile?.category || 'Service';
    const safeUrl = productUrl || profile?.product_url || 'N/A';

    return `Help me build a COMPLETE Product Profile for ${safeName}.

Context:
- Category: ${safeCategory}
- Description: ${safeDescription}
- URL: ${safeUrl}

Ask me clarifying questions if needed, then return a SINGLE valid JSON object (no markdown) with this exact shape:
{
  "overview": { "description": "", "tagline": "", "category": "", "product_url": "" },
  "target_market": { "industries": [], "company_sizes": [], "regions": [], "buyer_personas": [] },
  "value_propositions": { "primary_value_prop": "", "supporting_points": [], "proof_points": [] },
  "pricing": { "model": "", "tiers": [{"name":"", "price":"", "features":[]}], "price_range": "", "billing_options": [] },
  "competitors": { "direct_competitors": [{"name":"", "domain":"", "differentiator":""}], "indirect_competitors": [] },
  "use_cases": { "primary_use_cases": [{"title":"", "description":"", "persona":""}], "secondary_use_cases": [] },
  "differentiators": { "key_differentiators": [], "unique_capabilities": [], "awards": [] },
  "pain_points_solved": { "pain_points": [{"pain":"", "solution":"", "impact":""}] },
  "key_features": { "features": [{"name":"", "description":"", "category":""}] },
  "integrations": { "native_integrations": [], "api_available": false, "platforms": [] }
}

Focus on realistic B2B positioning and avoid placeholders where possible.`;
  }, [name, description, category, productUrl, profile?.name, profile?.description, profile?.category, profile?.product_url]);

  useEffect(() => {
    if (!profile) return;
    setName(profile.name ?? '');
    setDescription(profile.description ?? '');
    setCategory(profile.category ?? '');
    setProductUrl(profile.product_url ?? '');
    setCopilotPrompt(defaultCopilotPrompt);
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    setCopilotPrompt(defaultCopilotPrompt);
  }, [defaultCopilotPrompt, profile]);

  const stripCodeFence = (raw: string): string => {
    const trimmed = raw.trim();
    if (!trimmed.startsWith('```')) return trimmed;
    return trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
  };

  const isObject = (value: unknown): value is Record<string, unknown> => {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  };

  const handleOpenCopilot = () => {
    const prompt = copilotPrompt.trim();
    if (!prompt) {
      toast.error('Prompt is empty');
      return;
    }
    openCopilot(prompt, true);
    navigate('/copilot');
  };

  const handleApplyJson = async () => {
    if (!profile) return;
    const raw = pastedJson.trim();
    if (!raw) {
      toast.error('Paste JSON first');
      return;
    }

    setIsApplyingJson(true);
    try {
      const parsed = JSON.parse(stripCodeFence(raw));
      if (!isObject(parsed)) {
        throw new Error('JSON must be an object');
      }

      const existing = profile.research_data ?? ({} as ProductProfileResearchData);
      const merged: ProductProfileResearchData = {
        ...existing,
        ...parsed,
      } as ProductProfileResearchData;

      await updateMutation.mutateAsync({
        id: profile.id,
        payload: { research_data: merged },
        silent: true,
      });
      toast.success('AI profile data applied');
      setPastedJson('');
      navigate(`/profiles/products/${profile.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid JSON';
      toast.error(`Failed to apply JSON: ${message}`);
    } finally {
      setIsApplyingJson(false);
    }
  };

  const handleSave = async () => {
    if (!profile || !canSave) return;
    await updateMutation.mutateAsync({
      id: profile.id,
      payload: {
        name: name.trim(),
        description: description.trim() || '',
        category: category || '',
        product_url: productUrl.trim() || '',
      },
    });
    toast.success('Profile basics saved');
    navigate(`/profiles/products/${profile.id}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-brand-blue" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-8">
        <p className="text-[#64748B]">Product profile not found.</p>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Edit {profile.name} — Product Profile | 60</title>
      </Helmet>
      <div className="container mx-auto max-w-5xl px-3 sm:px-4 lg:px-6 py-6 space-y-6">
        <div className="rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-gradient-to-r from-white to-[#F8FAFC] dark:from-gray-900 dark:to-gray-900/80 p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-semibold text-[#1E293B] dark:text-gray-100">
                Edit Product Profile
              </h1>
              <p className="text-sm text-[#64748B] dark:text-gray-400 mt-1">
                Improve the basics and use AI Copilot to generate the full research profile.
              </p>
            </div>
            <Badge variant="secondary" className="text-xs">
              {sectionCount.complete}/{sectionCount.total} sections complete
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 p-6 space-y-5">
            <h2 className="text-sm font-semibold text-[#1E293B] dark:text-gray-100">
              Profile Basics
            </h2>

            <div className="space-y-2">
              <Label htmlFor="pp-name">Name</Label>
              <Input
                id="pp-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Product name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pp-description">Description</Label>
              <Textarea
                id="pp-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                placeholder="Brief description"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pp-category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="pp-category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pp-url">Product URL</Label>
              <Input
                id="pp-url"
                value={productUrl}
                onChange={(e) => setProductUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => navigate(-1)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!canSave || updateMutation.isPending}>
                <Save className="h-4 w-4 mr-2" />
                {updateMutation.isPending ? 'Saving...' : 'Save Basics'}
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 p-6 space-y-5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-blue" />
              <h2 className="text-sm font-semibold text-[#1E293B] dark:text-gray-100">
                AI Copilot Builder
              </h2>
            </div>

            <p className="text-xs text-[#64748B] dark:text-gray-400">
              Open a guided Copilot chat to generate a complete structured profile, then paste the JSON output below.
            </p>

            <div className="space-y-2">
              <Label htmlFor="copilot-prompt">Copilot Prompt</Label>
              <Textarea
                id="copilot-prompt"
                value={copilotPrompt}
                onChange={(e) => setCopilotPrompt(e.target.value)}
                rows={10}
              />
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={handleOpenCopilot}>
                <Wand2 className="h-4 w-4 mr-2" />
                Open in Copilot Chat
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(copilotPrompt);
                  toast.success('Prompt copied');
                }}
              >
                Copy Prompt
              </Button>
            </div>

            <div className="pt-4 border-t border-[#E2E8F0] dark:border-gray-700/50 space-y-2">
              <Label htmlFor="profile-json">Paste Copilot JSON Output</Label>
              <Textarea
                id="profile-json"
                value={pastedJson}
                onChange={(e) => setPastedJson(e.target.value)}
                placeholder="Paste JSON object returned by Copilot..."
                rows={8}
              />
              <Button onClick={handleApplyJson} disabled={isApplyingJson || !pastedJson.trim()}>
                {isApplyingJson ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Applying...
                  </>
                ) : (
                  <>
                    <ClipboardPaste className="h-4 w-4 mr-2" />
                    Apply JSON to Full Profile
                  </>
                )}
              </Button>
            </div>

            <div className="rounded-lg border border-[#E2E8F0] dark:border-gray-700/50 bg-[#F8FAFC] dark:bg-gray-800/30 p-3 text-xs text-[#64748B] dark:text-gray-400 flex items-start gap-2">
              <FileJson className="h-4 w-4 mt-0.5 shrink-0" />
              AI-generated JSON is merged into `research_data` and powers all full-profile sections (overview, target market, pricing, competitors, use cases, differentiators, pain points, features, integrations).
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
