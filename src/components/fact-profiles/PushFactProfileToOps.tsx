import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/clientV2';
import { OpsTableService } from '@/lib/services/opsTableService';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { useAuth } from '@/lib/contexts/AuthContext';
import type { FactProfile, FactProfileResearchData } from '@/lib/types/factProfile';

interface PushFactProfileToOpsProps {
  profile: FactProfile;
  variant?: 'default' | 'outline';
  size?: 'default' | 'sm';
}

/** Map fact profile research data into Ops table columns + a single row of cell values. */
function buildColumnsAndCells(rd: FactProfileResearchData) {
  const columns: { key: string; label: string; type: 'text' | 'url' | 'tags' | 'number' }[] = [];
  const cells: Record<string, string> = {};

  // --- Company Overview ---
  const ov = rd?.company_overview;
  columns.push({ key: 'company_name', label: 'Company Name', type: 'text' });
  cells.company_name = ov?.name || '';

  columns.push({ key: 'tagline', label: 'Tagline', type: 'text' });
  cells.tagline = ov?.tagline || '';

  columns.push({ key: 'description', label: 'Description', type: 'text' });
  cells.description = ov?.description || '';

  columns.push({ key: 'website', label: 'Website', type: 'url' });
  cells.website = ov?.website || '';

  columns.push({ key: 'headquarters', label: 'Headquarters', type: 'text' });
  cells.headquarters = ov?.headquarters || '';

  columns.push({ key: 'founded_year', label: 'Founded', type: 'number' });
  cells.founded_year = ov?.founded_year?.toString() || '';

  columns.push({ key: 'company_type', label: 'Company Type', type: 'text' });
  cells.company_type = ov?.company_type || '';

  // --- Market Position ---
  const mp = rd?.market_position;
  columns.push({ key: 'industry', label: 'Industry', type: 'text' });
  cells.industry = mp?.industry || '';

  columns.push({ key: 'sub_industries', label: 'Sub-Industries', type: 'tags' });
  cells.sub_industries = mp?.sub_industries?.join(', ') || '';

  columns.push({ key: 'target_market', label: 'Target Market', type: 'text' });
  cells.target_market = mp?.target_market || '';

  columns.push({ key: 'differentiators', label: 'Differentiators', type: 'tags' });
  cells.differentiators = mp?.differentiators?.join(', ') || '';

  columns.push({ key: 'competitors', label: 'Competitors', type: 'tags' });
  cells.competitors = mp?.competitors?.join(', ') || '';

  // --- Products & Services ---
  const ps = rd?.products_services;
  columns.push({ key: 'products', label: 'Products', type: 'tags' });
  cells.products = ps?.products?.join(', ') || '';

  columns.push({ key: 'key_features', label: 'Key Features', type: 'tags' });
  cells.key_features = ps?.key_features?.join(', ') || '';

  columns.push({ key: 'use_cases', label: 'Use Cases', type: 'tags' });
  cells.use_cases = ps?.use_cases?.join(', ') || '';

  columns.push({ key: 'pricing_model', label: 'Pricing Model', type: 'text' });
  cells.pricing_model = ps?.pricing_model || '';

  // --- Team & Leadership ---
  const tl = rd?.team_leadership;
  columns.push({ key: 'employee_range', label: 'Employee Range', type: 'text' });
  cells.employee_range = tl?.employee_range || '';

  columns.push({ key: 'employee_count', label: 'Employee Count', type: 'number' });
  cells.employee_count = tl?.employee_count?.toString() || '';

  columns.push({ key: 'key_people', label: 'Key People', type: 'text' });
  cells.key_people = tl?.key_people?.map((p) => `${p.name} (${p.title})`).join('; ') || '';

  columns.push({ key: 'departments', label: 'Departments', type: 'tags' });
  cells.departments = tl?.departments?.join(', ') || '';

  columns.push({ key: 'hiring_signals', label: 'Hiring Signals', type: 'tags' });
  cells.hiring_signals = tl?.hiring_signals?.join(', ') || '';

  // --- Financials ---
  const fi = rd?.financials;
  columns.push({ key: 'revenue_range', label: 'Revenue Range', type: 'text' });
  cells.revenue_range = fi?.revenue_range || '';

  columns.push({ key: 'funding_status', label: 'Funding Status', type: 'text' });
  cells.funding_status = fi?.funding_status || '';

  columns.push({ key: 'total_raised', label: 'Total Raised', type: 'text' });
  cells.total_raised = fi?.total_raised || '';

  columns.push({ key: 'investors', label: 'Investors', type: 'tags' });
  cells.investors = fi?.investors?.join(', ') || '';

  // --- Technology ---
  const te = rd?.technology;
  columns.push({ key: 'tech_stack', label: 'Tech Stack', type: 'tags' });
  cells.tech_stack = te?.tech_stack?.join(', ') || '';

  columns.push({ key: 'platforms', label: 'Platforms', type: 'tags' });
  cells.platforms = te?.platforms?.join(', ') || '';

  columns.push({ key: 'integrations', label: 'Integrations', type: 'tags' });
  cells.integrations = te?.integrations?.join(', ') || '';

  // --- Ideal Customer Indicators ---
  const ic = rd?.ideal_customer_indicators;
  columns.push({ key: 'target_industries', label: 'Target Industries', type: 'tags' });
  cells.target_industries = ic?.target_industries?.join(', ') || '';

  columns.push({ key: 'target_company_sizes', label: 'Target Company Sizes', type: 'tags' });
  cells.target_company_sizes = ic?.target_company_sizes?.join(', ') || '';

  columns.push({ key: 'target_roles', label: 'Target Roles', type: 'tags' });
  cells.target_roles = ic?.target_roles?.join(', ') || '';

  columns.push({ key: 'pain_points', label: 'Pain Points', type: 'tags' });
  cells.pain_points = ic?.pain_points?.join(', ') || '';

  columns.push({ key: 'buying_signals', label: 'Buying Signals', type: 'tags' });
  cells.buying_signals = ic?.buying_signals?.join(', ') || '';

  columns.push({ key: 'value_propositions', label: 'Value Propositions', type: 'tags' });
  cells.value_propositions = ic?.value_propositions?.join(', ') || '';

  return { columns, cells };
}

export function PushFactProfileToOps({ profile, variant = 'outline', size = 'default' }: PushFactProfileToOpsProps) {
  const navigate = useNavigate();
  const orgId = useActiveOrgId();
  const { userId } = useAuth();
  const [loading, setLoading] = useState(false);

  const handlePush = async () => {
    if (!orgId || !userId) {
      toast.error('Missing org or user context');
      return;
    }

    if (!profile.research_data) {
      toast.error('No research data to push');
      return;
    }

    setLoading(true);
    try {
      const service = new OpsTableService(supabase);

      // 1. Create the table
      const table = await service.createTable({
        organizationId: orgId,
        createdBy: userId,
        name: `${profile.company_name} — Fact Profile`,
        description: `Research data from Fact Profile: ${profile.company_name}. Profile type: ${profile.profile_type}. Created from fact profile ${profile.id}.`,
        sourceType: 'manual',
        sourceQuery: { factProfileId: profile.id },
      });

      // 2. Build columns from research data
      const { columns, cells } = buildColumnsAndCells(profile.research_data);

      // Add columns sequentially (position matters)
      for (let i = 0; i < columns.length; i++) {
        const col = columns[i];
        await service.addColumn({
          tableId: table.id,
          key: col.key,
          label: col.label,
          columnType: col.type === 'tags' ? 'text' : col.type,
          position: i,
        });
      }

      // 3. Add the company as the first row
      await service.addRows(table.id, [
        {
          sourceId: profile.id,
          sourceData: { factProfileId: profile.id, companyName: profile.company_name },
          cells,
        },
      ]);

      toast.success('Pushed to Ops table');
      navigate(`/ops/${table.id}`);
    } catch (err) {
      console.error('[PushFactProfileToOps] Error:', err);
      toast.error('Failed to create Ops table');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant={variant} size={size} onClick={handlePush} disabled={loading} className="gap-1.5">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Table2 className="h-4 w-4" />}
      Push to Ops
    </Button>
  );
}
