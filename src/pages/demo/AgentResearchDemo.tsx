import { useState, useEffect } from 'react';
import { Brain, Play, RefreshCw, Trash2, Loader2, Search, Plus, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrg } from '@/lib/contexts/OrgContext';
import { NaturalLanguageQueryBar, QueryParseResult } from '@/components/prospecting/NaturalLanguageQueryBar';
import { SourcePreferenceSelector } from '@/components/prospecting/SourcePreferenceSelector';
import { ProgressIndicator } from '@/components/prospecting/ProgressIndicator';
import { QueryResultsPreview } from '@/components/prospecting/QueryResultsPreview';
import { SourcePreference } from '@/lib/types/apifyQuery';
import { NormalizedResult } from '@/lib/utils/apifyResultNormalizer';

interface DemoRow {
  id: string;
  company_name: string;
  domain: string;
  industry: string;
  employee_count: string;
}

interface AgentRun {
  id: string;
  row_id: string;
  status: 'queued' | 'in_progress' | 'complete' | 'failed';
  result_text?: string;
  confidence?: 'high' | 'medium' | 'low';
  providers_used?: string[];
  sources?: Array<{ url: string; title: string; provider: string }>;
  error_message?: string;
  depth_level_used?: 'low' | 'medium' | 'high';
  chain_log?: Array<{ step: number; provider: string; result: string }>;
}

const SAMPLE_DATA = [
  { company_name: 'Stripe', domain: 'stripe.com', industry: 'Payments', employee_count: '8000' },
  { company_name: 'Notion', domain: 'notion.so', industry: 'Productivity', employee_count: '400' },
  { company_name: 'Linear', domain: 'linear.app', industry: 'Project Management', employee_count: '80' },
  { company_name: 'Vercel', domain: 'vercel.com', industry: 'Developer Tools', employee_count: '300' },
  { company_name: 'Supabase', domain: 'supabase.com', industry: 'Database', employee_count: '100' }
];

const TEST_PROMPTS = [
  {
    name: 'CRM Technology',
    prompt: 'What CRM software does {{company_name}} use? Check their website {{domain}} and tech stack.',
    depth: 'medium' as const,
    outputFormat: 'single_value' as const
  },
  {
    name: 'Pricing Model',
    prompt: 'What is {{company_name}}\'s pricing model? Are they freemium, enterprise-only, or usage-based? Visit {{domain}} for details.',
    depth: 'high' as const,
    outputFormat: 'free_text' as const
  },
  {
    name: 'Salesforce Integration',
    prompt: 'Does {{company_name}} have a Salesforce integration? Answer yes or no.',
    depth: 'low' as const,
    outputFormat: 'yes_no' as const
  },
  {
    name: 'Recent Funding',
    prompt: 'What is {{company_name}}\'s most recent funding round? Include amount and date if available.',
    depth: 'medium' as const,
    outputFormat: 'single_value' as const
  },
  {
    name: 'Competitors',
    prompt: 'List the top 3 competitors of {{company_name}} in the {{industry}} industry.',
    depth: 'high' as const,
    outputFormat: 'list' as const
  }
];

export default function AgentResearchDemo() {
  const { user } = useAuth();
  const { activeOrgId } = useOrg();

  const [promptTemplate, setPromptTemplate] = useState('');
  const [researchDepth, setResearchDepth] = useState<'low' | 'medium' | 'high'>('medium');
  const [outputFormat, setOutputFormat] = useState<'free_text' | 'single_value' | 'yes_no' | 'url' | 'list'>('free_text');
  const [sourcePerplexity, setSourcePerplexity] = useState(true);
  const [sourceExa, setSourceExa] = useState(true);
  const [sourceApify, setSourceApify] = useState(true);

  const [demoTableId, setDemoTableId] = useState<string | null>(null);
  const [agentColumnId, setAgentColumnId] = useState<string | null>(null);
  const [demoRows, setDemoRows] = useState<DemoRow[]>([]);
  const [agentRuns, setAgentRuns] = useState<Record<string, AgentRun>>({});
  const [isInitializing, setIsInitializing] = useState(true);
  const [isRunning, setIsRunning] = useState(false);

  // Apollo import
  const [apolloDialogOpen, setApolloDialogOpen] = useState(false);
  const [apolloSearchQuery, setApolloSearchQuery] = useState('');
  const [apolloResults, setApolloResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());

  // Natural Language Query state
  const [selectedSources, setSelectedSources] = useState<SourcePreference[]>([]);
  const [queryResults, setQueryResults] = useState<NormalizedResult[]>([]);
  const [isQuerying, setIsQuerying] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [lastParsedQuery, setLastParsedQuery] = useState<QueryParseResult | null>(null);
  const [showRetryOptions, setShowRetryOptions] = useState(false);
  const [retryCountdown, setRetryCountdown] = useState(0);
  const [suggestedModifications, setSuggestedModifications] = useState<string[]>([]);
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const [showIntegrationsLink, setShowIntegrationsLink] = useState(false);

  // Initialize demo environment
  useEffect(() => {
    if (!user || !activeOrgId) return;

    const initDemo = async () => {
      try {
        setIsInitializing(true);

        // 1. Create or get demo table
        const tableName = `AI Research Demo - ${new Date().toLocaleDateString()}`;
        const { data: existingTables } = await supabase
          .from('dynamic_tables')
          .select('id')
          .eq('organization_id', activeOrgId)
          .eq('name', tableName)
          .maybeSingle();

        let tableId = existingTables?.id;

        if (!tableId) {
          const { data: newTable, error: tableError } = await supabase
            .from('dynamic_tables')
            .insert({
              organization_id: activeOrgId,
              name: tableName,
              description: 'Demo table for testing AI Research Agent',
              created_by: user.id
            })
            .select('id')
            .single();

          if (tableError) throw tableError;
          tableId = newTable.id;

          // Create base columns
          const baseColumns = [
            { name: 'company_name', data_type: 'text', order_index: 0 },
            { name: 'domain', data_type: 'text', order_index: 1 },
            { name: 'industry', data_type: 'text', order_index: 2 },
            { name: 'employee_count', data_type: 'text', order_index: 3 }
          ];

          for (const col of baseColumns) {
            await supabase.from('dynamic_table_columns').insert({
              table_id: tableId,
              ...col
            });
          }
        }

        setDemoTableId(tableId);

        // 2. Create or get demo rows
        const { data: existingRows } = await supabase
          .from('dynamic_table_rows')
          .select('id, data')
          .eq('table_id', tableId);

        let rowsData: DemoRow[] = [];

        if (!existingRows || existingRows.length === 0) {
          // Create sample rows
          for (const sample of SAMPLE_DATA) {
            const { data: newRow, error: rowError } = await supabase
              .from('dynamic_table_rows')
              .insert({
                table_id: tableId,
                data: sample
              })
              .select('id, data')
              .single();

            if (rowError) throw rowError;
            rowsData.push({ id: newRow.id, ...sample });
          }
        } else {
          rowsData = existingRows.map(r => ({ id: r.id, ...r.data as any }));
        }

        setDemoRows(rowsData);

        // 3. Load existing agent runs if any
        if (rowsData.length > 0) {
          const rowIds = rowsData.map(r => r.id);
          const { data: runs } = await supabase
            .from('agent_runs')
            .select('*')
            .in('row_id', rowIds)
            .order('created_at', { ascending: false });

          if (runs) {
            const runsMap: Record<string, AgentRun> = {};
            runs.forEach(run => {
              // Only keep the latest run per row
              if (!runsMap[run.row_id]) {
                runsMap[run.row_id] = run as AgentRun;
              }
            });
            setAgentRuns(runsMap);
          }
        }

        toast.success('Demo environment initialized!');
      } catch (error: any) {
        console.error('Failed to initialize demo:', error);
        toast.error(`Setup failed: ${error.message}`);
      } finally {
        setIsInitializing(false);
      }
    };

    initDemo();
  }, [user, activeOrgId]);

  // Subscribe to agent_runs updates
  useEffect(() => {
    if (!demoTableId || demoRows.length === 0) return;

    const rowIds = demoRows.map(r => r.id);

    const channel = supabase
      .channel(`agent-runs-demo`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agent_runs',
          filter: `row_id=in.(${rowIds.join(',')})`
        },
        (payload) => {
          const run = payload.new as AgentRun;
          if (run) {
            setAgentRuns(prev => ({
              ...prev,
              [run.row_id]: run
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [demoTableId, demoRows]);

  const loadTestPrompt = (testPrompt: typeof TEST_PROMPTS[0]) => {
    setPromptTemplate(testPrompt.prompt);
    setResearchDepth(testPrompt.depth);
    setOutputFormat(testPrompt.outputFormat);
    toast.success(`Loaded test: ${testPrompt.name}`);
  };

  const createAgentColumn = async (): Promise<string> => {
    if (!demoTableId || !activeOrgId) throw new Error('Demo not initialized');

    // Create agent column
    const { data: column, error: colError } = await supabase
      .from('agent_columns')
      .insert({
        table_id: demoTableId,
        organization_id: activeOrgId,
        name: 'Research Result',
        prompt_template: promptTemplate,
        output_format: outputFormat,
        research_depth: researchDepth,
        source_preferences: {
          perplexity: sourcePerplexity,
          exa: sourceExa,
          apify_linkedin: sourceApify,
          apify_maps: sourceApify,
          apify_serp: sourceApify
        }
      })
      .select('id')
      .single();

    if (colError) throw colError;
    return column.id;
  };

  const runResearch = async (rowId: string) => {
    if (!promptTemplate.trim()) {
      toast.error('Please enter a research prompt');
      return;
    }

    try {
      // Create or update agent column
      let columnId = agentColumnId;
      if (!columnId) {
        columnId = await createAgentColumn();
        setAgentColumnId(columnId);
      } else {
        // Update existing column config
        await supabase
          .from('agent_columns')
          .update({
            prompt_template: promptTemplate,
            output_format: outputFormat,
            research_depth: researchDepth,
            source_preferences: {
              perplexity: sourcePerplexity,
              exa: sourceExa,
              apify_linkedin: sourceApify,
              apify_maps: sourceApify,
              apify_serp: sourceApify
            }
          })
          .eq('id', columnId);
      }

      const row = demoRows.find(r => r.id === rowId);
      toast.info(`Starting research for ${row?.company_name || 'row'}...`);

      // Call research-orchestrator edge function
      const { data, error } = await supabase.functions.invoke('research-orchestrator', {
        body: {
          agent_column_id: columnId,
          row_ids: [rowId],
          depth_override: researchDepth
        }
      });

      if (error) throw error;

      toast.success(`Research queued! (Run ID: ${data.run_id})`);
    } catch (error: any) {
      console.error('Failed to start research:', error);
      toast.error(`Failed: ${error.message}`);
    }
  };

  const runAll = async () => {
    if (!promptTemplate.trim()) {
      toast.error('Please enter a research prompt');
      return;
    }

    try {
      setIsRunning(true);

      // Create or update agent column
      let columnId = agentColumnId;
      if (!columnId) {
        columnId = await createAgentColumn();
        setAgentColumnId(columnId);
      } else {
        await supabase
          .from('agent_columns')
          .update({
            prompt_template: promptTemplate,
            output_format: outputFormat,
            research_depth: researchDepth,
            source_preferences: {
              perplexity: sourcePerplexity,
              exa: sourceExa,
              apify_linkedin: sourceApify,
              apify_maps: sourceApify,
              apify_serp: sourceApify
            }
          })
          .eq('id', columnId);
      }

      const rowIds = demoRows.map(r => r.id);

      toast.info(`Starting research for ${rowIds.length} companies...`);

      // Call research-orchestrator for all rows
      const { data, error } = await supabase.functions.invoke('research-orchestrator', {
        body: {
          agent_column_id: columnId,
          row_ids: rowIds,
          depth_override: researchDepth
        }
      });

      if (error) throw error;

      toast.success(`All research queued! (Run ID: ${data.run_id}, ${data.total_tasks} tasks, ~${data.estimated_credits} credits)`);
    } catch (error: any) {
      console.error('Failed to start research:', error);
      toast.error(`Failed: ${error.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const clearResults = async () => {
    if (!demoTableId) return;

    const rowIds = demoRows.map(r => r.id);
    await supabase
      .from('agent_runs')
      .delete()
      .in('row_id', rowIds);

    setAgentRuns({});
    toast.info('Results cleared');
  };

  const searchApollo = async () => {
    if (!apolloSearchQuery.trim()) {
      toast.error('Please enter a search query');
      return;
    }

    try {
      setIsSearching(true);
      const { data, error } = await supabase.functions.invoke('apollo-search', {
        body: {
          query: apolloSearchQuery,
          page: 1,
          per_page: 20
        }
      });

      if (error) throw error;

      setApolloResults(data.people || data.organizations || []);
      toast.success(`Found ${data.people?.length || data.organizations?.length || 0} results`);
    } catch (error: any) {
      console.error('Apollo search failed:', error);
      toast.error(`Search failed: ${error.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  const importSelectedCompanies = async () => {
    if (selectedCompanies.size === 0) {
      toast.error('Please select at least one company');
      return;
    }

    if (!demoTableId) {
      toast.error('Demo table not initialized');
      return;
    }

    try {
      const companiesToImport = apolloResults.filter(r =>
        selectedCompanies.has(r.organization?.id || r.id)
      );

      const newRows: DemoRow[] = [];

      for (const company of companiesToImport) {
        const org = company.organization || company;
        const rowData = {
          company_name: org.name || 'Unknown',
          domain: org.website_url || org.primary_domain || '',
          industry: org.industry || '',
          employee_count: org.estimated_num_employees?.toString() || ''
        };

        const { data: newRow, error } = await supabase
          .from('dynamic_table_rows')
          .insert({
            table_id: demoTableId,
            data: rowData
          })
          .select('id, data')
          .single();

        if (error) throw error;
        newRows.push({ id: newRow.id, ...rowData });
      }

      setDemoRows(prev => [...prev, ...newRows]);
      setApolloDialogOpen(false);
      setSelectedCompanies(new Set());
      setApolloResults([]);
      setApolloSearchQuery('');
      toast.success(`Imported ${newRows.length} companies!`);
    } catch (error: any) {
      console.error('Import failed:', error);
      toast.error(`Import failed: ${error.message}`);
    }
  };

  const toggleCompanySelection = (companyId: string) => {
    setSelectedCompanies(prev => {
      const next = new Set(prev);
      if (next.has(companyId)) {
        next.delete(companyId);
      } else {
        next.add(companyId);
      }
      return next;
    });
  };

  // Auto-retry logic
  useEffect(() => {
    if (retryCountdown <= 0) return;

    const interval = setInterval(() => {
      setRetryCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          if (lastParsedQuery) {
            handleQuerySubmit(lastParsedQuery);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [retryCountdown]);

  // Log query errors
  const logQueryError = (error: any, context: string) => {
    console.error(`[NL Query Error - ${context}]`, {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      query: lastParsedQuery
    });
  };

  // Handle Natural Language Query submission
  const handleQuerySubmit = async (parsedQuery: QueryParseResult, retryWithFaster = false) => {
    setIsQuerying(true);
    setQueryError(null);
    setQueryResults([]);
    setShowRetryOptions(false);
    setSuggestedModifications([]);
    setFailedSources([]);
    setShowIntegrationsLink(false);
    setLastParsedQuery(parsedQuery);

    // Pre-select source if user specified one
    if (parsedQuery.source_preference && !selectedSources.includes(parsedQuery.source_preference)) {
      setSelectedSources([parsedQuery.source_preference]);
    }

    try {
      // Set 60-second timeout
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Query timed out')), 60000)
      );

      const queryPromise = supabase.functions.invoke('apify-multi-query', {
        body: {
          parsedQuery,
          tableId: demoTableId,
          selectedSources: selectedSources.length > 0 ? selectedSources : undefined,
          depth: retryWithFaster ? 'low' : 'medium'
        }
      });

      const { data, error } = await Promise.race([queryPromise, timeoutPromise]) as any;

      if (error) throw error;

      // Check for partial results / merge failed
      if (data.results?.length > 0 && data.warnings?.length > 0) {
        setQueryResults(data.results);
        toast.warning(
          `${data.results.length} results found, but ${data.warnings.length} source(s) failed. ` +
          `Try again for complete results.`
        );
        setFailedSources(data.warnings.map((w: any) => w.provider));
      } else if (data.results?.length === 0) {
        // No results found
        setQueryError(null);
        toast.info('No results found. Try: broader location, different keywords, or more data sources');
        setSuggestedModifications([
          'Remove location filter',
          'Use different industry terms',
          'Enable all data sources'
        ]);
      } else {
        // Success
        setQueryResults(data.results || []);
        toast.success(`Found ${data.results?.length || 0} results!`);
      }

    } catch (error: any) {
      logQueryError(error, 'Query Execution');

      // Enhanced error handling
      if (error.message === 'Query timed out') {
        setQueryError('Query took too long. Try a simpler search or fewer sources.');
        setShowRetryOptions(true);
      } else if (error.message?.includes('429') || error.message?.includes('rate limit')) {
        toast.error('Too many concurrent queries. Please wait a moment and try again.');
        setQueryError('Rate limit exceeded. Retrying automatically...');
        // Auto-retry in 10 seconds
        setRetryCountdown(10);
      } else if (error.message?.includes('not configured') || error.message?.includes('integration')) {
        toast.error('Data source not configured. Please connect your integrations in Settings.');
        setQueryError('Data source not configured.');
        setShowIntegrationsLink(true);
      } else {
        setQueryError(error.message || 'Failed to execute query');
        toast.error('Query failed. Please try again.');
      }
    } finally {
      setIsQuerying(false);
    }
  };

  // Handle adding a single result to table
  const handleAddToTable = async (result: NormalizedResult) => {
    if (!demoTableId) {
      toast.error('Demo table not initialized');
      return;
    }

    try {
      const rowData = {
        company_name: result.company || result.name || 'Unknown',
        domain: result.website || '',
        industry: result.industry || '',
        employee_count: result.employee_count?.toString() || ''
      };

      const { data: newRow, error } = await supabase
        .from('dynamic_table_rows')
        .insert({
          table_id: demoTableId,
          data: rowData
        })
        .select('id, data')
        .single();

      if (error) throw error;

      setDemoRows(prev => [...prev, { id: newRow.id, ...rowData }]);
      toast.success('Added to table');
    } catch (error: any) {
      console.error('Add error:', error);
      toast.error('Failed to add to table');
    }
  };

  // Handle adding all results to table
  const handleAddAllToTable = async () => {
    if (queryResults.length === 0) {
      toast.error('No results to add');
      return;
    }

    if (!demoTableId) {
      toast.error('Demo table not initialized');
      return;
    }

    try {
      const newRows: DemoRow[] = [];

      for (const result of queryResults) {
        const rowData = {
          company_name: result.company || result.name || 'Unknown',
          domain: result.website || '',
          industry: result.industry || '',
          employee_count: result.employee_count?.toString() || ''
        };

        const { data: newRow, error } = await supabase
          .from('dynamic_table_rows')
          .insert({
            table_id: demoTableId,
            data: rowData
          })
          .select('id, data')
          .single();

        if (error) throw error;
        newRows.push({ id: newRow.id, ...rowData });
      }

      setDemoRows(prev => [...prev, ...newRows]);
      toast.success(`Added ${newRows.length} results to table`);
    } catch (error: any) {
      console.error('Batch add error:', error);
      toast.error('Failed to add all results');
    }
  };

  const getStatusBadge = (status: AgentRun['status']) => {
    const variants = {
      queued: 'secondary',
      in_progress: 'default',
      complete: 'default',
      failed: 'destructive'
    } as const;

    const colors = {
      queued: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
      in_progress: 'bg-violet-500/10 text-violet-700 border-violet-500/20',
      complete: 'bg-green-500/10 text-green-700 border-green-500/20',
      failed: 'bg-red-500/10 text-red-700 border-red-500/20'
    };

    return (
      <Badge variant={variants[status]} className={colors[status]}>
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  const getConfidenceDot = (confidence?: 'high' | 'medium' | 'low') => {
    if (!confidence) return null;

    const colors = {
      high: 'bg-green-500',
      medium: 'bg-yellow-500',
      low: 'bg-red-500'
    };

    return (
      <span className={`inline-block w-2 h-2 rounded-full ${colors[confidence]}`} />
    );
  };

  const estimatedCredits = demoRows.length * (researchDepth === 'low' ? 3 : researchDepth === 'medium' ? 5 : 10);

  if (isInitializing) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-violet-600" />
          <p className="text-muted-foreground">Initializing demo environment...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Brain className="w-8 h-8 text-violet-600" />
            AI Research Agent - Live Demo
          </h1>
          <p className="text-muted-foreground mt-1">
            Test the AI Research Agent with real API calls to Perplexity, Exa, and Apify
          </p>
        </div>
        <Badge variant="outline" className="text-lg px-4 py-2 bg-green-500/10 text-green-700 border-green-500/20">
          Live Mode
        </Badge>
      </div>

      {/* Natural Language Query Section */}
      <Card className="border-violet-200 bg-violet-50/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5 text-violet-600" />
            Natural Language Query
          </CardTitle>
          <CardDescription>
            Search for companies or people using plain English queries
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Natural Language Query Bar */}
          <div className="space-y-2">
            <NaturalLanguageQueryBar
              onQuerySubmit={handleQuerySubmit}
              isLoading={isQuerying}
            />

            <SourcePreferenceSelector
              selectedSources={selectedSources}
              onSourcesChange={setSelectedSources}
              disabled={isQuerying}
            />
          </div>

          {/* Progress Indicator */}
          {isQuerying && (
            <ProgressIndicator
              isActive={isQuerying}
              onComplete={() => setIsQuerying(false)}
            />
          )}

          {/* Error State with Retry */}
          {queryError && (
            <div className="space-y-3 p-4 border border-amber-500 rounded-lg bg-amber-50">
              <p className="text-amber-900">{queryError}</p>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => lastParsedQuery && handleQuerySubmit(lastParsedQuery)}
                  variant="outline"
                  size="sm"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry Same Query
                </Button>

                {showRetryOptions && (
                  <Button
                    onClick={() => lastParsedQuery && handleQuerySubmit(lastParsedQuery, true)}
                    variant="outline"
                    size="sm"
                  >
                    Retry with Faster Search
                  </Button>
                )}

                {showIntegrationsLink && (
                  <Button
                    onClick={() => window.open('/settings/integrations', '_blank')}
                    variant="outline"
                    size="sm"
                  >
                    Open Settings
                  </Button>
                )}
              </div>

              {suggestedModifications.length > 0 && (
                <div className="text-sm space-y-1">
                  <p className="font-medium text-amber-900">Suggestions:</p>
                  <ul className="list-disc list-inside space-y-1 text-amber-800">
                    {suggestedModifications.map((suggestion, i) => (
                      <li key={i}>{suggestion}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Auto-Retry Countdown */}
          {retryCountdown > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 border rounded-lg bg-muted/30">
              <Loader2 className="h-4 w-4 animate-spin" />
              Retrying in {retryCountdown}s...
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRetryCountdown(0)}
              >
                Cancel
              </Button>
            </div>
          )}

          {/* Failed Sources Indicator */}
          {failedSources.length > 0 && (
            <div className="flex items-center gap-2 text-sm p-3 border border-amber-500/30 rounded-lg bg-amber-50/50">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <span className="text-amber-900">
                Some sources failed: {failedSources.join(', ')}
              </span>
            </div>
          )}

          {/* Results Preview */}
          {queryResults.length > 0 && (
            <QueryResultsPreview
              results={queryResults}
              onAddToTable={handleAddToTable}
              onAddAllToTable={handleAddAllToTable}
              entityType={lastParsedQuery?.entity_type === 'person' ? 'people' : lastParsedQuery?.entity_type as 'companies' | 'people' || 'companies'}
              parsedSummary={lastParsedQuery ? {
                entity_type: lastParsedQuery.entity_type,
                count: lastParsedQuery.count,
                location: lastParsedQuery.location,
                keywords: lastParsedQuery.keywords,
              } : undefined}
            />
          )}
        </CardContent>
      </Card>

      {/* Configuration Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Config */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Research Configuration</CardTitle>
              <CardDescription>
                Configure your AI research prompt and settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Test Prompts */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Quick Test Examples</Label>
                <div className="flex flex-wrap gap-2">
                  {TEST_PROMPTS.map((test, idx) => (
                    <Button
                      key={idx}
                      variant="outline"
                      size="sm"
                      onClick={() => loadTestPrompt(test)}
                    >
                      {test.name}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Prompt Template */}
              <div>
                <Label htmlFor="prompt">Research Prompt Template</Label>
                <Textarea
                  id="prompt"
                  placeholder="What CRM does {{company_name}} use? Their website is {{domain}}."
                  value={promptTemplate}
                  onChange={(e) => setPromptTemplate(e.target.value)}
                  rows={4}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Available variables: {'{'}{'{'}<strong>company_name</strong>{'}'}{'}'},  {'{'}{'{'}<strong>domain</strong>{'}'}{'}'},  {'{'}{'{'}<strong>industry</strong>{'}'}{'}'},  {'{'}{'{'}<strong>employee_count</strong>{'}'}{'}'}
                </p>
              </div>

              {/* Research Depth */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="depth">Research Depth</Label>
                  <Select value={researchDepth} onValueChange={(v: any) => setResearchDepth(v)}>
                    <SelectTrigger id="depth">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low - Quick (3 credits)</SelectItem>
                      <SelectItem value="medium">Medium - Balanced (5 credits)</SelectItem>
                      <SelectItem value="high">High - Comprehensive (10 credits)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="output">Output Format</Label>
                  <Select value={outputFormat} onValueChange={(v: any) => setOutputFormat(v)}>
                    <SelectTrigger id="output">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free_text">Free Text</SelectItem>
                      <SelectItem value="single_value">Single Value</SelectItem>
                      <SelectItem value="yes_no">Yes/No</SelectItem>
                      <SelectItem value="url">URL</SelectItem>
                      <SelectItem value="list">List</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Source Preferences */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Source Preferences</Label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sourcePerplexity}
                      onChange={(e) => setSourcePerplexity(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">Perplexity</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sourceExa}
                      onChange={(e) => setSourceExa(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">Exa</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sourceApify}
                      onChange={(e) => setSourceApify(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">Apify</span>
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Info */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                onClick={runAll}
                disabled={isRunning || !promptTemplate.trim()}
                className="w-full"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Run All ({demoRows.length} rows)
                  </>
                )}
              </Button>
              <Button
                onClick={clearResults}
                variant="outline"
                className="w-full"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear Results
              </Button>

              <Dialog open={apolloDialogOpen} onOpenChange={setApolloDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full">
                    <Plus className="w-4 h-4 mr-2" />
                    Import from Apollo
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Import Companies from Apollo</DialogTitle>
                    <DialogDescription>
                      Search Apollo's database and add companies to your demo table
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Search companies (e.g., 'AI startups in San Francisco')"
                        value={apolloSearchQuery}
                        onChange={(e) => setApolloSearchQuery(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && searchApollo()}
                      />
                      <Button onClick={searchApollo} disabled={isSearching}>
                        {isSearching ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Search className="w-4 h-4" />
                        )}
                      </Button>
                    </div>

                    {apolloResults.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-muted-foreground">
                            {apolloResults.length} results • {selectedCompanies.size} selected
                          </p>
                          <Button
                            size="sm"
                            onClick={importSelectedCompanies}
                            disabled={selectedCompanies.size === 0}
                          >
                            Import Selected ({selectedCompanies.size})
                          </Button>
                        </div>

                        <div className="border rounded-lg divide-y max-h-96 overflow-y-auto">
                          {apolloResults.map((result) => {
                            const org = result.organization || result;
                            const companyId = org.id;
                            const isSelected = selectedCompanies.has(companyId);

                            return (
                              <div
                                key={companyId}
                                className={`p-3 cursor-pointer hover:bg-muted/50 ${
                                  isSelected ? 'bg-violet-50' : ''
                                }`}
                                onClick={() => toggleCompanySelection(companyId)}
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => {}}
                                        className="rounded"
                                      />
                                      <div>
                                        <p className="font-medium">{org.name}</p>
                                        <p className="text-sm text-muted-foreground">
                                          {org.website_url || org.primary_domain}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="mt-2 flex gap-2 text-xs text-muted-foreground">
                                      {org.industry && (
                                        <Badge variant="outline" className="text-xs">
                                          {org.industry}
                                        </Badge>
                                      )}
                                      {org.estimated_num_employees && (
                                        <Badge variant="outline" className="text-xs">
                                          {org.estimated_num_employees} employees
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cost Estimate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <p className="text-3xl font-bold text-violet-600">
                  {estimatedCredits}
                </p>
                <p className="text-sm text-muted-foreground">credits for all rows</p>
              </div>
              <div className="mt-4 space-y-1 text-sm text-muted-foreground">
                <p>• {demoRows.length} rows</p>
                <p>• {researchDepth} depth</p>
                <p>• {researchDepth === 'low' ? 3 : researchDepth === 'medium' ? 5 : 10} credits per row</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Results Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Demo Data Table</CardTitle>
              <CardDescription>
                {demoRows.length} companies ({SAMPLE_DATA.length} samples + {demoRows.length - SAMPLE_DATA.length} imported)
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-sm">
              {demoRows.length} rows
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium">Company</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Domain</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Industry</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Employees</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Research Result</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {demoRows.map((row) => {
                  const run = agentRuns[row.id];

                  return (
                    <tr key={row.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="font-medium">{row.company_name}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {row.domain}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {row.industry}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {row.employee_count}
                      </td>
                      <td className="px-4 py-3">
                        {!run && (
                          <div className="text-sm text-muted-foreground">Not run</div>
                        )}

                        {run && run.status === 'queued' && (
                          <div className="flex items-center gap-2">
                            {getStatusBadge('queued')}
                          </div>
                        )}

                        {run && run.status === 'in_progress' && (
                          <div className="flex items-center gap-2">
                            {getStatusBadge('in_progress')}
                            <span className="text-sm text-muted-foreground animate-pulse">
                              Researching...
                            </span>
                          </div>
                        )}

                        {run && run.status === 'complete' && (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              {getConfidenceDot(run.confidence)}
                              {getStatusBadge('complete')}
                            </div>
                            <div className="text-sm line-clamp-2">
                              {run.result_text}
                            </div>
                            {run.sources && (
                              <div className="text-xs text-muted-foreground">
                                {run.sources.length} sources • {run.providers_used?.join(', ')}
                              </div>
                            )}
                          </div>
                        )}

                        {run && run.status === 'failed' && (
                          <div className="space-y-1">
                            {getStatusBadge('failed')}
                            {run.error_message && (
                              <div className="text-sm text-red-600">
                                {run.error_message}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => runResearch(row.id)}
                          disabled={run?.status === 'in_progress' || !promptTemplate.trim()}
                        >
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Info */}
      <Card className="border-green-200 bg-green-50/50">
        <CardContent className="pt-6 space-y-2">
          <p className="text-sm text-green-900">
            <strong>Live Mode:</strong> This demo makes real API calls to Perplexity, Exa, and Apify. Results stream in live via Supabase Realtime. Credits will be consumed from your workspace balance.
          </p>
          <p className="text-sm text-green-900">
            <strong>Import from Apollo:</strong> Click "Import from Apollo" to search Apollo's database and add real companies to test with actual market data.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
