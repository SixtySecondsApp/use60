/**
 * InteractivePlayground Component
 *
 * Test copilot queries with user impersonation and execution tracing.
 * Shows step-by-step execution with timing and output preview.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Loader2,
  User,
  Database,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  Expand,
  Code,
  Eye,
  FileText,
  Sparkles,
  RefreshCw,
  DollarSign,
  Zap,
  Save,
  FolderOpen,
  Trash2,
  Bug,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';

interface PlaygroundUser {
  id: string;
  name: string;
  email: string;
  role?: string;
}

interface ExecutionStep {
  step: number;
  name: string;
  type: 'intent' | 'action' | 'skill' | 'sequence' | 'generate';
  status: 'pending' | 'running' | 'complete' | 'error';
  startTime?: number;
  endTime?: number;
  duration?: number;
  output?: any;
  error?: string;
  metadata?: Record<string, any>;
}

interface PlaygroundResult {
  success: boolean;
  response: string;
  structuredResponse?: any;
  steps: ExecutionStep[];
  totalTime: number;
  toolExecutions?: any[];
  // LAB-001: Cost and token metrics
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  estimatedCost?: number;
  workflowType?: string;
  confidence?: string;
}

// LAB-002: Saved query interface
interface SavedQuery {
  id: string;
  name: string;
  query: string;
  description?: string;
  tags?: string[];
  createdAt: string;
}

// LAB-002: Saved queries storage key
const SAVED_QUERIES_KEY = 'copilot-lab-saved-queries';

// LAB-002: Load saved queries from localStorage
function loadSavedQueries(): SavedQuery[] {
  try {
    const stored = localStorage.getItem(SAVED_QUERIES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// LAB-002: Save queries to localStorage
function saveSavedQueries(queries: SavedQuery[]) {
  localStorage.setItem(SAVED_QUERIES_KEY, JSON.stringify(queries.slice(0, 50))); // Limit to 50
}

interface InteractivePlaygroundProps {
  organizationId?: string;
  users?: PlaygroundUser[];
  defaultQuery?: string;
  initialQuery?: string; // Alias for defaultQuery
  onQueryComplete?: (result: PlaygroundResult) => void;
  // Props passed from CopilotLabPage
  skills?: any[];
  capabilities?: any[];
  isLoading?: boolean;
}

// Sample queries for quick testing
const SAMPLE_QUERIES = [
  { label: 'Meeting Prep', query: 'Prep me for my next meeting' },
  { label: 'Pipeline Check', query: 'What deals need my attention today?' },
  { label: 'Follow-ups', query: 'What follow-ups am I missing?' },
  { label: 'Deal Health', query: 'Show me deals that are at risk' },
  { label: 'Daily Focus', query: 'What should I focus on today?' },
];

/**
 * Renders the structured response from the copilot API
 * Handles the actual API structure: data.pipelineDeals.deals, data.contactsNeedingAttention.contacts, etc.
 */
function StructuredResponseRenderer({ data }: { data: any }) {
  if (!data) return null;

  // Extract data from various possible structures
  const responseData = data.data || data;

  // Deals: could be data.pipelineDeals.deals or data.deals
  const deals = responseData?.pipelineDeals?.deals || responseData?.deals || [];
  const dealsInfo = responseData?.pipelineDeals || {};

  // Contacts: could be data.contactsNeedingAttention.contacts or data.contacts
  const contacts = responseData?.contactsNeedingAttention?.contacts || responseData?.contacts || [];
  const contactsInfo = responseData?.contactsNeedingAttention || {};

  // Tasks: could be data.openTasks.tasks or data.tasks
  const tasks = responseData?.openTasks?.tasks || responseData?.tasks || [];
  const tasksInfo = responseData?.openTasks || {};

  // Priorities: could be data.priorities or metadata.priorities
  const priorities = responseData?.priorities || data?.metadata?.priorities || [];

  // Actions: could be data.actions or at root
  const actions = responseData?.actions || data?.actions || [];

  // Task pack: could be data.taskPack or metadata.task_pack
  const taskPack = responseData?.taskPack || responseData?.task_pack || data?.metadata?.task_pack || [];

  // Check if we have any data to display
  const hasData = deals.length > 0 || contacts.length > 0 || tasks.length > 0 ||
                  priorities.length > 0 || actions.length > 0 || taskPack.length > 0;

  if (!hasData) {
    return (
      <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
        <p className="text-sm text-gray-500">No structured data to display. Check the JSON tab for the raw response.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 border-t border-gray-200 dark:border-gray-700 pt-6">
      {/* Pipeline Deals */}
      {deals.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            Pipeline Deals
            {dealsInfo.filter && (
              <Badge variant="outline" className="text-xs ml-2">
                {dealsInfo.filter} • {dealsInfo.period || 'this week'}
              </Badge>
            )}
            <span className="text-gray-500 font-normal">({deals.length})</span>
          </h4>
          <div className="grid gap-2">
            {deals.map((deal: any, idx: number) => (
              <div
                key={deal.id || idx}
                className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {deal.name || deal.deal_name}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      {deal.company || deal.company_name}
                    </p>
                  </div>
                  <div className="text-right">
                    {(deal.value || deal.amount) && (
                      <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                        ${(deal.value || deal.amount).toLocaleString()}
                      </p>
                    )}
                    {(deal.stage_name || deal.stage) && (
                      <Badge variant="secondary" className="text-xs">
                        {deal.stage_name || deal.stage}
                      </Badge>
                    )}
                    {deal.expected_close_date && (
                      <p className="text-xs text-gray-500 mt-1">
                        Close: {new Date(deal.expected_close_date).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contacts Needing Attention */}
      {contacts.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-500" />
            Contacts Needing Attention
            {contactsInfo.filter && (
              <Badge variant="outline" className="text-xs ml-2">
                {contactsInfo.filter}
              </Badge>
            )}
            <span className="text-gray-500 font-normal">({contacts.length})</span>
          </h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {contacts.slice(0, 6).map((contact: any, idx: number) => (
              <div
                key={contact.id || idx}
                className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
              >
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {contact.name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email}
                </p>
                {contact.company_name && (
                  <p className="text-xs text-gray-600 dark:text-gray-400">{contact.company_name}</p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  {contact.health_status && (
                    <Badge
                      variant="secondary"
                      className={cn(
                        'text-xs',
                        contact.health_status === 'critical' && 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
                        contact.health_status === 'at_risk' && 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
                        contact.health_status === 'healthy' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      )}
                    >
                      {contact.health_status}
                    </Badge>
                  )}
                  {contact.risk_level && (
                    <Badge variant="outline" className="text-xs">
                      {contact.risk_level} risk
                    </Badge>
                  )}
                </div>
                {contact.risk_factors && contact.risk_factors.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    {contact.risk_factors.join(', ')}
                  </p>
                )}
              </div>
            ))}
            {contacts.length > 6 && (
              <div className="p-3 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center">
                <span className="text-sm text-gray-500">
                  +{contacts.length - 6} more contacts
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Open Tasks */}
      {tasks.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-orange-500" />
            Open Tasks
            <span className="text-gray-500 font-normal">({tasks.length})</span>
          </h4>
          <div className="grid gap-2">
            {tasks.map((task: any, idx: number) => (
              <div
                key={task.id || idx}
                className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
              >
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {task.title || task.subject || task.description}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {task.due_date && (
                    <span className="text-xs text-gray-500">
                      Due: {new Date(task.due_date).toLocaleDateString()}
                    </span>
                  )}
                  {task.priority && (
                    <Badge variant="outline" className="text-xs">
                      {task.priority}
                    </Badge>
                  )}
                  {task.status && (
                    <Badge variant="secondary" className="text-xs">
                      {task.status}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Priorities */}
      {priorities.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Priorities
            <span className="text-gray-500 font-normal">({priorities.length})</span>
          </h4>
          <div className="grid gap-2">
            {priorities.map((priority: any, idx: number) => (
              <div
                key={idx}
                className={cn(
                  'p-3 rounded-lg border',
                  priority.urgency === 'critical' && 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
                  priority.urgency === 'high' && 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
                  priority.urgency === 'medium' && 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
                  (!priority.urgency || priority.urgency === 'low') && 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {priority.title || priority.reason || priority.description}
                    </p>
                    {priority.reason && priority.title && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {priority.reason}
                      </p>
                    )}
                  </div>
                  {priority.urgency && (
                    <Badge
                      variant="secondary"
                      className={cn(
                        'text-xs shrink-0',
                        priority.urgency === 'critical' && 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
                        priority.urgency === 'high' && 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                      )}
                    >
                      {priority.urgency}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommended Actions */}
      {actions.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Recommended Actions
            <span className="text-gray-500 font-normal">({actions.length})</span>
          </h4>
          <div className="grid gap-2">
            {actions.map((action: any, idx: number) => (
              <div
                key={idx}
                className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
              >
                <div className="flex items-start gap-3">
                  <span className="text-lg shrink-0">{action.icon || '📋'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {action.action || action.title || action.description}
                    </p>
                    {action.context && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {action.context}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      {action.time_estimate && (
                        <Badge variant="outline" className="text-xs">
                          <Clock className="w-3 h-3 mr-1" />
                          {action.time_estimate}
                        </Badge>
                      )}
                      {action.impact && (
                        <Badge variant="outline" className="text-xs text-emerald-600 dark:text-emerald-400">
                          {action.impact}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Task Pack / Suggested Tasks */}
      {taskPack.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-500" />
            Suggested Tasks to Create
            <span className="text-gray-500 font-normal">({taskPack.length})</span>
          </h4>
          <div className="grid gap-2">
            {taskPack.map((task: any, idx: number) => (
              <div
                key={idx}
                className="p-3 rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {task.title || task.subject}
                    </p>
                    {task.description && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {task.description}
                      </p>
                    )}
                  </div>
                  <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 text-xs shrink-0">
                    {task.type || 'task'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function InteractivePlayground({
  organizationId,
  users = [],
  defaultQuery = '',
  initialQuery,
  onQueryComplete,
}: InteractivePlaygroundProps) {
  // Use initialQuery if provided, otherwise defaultQuery
  const effectiveDefaultQuery = initialQuery || defaultQuery;
  const [query, setQuery] = useState(effectiveDefaultQuery);
  const [selectedUserId, setSelectedUserId] = useState<string>('current');

  // Update query when defaultQuery or initialQuery prop changes
  const prevDefaultQueryRef = useRef(effectiveDefaultQuery);
  useEffect(() => {
    const newQuery = initialQuery || defaultQuery;
    if (newQuery && newQuery !== prevDefaultQueryRef.current) {
      setQuery(newQuery);
      prevDefaultQueryRef.current = newQuery;
    }
  }, [defaultQuery, initialQuery]);
  const [dataMode, setDataMode] = useState<'real' | 'sample'>('real');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [outputView, setOutputView] = useState<'rendered' | 'json' | 'raw'>('rendered');
  
  // LAB-002: Saved queries state
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>(() => loadSavedQueries());
  const [showSavedQueries, setShowSavedQueries] = useState(false);
  const [saveQueryName, setSaveQueryName] = useState('');
  
  // LAB-003: Debug mode state
  const [debugMode, setDebugMode] = useState(false);

  // Run the query
  const handleRun = useCallback(async () => {
    if (!query.trim() || isRunning) return;

    setIsRunning(true);
    setResult(null);
    setExpandedSteps(new Set());

    const startTime = Date.now();
    const steps: ExecutionStep[] = [];

    try {
      // Step 1: Intent Detection
      steps.push({
        step: 1,
        name: 'Intent Detection',
        type: 'intent',
        status: 'running',
        startTime: Date.now(),
      });
      setResult({ success: true, response: '', steps, totalTime: 0 });

      // Call the copilot API - use /chat endpoint path
      // LAB-003: Include debug flag for verbose logging
      const { data, error } = await supabase.functions.invoke('api-copilot/chat', {
        body: {
          message: query,
          context: {
            orgId: organizationId,
            isPlaygroundTest: true,
            dataMode,
          },
          debug: debugMode, // LAB-003: Enable verbose response
        },
      });

      if (error) throw error;

      // Complete intent detection
      steps[0].status = 'complete';
      steps[0].endTime = Date.now();
      steps[0].duration = steps[0].endTime - (steps[0].startTime || 0);
      steps[0].output = data?.intent || 'general_query';

      // Parse tool executions into steps
      const toolExecutions = data?.tool_executions || [];
      toolExecutions.forEach((exec: any, idx: number) => {
        steps.push({
          step: idx + 2,
          name: exec.tool || exec.action || `Step ${idx + 2}`,
          type: exec.type === 'skill' ? 'skill' : exec.type === 'sequence' ? 'sequence' : 'action',
          status: exec.success ? 'complete' : 'error',
          startTime: exec.startTime,
          endTime: exec.endTime,
          duration: exec.duration_ms || (exec.endTime - exec.startTime),
          output: exec.result || exec.data,
          error: exec.error,
          metadata: {
            provider: exec.provider,
            capability: exec.capability,
          },
        });
      });

      // Add generation step
      steps.push({
        step: steps.length + 1,
        name: 'Generate Response',
        type: 'generate',
        status: 'complete',
        startTime: Date.now() - 100,
        endTime: Date.now(),
        duration: 100,
        output: data?.response?.content?.slice(0, 200) + '...',
      });

      const totalTime = Date.now() - startTime;

      // Debug: Log the raw API response to understand its structure
      console.log('[Playground] Raw API response:', JSON.stringify(data, null, 2));

      // Handle different response structures from the API
      let responseText = '';
      let structuredData = null;

      // Check all possible response structures
      const possibleStructures = {
        hasResponseContent: !!data?.response?.content,
        hasSummary: !!data?.summary,
        hasType: data?.type,
        hasData: !!data?.data,
        hasActions: !!data?.actions,
        hasMetadata: !!data?.metadata,
        topLevelKeys: data ? Object.keys(data) : [],
      };
      console.log('[Playground] Response structure analysis:', possibleStructures);

      if (data?.response?.content) {
        // Nested structure: data.response.content
        console.log('[Playground] Using nested structure');
        responseText = data.response.content;
        structuredData = data.response.structuredResponse || data.response;
      } else if (data?.summary || data?.type === 'structured') {
        // Flat structured response from API
        console.log('[Playground] Using flat structured response');
        responseText = data.summary || data.response || '';
        structuredData = {
          type: data.type,
          summary: data.summary,
          data: data.data,
          actions: data.actions,
          metadata: data.metadata,
        };
      } else if (data?.content) {
        // Alternative: data.content with structured data at root
        console.log('[Playground] Using data.content structure');
        responseText = data.content;
        structuredData = data;
      } else if (typeof data === 'string') {
        // Plain text response
        console.log('[Playground] Using plain text response');
        responseText = data;
      } else {
        // Fallback - try to extract what we can
        console.log('[Playground] Using fallback extraction');
        responseText = data?.message || '';
        // Maybe the whole data object IS the structured response
        if (data?.actions || data?.metadata || data?.data) {
          structuredData = data;
          responseText = data.summary || data.message || 'Response received';
        }
      }

      console.log('[Playground] Final responseText:', responseText);
      console.log('[Playground] Final structuredData:', structuredData);

      // LAB-001: Extract cost and token metrics from response
      const analytics = data?.analytics || data?.response?.analytics || {};
      const tokenUsage = analytics.token_usage || data?.token_usage || {
        inputTokens: analytics.input_tokens || 0,
        outputTokens: analytics.output_tokens || 0,
        totalTokens: (analytics.input_tokens || 0) + (analytics.output_tokens || 0),
      };
      
      // Estimate cost based on Gemini Flash pricing (~$0.075/1M input, $0.30/1M output)
      const estimatedCost = (tokenUsage.inputTokens * 0.000000075) + (tokenUsage.outputTokens * 0.0000003);
      
      const finalResult: PlaygroundResult = {
        success: true,
        response: responseText,
        structuredResponse: structuredData,
        steps,
        totalTime,
        toolExecutions,
        // LAB-001: Cost and latency metrics
        tokenUsage,
        estimatedCost,
        workflowType: analytics.workflow_type || data?.workflow_type,
        confidence: analytics.confidence || data?.confidence,
      };

      setResult(finalResult);
      onQueryComplete?.(finalResult);
      toast.success(`Query completed in ${(totalTime / 1000).toFixed(2)}s`);
    } catch (err: any) {
      console.error('Playground error:', err);

      // Mark last step as error
      if (steps.length > 0) {
        const lastStep = steps[steps.length - 1];
        if (lastStep.status === 'running') {
          lastStep.status = 'error';
          lastStep.error = err.message;
          lastStep.endTime = Date.now();
        }
      }

      setResult({
        success: false,
        response: err.message || 'An error occurred',
        steps,
        totalTime: Date.now() - startTime,
      });
      toast.error('Query failed: ' + (err.message || 'Unknown error'));
    } finally {
      setIsRunning(false);
    }
  }, [query, organizationId, dataMode, onQueryComplete, isRunning]);

  // Toggle step expansion
  const toggleStep = (stepNum: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepNum)) {
        next.delete(stepNum);
      } else {
        next.add(stepNum);
      }
      return next;
    });
  };

  // Copy output to clipboard
  const copyOutput = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(
        outputView === 'json'
          ? JSON.stringify(result.structuredResponse || result, null, 2)
          : result.response
      );
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700/50">
        {/* User selector */}
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-gray-500" />
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Test as..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">Current User</SelectItem>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Data mode */}
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-gray-500" />
          <Select value={dataMode} onValueChange={(v: 'real' | 'sample') => setDataMode(v)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="real">Real Data</SelectItem>
              <SelectItem value="sample">Sample Data</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Quick queries */}
        <div className="flex-1 flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-500">Quick:</span>
          {SAMPLE_QUERIES.map((sq) => (
            <Button
              key={sq.label}
              variant="outline"
              size="sm"
              onClick={() => setQuery(sq.query)}
              className="text-xs"
            >
              {sq.label}
            </Button>
          ))}
        </div>
      </div>

      {/* LAB-003: Debug Mode Toggle */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-800/30 rounded-lg border border-gray-200 dark:border-gray-700/50">
        <div className="flex items-center gap-2">
          <Bug className="w-4 h-4 text-gray-500" />
          <span className="text-sm text-gray-600 dark:text-gray-400">Debug Mode</span>
        </div>
        <Button
          variant={debugMode ? "default" : "outline"}
          size="sm"
          onClick={() => setDebugMode(!debugMode)}
          className="gap-2"
        >
          {debugMode ? 'Enabled' : 'Disabled'}
        </Button>
      </div>

      {/* Query Input */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Test Query
          </label>
          {/* LAB-002: Save/Load Queries */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSavedQueries(!showSavedQueries)}
              className="gap-1 text-xs"
            >
              <FolderOpen className="w-3 h-3" />
              Saved ({savedQueries.length})
            </Button>
            {query.trim() && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const name = prompt('Enter a name for this query:');
                  if (name) {
                    const newQuery: SavedQuery = {
                      id: Date.now().toString(),
                      name,
                      query: query.trim(),
                      createdAt: new Date().toISOString(),
                    };
                    const updated = [newQuery, ...savedQueries];
                    setSavedQueries(updated);
                    saveSavedQueries(updated);
                    toast.success('Query saved');
                  }
                }}
                className="gap-1 text-xs"
              >
                <Save className="w-3 h-3" />
                Save
              </Button>
            )}
          </div>
        </div>
        
        {/* LAB-002: Saved Queries Dropdown */}
        {showSavedQueries && savedQueries.length > 0 && (
          <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 max-h-48 overflow-y-auto">
            <div className="space-y-2">
              {savedQueries.map((sq) => (
                <div
                  key={sq.id}
                  className="flex items-center justify-between p-2 hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded cursor-pointer"
                  onClick={() => {
                    setQuery(sq.query);
                    setShowSavedQueries(false);
                  }}
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{sq.name}</p>
                    <p className="text-xs text-gray-500 truncate max-w-[300px]">{sq.query}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      const updated = savedQueries.filter((q) => q.id !== sq.id);
                      setSavedQueries(updated);
                      saveSavedQueries(updated);
                      toast.success('Query deleted');
                    }}
                  >
                    <Trash2 className="w-3 h-3 text-gray-400 hover:text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="relative">
          <Textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter a query to test... e.g., 'What deals need my attention today?'"
            className="min-h-[100px] pr-24 bg-white dark:bg-gray-900"
            disabled={isRunning}
          />
          <Button
            onClick={handleRun}
            disabled={!query.trim() || isRunning}
            className="absolute bottom-3 right-3 gap-2"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Run
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Execution Trace */}
      {result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Execution Trace
            </h3>
            {/* LAB-001: Cost/Latency Display */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Latency Badge */}
              <Badge variant="outline" className="gap-1">
                <Zap className="w-3 h-3" />
                {(result.totalTime / 1000).toFixed(2)}s
              </Badge>
              
              {/* Token Usage Badge */}
              {result.tokenUsage && result.tokenUsage.totalTokens > 0 && (
                <Badge variant="outline" className="gap-1 text-blue-600 dark:text-blue-400">
                  {result.tokenUsage.totalTokens.toLocaleString()} tokens
                </Badge>
              )}
              
              {/* Cost Badge */}
              {result.estimatedCost !== undefined && result.estimatedCost > 0 && (
                <Badge variant="outline" className="gap-1 text-emerald-600 dark:text-emerald-400">
                  <DollarSign className="w-3 h-3" />
                  {result.estimatedCost < 0.01 
                    ? '<$0.01' 
                    : `$${result.estimatedCost.toFixed(4)}`}
                </Badge>
              )}
              
              {/* Workflow Type Badge */}
              {result.workflowType && (
                <Badge variant="secondary" className="gap-1">
                  {result.workflowType}
                </Badge>
              )}
              
              {/* Confidence Badge */}
              {result.confidence && (
                <Badge 
                  variant="secondary" 
                  className={cn(
                    'gap-1',
                    result.confidence === 'high' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30',
                    result.confidence === 'medium' && 'bg-amber-100 text-amber-700 dark:bg-amber-900/30',
                    result.confidence === 'low' && 'bg-gray-100 text-gray-700 dark:bg-gray-900/30'
                  )}
                >
                  {result.confidence} confidence
                </Badge>
              )}
              
              {/* Status Badge */}
              {result.success ? (
                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Success
                </Badge>
              ) : (
                <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                  <XCircle className="w-3 h-3 mr-1" />
                  Failed
                </Badge>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900/80 border border-gray-200 dark:border-gray-700/50 rounded-xl overflow-hidden">
            {result.steps.map((step, idx) => (
              <div
                key={step.step}
                className={cn(
                  'border-b border-gray-100 dark:border-gray-800 last:border-b-0',
                  step.status === 'error' && 'bg-red-50 dark:bg-red-900/10'
                )}
              >
                {/* Step Header */}
                <button
                  onClick={() => toggleStep(step.step)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  {/* Status Icon */}
                  <div
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                      step.status === 'complete' && 'bg-emerald-100 dark:bg-emerald-900/30',
                      step.status === 'running' && 'bg-blue-100 dark:bg-blue-900/30',
                      step.status === 'error' && 'bg-red-100 dark:bg-red-900/30',
                      step.status === 'pending' && 'bg-gray-100 dark:bg-gray-800'
                    )}
                  >
                    {step.status === 'running' ? (
                      <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                    ) : step.status === 'complete' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : step.status === 'error' ? (
                      <XCircle className="w-4 h-4 text-red-500" />
                    ) : (
                      <span className="text-xs text-gray-500">{step.step}</span>
                    )}
                  </div>

                  {/* Step Info */}
                  <div className="flex-1 text-left">
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {step.name}
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {step.type}
                      </Badge>
                      {step.duration && (
                        <span>{step.duration}ms</span>
                      )}
                      {step.metadata?.provider && (
                        <span>via {step.metadata.provider}</span>
                      )}
                    </div>
                  </div>

                  {/* Expand Icon */}
                  {step.output && (
                    <div className="text-gray-400">
                      {expandedSteps.has(step.step) ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </div>
                  )}
                </button>

                {/* Step Output */}
                <AnimatePresence>
                  {expandedSteps.has(step.step) && step.output && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 pt-0">
                        <pre className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-xs overflow-x-auto">
                          {typeof step.output === 'string'
                            ? step.output
                            : JSON.stringify(step.output, null, 2)}
                        </pre>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Error Message */}
                {step.error && (
                  <div className="px-4 pb-4 pt-0">
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
                      {step.error}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Output Preview */}
      {result && result.success && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              Output
            </h3>
            <div className="flex items-center gap-2">
              <Tabs value={outputView} onValueChange={(v: any) => setOutputView(v)}>
                <TabsList className="h-8">
                  <TabsTrigger value="rendered" className="text-xs px-2 h-6">
                    <Eye className="w-3 h-3 mr-1" />
                    Rendered
                  </TabsTrigger>
                  <TabsTrigger value="json" className="text-xs px-2 h-6">
                    <Code className="w-3 h-3 mr-1" />
                    JSON
                  </TabsTrigger>
                  <TabsTrigger value="raw" className="text-xs px-2 h-6">
                    <FileText className="w-3 h-3 mr-1" />
                    Raw
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <Button variant="ghost" size="sm" onClick={copyOutput}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900/80 border border-gray-200 dark:border-gray-700/50 rounded-xl p-4 min-h-[200px]">
            {outputView === 'rendered' && (
              <div className="space-y-6">
                {/* Summary */}
                <div className="prose dark:prose-invert max-w-none">
                  {result.response || 'No response content'}
                </div>

                {/* Structured Response Rendering */}
                {result.structuredResponse && (
                  <StructuredResponseRenderer data={result.structuredResponse} />
                )}
              </div>
            )}
            {outputView === 'json' && (
              <pre className="text-xs overflow-x-auto">
                {JSON.stringify(result.structuredResponse || result, null, 2)}
              </pre>
            )}
            {outputView === 'raw' && (
              <pre className="text-sm whitespace-pre-wrap">{result.response}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default InteractivePlayground;
