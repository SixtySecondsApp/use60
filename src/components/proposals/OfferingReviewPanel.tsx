import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import {
  CheckCircle,
  Loader2,
  Plus,
  X,
  RefreshCw,
  Trash2,
  Package,
  Wrench,
  BookOpen,
  DollarSign,
  Star,
} from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

interface Product {
  name: string;
  description: string;
  key_features: string[];
  target_audience: string;
}

interface Service {
  name: string;
  description: string;
  deliverables: string[];
  typical_duration: string;
}

interface CaseStudy {
  client_name: string;
  industry: string;
  challenge: string;
  solution: string;
  outcome: string;
  metrics: string[];
}

interface PricingModel {
  model_type: string;
  description: string;
  typical_range: string;
}

interface OfferingProfile {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  products_json: Product[];
  services_json: Service[];
  case_studies_json: CaseStudy[];
  pricing_models_json: PricingModel[];
  differentiators_json: string[];
  source_document_id: string | null;
  is_active: boolean;
}

export interface OfferingReviewPanelProps {
  profileId: string;
  orgId: string;
  onApprove?: () => void;
  onReject?: () => void;
}

// =============================================================================
// Helpers
// =============================================================================

function newProduct(): Product {
  return { name: '', description: '', key_features: [], target_audience: '' };
}

function newService(): Service {
  return { name: '', description: '', deliverables: [], typical_duration: '' };
}

function newCaseStudy(): CaseStudy {
  return {
    client_name: '',
    industry: '',
    challenge: '',
    solution: '',
    outcome: '',
    metrics: [],
  };
}

function newPricingModel(): PricingModel {
  return { model_type: '', description: '', typical_range: '' };
}

// =============================================================================
// Skeleton
// =============================================================================

function ReviewSkeleton() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-12 w-full rounded-lg" />
      <Skeleton className="h-12 w-full rounded-lg" />
      <Skeleton className="h-12 w-full rounded-lg" />
      <Skeleton className="h-12 w-full rounded-lg" />
      <Skeleton className="h-12 w-full rounded-lg" />
    </div>
  );
}

// =============================================================================
// Inline editable tag list (for key_features, deliverables, metrics)
// =============================================================================

interface TagListEditorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

function TagListEditor({ tags, onChange, placeholder = 'Add item...' }: TagListEditorProps) {
  const [inputValue, setInputValue] = useState('');

  const addTag = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    onChange([...tags, trimmed]);
    setInputValue('');
  };

  const removeTag = (index: number) => {
    onChange(tags.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag, i) => (
          <Badge key={i} variant="secondary" className="gap-1 pr-1">
            {tag}
            <button
              onClick={() => removeTag(i)}
              className="ml-0.5 rounded-full hover:bg-slate-200 dark:hover:bg-gray-600 p-0.5"
              title="Remove"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="h-7 text-xs"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addTag}
          className="h-7 px-2 text-xs"
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Empty state
// =============================================================================

interface EmptyCategoryProps {
  label: string;
  onAdd: () => void;
}

function EmptyCategory({ label, onAdd }: EmptyCategoryProps) {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-center">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        No {label} extracted from document
      </p>
      <Button variant="outline" size="sm" onClick={onAdd} className="mt-3 text-xs gap-1.5">
        <Plus className="h-3.5 w-3.5" />
        Add {label.replace(/s$/, '')} manually
      </Button>
    </div>
  );
}

// =============================================================================
// Main component
// =============================================================================

export default function OfferingReviewPanel({
  profileId,
  orgId,
  onApprove,
  onReject,
}: OfferingReviewPanelProps) {
  const queryClient = useQueryClient();

  // ----- Data loading -----
  const { data: profile, isLoading, error } = useQuery({
    queryKey: ['offering-profile', profileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('org_offering_profiles')
        .select(
          'id, org_id, name, description, products_json, services_json, case_studies_json, pricing_models_json, differentiators_json, source_document_id, is_active'
        )
        .eq('id', profileId)
        .single();

      if (error) throw new Error(error.message);
      return data as OfferingProfile;
    },
    staleTime: 0,
  });

  // ----- Local edit state (populated once data loads) -----
  const [products, setProducts] = useState<Product[] | null>(null);
  const [services, setServices] = useState<Service[] | null>(null);
  const [caseStudies, setCaseStudies] = useState<CaseStudy[] | null>(null);
  const [pricingModels, setPricingModels] = useState<PricingModel[] | null>(null);
  const [differentiators, setDifferentiators] = useState<string[] | null>(null);

  // Seed local state from fetched data (once only)
  if (profile && products === null) {
    setProducts(profile.products_json ?? []);
    setServices(profile.services_json ?? []);
    setCaseStudies(profile.case_studies_json ?? []);
    setPricingModels(profile.pricing_models_json ?? []);
    setDifferentiators(profile.differentiators_json ?? []);
  }

  // ----- Approve mutation -----
  const approveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('org_offering_profiles')
        .update({
          products_json: products,
          services_json: services,
          case_studies_json: caseStudies,
          pricing_models_json: pricingModels,
          differentiators_json: differentiators,
          is_active: true,
        })
        .eq('id', profileId);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success('Offering profile approved and saved');
      queryClient.invalidateQueries({ queryKey: ['offering-profile', profileId] });
      queryClient.invalidateQueries({ queryKey: ['offering-profiles', orgId] });
      onApprove?.();
    },
    onError: (err: Error) => {
      toast.error(`Failed to save: ${err.message}`);
    },
  });

  // ----- Re-extract mutation -----
  const reExtractMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.source_document_id) {
        throw new Error('No source document available for re-extraction');
      }
      const { data, error } = await supabase.functions.invoke('offering-extract', {
        body: { asset_id: profile.source_document_id, org_id: orgId },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      toast.success('Re-extraction complete — review the updated data below');
      // Reset local state so it re-seeds from fresh DB data
      setProducts(null);
      setServices(null);
      setCaseStudies(null);
      setPricingModels(null);
      setDifferentiators(null);
      queryClient.invalidateQueries({ queryKey: ['offering-profile', profileId] });
    },
    onError: (err: Error) => {
      toast.error(`Re-extraction failed: ${err.message}`);
    },
  });

  // ----- Discard mutation -----
  const discardMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('org_offering_profiles')
        .delete()
        .eq('id', profileId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success('Offering profile discarded');
      onReject?.();
    },
    onError: (err: Error) => {
      toast.error(`Failed to discard: ${err.message}`);
    },
  });

  // ----- Render guards -----
  if (isLoading) return <ReviewSkeleton />;

  if (error || !profile) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center space-y-2">
        <p className="text-sm text-red-500 dark:text-red-400">
          {error instanceof Error ? error.message : 'Failed to load offering profile'}
        </p>
        <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ['offering-profile', profileId] })}>
          Retry
        </Button>
      </div>
    );
  }

  if (products === null) return <ReviewSkeleton />;

  const isBusy =
    approveMutation.isPending || reExtractMutation.isPending || discardMutation.isPending;

  const totalItems =
    products.length +
    services.length +
    (caseStudies?.length ?? 0) +
    (pricingModels?.length ?? 0) +
    (differentiators?.length ?? 0);

  // ----- Product editors -----
  const updateProduct = (index: number, field: keyof Product, value: Product[keyof Product]) => {
    setProducts((prev) =>
      prev ? prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)) : prev
    );
  };

  const removeProduct = (index: number) => {
    setProducts((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
  };

  // ----- Service editors -----
  const updateService = (index: number, field: keyof Service, value: Service[keyof Service]) => {
    setServices((prev) =>
      prev ? prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)) : prev
    );
  };

  const removeService = (index: number) => {
    setServices((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
  };

  // ----- Case study editors -----
  const updateCaseStudy = (
    index: number,
    field: keyof CaseStudy,
    value: CaseStudy[keyof CaseStudy]
  ) => {
    setCaseStudies((prev) =>
      prev ? prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)) : prev
    );
  };

  const removeCaseStudy = (index: number) => {
    setCaseStudies((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
  };

  // ----- Pricing model editors -----
  const updatePricingModel = (
    index: number,
    field: keyof PricingModel,
    value: string
  ) => {
    setPricingModels((prev) =>
      prev ? prev.map((m, i) => (i === index ? { ...m, [field]: value } : m)) : prev
    );
  };

  const removePricingModel = (index: number) => {
    setPricingModels((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
  };

  // ----- Differentiator editors -----
  const updateDifferentiator = (index: number, value: string) => {
    setDifferentiators((prev) =>
      prev ? prev.map((d, i) => (i === index ? value : d)) : prev
    );
  };

  const removeDifferentiator = (index: number) => {
    setDifferentiators((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Review Extracted Offering
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {profile.name} &middot; {totalItems} items extracted &mdash; edit any field before approving
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            disabled={isBusy || !profile.source_document_id}
            onClick={() => reExtractMutation.mutate()}
            title={!profile.source_document_id ? 'No source document available' : undefined}
            className="text-xs gap-1.5"
          >
            {reExtractMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Re-extract
          </Button>
        </div>
      </div>

      <Separator />

      {/* Accordion categories */}
      <Accordion type="multiple" defaultValue={['products', 'services', 'case_studies', 'pricing', 'differentiators']} className="space-y-2">

        {/* Products */}
        <AccordionItem value="products" className="border border-gray-200 dark:border-gray-700 rounded-lg px-4 [&_[data-state=open]]:pb-0">
          <AccordionTrigger className="text-sm font-medium gap-2 hover:no-underline">
            <span className="flex items-center gap-2">
              <Package className="h-4 w-4 text-blue-500 shrink-0" />
              Products
              <Badge variant="secondary" className="ml-1">{products.length}</Badge>
            </span>
          </AccordionTrigger>
          <AccordionContent className="pt-2">
            {products.length === 0 ? (
              <EmptyCategory label="products" onAdd={() => setProducts((p) => [...(p ?? []), newProduct()])} />
            ) : (
              <div className="space-y-3 pb-2">
                {products.map((product, index) => (
                  <Card key={index} className="border border-gray-100 dark:border-gray-700/50">
                    <CardContent className="p-3 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <Input
                          value={product.name}
                          onChange={(e) => updateProduct(index, 'name', e.target.value)}
                          placeholder="Product name"
                          className="h-8 text-sm font-medium"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeProduct(index)}
                          className="h-8 w-8 p-0 text-gray-400 hover:text-red-500 shrink-0"
                          title="Remove product"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <Textarea
                        value={product.description}
                        onChange={(e) => updateProduct(index, 'description', e.target.value)}
                        placeholder="Description"
                        rows={2}
                        className="text-xs resize-none"
                      />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Target audience</p>
                          <Input
                            value={product.target_audience}
                            onChange={(e) => updateProduct(index, 'target_audience', e.target.value)}
                            placeholder="e.g. Mid-market SaaS companies"
                            className="h-7 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Key features</p>
                          <TagListEditor
                            tags={product.key_features}
                            onChange={(tags) => updateProduct(index, 'key_features', tags)}
                            placeholder="Add feature..."
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setProducts((p) => [...(p ?? []), newProduct()])}
                  className="w-full text-xs gap-1.5 border-dashed"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add product
                </Button>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Services */}
        <AccordionItem value="services" className="border border-gray-200 dark:border-gray-700 rounded-lg px-4 [&_[data-state=open]]:pb-0">
          <AccordionTrigger className="text-sm font-medium gap-2 hover:no-underline">
            <span className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-purple-500 shrink-0" />
              Services
              <Badge variant="secondary" className="ml-1">{services.length}</Badge>
            </span>
          </AccordionTrigger>
          <AccordionContent className="pt-2">
            {services.length === 0 ? (
              <EmptyCategory label="services" onAdd={() => setServices((s) => [...(s ?? []), newService()])} />
            ) : (
              <div className="space-y-3 pb-2">
                {services.map((service, index) => (
                  <Card key={index} className="border border-gray-100 dark:border-gray-700/50">
                    <CardContent className="p-3 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <Input
                          value={service.name}
                          onChange={(e) => updateService(index, 'name', e.target.value)}
                          placeholder="Service name"
                          className="h-8 text-sm font-medium"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeService(index)}
                          className="h-8 w-8 p-0 text-gray-400 hover:text-red-500 shrink-0"
                          title="Remove service"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <Textarea
                        value={service.description}
                        onChange={(e) => updateService(index, 'description', e.target.value)}
                        placeholder="Description"
                        rows={2}
                        className="text-xs resize-none"
                      />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Typical duration</p>
                          <Input
                            value={service.typical_duration}
                            onChange={(e) => updateService(index, 'typical_duration', e.target.value)}
                            placeholder="e.g. 4–6 weeks"
                            className="h-7 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Deliverables</p>
                          <TagListEditor
                            tags={service.deliverables}
                            onChange={(tags) => updateService(index, 'deliverables', tags)}
                            placeholder="Add deliverable..."
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setServices((s) => [...(s ?? []), newService()])}
                  className="w-full text-xs gap-1.5 border-dashed"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add service
                </Button>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Case Studies */}
        <AccordionItem value="case_studies" className="border border-gray-200 dark:border-gray-700 rounded-lg px-4 [&_[data-state=open]]:pb-0">
          <AccordionTrigger className="text-sm font-medium gap-2 hover:no-underline">
            <span className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-emerald-500 shrink-0" />
              Case Studies
              <Badge variant="secondary" className="ml-1">{caseStudies?.length ?? 0}</Badge>
            </span>
          </AccordionTrigger>
          <AccordionContent className="pt-2">
            {!caseStudies || caseStudies.length === 0 ? (
              <EmptyCategory label="case studies" onAdd={() => setCaseStudies((c) => [...(c ?? []), newCaseStudy()])} />
            ) : (
              <div className="space-y-3 pb-2">
                {caseStudies.map((cs, index) => (
                  <Card key={index} className="border border-gray-100 dark:border-gray-700/50">
                    <CardContent className="p-3 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex gap-2 flex-1">
                          <Input
                            value={cs.client_name}
                            onChange={(e) => updateCaseStudy(index, 'client_name', e.target.value)}
                            placeholder="Client name"
                            className="h-8 text-sm font-medium"
                          />
                          <Input
                            value={cs.industry}
                            onChange={(e) => updateCaseStudy(index, 'industry', e.target.value)}
                            placeholder="Industry"
                            className="h-8 text-sm w-36"
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeCaseStudy(index)}
                          className="h-8 w-8 p-0 text-gray-400 hover:text-red-500 shrink-0"
                          title="Remove case study"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Challenge</p>
                          <Textarea
                            value={cs.challenge}
                            onChange={(e) => updateCaseStudy(index, 'challenge', e.target.value)}
                            placeholder="What was the challenge?"
                            rows={2}
                            className="text-xs resize-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Solution</p>
                          <Textarea
                            value={cs.solution}
                            onChange={(e) => updateCaseStudy(index, 'solution', e.target.value)}
                            placeholder="What was delivered?"
                            rows={2}
                            className="text-xs resize-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Outcome</p>
                          <Textarea
                            value={cs.outcome}
                            onChange={(e) => updateCaseStudy(index, 'outcome', e.target.value)}
                            placeholder="What was the result?"
                            rows={2}
                            className="text-xs resize-none"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Metrics</p>
                        <TagListEditor
                          tags={cs.metrics}
                          onChange={(tags) => updateCaseStudy(index, 'metrics', tags)}
                          placeholder="e.g. 3x revenue growth"
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCaseStudies((c) => [...(c ?? []), newCaseStudy()])}
                  className="w-full text-xs gap-1.5 border-dashed"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add case study
                </Button>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Pricing Models */}
        <AccordionItem value="pricing" className="border border-gray-200 dark:border-gray-700 rounded-lg px-4 [&_[data-state=open]]:pb-0">
          <AccordionTrigger className="text-sm font-medium gap-2 hover:no-underline">
            <span className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-amber-500 shrink-0" />
              Pricing Models
              <Badge variant="secondary" className="ml-1">{pricingModels?.length ?? 0}</Badge>
            </span>
          </AccordionTrigger>
          <AccordionContent className="pt-2">
            {!pricingModels || pricingModels.length === 0 ? (
              <EmptyCategory label="pricing models" onAdd={() => setPricingModels((m) => [...(m ?? []), newPricingModel()])} />
            ) : (
              <div className="space-y-3 pb-2">
                {pricingModels.map((model, index) => (
                  <Card key={index} className="border border-gray-100 dark:border-gray-700/50">
                    <CardContent className="p-3 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <Input
                          value={model.model_type}
                          onChange={(e) => updatePricingModel(index, 'model_type', e.target.value)}
                          placeholder="Model type (e.g. subscription, project-based)"
                          className="h-8 text-sm font-medium"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removePricingModel(index)}
                          className="h-8 w-8 p-0 text-gray-400 hover:text-red-500 shrink-0"
                          title="Remove pricing model"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-[1fr_160px]">
                        <Textarea
                          value={model.description}
                          onChange={(e) => updatePricingModel(index, 'description', e.target.value)}
                          placeholder="Description of this pricing model"
                          rows={2}
                          className="text-xs resize-none"
                        />
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Typical range</p>
                          <Input
                            value={model.typical_range}
                            onChange={(e) => updatePricingModel(index, 'typical_range', e.target.value)}
                            placeholder="e.g. $5k–$20k/mo"
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPricingModels((m) => [...(m ?? []), newPricingModel()])}
                  className="w-full text-xs gap-1.5 border-dashed"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add pricing model
                </Button>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Differentiators */}
        <AccordionItem value="differentiators" className="border border-gray-200 dark:border-gray-700 rounded-lg px-4 [&_[data-state=open]]:pb-0">
          <AccordionTrigger className="text-sm font-medium gap-2 hover:no-underline">
            <span className="flex items-center gap-2">
              <Star className="h-4 w-4 text-rose-500 shrink-0" />
              Differentiators
              <Badge variant="secondary" className="ml-1">{differentiators?.length ?? 0}</Badge>
            </span>
          </AccordionTrigger>
          <AccordionContent className="pt-2">
            {!differentiators || differentiators.length === 0 ? (
              <EmptyCategory
                label="differentiators"
                onAdd={() => setDifferentiators((d) => [...(d ?? []), ''])}
              />
            ) : (
              <div className="space-y-2 pb-2">
                {differentiators.map((diff, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={diff}
                      onChange={(e) => updateDifferentiator(index, e.target.value)}
                      placeholder="What makes your offering unique?"
                      className="h-8 text-sm"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeDifferentiator(index)}
                      className="h-8 w-8 p-0 text-gray-400 hover:text-red-500 shrink-0"
                      title="Remove"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDifferentiators((d) => [...(d ?? []), ''])}
                  className="w-full text-xs gap-1.5 border-dashed mt-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add differentiator
                </Button>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Separator />

      {/* Action row */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => discardMutation.mutate()}
          disabled={isBusy}
          className="text-xs text-gray-400 hover:text-red-500 gap-1.5"
        >
          {discardMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          Discard
        </Button>

        <Button
          onClick={() => approveMutation.mutate()}
          disabled={isBusy}
          className="gap-2"
        >
          {approveMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle className="h-4 w-4" />
              Approve &amp; Save
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
