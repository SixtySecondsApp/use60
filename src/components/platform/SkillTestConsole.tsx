/**
 * SkillTestConsole
 *
 * Admin console to run a skill through api-copilot test endpoint and inspect
 * tool executions + output.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Play, Loader2, TerminalSquare, AlertTriangle, ChevronDown, ChevronUp, Eye, Code, Info } from 'lucide-react';
import { MAPRenderer, isMAPContent, type MAPTask } from './MAPRenderer';
import { SkillOutputRenderer } from './SkillOutputRenderer';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { API_BASE_URL } from '@/lib/config';
import { getSupabaseHeaders } from '@/lib/utils/apiUtils';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgStore } from '@/lib/stores/orgStore';
import { useAuth } from '@/lib/contexts/AuthContext';
import { type PlatformSkill } from '@/lib/services/platformSkillService';
import {
  type EntityType,
  type EntityTestMode,
  type QualityTier,
} from '@/lib/utils/entityTestTypes';
import { EntityTypeSelector } from './EntityTypeSelector';
import { EntityTestModeSelector } from './EntityTestModeSelector';
// Contact imports
import { TestContactList } from './TestContactList';
import { TestContactSearch } from './TestContactSearch';
import { useTestContacts, type TestContact } from '@/lib/hooks/useTestContacts';
// Deal imports
import { TestDealList } from './TestDealList';
import { TestDealSearch } from './TestDealSearch';
import { useTestDeals, type TestDeal } from '@/lib/hooks/useTestDeals';
// Email imports
import { TestEmailList } from './TestEmailList';
import { TestEmailSearch } from './TestEmailSearch';
import { useTestEmails, type TestEmail } from '@/lib/hooks/useTestEmails';
// Activity imports
import { TestActivityList } from './TestActivityList';
import { TestActivitySearch } from './TestActivitySearch';
import { useTestActivities, type TestActivity } from '@/lib/hooks/useTestActivities';
// Meeting imports
import { TestMeetingList } from './TestMeetingList';
import { TestMeetingSearch } from './TestMeetingSearch';
import { useTestMeetings, type TestMeeting } from '@/lib/hooks/useTestMeetings';

type TestMode = 'readonly' | 'mock';

interface ToolExecutionDetail {
  toolName: string;
  startTime?: string;
  endTime?: string;
  durationMs?: number;
  success: boolean;
  error?: string;
  args?: unknown;
  resultSummary?: string;
  resultSize?: number;
  metadata?: Record<string, unknown>;
}

interface TestSkillResponse {
  success: boolean;
  skill_key: string;
  output: string;
  tools_used: string[];
  tool_iterations: number;
  tool_executions: ToolExecutionDetail[];
  usage?: { input_tokens: number; output_tokens: number };
  error?: string;
}

// Union type for selected entities
type SelectedEntity = TestContact | TestDeal | TestEmail | TestActivity | TestMeeting | null;

interface SkillTestConsoleProps {
  skillKey: string;
  initialInput?: string;
}

/**
 * Map requires_context fields to entity types
 * Note: transcript_id maps to meeting since transcripts come from meetings
 */
const CONTEXT_TO_ENTITY_MAP: Record<string, EntityType> = {
  deal_id: 'deal',
  contact_id: 'contact',
  meeting_id: 'meeting',
  transcript_id: 'meeting', // Transcripts are part of meetings
  email_id: 'email',
  activity_id: 'activity',
};

/**
 * Extract required entity types from skill's requires_context
 */
function getRequiredEntityTypes(requiresContext: string[] | undefined): EntityType[] {
  if (!requiresContext || requiresContext.length === 0) return [];

  const entityTypes: EntityType[] = [];
  for (const ctx of requiresContext) {
    const entityType = CONTEXT_TO_ENTITY_MAP[ctx];
    if (entityType && !entityTypes.includes(entityType)) {
      entityTypes.push(entityType);
    }
  }
  return entityTypes;
}

/**
 * Fetch skill by key
 */
async function fetchSkillByKey(skillKey: string): Promise<PlatformSkill | null> {
  const { data, error } = await supabase
    .from('platform_skills')
    .select('*')
    .eq('skill_key', skillKey)
    .maybeSingle();

  if (error) {
    console.error('Error fetching skill:', error);
    return null;
  }

  return data as PlatformSkill | null;
}

export function SkillTestConsole({ skillKey, initialInput }: SkillTestConsoleProps) {
  const { activeOrgId, loadOrganizations, isLoading } = useOrgStore();
  const { user } = useAuth();

  const [testInput, setTestInput] = useState(initialInput || 'Run this skill for a call prep briefing.');
  const [mode, setMode] = useState<TestMode>('readonly');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<TestSkillResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outputView, setOutputView] = useState<'rendered' | 'raw'>('rendered');

  // Track if initialInput changes and update testInput accordingly
  const prevInitialInputRef = useRef(initialInput);
  useEffect(() => {
    if (initialInput && initialInput !== prevInitialInputRef.current) {
      setTestInput(initialInput);
      prevInitialInputRef.current = initialInput;
    }
  }, [initialInput]);

  // Entity testing states
  const [entityType, setEntityType] = useState<EntityType>('contact');
  const [entityMode, setEntityMode] = useState<EntityTestMode>('none');
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity>(null);
  const [showEntitySection, setShowEntitySection] = useState(false);

  // Fetch skill metadata to get required context
  const { data: skill } = useQuery({
    queryKey: ['platform-skill', skillKey],
    queryFn: () => fetchSkillByKey(skillKey),
    enabled: !!skillKey,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Compute required entity types from skill's requires_context
  const requiredEntityTypes = useMemo(() => {
    return getRequiredEntityTypes(skill?.frontmatter?.requires_context);
  }, [skill?.frontmatter?.requires_context]);

  // Check if required context is satisfied
  const isRequiredContextSatisfied = useMemo(() => {
    if (requiredEntityTypes.length === 0) return true;
    // Check if selected entity matches one of the required types
    return requiredEntityTypes.includes(entityType) && selectedEntity !== null;
  }, [requiredEntityTypes, entityType, selectedEntity]);

  // Auto-expand entity section and pre-select entity type when skill requires context
  useEffect(() => {
    if (requiredEntityTypes.length > 0) {
      // Auto-expand entity section
      setShowEntitySection(true);
      // Pre-select the first required entity type if not already set
      if (!requiredEntityTypes.includes(entityType)) {
        setEntityType(requiredEntityTypes[0]);
      }
      // Set mode to 'good' if currently 'none'
      if (entityMode === 'none') {
        setEntityMode('good');
      }
    }
  }, [requiredEntityTypes, entityType, entityMode]);

  // Derive tier mode for fetching (good/average/bad only, not 'none' or 'custom')
  const tierMode: QualityTier | null =
    entityMode !== 'none' && entityMode !== 'custom' ? entityMode : null;

  // Fetch contacts when entity type is 'contact'
  const { contacts, isLoading: isLoadingContacts } = useTestContacts({
    mode: tierMode || 'good',
    enabled: !!tierMode && entityType === 'contact' && !!user?.id,
    limit: 10,
  });

  // Fetch deals when entity type is 'deal'
  const { deals, isLoading: isLoadingDeals } = useTestDeals({
    mode: tierMode || 'good',
    enabled: !!tierMode && entityType === 'deal' && !!user?.id,
    limit: 10,
  });

  // Fetch emails when entity type is 'email'
  const { emails, isLoading: isLoadingEmails } = useTestEmails({
    mode: tierMode || 'good',
    enabled: !!tierMode && entityType === 'email' && !!user?.id,
    limit: 10,
  });

  // Fetch activities when entity type is 'activity'
  const { activities, isLoading: isLoadingActivities } = useTestActivities({
    mode: tierMode || 'good',
    enabled: !!tierMode && entityType === 'activity' && !!user?.id,
    limit: 10,
  });

  // Fetch meetings when entity type is 'meeting'
  const { meetings, isLoading: isLoadingMeetings } = useTestMeetings({
    mode: tierMode || 'good',
    enabled: !!tierMode && entityType === 'meeting' && !!user?.id,
    limit: 10,
  });

  // Reset selected entity when entity type or mode changes
  const handleEntityTypeChange = (newType: EntityType) => {
    setEntityType(newType);
    setSelectedEntity(null);
  };

  const handleEntityModeChange = (newMode: EntityTestMode) => {
    setEntityMode(newMode);
    setSelectedEntity(null);
    setShowEntitySection(newMode !== 'none');
  };

  useEffect(() => {
    // Ensure we have an org loaded for authenticated admins
    if (!activeOrgId && !isLoading) {
      loadOrganizations().catch(() => {});
    }
  }, [activeOrgId, isLoading, loadOrganizations]);

  const canRun = useMemo(() => {
    const hasSkill = !!skillKey && !!activeOrgId && !isRunning;
    // If skill requires specific context, ensure it's provided
    if (!isRequiredContextSatisfied) {
      return false;
    }
    // If entity mode requires a selection, ensure one is selected
    if (entityMode !== 'none' && !selectedEntity) {
      return false;
    }
    return hasSkill;
  }, [skillKey, activeOrgId, isRunning, entityMode, selectedEntity, isRequiredContextSatisfied]);

  /**
   * Build entity context based on the entity type and selected entity
   */
  const buildEntityContext = (): Record<string, unknown> | null => {
    if (!selectedEntity || entityMode === 'none') return null;

    switch (entityType) {
      case 'contact': {
        const contact = selectedEntity as TestContact;
        return {
          id: contact.id,
          email: contact.email,
          name: contact.full_name ||
            [contact.first_name, contact.last_name].filter(Boolean).join(' '),
          title: contact.title,
          company_id: contact.company_id,
          company_name: contact.company_name,
          total_meetings_count: contact.total_meetings_count,
          quality_tier: contact.qualityScore.tier,
          quality_score: contact.qualityScore.score,
        };
      }
      case 'deal': {
        const deal = selectedEntity as TestDeal;
        return {
          id: deal.id,
          name: deal.name,
          company: deal.company,
          contact_name: deal.contact_name,
          value: deal.value,
          stage_name: deal.stage_name,
          health_status: deal.health_status,
          overall_health_score: deal.overall_health_score,
          days_in_current_stage: deal.days_in_current_stage,
          quality_tier: deal.qualityScore.tier,
          quality_score: deal.qualityScore.score,
        };
      }
      case 'email': {
        const email = selectedEntity as TestEmail;
        return {
          id: email.id,
          external_id: email.external_id,
          thread_id: email.thread_id,
          direction: email.direction,
          category: email.category,
          subject: email.subject,
          from_email: email.from_email,
          signals: email.signals,
          received_at: email.received_at,
          quality_tier: email.qualityScore.tier,
          quality_score: email.qualityScore.score,
        };
      }
      case 'activity': {
        const activity = selectedEntity as TestActivity;
        return {
          id: activity.id,
          type: activity.type,
          status: activity.status,
          priority: activity.priority,
          client_name: activity.client_name,
          details: activity.details,
          amount: activity.amount,
          date: activity.date,
          deal_id: activity.deal_id,
          engagement_quality: activity.engagement_quality,
          quality_tier: activity.qualityScore.tier,
          quality_score: activity.qualityScore.score,
        };
      }
      case 'meeting': {
        const meeting = selectedEntity as TestMeeting;
        return {
          id: meeting.id,
          title: meeting.title,
          meeting_start: meeting.meeting_start,
          duration_minutes: meeting.duration_minutes,
          summary: meeting.summary,
          transcript_text: meeting.transcript_text,
          transcript_excerpt: meeting.transcript_excerpt,
          company_id: meeting.company_id,
          company_name: meeting.company_name,
          primary_contact_id: meeting.primary_contact_id,
          contact_name: meeting.contact_name,
          quality_tier: meeting.qualityScore.tier,
          quality_score: meeting.qualityScore.score,
        };
      }
      default:
        return null;
    }
  };

  /**
   * Get the display label for the selected entity
   */
  const getSelectedEntityLabel = (): string => {
    if (!selectedEntity) return '';

    switch (entityType) {
      case 'contact': {
        const contact = selectedEntity as TestContact;
        return contact.full_name || contact.email || 'Unknown';
      }
      case 'deal': {
        const deal = selectedEntity as TestDeal;
        return deal.name;
      }
      case 'email': {
        const email = selectedEntity as TestEmail;
        return email.subject || email.from_email || 'Email';
      }
      case 'activity': {
        const activity = selectedEntity as TestActivity;
        return activity.client_name;
      }
      case 'meeting': {
        const meeting = selectedEntity as TestMeeting;
        return meeting.title || 'Untitled Meeting';
      }
      default:
        return '';
    }
  };

  const handleRun = async () => {
    setError(null);
    setResult(null);
    setIsRunning(true);
    try {
      const headers = await getSupabaseHeaders();

      // Build request body with optional entity context
      const requestBody: Record<string, unknown> = {
        skill_key: skillKey,
        test_input: testInput,
        mode,
      };

      // Add entity context if an entity is selected
      const entityContext = buildEntityContext();
      if (selectedEntity && entityMode !== 'none' && entityContext) {
        requestBody.entity_type = entityType;
        requestBody.entity_test_mode = entityMode;
        requestBody[`${entityType}_id`] = entityContext.id;
        requestBody[`${entityType}_context`] = entityContext;

        // For backwards compatibility, also set contact-specific fields
        if (entityType === 'contact') {
          requestBody.contact_id = entityContext.id;
          requestBody.contact_test_mode = entityMode;
          requestBody.contact_context = entityContext;
        }

        // For meetings, also set transcript_id since transcripts are part of meetings
        if (entityType === 'meeting') {
          requestBody.transcript_id = entityContext.id;
          requestBody.transcript_context = {
            id: entityContext.id,
            text: entityContext.transcript_text,
            excerpt: entityContext.transcript_excerpt,
          };
        }
      }

      const resp = await fetch(`${API_BASE_URL}/api-copilot/actions/test-skill`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = (await resp.json().catch(() => ({}))) as TestSkillResponse;
      if (!resp.ok || !data.success) {
        throw new Error((data as any).error || `Test failed (${resp.status})`);
      }

      setResult(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to run test';
      setError(msg);
    } finally {
      setIsRunning(false);
    }
  };

  /**
   * Get the deal ID if a deal is selected
   */
  const getSelectedDealId = (): string | undefined => {
    if (entityType === 'deal' && selectedEntity) {
      return (selectedEntity as TestDeal).id;
    }
    return undefined;
  };

  /**
   * Parse a date string like "Jan 21" or "Jan 21, 2026" into ISO format
   */
  const parseDateString = (dateStr: string): string | null => {
    if (!dateStr) return null;

    try {
      // Try direct date parse first
      let date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }

      // Handle formats like "Jan 21" - assume current or next year
      const monthDayMatch = dateStr.match(/^([A-Za-z]+)\s+(\d+)/);
      if (monthDayMatch) {
        const [, month, day] = monthDayMatch;
        const currentYear = new Date().getFullYear();
        date = new Date(`${month} ${day}, ${currentYear}`);

        // If the date is in the past, use next year
        if (date < new Date()) {
          date = new Date(`${month} ${day}, ${currentYear + 1}`);
        }

        if (!isNaN(date.getTime())) {
          return date.toISOString();
        }
      }

      return null;
    } catch {
      return null;
    }
  };

  /**
   * Map priority string to task priority enum
   */
  const mapPriority = (priority: string): 'low' | 'medium' | 'high' | 'urgent' => {
    const p = priority.toLowerCase();
    if (p === 'high' || p === 'urgent' || p === 'critical') return 'high';
    if (p === 'medium' || p === 'normal') return 'medium';
    return 'low';
  };

  /**
   * Handle task creation via direct Supabase insertion
   */
  const handleCreateTask = async (task: MAPTask): Promise<void> => {
    const dealId = getSelectedDealId();

    if (!user?.id) {
      throw new Error('User not authenticated');
    }

    try {
      const dueDate = parseDateString(task.dueDate);

      const { error } = await supabase
        .from('tasks')
        .insert({
          title: task.title,
          description: task.description?.join('\n') || null,
          due_date: dueDate,
          priority: mapPriority(task.priority),
          status: 'pending',
          task_type: 'follow_up',
          assigned_to: user.id,
          created_by: user.id,
          deal_id: dealId || null,
          metadata: {
            source: 'map_builder',
            owner: task.owner,
          },
        });

      if (error) {
        console.error('Supabase error creating task:', error);
        throw error;
      }
    } catch (error) {
      console.error('Failed to create task:', error);
      throw error;
    }
  };

  /**
   * Handle creating all tasks via copilot API
   */
  const handleCreateAllTasks = async (tasks: MAPTask[]): Promise<void> => {
    for (const task of tasks) {
      await handleCreateTask(task);
    }
  };

  /**
   * Handle plan acceptance
   */
  const handleAcceptPlan = async (): Promise<void> => {
    // For now, accepting the plan is just a local state change in MAPRenderer
    // Could be extended to call an API to store the plan acceptance
    toast.success('Plan accepted! You can now create tasks.');
  };

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-gray-200 dark:border-gray-700/50 px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-800/30">
        <div className="flex items-center gap-2">
          <TerminalSquare className="w-4 h-4 text-gray-700 dark:text-gray-200" />
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Skill Test Console</span>
          <Badge variant="outline" className="font-mono text-xs">
            {skillKey}
          </Badge>
        </div>
        <Button onClick={handleRun} disabled={!canRun} className="gap-2">
          {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {isRunning ? 'Running…' : 'Run'}
        </Button>
      </div>

      <div className="p-4 space-y-3 overflow-auto">
        {!activeOrgId && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-800/50 dark:bg-amber-900/10 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 mt-0.5" />
            <div className="text-sm">
              No active org selected. The test endpoint runs against the authenticated user's org membership.
            </div>
          </div>
        )}

        {/* Required Context Banner */}
        {requiredEntityTypes.length > 0 && (
          <div className={cn(
            "flex items-start gap-2 rounded-md border p-3",
            isRequiredContextSatisfied
              ? "border-green-200 bg-green-50 text-green-900 dark:border-green-800/50 dark:bg-green-900/10 dark:text-green-200"
              : "border-purple-200 bg-purple-50 text-purple-900 dark:border-purple-800/50 dark:bg-purple-900/10 dark:text-purple-200"
          )}>
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="text-sm">
              <span className="font-medium">Required context:</span>{' '}
              {requiredEntityTypes.map((type, idx) => (
                <Badge
                  key={type}
                  variant="outline"
                  className={cn(
                    "mx-1 text-xs font-mono",
                    entityType === type && selectedEntity
                      ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700"
                      : "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-700"
                  )}
                >
                  {type}_id
                </Badge>
              ))}
              {!isRequiredContextSatisfied && (
                <span className="ml-1 text-purple-700 dark:text-purple-300">
                  — Select {requiredEntityTypes.length === 1 ? `a ${requiredEntityTypes[0]}` : 'an entity'} below to run this skill
                </span>
              )}
              {isRequiredContextSatisfied && (
                <span className="ml-1 text-green-700 dark:text-green-300">
                  ✓ Context provided
                </span>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Test input</label>
            <Textarea value={testInput} onChange={(e) => setTestInput(e.target.value)} className="mt-1 min-h-[100px]" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Mode</label>
            <Input
              value={mode}
              onChange={(e) => setMode((e.target.value as TestMode) || 'readonly')}
              className="mt-1"
              placeholder="readonly | mock"
            />
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Use <span className="font-mono">readonly</span> unless you're mocking external calls.
            </p>
          </div>
        </div>

        {/* Entity Testing Section */}
        <div className="rounded-lg border border-gray-200 dark:border-gray-700/50 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowEntitySection(!showEntitySection)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/30 hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Entity Testing Mode
              </span>
              {entityMode !== 'none' && selectedEntity && (
                <Badge variant="outline" className="text-xs">
                  {getSelectedEntityLabel()}
                </Badge>
              )}
              {entityMode !== 'none' && !selectedEntity && (
                <Badge variant="outline" className="text-xs text-amber-600 dark:text-amber-400">
                  Select {entityType === 'activity' ? 'an' : 'a'} {entityType}
                </Badge>
              )}
            </div>
            {showEntitySection ? (
              <ChevronUp className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            )}
          </button>

          {showEntitySection && (
            <div className="p-4 space-y-4 border-t border-gray-200 dark:border-gray-700/50">
              {/* Entity Type Selector */}
              <EntityTypeSelector
                type={entityType}
                onChange={handleEntityTypeChange}
                disabled={isRunning}
              />

              {/* Entity Mode Selector */}
              <EntityTestModeSelector
                entityType={entityType}
                mode={entityMode}
                onChange={handleEntityModeChange}
                disabled={isRunning}
              />

              {/* Contact List/Search */}
              {entityType === 'contact' && tierMode && (
                <TestContactList
                  contacts={contacts}
                  isLoading={isLoadingContacts}
                  selectedContactId={(selectedEntity as TestContact | null)?.id || null}
                  onSelect={(contact) => setSelectedEntity(contact)}
                  tier={tierMode}
                />
              )}
              {entityType === 'contact' && entityMode === 'custom' && (
                <TestContactSearch
                  selectedContact={selectedEntity as TestContact | null}
                  onSelect={(contact) => setSelectedEntity(contact)}
                />
              )}

              {/* Deal List/Search */}
              {entityType === 'deal' && tierMode && (
                <TestDealList
                  deals={deals}
                  isLoading={isLoadingDeals}
                  selectedDealId={(selectedEntity as TestDeal | null)?.id || null}
                  onSelect={(deal) => setSelectedEntity(deal)}
                  tier={tierMode}
                />
              )}
              {entityType === 'deal' && entityMode === 'custom' && (
                <TestDealSearch
                  selectedDeal={selectedEntity as TestDeal | null}
                  onSelect={(deal) => setSelectedEntity(deal)}
                />
              )}

              {/* Email List/Search */}
              {entityType === 'email' && tierMode && (
                <TestEmailList
                  emails={emails}
                  isLoading={isLoadingEmails}
                  selectedEmailId={(selectedEntity as TestEmail | null)?.id || null}
                  onSelect={(email) => setSelectedEntity(email)}
                  tier={tierMode}
                />
              )}
              {entityType === 'email' && entityMode === 'custom' && (
                <TestEmailSearch
                  selectedEmail={selectedEntity as TestEmail | null}
                  onSelect={(email) => setSelectedEntity(email)}
                />
              )}

              {/* Activity List/Search */}
              {entityType === 'activity' && tierMode && (
                <TestActivityList
                  activities={activities}
                  isLoading={isLoadingActivities}
                  selectedActivityId={(selectedEntity as TestActivity | null)?.id || null}
                  onSelect={(activity) => setSelectedEntity(activity)}
                  tier={tierMode}
                />
              )}
              {entityType === 'activity' && entityMode === 'custom' && (
                <TestActivitySearch
                  selectedActivity={selectedEntity as TestActivity | null}
                  onSelect={(activity) => setSelectedEntity(activity)}
                />
              )}

              {/* Meeting List/Search */}
              {entityType === 'meeting' && tierMode && (
                <TestMeetingList
                  meetings={meetings}
                  isLoading={isLoadingMeetings}
                  selectedMeetingId={(selectedEntity as TestMeeting | null)?.id || null}
                  onSelect={(meeting) => setSelectedEntity(meeting)}
                  tier={tierMode}
                />
              )}
              {entityType === 'meeting' && entityMode === 'custom' && (
                <TestMeetingSearch
                  selectedMeeting={selectedEntity as TestMeeting | null}
                  onSelect={(meeting) => setSelectedEntity(meeting)}
                />
              )}
            </div>
          )}
        </div>

        {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}

        {result && (
          <div className="space-y-4">
            <div className="rounded-md border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Output</div>
                  {result.usage && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {result.usage.input_tokens} in / {result.usage.output_tokens} out
                    </div>
                  )}
                </div>
                <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => setOutputView('rendered')}
                    className={cn(
                      'px-2.5 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5',
                      outputView === 'rendered'
                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    )}
                  >
                    <Eye className="w-3 h-3" />
                    Rendered
                  </button>
                  <button
                    type="button"
                    onClick={() => setOutputView('raw')}
                    className={cn(
                      'px-2.5 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5',
                      outputView === 'raw'
                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    )}
                  >
                    <Code className="w-3 h-3" />
                    Raw
                  </button>
                </div>
              </div>
              <div className="p-4 max-h-[600px] overflow-y-auto">
                {outputView === 'rendered' ? (
                  isMAPContent(result.output) ? (
                    <MAPRenderer
                      content={result.output}
                      dealId={getSelectedDealId()}
                      onCreateTask={handleCreateTask}
                      onCreateAllTasks={handleCreateAllTasks}
                      onAcceptPlan={handleAcceptPlan}
                    />
                  ) : (
                    <SkillOutputRenderer content={result.output} />
                  )
                ) : (
                  <pre className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200 font-mono">{result.output}</pre>
                )}
              </div>
            </div>

            <div className="rounded-md border border-gray-200 dark:border-gray-800 p-3">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Tool executions</div>
              <div className="mt-2 space-y-2">
                {(result.tool_executions || []).length === 0 && (
                  <div className="text-sm text-gray-500 dark:text-gray-400">No tool executions recorded.</div>
                )}
                {(result.tool_executions || []).map((t, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      'flex items-center justify-between rounded-md border px-3 py-2',
                      t.success
                        ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800/40 dark:bg-emerald-900/10'
                        : 'border-red-200 bg-red-50 dark:border-red-800/40 dark:bg-red-900/10'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-gray-900 dark:text-gray-100">{t.toolName}</span>
                      {typeof t.durationMs === 'number' && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">{t.durationMs}ms</span>
                      )}
                    </div>
                    {!t.success && t.error && (
                      <span className="text-xs text-red-700 dark:text-red-300">{t.error}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

