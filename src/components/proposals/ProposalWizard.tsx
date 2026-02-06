import { useState, useEffect, useRef } from 'react';
import { parseMeetingSummary, getMeetingSummaryPlainText } from '@/lib/utils/meetingSummaryParser';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, FileText, FileCode, CheckCircle2, ArrowRight, ArrowLeft, Calendar, Clock, Users, Share2, Link, Lock, Copy, Check, Eye, Mail, AlertCircle, X, Monitor, Layout, Palette, File, Download, BookTemplate, Upload } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  generateGoals,
  generateSOW,
  generateProposal,
  generateEmailProposal,
  generateMarkdownProposal,
  getMeetingTranscripts,
  getTranscriptsFromMeetings,
  saveProposal,
  getJobStatus,
  pollJobStatus,
  analyzeFocusAreas,
  updateProposalShareSettings,
  getProposalShareUrl,
  extractGoalsFromMeeting,
  getProposalTemplates,
  getStructuredTemplates,
  downloadProposalDocx,
  downloadProposalPdf,
  subscribeToProposalProgress,
  type GenerateResponse,
  type JobStatus,
  type FocusArea,
  type ProposalTemplate,
  type StructuredTemplate,
  type TemplateExtraction,
  uploadAndParseDocument,
  createTemplateFromExtraction,
} from '@/lib/services/proposalService';
import BrandConfigPanel from './BrandConfigPanel';
import ProposalPreview from './ProposalPreview';
import type { ProposalSection, BrandConfig } from './ProposalPreview';
import SaveTemplateModal from './SaveTemplateModal';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { useOrgId } from '@/lib/contexts/OrgContext';
import {
  OrgProposalWorkflowService,
  type OrgProposalWorkflow,
  getWorkflowOutputTypes,
} from '@/lib/services/orgProposalWorkflowService';

const DESIGN_SYSTEM_SNIPPET = `<!-- DESIGN_SYSTEM_READY -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<script src="https://cdn.tailwindcss.com"></script>
<script>
  tailwind.config = {
    darkMode: ['class', '[data-theme="dark"]'],
    theme: {
      extend: {
        colors: {
          brand: {
            50: '#eff6ff',
            100: '#dbeafe',
            200: '#bfdbfe',
            300: '#93c5fd',
            400: '#60a5fa',
            500: '#3b82f6',
            600: '#2563eb',
            700: '#1d4ed8',
            800: '#1e40af',
            900: '#1e3a8a'
          }
        },
        fontFamily: {
          sans: ['Inter', 'system-ui', 'sans-serif']
        },
        boxShadow: {
          glass: '0 8px 32px rgba(0, 0, 0, 0.3)'
        }
      }
    }
  };
</script>
<style>
  body {
    background: linear-gradient(135deg, #030712 0%, #111827 100%);
    font-family: 'Inter', system-ui, sans-serif;
    color: #f3f4f6;
    min-height: 100vh;
    margin: 0;
  }
  .glass-card {
    background: rgba(17, 24, 39, 0.8);
    border: 1px solid rgba(55, 65, 81, 0.5);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(16px);
  }
  .glass-premium {
    background: rgba(20, 28, 36, 0.6);
    border: 1px solid rgba(45, 62, 78, 0.4);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(24px);
  }
</style>`;

const ensureDesignSystemApplied = (html: string) => {
  let output = html?.trim() || '';
  if (!output) return output;

  const hasDoctype = /<!DOCTYPE/i.test(output);
  const hasHtmlTag = /<html[^>]*>/i.test(output);

  if (!hasDoctype || !hasHtmlTag) {
    output = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
${DESIGN_SYSTEM_SNIPPET}
</head>
<body>
${output}
</body>
</html>`;
    return output;
  }

  // Ensure html tag has data-theme
  output = output.replace(/<html([^>]*)>/i, (match, attrs = '') => {
    if (/data-theme=/i.test(match)) return match;
    const existingAttrs = attrs?.trim();
    return existingAttrs ? `<html ${existingAttrs} data-theme="dark">` : '<html data-theme="dark">';
  });

  if (!/<!-- DESIGN_SYSTEM_READY -->/i.test(output)) {
    if (/<head[^>]*>/i.test(output)) {
      output = output.replace(/<head([^>]*)>/i, `<head$1>\n${DESIGN_SYSTEM_SNIPPET}\n`);
    } else {
      output = output.replace(/<html[^>]*>/i, (match) => `${match}\n<head>\n${DESIGN_SYSTEM_SNIPPET}\n</head>\n`);
    }
  }

  return output;
};

type Step = 'select_meetings' | 'analyze_focus' | 'loading' | 'review_goals' | 'choose_format' | 'configure_document' | 'preview' | 'share';

// Steps that represent completed work (not transient states like 'loading')
const COMPLETABLE_STEPS: Step[] = ['select_meetings', 'analyze_focus', 'review_goals', 'choose_format', 'configure_document', 'preview'];

// Saved wizard state for persistence
interface SavedWizardState {
  step: Step;
  selectedMeetingIds: string[];
  focusAreas: FocusArea[];
  selectedFocusAreaIds: string[];
  goals: string;
  selectedFormat: 'sow' | 'proposal' | 'email' | 'markdown' | null;
  documentConfig: {
    length_target?: 'short' | 'medium' | 'long';
    word_limit?: number;
    page_target?: number;
  };
  finalContent: string;
  savedAt: string;
  contactName?: string;
  companyName?: string;
  outputFormat?: 'html' | 'docx' | 'pdf';
  selectedTemplateId?: string | null;
  brandingEnabled?: boolean;
}

// Generate storage key based on meeting IDs or contact
const getStorageKey = (meetingIds?: string[], contactId?: string): string => {
  if (meetingIds && meetingIds.length > 0) {
    return `proposal_wizard_${meetingIds.sort().join('_')}`;
  }
  if (contactId) {
    return `proposal_wizard_contact_${contactId}`;
  }
  return 'proposal_wizard_default';
};

// Save wizard state to localStorage
const saveWizardState = (key: string, state: SavedWizardState) => {
  try {
    localStorage.setItem(key, JSON.stringify(state));
    console.log('[ProposalWizard] State saved:', key, state.step);
  } catch (e) {
    console.error('[ProposalWizard] Failed to save state:', e);
  }
};

// Load wizard state from localStorage
const loadWizardState = (key: string): SavedWizardState | null => {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const state = JSON.parse(stored) as SavedWizardState;
      console.log('[ProposalWizard] State loaded:', key, state.step);
      return state;
    }
  } catch (e) {
    console.error('[ProposalWizard] Failed to load state:', e);
  }
  return null;
};

// Clear wizard state from localStorage
const clearWizardState = (key: string) => {
  try {
    localStorage.removeItem(key);
    console.log('[ProposalWizard] State cleared:', key);
  } catch (e) {
    console.error('[ProposalWizard] Failed to clear state:', e);
  }
};

interface MeetingContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  is_primary?: boolean;
}

interface Meeting {
  id: string;
  title: string;
  meeting_start: string;
  duration_minutes: number;
  transcript_text: string | null;
  summary: string | null;
  contacts?: MeetingContact[];
}

interface ProposalWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId?: string;
  meetingIds?: string[];
  contactName?: string;
  companyName?: string;
}

export function ProposalWizard({
  open,
  onOpenChange,
  contactId,
  meetingIds: initialMeetingIds,
  contactName,
  companyName,
}: ProposalWizardProps) {
  const [step, setStep] = useState<Step>('select_meetings');
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedMeetingIds, setSelectedMeetingIds] = useState<Set<string>>(new Set());
  const [transcripts, setTranscripts] = useState<string[]>([]);
  const [focusAreas, setFocusAreas] = useState<FocusArea[]>([]);
  const [selectedFocusAreaIds, setSelectedFocusAreaIds] = useState<Set<string>>(new Set());
  const [goals, setGoals] = useState<string>('');
  const [selectedFormat, setSelectedFormat] = useState<'sow' | 'proposal' | 'email' | 'markdown' | null>(null);
  const [documentConfig, setDocumentConfig] = useState<{
    length_target?: 'short' | 'medium' | 'long';
    word_limit?: number;
    page_target?: number;
  }>({});
  const [finalContent, setFinalContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isTextareaFocusedRef = useRef(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const iframeContentRef = useRef<string>('');
  const lastIframeUpdateRef = useRef<number>(0);

  const [iframeContent, setIframeContent] = useState<string>('');

  // State persistence
  const [savedState, setSavedState] = useState<SavedWizardState | null>(null);
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const storageKey = getStorageKey(initialMeetingIds, contactId);
  const hasCheckedSavedStateRef = useRef(false); // Track if we've already checked for saved state this session

  // Tab state for preview - show HTML code while generating, switch to preview when done
  const [previewTab, setPreviewTab] = useState<'html' | 'preview'>('html');
  const htmlCodeTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Share settings state
  const [savedProposalId, setSavedProposalId] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [sharePassword, setSharePassword] = useState('');
  const [isPublicEnabled, setIsPublicEnabled] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [savingShare, setSavingShare] = useState(false);

  // Phase 4.1: Quick Mode vs Advanced Mode
  const [proposalMode, setProposalMode] = useState<'quick' | 'advanced'>('advanced');
  const [quickModeSummary, setQuickModeSummary] = useState<string>('');
  const [quickModeEmail, setQuickModeEmail] = useState<string>('');

  // Org-configurable workflows
  const orgId = useOrgId();
  const [workflows, setWorkflows] = useState<OrgProposalWorkflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<OrgProposalWorkflow | null>(null);
  const [workflowsLoading, setWorkflowsLoading] = useState(false);

  // WIZ-001: Output format, template picker, and branding toggle
  const [outputFormat, setOutputFormat] = useState<'html' | 'docx' | 'pdf'>('html');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [brandingEnabled, setBrandingEnabled] = useState(true);
  const [templates, setTemplates] = useState<ProposalTemplate[]>([]);
  const [structuredTemplates, setStructuredTemplates] = useState<StructuredTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  // UPL-005: Upload example proposal flow in template picker
  const [wizardUploadProcessing, setWizardUploadProcessing] = useState(false);

  // WIZ-002: Brand configuration
  const [brandConfig, setBrandConfig] = useState<BrandConfig>({});

  // WIZ-003: Structured sections, download state, save-template modal, progress
  const [proposalSections, setProposalSections] = useState<ProposalSection[]>([]);
  const [downloading, setDownloading] = useState<'docx' | 'pdf' | null>(null);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{ step: string; percent: number; message: string } | null>(null);

  // Fetch org workflows on mount
  useEffect(() => {
    if (orgId && open) {
      setWorkflowsLoading(true);
      OrgProposalWorkflowService.getActiveWorkflows(orgId)
        .then(setWorkflows)
        .catch((err) => {
          console.error('[ProposalWizard] Failed to load workflows:', err);
          // Fallback to empty array - will show legacy format selection
          setWorkflows([]);
        })
        .finally(() => setWorkflowsLoading(false));
    }
  }, [orgId, open]);

  // Fetch proposal templates on mount (both prompt-style and structured)
  useEffect(() => {
    if (open) {
      setTemplatesLoading(true);
      Promise.all([
        getProposalTemplates().catch(() => []),
        getStructuredTemplates().catch(() => []),
      ])
        .then(([promptTemplates, structured]) => {
          setTemplates(promptTemplates);
          setStructuredTemplates(structured);
        })
        .catch((err) => {
          console.error('[ProposalWizard] Failed to load templates:', err);
          setTemplates([]);
          setStructuredTemplates([]);
        })
        .finally(() => setTemplatesLoading(false));
    }
  }, [open]);

  // TPL-002: When a structured template is selected, pre-populate sections and brand_config
  const handleSelectStructuredTemplate = (tmpl: StructuredTemplate) => {
    setSelectedTemplateId(tmpl.id);
    if (tmpl.sections && tmpl.sections.length > 0) {
      setProposalSections(tmpl.sections.map(s => ({
        id: s.id,
        type: s.type as ProposalSection['type'],
        title: s.title,
        content: s.content,
        order: s.order,
      })));
    }
    if (tmpl.brand_config) {
      setBrandConfig(tmpl.brand_config as BrandConfig);
    }
  };

  // Auto-scroll HTML code textarea to bottom while generating
  useEffect(() => {
    if (loading && previewTab === 'html' && htmlCodeTextareaRef.current) {
      htmlCodeTextareaRef.current.scrollTop = htmlCodeTextareaRef.current.scrollHeight;
    }
  }, [finalContent, loading, previewTab]);

  // Get step label for display
  const getStepLabel = (s: Step): string => {
    switch (s) {
      case 'select_meetings': return 'Select Meetings';
      case 'analyze_focus': return 'Focus Areas';
      case 'loading': return 'Loading';
      case 'review_goals': return 'Review Goals';
      case 'choose_format': return 'Choose Format';
      case 'configure_document': return 'Configure';
      case 'preview': return 'Preview';
      case 'share': return 'Share';
      default: return s;
    }
  };

  // Save current state to localStorage
  const saveCurrentState = (currentStep?: Step) => {
    const stateToSave: SavedWizardState = {
      step: currentStep || step,
      selectedMeetingIds: Array.from(selectedMeetingIds),
      focusAreas,
      selectedFocusAreaIds: Array.from(selectedFocusAreaIds),
      goals,
      selectedFormat,
      documentConfig,
      finalContent,
      savedAt: new Date().toISOString(),
      contactName,
      companyName,
      outputFormat,
      selectedTemplateId,
      brandingEnabled,
    };
    saveWizardState(storageKey, stateToSave);
  };

  // Restore state from saved state
  const restoreState = (state: SavedWizardState) => {
    setSelectedMeetingIds(new Set(state.selectedMeetingIds));
    setFocusAreas(state.focusAreas);
    setSelectedFocusAreaIds(new Set(state.selectedFocusAreaIds));
    setGoals(state.goals);
    setSelectedFormat(state.selectedFormat);
    setDocumentConfig(state.documentConfig);
    setFinalContent(state.finalContent);
    setOutputFormat(state.outputFormat ?? 'html');
    setSelectedTemplateId(state.selectedTemplateId ?? null);
    setBrandingEnabled(state.brandingEnabled ?? true);
    // Skip 'loading' step - go to the last completable step
    const targetStep = state.step === 'loading' ? 'review_goals' : state.step;
    setStep(targetStep);
    setShowResumeDialog(false);
    setSavedState(null);
  };

  // Start fresh - clear saved state
  const startFresh = () => {
    clearWizardState(storageKey);
    setSavedState(null);
    setShowResumeDialog(false);
    // Reset all state
    setFocusAreas([]);
    setSelectedFocusAreaIds(new Set());
    setGoals('');
    setSelectedFormat(null);
    setDocumentConfig({});
    setFinalContent('');
    setError(null);
    setStatusMessage(null);
    setTranscripts([]); // Clear transcripts to force reload
    setOutputFormat('html');
    setSelectedTemplateId(null);
    setBrandingEnabled(true);

    // If we have initial meeting IDs, skip meeting selection and reload transcripts
    if (initialMeetingIds && initialMeetingIds.length > 0) {
      setSelectedMeetingIds(new Set(initialMeetingIds));
      setStep('analyze_focus');
      // Re-load transcripts since we cleared them
      loadTranscripts(initialMeetingIds);
    } else {
      // Otherwise, go back to meeting selection
      setStep('select_meetings');
      setSelectedMeetingIds(new Set());
    }
  };

  // Jump to a specific step (for reprocessing)
  const jumpToStep = (targetStep: Step) => {
    // Clear data for steps after the target
    const stepOrder: Step[] = ['select_meetings', 'analyze_focus', 'review_goals', 'choose_format', 'configure_document', 'preview'];
    const targetIndex = stepOrder.indexOf(targetStep);

    if (targetIndex >= 0) {
      // Clear data for subsequent steps
      if (targetIndex <= stepOrder.indexOf('analyze_focus')) {
        setFocusAreas([]);
        setSelectedFocusAreaIds(new Set());
      }
      if (targetIndex <= stepOrder.indexOf('review_goals')) {
        setGoals('');
      }
      if (targetIndex <= stepOrder.indexOf('choose_format')) {
        setSelectedFormat(null);
        setOutputFormat('html');
        setSelectedTemplateId(null);
        setBrandingEnabled(true);
      }
      if (targetIndex <= stepOrder.indexOf('configure_document')) {
        setDocumentConfig({});
      }
      if (targetIndex <= stepOrder.indexOf('preview')) {
        setFinalContent('');
      }
    }

    setStep(targetStep);
    saveCurrentState(targetStep);
  };

  useEffect(() => {
    if (selectedFormat !== 'proposal') {
      setIframeContent(finalContent);
      iframeContentRef.current = finalContent;
      return;
    }
    if (!finalContent) return;

    const now = Date.now();
    const minInterval = loading ? 700 : 200;
    const elapsed = now - lastIframeUpdateRef.current;
    const delay = elapsed >= minInterval ? 0 : minInterval - elapsed;

    const timeoutId = setTimeout(() => {
      setIframeContent(finalContent);
      iframeContentRef.current = finalContent;
      lastIframeUpdateRef.current = Date.now();
    }, delay);

    return () => clearTimeout(timeoutId);
  }, [finalContent, selectedFormat, loading]);

  useEffect(() => {
    if (!loading && selectedFormat === 'proposal' && finalContent && iframeContentRef.current !== finalContent) {
      setIframeContent(finalContent);
      iframeContentRef.current = finalContent;
      lastIframeUpdateRef.current = Date.now();
    }
  }, [loading, selectedFormat, finalContent]);

  // Step 1: Load meetings when dialog opens - check for saved state first
  useEffect(() => {
    if (open) {
      // Only check for saved state once per session (when first opening the wizard)
      if (!hasCheckedSavedStateRef.current) {
        hasCheckedSavedStateRef.current = true;

        // Check for saved state
        const saved = loadWizardState(storageKey);
        if (saved && saved.step !== 'select_meetings') {
          // We have a saved state with progress - show resume dialog
          console.log('[ProposalWizard] Found saved state:', saved.step, 'showing resume dialog');
          setSavedState(saved);
          setShowResumeDialog(true);
          return;
        }
      }

      // No saved state or already checked - proceed normally
      if (initialMeetingIds && initialMeetingIds.length > 0) {
        // If specific meetings provided, load transcripts and show focus area selection
        setSelectedMeetingIds(new Set(initialMeetingIds));
        setStep('analyze_focus');
        loadTranscripts(initialMeetingIds);
      } else {
        // Otherwise, show meeting selection
        loadMeetings();
      }
    } else {
      // Reset the flag when dialog closes so we check again next time it opens
      hasCheckedSavedStateRef.current = false;
    }
  }, [open, initialMeetingIds, storageKey]);

  // Auto-save state when step changes (for completable steps)
  // Only save when step actually changes, not on every state update
  useEffect(() => {
    if (open && COMPLETABLE_STEPS.includes(step) && step !== 'select_meetings') {
      saveCurrentState(step);
    }
  }, [step, open]);

  const loadMeetings = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      let query = supabase
        .from('meetings')
        .select('id, title, meeting_start, duration_minutes, transcript_text, summary')
        .not('transcript_text', 'is', null)
        .order('meeting_start', { ascending: false });

      // Filter by contact or company
      if (contactId) {
        // Get meetings linked to this contact via primary_contact_id or meeting_contacts
        const { data: meetingsByPrimary } = await supabase
          .from('meetings')
          .select('id')
          .eq('primary_contact_id', contactId)
          .eq('owner_user_id', user.id);

        const { data: meetingContacts } = await supabase
          .from('meeting_contacts')
          .select('meeting_id')
          .eq('contact_id', contactId);

        const meetingIds = [
          ...(((meetingsByPrimary as Array<{ id: string }> | null) ?? []).map((m) => m.id)),
          ...(((meetingContacts as Array<{ meeting_id: string }> | null) ?? []).map((mc) => mc.meeting_id)),
        ];

        if (meetingIds.length > 0) {
          query = query.in('id', meetingIds);
        } else {
          setMeetings([]);
          setLoading(false);
          setError('No meetings found for this contact.');
          return;
        }
      } else if (companyName) {
        // Try to find company by name and get meetings
        const { data: company } = await supabase
          .from('companies')
          .select('id')
          .eq('name', companyName)
          .single();

        const companyRow = company as { id: string } | null;
        if (companyRow && companyRow.id) {
          query = query.eq('company_id', companyRow.id).eq('owner_user_id', user.id);
        } else {
          setMeetings([]);
          setLoading(false);
          setError('Company not found.');
          return;
        }
      } else {
        // No filter - get user's recent meetings with transcripts
        query = query.eq('owner_user_id', user.id).limit(50);
      }

      const { data: meetingsData, error: meetingsError } = await query;

      if (meetingsError) {
        throw meetingsError;
      }

      const meetingsRows = (meetingsData as any[] | null) ?? [];

      if (meetingsRows.length === 0) {
        setError('No meetings with transcripts found.');
        setMeetings([]);
      } else {
        // Fetch contacts for each meeting
        const meetingsWithContacts = await Promise.all(
          meetingsRows.map(async (meeting) => {
            // Fetch external contacts via meeting_contacts junction
            const { data: meetingContactsData } = await supabase
              .from('meeting_contacts')
              .select(`
                contact_id,
                is_primary,
                contacts (
                  id,
                  first_name,
                  last_name,
                  full_name,
                  email
                )
              `)
              .eq('meeting_id', meeting.id);

            const meetingContactsRows = (meetingContactsData as any[] | null) ?? [];
            const contacts: MeetingContact[] = meetingContactsRows
              .filter((mc: any) => mc.contacts)
              .map((mc: any) => ({
                ...(mc.contacts as any),
                is_primary: !!mc.is_primary,
              }));

            return {
              ...meeting,
              contacts
            };
          })
        );

        setMeetings(meetingsWithContacts);
        // Pre-select all meetings by default
        setSelectedMeetingIds(new Set(meetingsWithContacts.map(m => m.id)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load meetings');
    } finally {
      setLoading(false);
    }
  };

  const loadTranscripts = async (meetingIdsToLoad?: string[]) => {
    setLoading(true);
    setError(null);
    try {
      const idsToUse = meetingIdsToLoad || Array.from(selectedMeetingIds);
      
      if (idsToUse.length === 0) {
        setError('Please select at least one meeting.');
        setLoading(false);
        return;
      }

      const loadedTranscripts = await getTranscriptsFromMeetings(idsToUse);

      if (loadedTranscripts.length === 0) {
        setError('No transcripts found. Please ensure selected meetings have transcripts available.');
        setLoading(false);
        return;
      }

      setTranscripts(loadedTranscripts);
      setStep('analyze_focus');
      await analyzeFocusAreasFromTranscripts(loadedTranscripts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transcripts');
      setLoading(false);
    }
  };

  const handleMeetingToggle = (meetingId: string) => {
    setSelectedMeetingIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(meetingId)) {
        newSet.delete(meetingId);
      } else {
        newSet.add(meetingId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedMeetingIds.size === meetings.length) {
      setSelectedMeetingIds(new Set());
    } else {
      setSelectedMeetingIds(new Set(meetings.map(m => m.id)));
    }
  };

  const handleContinueFromSelection = async () => {
    if (selectedMeetingIds.size === 0) {
      setError('Please select at least one meeting');
      setStatusMessage('Please select at least one meeting');
      return;
    }
    setError(null);
    setStatusMessage(null);

    // Phase 4.1: Quick Mode - skip to summary generation
    if (proposalMode === 'quick') {
      setStep('loading');
      setLoading(true);
      setStatusMessage('Generating quick summary...');
      
      try {
        // Get the first selected meeting ID
        const firstMeetingId = Array.from(selectedMeetingIds)[0];
        
        // Extract goals from meeting
        const extracted = await extractGoalsFromMeeting(firstMeetingId);
        
        // Generate simple summary and follow-up email
        const summary = extracted.goals || 'Meeting summary will be generated here.';
        const email = `Hi ${contactName || 'there'},

Thank you for taking the time to meet with me today. I wanted to follow up on our conversation.

${summary}

${extracted.painPoints.length > 0 ? `\nKey pain points discussed:\n${extracted.painPoints.map(p => `- ${p}`).join('\n')}` : ''}

${extracted.proposedSolutions.length > 0 ? `\nProposed solutions:\n${extracted.proposedSolutions.map(s => `- ${s}`).join('\n')}` : ''}

I look forward to continuing our conversation and helping you achieve your goals.

Best regards`;

        setQuickModeSummary(summary);
        setQuickModeEmail(email);
        setFinalContent(email); // Set final content for preview
        setStep('preview'); // Show preview with summary and email
        setLoading(false);
        setStatusMessage(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate quick summary');
        setStatusMessage(null);
        setLoading(false);
        setStep('select_meetings');
      }
    } else {
      // Advanced Mode - proceed with normal flow
      setStep('analyze_focus');
      loadTranscripts();
    }
  };

  const analyzeFocusAreasFromTranscripts = async (transcriptList?: string[]) => {
    setLoading(true);
    setError(null);
    try {
      const transcriptsToAnalyze = transcriptList && transcriptList.length > 0 ? transcriptList : transcripts;
      if (!transcriptsToAnalyze || transcriptsToAnalyze.length === 0) {
        throw new Error('No transcripts available to analyze.');
      }

      const result = await analyzeFocusAreas({
        transcripts: transcriptsToAnalyze,
        contact_name: contactName,
        company_name: companyName,
      });

      if (!result.success || !result.focus_areas) {
        throw new Error(result.error || 'Failed to analyze focus areas');
      }

      setFocusAreas(result.focus_areas);
      // Pre-select all focus areas by default
      setSelectedFocusAreaIds(new Set(result.focus_areas.map(fa => fa.id)));
      setStep('analyze_focus');
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to analyze focus areas';
          setError(errorMsg);
          setStatusMessage(`Error: ${errorMsg}`);
        } finally {
          setLoading(false);
        }
      };

  const handleFocusAreaToggle = (focusAreaId: string) => {
    setSelectedFocusAreaIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(focusAreaId)) {
        newSet.delete(focusAreaId);
      } else {
        newSet.add(focusAreaId);
      }
      return newSet;
    });
  };

  const handleSelectAllFocusAreas = () => {
    if (selectedFocusAreaIds.size === focusAreas.length) {
      setSelectedFocusAreaIds(new Set());
    } else {
      setSelectedFocusAreaIds(new Set(focusAreas.map(fa => fa.id)));
    }
  };

  const handleContinueFromFocusAreas = async () => {
    if (selectedFocusAreaIds.size === 0) {
      setError('Please select at least one focus area');
      setStatusMessage('Please select at least one focus area');
      return;
    }
    setError(null);
    setStatusMessage(null);
    setStep('loading');
    const selectedFocusAreas = Array.from(selectedFocusAreaIds).map(id => {
      const fa = focusAreas.find(f => f.id === id);
      return fa?.title || '';
    }).filter(Boolean);
    await generateGoalsFromTranscripts(transcripts, selectedFocusAreas);
  };

  const generateGoalsFromTranscripts = async (transcriptList: string[], selectedFocusAreas?: string[]) => {
    setLoading(true);
    setStep('loading');
    setStatusMessage('Generating goals... This may take a minute.');
    setGoals(''); // Clear previous goals
    
    try {
      // Use streaming for goals generation
      const result: GenerateResponse = await generateGoals(
        {
          transcripts: transcriptList,
          contact_name: contactName,
          company_name: companyName,
          focus_areas: selectedFocusAreas,
        },
        (chunk: string) => {
          // Update goals as chunks arrive
          setGoals((prev) => prev + chunk);
          setStatusMessage('Generating goals... Processing your request.');
        }
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to generate goals');
      }

      // If streaming, content will be updated via onChunk callback
      if (result.content) {
        // Streaming response - content is already set via onChunk, just finalize
        setGoals(result.content);
        setStep('review_goals');
        setStatusMessage(null); // Clear status - goals will be shown
        setError(null);
      } else if (result.job_id) {
        // Fallback to polling if streaming not available
        setStatusMessage('Generating goals... This may take a minute.');
        
        const jobStatus = await pollJobStatus(result.job_id, {
          interval: 2000, // Poll every 2 seconds
          maxAttempts: 150, // Max 5 minutes
          onProgress: (status: JobStatus) => {
            if (status.status === 'processing') {
              setStatusMessage('Generating goals... Processing your request.');
            }
            // Update goals as they come in (if partial content available)
            if (status.content) {
              setGoals(status.content);
            }
          },
        });

        if (!jobStatus) {
          throw new Error('Job polling timed out. Please check the job status manually.');
        }

        if (jobStatus.status === 'failed') {
          throw new Error(jobStatus.error || 'Job failed');
        }

        if (jobStatus.status === 'completed' && jobStatus.content) {
          setGoals(jobStatus.content);
          setStep('review_goals');
          setStatusMessage(null); // Clear status - goals will be shown
          setError(null);
        } else {
          throw new Error('Job completed but no content received');
        }
      } else {
        throw new Error('No content or job_id received');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to generate goals';
      setError(errorMsg);
      setStatusMessage(`Error: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveGoals = () => {
    setStep('choose_format');
  };


  const handleGenerateDocument = async () => {
    console.log('[ProposalWizard] Starting document generation', { selectedFormat, goalsLength: goals.length });
    setStep('preview');
    setLoading(true);
    setError(null);
    // Show visual preview for HTML proposals so users can watch it build, HTML code for others
    setPreviewTab(selectedFormat === 'proposal' ? 'preview' : 'html');

    // Initialize with base HTML structure for proposals to prevent flashing
    if (selectedFormat === 'proposal') {
      const baseHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Proposal</title>
  <style>
    body {
      margin: 0;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #e0e0e0;
      min-height: 100vh;
    }
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 400px;
      color: #888;
    }
  </style>
</head>
<body>
  <div class="loading">Generating proposal...</div>
</body>
</html>`;
      console.log('[ProposalWizard] Set initial base HTML for proposal');
      setFinalContent(baseHTML);
      setIframeContent(baseHTML);
      iframeContentRef.current = baseHTML;
      lastIframeUpdateRef.current = Date.now();
    } else {
      // Clear for SOW, email, and markdown formats
      console.log('[ProposalWizard] Cleared content for non-proposal format');
      setFinalContent('');
      setIframeContent('');
      iframeContentRef.current = '';
    }

    try {
      const selectedFocusAreas = Array.from(selectedFocusAreaIds).map(id => {
        const fa = focusAreas.find(f => f.id === id);
        return fa?.title || '';
      }).filter(Boolean);

      console.log('[ProposalWizard] Prepared focus areas:', selectedFocusAreas);
      let result: GenerateResponse;
      let chunkCount = 0;
      
      if (selectedFormat === 'sow') {
        // Use streaming for SOW
        console.log('[ProposalWizard] Calling generateSOW with streaming');
        result = await generateSOW(
          {
            goals,
            contact_name: contactName,
            company_name: companyName,
            focus_areas: selectedFocusAreas,
            ...documentConfig,
          },
          (chunk: string) => {
            // Update content as chunks arrive
            chunkCount++;
            if (chunkCount <= 3 || chunkCount % 20 === 0) {
              console.log(`[ProposalWizard] SOW chunk #${chunkCount}, length: ${chunk.length}`);
            }
            setFinalContent((prev) => {
              const newContent = prev + chunk;
              if (chunkCount === 1 || chunkCount % 50 === 0) {
                console.log(`[ProposalWizard] SOW content length: ${newContent.length}`);
              }
              return newContent;
            });
          }
        );
        console.log('[ProposalWizard] generateSOW completed', { success: result.success, contentLength: result.content?.length, chunkCount });
      } else if (selectedFormat === 'email') {
        // Use streaming for email proposals
        result = await generateEmailProposal(
          {
            goals,
            contact_name: contactName,
            company_name: companyName,
            focus_areas: selectedFocusAreas,
            ...documentConfig,
          },
          (chunk: string) => {
            // Update content as chunks arrive
            setFinalContent((prev) => prev + chunk);
          }
        );
      } else if (selectedFormat === 'markdown') {
        // Use streaming for markdown proposals
        result = await generateMarkdownProposal(
          {
            goals,
            contact_name: contactName,
            company_name: companyName,
            focus_areas: selectedFocusAreas,
            ...documentConfig,
          },
          (chunk: string) => {
            // Update content as chunks arrive
            setFinalContent((prev) => prev + chunk);
          }
        );
      } else {
        // Use streaming for HTML proposals
        console.log('[ProposalWizard] Calling generateProposal with streaming');
        result = await generateProposal(
          {
            goals,
            contact_name: contactName,
            company_name: companyName,
            focus_areas: selectedFocusAreas,
            ...documentConfig,
          },
          (chunk: string) => {
            // Update content as chunks arrive - replace loading div with actual content
            chunkCount++;
            if (chunkCount <= 3 || chunkCount % 20 === 0) {
              console.log(`[ProposalWizard] HTML chunk #${chunkCount}, length: ${chunk.length}`);
            }
            setFinalContent((prev) => {
              // Remove markdown code block markers from chunk
              let cleanChunk = chunk
                .replace(/^```html\n?/gi, '')
                .replace(/\n?```$/gi, '')
                .replace(/^```\n?/gi, '')
                .replace(/^html\n?/gi, '')
                .trim();
              
              let newContent: string;
              
              // If chunk contains complete HTML structure, use it directly
              if (cleanChunk.includes('<!DOCTYPE') || (cleanChunk.includes('<html') && cleanChunk.includes('</html>'))) {
                const normalized = cleanChunk.replace(/^html\s*/i, '').trim();
                newContent = ensureDesignSystemApplied(normalized);
              }
              // If we have base HTML with loading message, start replacing it
              else if (prev.includes('Generating proposal...')) {
                // If chunk starts with HTML structure, replace entire body
                if (cleanChunk.includes('<!DOCTYPE') || cleanChunk.includes('<html')) {
                  newContent = ensureDesignSystemApplied(cleanChunk);
                }
                // Otherwise, replace loading div and append content
                else {
                  const bodyStart = prev.indexOf('<body>');
                  const bodyEnd = prev.indexOf('</body>');
                  if (bodyStart !== -1 && bodyEnd !== -1) {
                    const beforeBody = prev.substring(0, bodyStart + 6);
                    const afterBody = prev.substring(bodyEnd);
                    newContent = beforeBody + cleanChunk + afterBody;
                  } else {
                    // Fallback: just replace loading div
                    newContent = prev.replace(/<div class="loading">Generating proposal\.\.\.<\/div>/, '') + cleanChunk;
                  }
                  // Apply design system if we have HTML structure
                  if (newContent.includes('<!DOCTYPE') || newContent.includes('<html')) {
                    newContent = ensureDesignSystemApplied(newContent);
                  }
                }
              }
              // Otherwise, append chunk to existing content
              else {
                newContent = prev + cleanChunk;
                // Apply design system if we have HTML structure
                if (newContent.includes('<!DOCTYPE') || newContent.includes('<html')) {
                  newContent = ensureDesignSystemApplied(newContent);
                }
              }
              
              // Update iframe content for real-time preview (throttled to avoid performance issues)
              if (Date.now() - lastIframeUpdateRef.current > 200) {
                setIframeContent(newContent);
                iframeContentRef.current = newContent;
                lastIframeUpdateRef.current = Date.now();
              }

              if (chunkCount === 1 || chunkCount % 50 === 0) {
                console.log(`[ProposalWizard] HTML content length: ${newContent.length}`);
              }
              return newContent;
            });
          }
        );
        console.log('[ProposalWizard] generateProposal completed', { success: result.success, contentLength: result.content?.length, chunkCount });
      }

      console.log('[ProposalWizard] Generation result:', {
        success: result.success,
        hasContent: !!result.content,
        contentLength: result.content?.length,
        error: result.error
      });

      if (!result.success) {
        console.error('[ProposalWizard] Generation failed:', result.error);
        throw new Error(result.error || 'Failed to generate document');
      }

      if (result.content) {
        console.log('[ProposalWizard] Processing final content, length:', result.content.length);
        // Final content received - ensure it's complete HTML for proposals
        if (selectedFormat === 'proposal') {
          // Ensure we have a complete HTML document
          let htmlContent = result.content.trim();
          
          // Aggressively remove markdown code block markers and artifacts
          htmlContent = htmlContent
            .replace(/^```html\n?/gi, '')
            .replace(/\n?```$/gi, '')
            .replace(/^```\n?/gi, '')
            .replace(/^html\s*/gi, '')
            .replace(/^\s*html\s*/gi, '')
            .trim();
          
          // Remove any leading "html" text that might appear
          if (htmlContent.startsWith('html') && !htmlContent.startsWith('html>')) {
            htmlContent = htmlContent.replace(/^html\s*/i, '').trim();
          }
          
          // Ensure it starts with DOCTYPE or html tag
          if (!htmlContent.includes('<!DOCTYPE') && !htmlContent.includes('<html')) {
            // Wrap in basic HTML structure if needed
            htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Proposal</title>
</head>
<body>
${htmlContent}
</body>
</html>`;
          }
          
          const enhancedHtml = ensureDesignSystemApplied(htmlContent);
          setFinalContent(enhancedHtml);
          setIframeContent(enhancedHtml);
          iframeContentRef.current = enhancedHtml;
          lastIframeUpdateRef.current = Date.now();
        } else {
          setFinalContent(result.content);
        }
        setStatusMessage(null); // Clear status message on success - content will show
        setError(null);
        // Switch to preview tab now that generation is complete
        setPreviewTab('preview');
        console.log('[ProposalWizard] Successfully processed final content');
      } else {
        // No result.content, but check if we accumulated content via streaming
        console.warn('[ProposalWizard] No result.content received, checking current finalContent state');
        // We'll check finalContent in a setTimeout to allow React state updates to complete
        setTimeout(() => {
          setFinalContent((current) => {
            console.log('[ProposalWizard] Current finalContent length after generation:', current.length);
            if (!current || current.length === 0 || (selectedFormat === 'proposal' && current.includes('Generating proposal...'))) {
              console.error('[ProposalWizard] No content available after generation');
              setError('No content was generated. Please try again.');
              setStatusMessage('Error: No content generated');
            } else {
              console.log('[ProposalWizard] Content was accumulated via streaming, proceeding with preview');
              setStatusMessage(null);
              setError(null);
              setPreviewTab('preview');
            }
            return current;
          });
        }, 100);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to generate document';
      console.error('[ProposalWizard] Exception during generation:', err);
      setError(errorMsg);
      setStatusMessage(`Error: ${errorMsg}`);
    } finally {
      console.log('[ProposalWizard] Generation complete, setting loading=false');
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!finalContent || !selectedFormat) return;

    try {
      // Persist only known DB types; email/markdown are generated outputs but stored as 'proposal'.
      const persistedType: 'goals' | 'sow' | 'proposal' =
        selectedFormat === 'sow' ? 'sow' : selectedFormat === 'proposal' ? 'proposal' : 'proposal';

      const saved = await saveProposal({
        meeting_id: Array.from(selectedMeetingIds)[0],
        contact_id: contactId,
        type: persistedType,
        status: 'generated',
        content: finalContent,
        title: `${selectedFormat === 'sow' ? 'SOW' : selectedFormat === 'email' ? 'Email Proposal' : selectedFormat === 'markdown' ? 'Markdown Proposal' : 'Proposal'} - ${companyName || contactName || 'Untitled'}`,
      });

      if (saved) {
        // Store proposal info and transition to share step
        setSavedProposalId(saved.id);
        setShareToken(saved.share_token || null);
        setStep('share');
        setStatusMessage(null);
        setError(null);
      } else {
        setError('Failed to save proposal');
        setStatusMessage('Error: Failed to save proposal');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error saving proposal';
      setError(errorMsg);
      setStatusMessage(`Error: ${errorMsg}`);
    }
  };

  const [shouldClose, setShouldClose] = useState(false);

  const handleClose = () => {
    setStep('select_meetings');
    setMeetings([]);
    setSelectedMeetingIds(new Set());
    setTranscripts([]);
    setFocusAreas([]);
    setSelectedFocusAreaIds(new Set());
    setGoals('');
    setSelectedFormat(null);
    setDocumentConfig({});
    setFinalContent('');
    setIframeContent('');
    iframeContentRef.current = '';
    lastIframeUpdateRef.current = 0;
    setError(null);
    setStatusMessage(null);
    setShouldClose(false);
    isTextareaFocusedRef.current = false;
    // Reset share settings
    setSavedProposalId(null);
    setShareToken(null);
    setSharePassword('');
    setIsPublicEnabled(false);
    setLinkCopied(false);
    setSavingShare(false);
    // Reset WIZ-001 state
    setOutputFormat('html');
    setSelectedTemplateId(null);
    setBrandingEnabled(true);
    onOpenChange(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && !shouldClose) {
      // Check if textarea is focused
      if (isTextareaFocusedRef.current || textareaRef.current === document.activeElement) {
        // Prevent closing - re-open immediately
        setTimeout(() => onOpenChange(true), 0);
        return;
      }
      
      // Also check other form elements
      const activeElement = document.activeElement;
      const isFormElement = activeElement && (
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.tagName === 'INPUT' ||
        activeElement.closest('textarea') ||
        activeElement.closest('input')
      );
      
      // Prevent closing if interacting with a form element
      if (isFormElement) {
        // Re-open immediately to prevent close
        setTimeout(() => onOpenChange(true), 0);
        return;
      }
    }
    
    if (!newOpen) {
      handleClose();
    }
  };

  const handleRegenerateGoals = async () => {
    await generateGoalsFromTranscripts(transcripts);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent 
        className="max-w-4xl max-h-[90vh] flex flex-col p-0"
        onInteractOutside={(e) => {
          // Prevent closing when clicking on any interactive element inside
          const target = e.target as HTMLElement;
          // Check if the click is actually inside the dialog content
          const dialogContent = e.currentTarget as HTMLElement;
          if (dialogContent.contains(target)) {
            e.preventDefault();
            return;
          }
          // Also prevent closing when clicking on form elements
          if (target.tagName === 'TEXTAREA' || 
              target.tagName === 'INPUT' ||
              target.closest('textarea') ||
              target.closest('input') ||
              target.closest('[role="textbox"]')) {
            e.preventDefault();
          }
        }}
        onEscapeKeyDown={(e) => {
          // Allow ESC to close, but check if we're in a form element
          const activeElement = document.activeElement;
          if (activeElement && (
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.tagName === 'INPUT'
          )) {
            // If focus is in textarea/input, blur it first instead of closing
            (activeElement as HTMLElement).blur();
            e.preventDefault();
          }
        }}
      >
        <DialogHeader className="pb-4 px-6 pt-6 flex-shrink-0">
          <DialogTitle>Generate Proposal</DialogTitle>
          <DialogDescription>
            Create a proposal or SOW from call transcripts
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto px-6 pb-4">

        {/* Phase 4.1: Quick Mode vs Advanced Mode Toggle */}
        {step === 'select_meetings' && (
          <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border-2 border-blue-200 dark:border-blue-800">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="text-sm font-semibold mb-1 text-gray-900 dark:text-gray-100">
                  Proposal Mode
                </h3>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {proposalMode === 'quick' 
                    ? 'Quick Mode: Generate a simple summary and follow-up email'
                    : 'Advanced Mode: Full Goals → SOW → HTML workflow'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-medium ${proposalMode === 'quick' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500'}`}>
                  Quick
                </span>
                <Switch
                  id="proposal-mode"
                  checked={proposalMode === 'advanced'}
                  onCheckedChange={(checked) => {
                    setProposalMode(checked ? 'advanced' : 'quick');
                    // Reset quick mode state when switching
                    if (!checked) {
                      setQuickModeSummary('');
                      setQuickModeEmail('');
                    }
                  }}
                />
                <span className={`text-sm font-medium ${proposalMode === 'advanced' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500'}`}>
                  Advanced
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Resume Dialog - shown when saved state exists */}
        {showResumeDialog && savedState && (
          <div className="space-y-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg mb-4">
            <div className="flex items-start gap-3">
              <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 dark:text-blue-100">Saved Draft Found</h3>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  You have an unfinished proposal from {new Date(savedState.savedAt).toLocaleString()}.
                </p>
                <div className="mt-2 text-sm text-blue-600 dark:text-blue-400 space-y-1">
                  <p><strong>Last Step:</strong> {getStepLabel(savedState.step)}</p>
                  {savedState.selectedFormat && <p><strong>Format:</strong> {savedState.selectedFormat.toUpperCase()}</p>}
                  {savedState.goals && <p><strong>Content:</strong> {savedState.goals.length} chars of goals</p>}
                  {savedState.finalContent && <p><strong>Document:</strong> Generated ({savedState.finalContent.length} chars)</p>}
                </div>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-3 font-medium">
                  Choose an option below:
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={startFresh}
                className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                <X className="w-4 h-4 mr-1" />
                Delete Draft & Start Fresh
              </Button>
              <Button onClick={() => restoreState(savedState)} className="bg-blue-600 hover:bg-blue-700">
                <CheckCircle2 className="w-4 h-4 mr-1" />
                Resume from "{getStepLabel(savedState.step)}"
              </Button>
            </div>
          </div>
        )}

        {/* Step Indicator - clickable for completed steps */}
        {!showResumeDialog && (
          <div className="flex items-center justify-center gap-2 mb-6 overflow-x-auto pb-2 pt-2">
            {['select_meetings', 'analyze_focus', 'review_goals', 'choose_format', 'configure_document', 'preview'].map((stepName, idx) => {
              const stepNames = ['select_meetings', 'analyze_focus', 'review_goals', 'choose_format', 'configure_document', 'preview'];
              const stepLabels = ['Meetings', 'Focus', 'Goals', 'Format', 'Config', 'Preview'];
              const currentStepIdx = stepNames.indexOf(step);
              const isCompleted = idx < currentStepIdx;
              const isActive = idx <= currentStepIdx;
              const isCurrent = step === stepName;
              const canClick = isCompleted && !loading; // Can click on completed steps to go back

              return (
                <div key={stepName} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => canClick && jumpToStep(stepName as Step)}
                    disabled={!canClick}
                    className={`flex flex-col items-center ${
                      isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'
                    } ${canClick ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                    title={canClick ? `Go back to ${stepLabels[idx]}` : undefined}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                      isCurrent ? 'bg-blue-100 dark:bg-blue-900/30 ring-2 ring-blue-500' : isActive ? 'bg-gray-200 dark:bg-gray-700' : 'bg-gray-100 dark:bg-gray-800'
                    } ${canClick ? 'hover:ring-2 hover:ring-blue-300' : ''}`}>
                      {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : idx + 1}
                    </div>
                    <span className="mt-1.5 text-xs font-medium whitespace-nowrap">{stepLabels[idx]}</span>
                  </button>
                  {idx < stepNames.length - 1 && (
                    <ArrowRight className="w-4 h-4 text-gray-400 mx-1.5 flex-shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Start Fresh button - shown when not at first step and not loading */}
        {!showResumeDialog && step !== 'select_meetings' && !loading && (
          <div className="flex justify-end mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={startFresh}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Start Over
            </Button>
          </div>
        )}

        {/* Step 0: Select Meetings */}
        {!showResumeDialog && step === 'select_meetings' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">Select Meetings to Include</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Choose which meetings to include in the proposal. Only meetings with transcripts are shown.
              </p>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400 mb-4" />
                <p className="text-gray-600 dark:text-gray-400">Loading meetings...</p>
              </div>
            ) : error ? (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <p className="text-red-800 dark:text-red-200">{error}</p>
                <Button onClick={loadMeetings} className="mt-4" variant="default">
                  Retry
                </Button>
              </div>
            ) : meetings.length === 0 ? (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <p className="text-yellow-800 dark:text-yellow-200">
                  No meetings with transcripts found.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {selectedMeetingIds.size} of {meetings.length} selected
                  </div>
                  <Button onClick={handleSelectAll} variant="secondary" size="sm">
                    {selectedMeetingIds.size === meetings.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
                <div className="max-h-[400px] overflow-y-auto space-y-2 border rounded-lg p-4">
                  {meetings.map((meeting) => (
                    <div
                      key={meeting.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                        selectedMeetingIds.has(meeting.id)
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                          : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      <Checkbox
                        checked={selectedMeetingIds.has(meeting.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedMeetingIds(prev => new Set(prev).add(meeting.id));
                          } else {
                            setSelectedMeetingIds(prev => {
                              const newSet = new Set(prev);
                              newSet.delete(meeting.id);
                              return newSet;
                            });
                          }
                        }}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-base mb-2 text-gray-900 dark:text-white">
                          {meeting.title || 'Untitled Meeting'}
                        </div>
                        
                        {/* Date and Duration */}
                        <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mb-2">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-4 h-4" />
                            <span className="font-medium">
                              {meeting.meeting_start
                                ? format(new Date(meeting.meeting_start), 'MMM d, yyyy')
                                : 'No date'}
                            </span>
                          </div>
                          {meeting.duration_minutes && (
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-4 h-4" />
                              <span>{Math.round(meeting.duration_minutes)} min</span>
                            </div>
                          )}
                        </div>

                        {/* Attendees */}
                        {meeting.contacts && meeting.contacts.length > 0 && (
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <Users className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                            <div className="flex items-center gap-2 flex-wrap">
                              {meeting.contacts.map((contact, idx) => {
                                const name = contact.full_name || 
                                  `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 
                                  contact.email || 
                                  'Unknown';
                                return (
                                  <span
                                    key={contact.id || idx}
                                    className={`text-xs px-2 py-0.5 rounded-full ${
                                      contact.is_primary
                                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                                    }`}
                                  >
                                    {name}
                                    {contact.is_primary && (
                                      <span className="ml-1 text-[10px]">(Primary)</span>
                                    )}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Meeting Purpose - extracted from summary */}
                        {meeting.summary && (() => {
                          const parsed = parseMeetingSummary(meeting.summary);
                          let purposeText = '';
                          
                          if (parsed.markdown) {
                            // Extract text after "## Meeting Purpose" header
                            const purposeMatch = parsed.markdown.match(/##\s+Meeting\s+Purpose\s*\n\n(.*?)(?=\n\n|$)/is);
                            if (purposeMatch) {
                              // Remove markdown links and formatting
                              purposeText = purposeMatch[1]
                                .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove markdown links
                                .replace(/\*\*/g, '') // Remove bold
                                .replace(/\n+/g, ' ') // Replace newlines with spaces
                                .trim();
                            } else {
                              // Fallback: get first paragraph or first 200 chars
                              purposeText = getMeetingSummaryPlainText(meeting.summary)
                                .substring(0, 200)
                                .replace(/\n+/g, ' ')
                                .trim();
                            }
                          } else {
                            purposeText = getMeetingSummaryPlainText(meeting.summary)
                              .substring(0, 200)
                              .replace(/\n+/g, ' ')
                              .trim();
                          }
                          
                          if (purposeText) {
                            return (
                              <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                                <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                  Meeting Purpose:
                                </div>
                                <div className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                                  {purposeText}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 1.5: Analyze Focus Areas */}
        {!showResumeDialog && step === 'analyze_focus' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">Select Focus Areas</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Review the key focus areas identified from your meetings. Select which areas to include in your proposal or SOW.
              </p>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400 mb-4" />
                <p className="text-gray-600 dark:text-gray-400 text-center">
                  {statusMessage || 'Analyzing transcripts...'}
                </p>
              </div>
            ) : error ? (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <p className="text-red-800 dark:text-red-200">{error}</p>
                <Button onClick={() => analyzeFocusAreasFromTranscripts()} className="mt-4" variant="default">
                  Retry
                </Button>
              </div>
            ) : focusAreas.length === 0 ? (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <p className="text-yellow-800 dark:text-yellow-200">
                  No focus areas found. Proceeding with all content.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {selectedFocusAreaIds.size} of {focusAreas.length} selected
                  </div>
                  <Button onClick={handleSelectAllFocusAreas} variant="secondary" size="sm">
                    {selectedFocusAreaIds.size === focusAreas.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
                <div className="max-h-[400px] overflow-y-auto space-y-2 border rounded-lg p-4">
                  {focusAreas.map((focusArea) => (
                    <div
                      key={focusArea.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                        selectedFocusAreaIds.has(focusArea.id)
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                          : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      <Checkbox
                        checked={selectedFocusAreaIds.has(focusArea.id)}
                        onCheckedChange={() => handleFocusAreaToggle(focusArea.id)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-base mb-1 text-gray-900 dark:text-white">
                          {focusArea.title}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                          {focusArea.description}
                        </div>
                        {focusArea.category && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Category: {focusArea.category}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 2: Loading/Analyzing - Show streaming goals content */}
        {!showResumeDialog && step === 'loading' && (
          <div className="space-y-4">
            {loading ? (
              <div className="space-y-4">
                {/* Spinner and status at top */}
                <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-600 dark:text-blue-400 flex-shrink-0" />
                  <div>
                    <p className="text-blue-800 dark:text-blue-200 text-sm font-medium">
                      {statusMessage || 'Analyzing call transcripts and generating goals...'}
                    </p>
                    {goals.length > 0 && (
                      <p className="text-blue-600 dark:text-blue-400 text-xs mt-1">
                        {goals.length} characters generated...
                      </p>
                    )}
                  </div>
                </div>

                {/* Show goals textarea during streaming so users can see progress */}
                {goals.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Generating Goals...</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      Watch as the AI generates your goals document in real-time:
                    </p>
                    <Textarea
                      value={goals}
                      readOnly
                      rows={15}
                      className="font-mono text-sm bg-gray-50 dark:bg-gray-900"
                      placeholder="Goals content streaming..."
                    />
                  </div>
                )}
              </div>
            ) : error ? (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <p className="text-red-800 dark:text-red-200">{error}</p>
                <Button onClick={() => loadTranscripts()} className="mt-4" variant="default">
                  Retry
                </Button>
              </div>
            ) : null}
          </div>
        )}

        {/* Step 3: Review Goals */}
        {!showResumeDialog && step === 'review_goals' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">Review Generated Goals</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Review and edit the goals document before proceeding. This will be used to generate your proposal or SOW.
              </p>
              <Textarea
                ref={textareaRef}
                value={goals}
                onChange={(e) => setGoals(e.target.value)}
                rows={20}
                className="font-mono text-sm"
                placeholder="Goals content will appear here..."
                onFocus={() => {
                  isTextareaFocusedRef.current = true;
                }}
                onBlur={() => {
                  isTextareaFocusedRef.current = false;
                }}
                onMouseDown={(e) => {
                  // Prevent any potential event bubbling that might close the dialog
                  e.stopPropagation();
                }}
              />
            </div>
          </div>
        )}

        {/* Step 4: Configure Document */}
        {!showResumeDialog && step === 'configure_document' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                Configure {selectedFormat === 'sow' ? 'SOW' : selectedFormat === 'email' ? 'Email Proposal' : selectedFormat === 'markdown' ? 'Markdown Proposal' : 'Proposal'}
                {selectedTemplateId && (() => {
                  const tmplName = structuredTemplates.find(t => t.id === selectedTemplateId)?.name
                    || templates.find(t => t.id === selectedTemplateId)?.name;
                  return tmplName ? (
                    <span className="text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                      {tmplName}
                    </span>
                  ) : null;
                })()}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                Set the focus and length for your {selectedFormat === 'sow' ? 'Statement of Work' : selectedFormat === 'email' ? 'email proposal' : selectedFormat === 'markdown' ? 'markdown proposal' : 'proposal'}.
              </p>
            </div>

            <div className="space-y-6">
              {/* Length Target */}
              <div>
                <label className="text-sm font-medium mb-2 block">Document Length</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['short', 'medium', 'long'] as const).map((length) => (
                    <Card
                      key={length}
                      className={`cursor-pointer transition-all hover:scale-105 ${
                        documentConfig.length_target === length ? 'ring-2 ring-blue-500' : ''
                      }`}
                      onClick={() => setDocumentConfig(prev => ({ ...prev, length_target: length }))}
                    >
                      <CardContent className="p-4">
                        <div className="font-semibold capitalize mb-1">{length}</div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          {length === 'short' && '< 1000 words / ~2 pages'}
                          {length === 'medium' && '1000-2500 words / ~3-5 pages'}
                          {length === 'long' && '> 2500 words / ~6+ pages'}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Custom Word Limit */}
              <div>
                <label className="text-sm font-medium mb-2 block">Custom Word Limit (Optional)</label>
                <input
                  type="number"
                  min="100"
                  max="10000"
                  step="100"
                  placeholder="e.g., 1500"
                  value={documentConfig.word_limit || ''}
                  onChange={(e) => setDocumentConfig(prev => ({ 
                    ...prev, 
                    word_limit: e.target.value ? parseInt(e.target.value) : undefined 
                  }))}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Override length target with a specific word count
                </p>
              </div>

              {/* Page Target */}
              <div>
                <label className="text-sm font-medium mb-2 block">Target Pages (Optional)</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  step="1"
                  placeholder="e.g., 3"
                  value={documentConfig.page_target || ''}
                  onChange={(e) => setDocumentConfig(prev => ({
                    ...prev,
                    page_target: e.target.value ? parseInt(e.target.value) : undefined
                  }))}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Target number of pages for the document
                </p>
              </div>

              {/* WIZ-002: Brand Configuration */}
              {(selectedFormat === 'proposal' || outputFormat !== 'html') && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-5">
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Palette className="w-4 h-4" />
                    Brand Configuration
                  </h4>
                  <BrandConfigPanel
                    brandConfig={brandConfig}
                    onBrandConfigChange={setBrandConfig}
                    orgId={orgId || ''}
                    contactEmail={null}
                    proposalId={null}
                    templateBrandConfig={null}
                    brandingEnabled={brandingEnabled}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 4: Choose Format / Workflow */}
        {!showResumeDialog && step === 'choose_format' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold mb-2">Choose Proposal Workflow</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Select a workflow to generate your proposal outputs.
            </p>

            {/* WIZ-001: Output Format Selector */}
            <div>
              <Label className="text-sm font-medium mb-3 block">Output Format</Label>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { value: 'html' as const, label: 'HTML', subtitle: 'Live Preview', icon: Monitor },
                  { value: 'docx' as const, label: 'DOCX', subtitle: 'Word Document', icon: FileText },
                  { value: 'pdf' as const, label: 'PDF', subtitle: 'PDF Document', icon: File },
                ]).map(({ value, label, subtitle, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setOutputFormat(value)}
                    className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left ${
                      outputFormat === value
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                      outputFormat === value
                        ? 'bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-300'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                    }`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className={`font-semibold text-sm ${
                        outputFormat === value
                          ? 'text-blue-900 dark:text-blue-100'
                          : 'text-gray-900 dark:text-gray-100'
                      }`}>
                        {label}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {subtitle}
                      </div>
                    </div>
                    {outputFormat === value && (
                      <CheckCircle2 className="w-5 h-5 text-blue-500 ml-auto flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* WIZ-001: Template Picker */}
            <div>
              <Label className="text-sm font-medium mb-3 flex items-center gap-2">
                <Layout className="w-4 h-4" />
                Template
              </Label>
              {templatesLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-600 dark:text-blue-400" />
                  <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">Loading templates...</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Start Fresh option */}
                  <Card
                    className={`cursor-pointer transition-all hover:scale-[1.02] ${
                      selectedTemplateId === null ? 'ring-2 ring-blue-500' : ''
                    }`}
                    onClick={() => {
                      setSelectedTemplateId(null);
                      setProposalSections([]);
                      setBrandConfig({});
                    }}
                  >
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                        selectedTemplateId === null
                          ? 'bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-300'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                      }`}>
                        <FileCode className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                          Start Fresh
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Generate from scratch without a template
                        </div>
                      </div>
                      {selectedTemplateId === null && (
                        <CheckCircle2 className="w-5 h-5 text-blue-500 flex-shrink-0" />
                      )}
                    </CardContent>
                  </Card>

                  {/* Structured templates (with sections) */}
                  {structuredTemplates.map((tmpl) => (
                    <Card
                      key={tmpl.id}
                      className={`cursor-pointer transition-all hover:scale-[1.02] ${
                        selectedTemplateId === tmpl.id ? 'ring-2 ring-blue-500' : ''
                      }`}
                      onClick={() => handleSelectStructuredTemplate(tmpl)}
                    >
                      <CardContent className="p-4 flex items-center gap-3">
                        <div
                          className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                            selectedTemplateId === tmpl.id
                              ? 'bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-300'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                          }`}
                          style={
                            selectedTemplateId === tmpl.id && (tmpl.brand_config as Record<string, string> | null)?.primary_color
                              ? { backgroundColor: `${(tmpl.brand_config as Record<string, string>).primary_color}20` }
                              : undefined
                          }
                        >
                          <Layout className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 flex items-center gap-2">
                            {tmpl.name}
                            {tmpl.category === 'starter' && (
                              <span className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded">
                                Starter
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {tmpl.description || `${tmpl.sections?.length || 0} sections`}
                          </div>
                        </div>
                        {selectedTemplateId === tmpl.id && (
                          <CheckCircle2 className="w-5 h-5 text-blue-500 flex-shrink-0" />
                        )}
                      </CardContent>
                    </Card>
                  ))}

                  {/* Upload Example card */}
                  <Card
                    className={`cursor-pointer transition-all hover:scale-[1.02] border-dashed ${
                      wizardUploadProcessing ? 'opacity-70 pointer-events-none' : ''
                    }`}
                    onClick={() => {
                      if (wizardUploadProcessing) return;
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = '.docx,.pdf';
                      input.onchange = async (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (!file) return;
                        // Validate
                        const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
                        if (!allowedTypes.includes(file.type)) {
                          const ext = file.name.toLowerCase().split('.').pop();
                          if (ext !== 'pdf' && ext !== 'docx') {
                            toast.error('Only .docx and .pdf files are supported');
                            return;
                          }
                        }
                        if (file.size > 15 * 1024 * 1024) {
                          toast.error('File too large. Maximum size: 15MB');
                          return;
                        }
                        setWizardUploadProcessing(true);
                        try {
                          const { extraction, assetId } = await uploadAndParseDocument(file, orgId || '');
                          const templateName = file.name.replace(/\.(docx|pdf)$/i, '').replace(/[-_]/g, ' ');
                          const template = await createTemplateFromExtraction(
                            templateName,
                            `Auto-created from ${file.name}`,
                            extraction,
                            orgId || '',
                            assetId
                          );
                          if (template) {
                            // Add to structured templates list and auto-select
                            setStructuredTemplates(prev => [template, ...prev]);
                            handleSelectStructuredTemplate(template);
                            toast.success(`Template "${template.name}" created from ${file.name}`);
                          }
                        } catch (err: unknown) {
                          toast.error(err instanceof Error ? err.message : 'Failed to process document');
                        } finally {
                          setWizardUploadProcessing(false);
                        }
                      };
                      input.click();
                    }}
                  >
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                        {wizardUploadProcessing ? (
                          <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                        ) : (
                          <Upload className="w-5 h-5" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                          {wizardUploadProcessing ? 'Analysing document...' : 'Upload Example'}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {wizardUploadProcessing ? 'Extracting structure and branding' : 'Create template from .docx or .pdf'}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Legacy prompt templates */}
                  {templates.map((template) => (
                    <Card
                      key={template.id}
                      className={`cursor-pointer transition-all hover:scale-[1.02] ${
                        selectedTemplateId === template.id ? 'ring-2 ring-blue-500' : ''
                      }`}
                      onClick={() => setSelectedTemplateId(template.id)}
                    >
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                          selectedTemplateId === template.id
                            ? 'bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-300'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                        }`}>
                          <Layout className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 flex items-center gap-2">
                            {template.name}
                            {template.is_default && (
                              <span className="text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">
                                Default
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {template.type === 'sow' ? 'Statement of Work' :
                             template.type === 'proposal' ? 'Proposal' :
                             template.type === 'goals' ? 'Goals' :
                             template.type === 'design_system' ? 'Design System' :
                             template.type}
                          </div>
                        </div>
                        {selectedTemplateId === template.id && (
                          <CheckCircle2 className="w-5 h-5 text-blue-500 flex-shrink-0" />
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* WIZ-001: Client Branding Toggle */}
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border">
              <div className="flex items-center gap-3">
                <Palette className="w-5 h-5 text-gray-500" />
                <div>
                  <Label htmlFor="branding-toggle" className="font-medium">Client Branding</Label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Enable Logo.dev branding integration for client logos
                  </p>
                </div>
              </div>
              <Switch
                id="branding-toggle"
                checked={brandingEnabled}
                onCheckedChange={setBrandingEnabled}
              />
            </div>

            {/* Loading state */}
            {workflowsLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600 dark:text-blue-400" />
                <span className="ml-2 text-gray-600 dark:text-gray-400">Loading workflows...</span>
              </div>
            )}

            {/* Org workflows */}
            {!workflowsLoading && workflows.length > 0 && (
              <div>
                <Label className="text-sm font-medium mb-3 block">Proposal Type</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {workflows.map((workflow) => {
                    const outputTypes = getWorkflowOutputTypes(workflow);
                    return (
                      <Card
                        key={workflow.id}
                        className={`cursor-pointer transition-all hover:scale-105 ${
                          selectedWorkflow?.id === workflow.id ? 'ring-2 ring-blue-500' : ''
                        }`}
                        onClick={() => {
                          setSelectedWorkflow(workflow);
                          // Set primary format based on workflow (for backwards compatibility)
                          const primaryFormat: 'sow' | 'proposal' | 'email' | 'markdown' =
                            workflow.include_html
                              ? 'proposal'
                              : workflow.include_sow
                                ? 'sow'
                                : workflow.include_email
                                  ? 'email'
                                  : workflow.include_markdown
                                    ? 'markdown'
                                    : // Safety: ensure downstream steps never receive null
                                      'proposal';
                          setSelectedFormat(primaryFormat);
                          setStep('configure_document');
                        }}
                      >
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <FileText className="w-5 h-5" />
                            {workflow.name}
                            {workflow.is_default && (
                              <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">
                                Default
                              </span>
                            )}
                          </CardTitle>
                          <CardDescription>
                            {workflow.description || `Generates: ${outputTypes.join(', ')}`}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-1.5">
                            {outputTypes.map((type) => (
                              <span
                                key={type}
                                className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-1 rounded"
                              >
                                {type}
                              </span>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Fallback: Legacy format selection if no workflows */}
            {!workflowsLoading && workflows.length === 0 && (
              <div>
                <Label className="text-sm font-medium mb-3 block">Proposal Type</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card
                    className={`cursor-pointer transition-all hover:scale-105 ${
                      selectedFormat === 'sow' ? 'ring-2 ring-blue-500' : ''
                    }`}
                    onClick={() => {
                      setSelectedFormat('sow');
                      setStep('configure_document');
                    }}
                  >
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        Statement of Work
                      </CardTitle>
                      <CardDescription>
                        A comprehensive SOW document in Markdown format
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Includes project objectives, proposed solution, pricing, timeline, and terms.
                      </p>
                    </CardContent>
                  </Card>

                  <Card
                    className={`cursor-pointer transition-all hover:scale-105 ${
                      selectedFormat === 'proposal' ? 'ring-2 ring-blue-500' : ''
                    }`}
                    onClick={() => {
                      setSelectedFormat('proposal');
                      setStep('configure_document');
                    }}
                  >
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileCode className="w-5 h-5" />
                        HTML Proposal
                      </CardTitle>
                      <CardDescription>
                        An interactive HTML presentation with modern design
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Beautiful, interactive proposal with slides, animations, and professional styling.
                      </p>
                    </CardContent>
                  </Card>

                  <Card
                    className={`cursor-pointer transition-all hover:scale-105 ${
                      selectedFormat === 'email' ? 'ring-2 ring-blue-500' : ''
                    }`}
                    onClick={() => {
                      setSelectedFormat('email');
                      setStep('configure_document');
                    }}
                  >
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Mail className="w-5 h-5" />
                        Email Proposal
                      </CardTitle>
                      <CardDescription>
                        A simple email proposal in Markdown format
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Professional email format ready to send directly to clients.
                      </p>
                    </CardContent>
                  </Card>

                  <Card
                    className={`cursor-pointer transition-all hover:scale-105 ${
                      selectedFormat === 'markdown' ? 'ring-2 ring-blue-500' : ''
                    }`}
                    onClick={() => {
                      setSelectedFormat('markdown');
                      setStep('configure_document');
                    }}
                  >
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        Markdown Proposal
                      </CardTitle>
                      <CardDescription>
                        A simple Markdown document proposal
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Clean, simple proposal in Markdown format. Easy to edit and share.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 5: Preview */}
        {!showResumeDialog && step === 'preview' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                {proposalMode === 'quick' ? 'Quick Summary & Follow-up Email' : 'Preview Generated Document'}
              </h3>
              <div className="flex items-center gap-2">
                {/* WIZ-003: Download buttons */}
                {savedProposalId && !loading && proposalMode === 'advanced' && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!!downloading}
                      onClick={async () => {
                        setDownloading('docx');
                        try {
                          await downloadProposalDocx(savedProposalId);
                          toast.success('DOCX downloaded');
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : 'Download failed');
                        } finally {
                          setDownloading(null);
                        }
                      }}
                    >
                      {downloading === 'docx' ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
                      DOCX
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!!downloading}
                      onClick={async () => {
                        setDownloading('pdf');
                        try {
                          await downloadProposalPdf(savedProposalId);
                          toast.success('PDF downloaded');
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : 'Download failed');
                        } finally {
                          setDownloading(null);
                        }
                      }}
                    >
                      {downloading === 'pdf' ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
                      PDF
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowSaveTemplateModal(true)}
                    >
                      <BookTemplate className="w-3.5 h-3.5 mr-1.5" />
                      Save Template
                    </Button>
                  </>
                )}
                {selectedFormat === 'proposal' && proposalMode === 'advanced' && (
                  <Button
                    onClick={() => {
                      const blob = new Blob([finalContent], { type: 'text/html' });
                      const url = URL.createObjectURL(blob);
                      window.open(url, '_blank');
                    }}
                    variant="secondary"
                    size="sm"
                  >
                    Open in New Tab
                  </Button>
                )}
              </div>
            </div>

            {/* WIZ-003: Generation progress stepper */}
            {loading && generationProgress && (
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-blue-700 dark:text-blue-300">
                      {generationProgress.message}
                    </div>
                    <div className="mt-1.5 h-1.5 bg-blue-100 dark:bg-blue-900 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-500"
                        style={{ width: `${generationProgress.percent}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-xs text-blue-500 font-mono">{generationProgress.percent}%</span>
                </div>
              </div>
            )}

            {/* Quick Mode Preview */}
            {proposalMode === 'quick' && quickModeSummary && (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Meeting Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={quickModeSummary}
                      onChange={(e) => setQuickModeSummary(e.target.value)}
                      className="min-h-[200px] font-mono text-sm"
                      placeholder="Meeting summary..."
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Follow-up Email</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={quickModeEmail}
                      onChange={(e) => {
                        setQuickModeEmail(e.target.value);
                        setFinalContent(e.target.value);
                      }}
                      className="min-h-[300px] font-mono text-sm"
                      placeholder="Follow-up email..."
                    />
                    <div className="mt-4 flex gap-2">
                      <Button
                        onClick={() => {
                          navigator.clipboard.writeText(quickModeEmail);
                          toast.success('Email copied to clipboard!');
                        }}
                        variant="outline"
                        size="sm"
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Copy Email
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Advanced Mode Preview */}
            {proposalMode === 'advanced' && (
              <>
            {loading && !finalContent && selectedFormat !== 'proposal' ? (
              // Only show pure loader for non-proposal formats when no content yet
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400 mb-4" />
                <p className="text-gray-600 dark:text-gray-400 text-center">
                  {statusMessage || `Generating ${selectedFormat === 'sow' ? 'SOW' : selectedFormat === 'email' ? 'email proposal' : selectedFormat === 'markdown' ? 'markdown proposal' : 'proposal'}...`}
                </p>
                {statusMessage && statusMessage.includes('Generating') && (
                  <p className="text-sm text-gray-500 dark:text-gray-500 mt-2 text-center">
                    This may take a minute. Please wait...
                  </p>
                )}
              </div>
            ) : error ? (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <p className="text-red-800 dark:text-red-200">{error}</p>
              </div>
            ) : selectedFormat === 'proposal' && finalContent ? (
              <Tabs value={previewTab} onValueChange={(v) => setPreviewTab(v as 'html' | 'preview')} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="preview">
                    Preview
                    {loading && <Loader2 className="w-3 h-3 ml-2 animate-spin" />}
                  </TabsTrigger>
                  <TabsTrigger value="html">
                    HTML Code
                    {loading && <span className="ml-2 text-xs text-blue-400">(building...)</span>}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="preview" className="mt-4">
                  {loading && (
                    <div className="mb-3 text-center">
                      <p className="text-sm text-blue-600 dark:text-blue-400 flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="font-medium">Watch your proposal build section by section...</span>
                      </p>
                    </div>
                  )}
                  <div className="border rounded-lg overflow-hidden relative">
                    <iframe
                      ref={iframeRef}
                      srcDoc={iframeContent || finalContent}
                      className="w-full h-[600px] border-0 transition-opacity duration-300"
                      title="Proposal Preview"
                      sandbox="allow-same-origin allow-scripts"
                    />
                    {loading && (
                      <div className="absolute top-2 right-2 bg-blue-600 text-white px-3 py-1 rounded-full text-xs flex items-center gap-2 z-10 shadow-lg">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Building...
                      </div>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="html" className="mt-4">
                  <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-900/50 relative">
                    <div className="flex justify-end mb-2">
                      <Button 
                        onClick={() => {
                          navigator.clipboard.writeText(finalContent);
                          setStatusMessage('Copied to clipboard!');
                          setTimeout(() => setStatusMessage(null), 2000);
                        }} 
                        variant="outline" 
                        size="sm"
                      >
                        Copy HTML
                      </Button>
                    </div>
                    <Textarea
                      ref={htmlCodeTextareaRef}
                      value={finalContent}
                      onChange={(e) => setFinalContent(e.target.value)}
                      className="w-full h-[550px] font-mono text-xs"
                      placeholder="HTML content..."
                    />
                    {loading && (
                      <div className="absolute top-2 right-2 bg-blue-600 text-white px-3 py-1 rounded-full text-xs flex items-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Generating...
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            ) : (selectedFormat === 'sow' || selectedFormat === 'email' || selectedFormat === 'markdown') && finalContent ? (
              <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-900/50 max-h-[600px] overflow-y-auto relative">
                <div className="flex justify-end mb-2">
                  <Button 
                    onClick={() => {
                      navigator.clipboard.writeText(finalContent);
                      setStatusMessage('Copied to clipboard!');
                      setTimeout(() => setStatusMessage(null), 2000);
                    }} 
                    variant="outline" 
                    size="sm"
                  >
                    Copy {selectedFormat === 'email' ? 'Email' : 'Markdown'}
                  </Button>
                </div>
                <pre className="whitespace-pre-wrap font-mono text-sm">
                  {finalContent}
                </pre>
                {loading && (
                  <div className="absolute top-2 right-2 bg-blue-600 text-white px-3 py-1 rounded-full text-xs flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Generating...
                  </div>
                )}
              </div>
            ) : !loading && !error ? (
              // Fallback: Content is missing but no error shown
              <div className="border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-6 text-center">
                <AlertCircle className="w-12 h-12 text-yellow-600 dark:text-yellow-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
                  No Content Generated
                </h3>
                <p className="text-yellow-700 dark:text-yellow-300 mb-4">
                  The generation completed but no content was produced. This could be due to:
                </p>
                <ul className="text-left text-sm text-yellow-700 dark:text-yellow-300 mb-4 max-w-md mx-auto">
                  <li className="mb-2">• Network interruption during streaming</li>
                  <li className="mb-2">• AI model timeout or rate limiting</li>
                  <li className="mb-2">• Configuration issue with the generation service</li>
                </ul>
                <p className="text-sm text-yellow-600 dark:text-yellow-400 mb-4">
                  Please check the browser console for detailed logs.
                </p>
                <Button onClick={() => {
                  console.log('[ProposalWizard] User clicked retry from fallback UI');
                  handleGenerateDocument();
                }} variant="default">
                  Try Again
                </Button>
              </div>
            ) : null}
              </>
            )}
          </div>
        )}

        {/* Step 6: Share Settings */}
        {!showResumeDialog && step === 'share' && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-green-900 dark:text-green-100">Proposal Saved Successfully!</h3>
                <p className="text-sm text-green-700 dark:text-green-300">
                  Your {selectedFormat === 'sow' ? 'Statement of Work' : selectedFormat === 'email' ? 'email proposal' : selectedFormat === 'markdown' ? 'markdown proposal' : 'proposal'} has been saved.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Share2 className="w-5 h-5" />
                Share Settings
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Enable public sharing to generate a link you can send to your prospect.
              </p>

              {/* Enable Public Sharing Toggle */}
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border">
                <div className="flex items-center gap-3">
                  <Link className="w-5 h-5 text-gray-500" />
                  <div>
                    <Label htmlFor="public-sharing" className="font-medium">Enable Public Sharing</Label>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Anyone with the link can view this proposal
                    </p>
                  </div>
                </div>
                <Switch
                  id="public-sharing"
                  checked={isPublicEnabled}
                  onCheckedChange={setIsPublicEnabled}
                />
              </div>

              {/* Password Protection */}
              {isPublicEnabled && (
                <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border space-y-3">
                  <div className="flex items-center gap-3">
                    <Lock className="w-5 h-5 text-gray-500" />
                    <div>
                      <Label htmlFor="share-password" className="font-medium">Password Protection (Optional)</Label>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Add a password to protect your proposal
                      </p>
                    </div>
                  </div>
                  <Input
                    id="share-password"
                    type="password"
                    placeholder="Enter password (leave blank for no password)"
                    value={sharePassword}
                    onChange={(e) => setSharePassword(e.target.value)}
                    className="mt-2"
                  />
                </div>
              )}

              {/* Share Link */}
              {isPublicEnabled && shareToken && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 space-y-3">
                  <div className="flex items-center gap-3">
                    <Eye className="w-5 h-5 text-blue-500" />
                    <Label className="font-medium text-blue-900 dark:text-blue-100">Share Link</Label>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={getProposalShareUrl(shareToken)}
                      readOnly
                      className="font-mono text-sm bg-white dark:bg-gray-800"
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(getProposalShareUrl(shareToken));
                        setLinkCopied(true);
                        setTimeout(() => setLinkCopied(false), 2000);
                      }}
                      className="flex-shrink-0"
                    >
                      {linkCopied ? (
                        <>
                          <Check className="w-4 h-4 mr-1" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 mr-1" />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    Share this link with your prospect to give them access to the proposal.
                  </p>
                </div>
              )}

              {/* Save Share Settings Button */}
              {isPublicEnabled && (
                <Button
                  onClick={async () => {
                    if (!savedProposalId) return;
                    setSavingShare(true);
                    try {
                      await updateProposalShareSettings(savedProposalId, {
                        is_public: true,
                        password: sharePassword || undefined,
                      });
                      setStatusMessage('Share settings saved!');
                      setTimeout(() => setStatusMessage(null), 2000);
                    } catch (err) {
                      setError('Failed to save share settings');
                    } finally {
                      setSavingShare(false);
                    }
                  }}
                  disabled={savingShare}
                  className="w-full"
                >
                  {savingShare ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Save Share Settings
                    </>
                  )}
                </Button>
              )}
            </div>

            {statusMessage && (
              <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm text-green-700 dark:text-green-300">{statusMessage}</p>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}
          </div>
        )}
        </div>
        {/* Fixed button footer - always visible */}
        <div className="flex-shrink-0 border-t bg-background px-6 py-4">
          {step === 'select_meetings' && !showResumeDialog && (
            <div className="flex justify-end">
              {meetings.length > 0 && selectedMeetingIds.size > 0 && (
                <Button
                  onClick={handleContinueFromSelection}
                  variant="default"
                  disabled={selectedMeetingIds.size === 0}
                >
                  Continue with {selectedMeetingIds.size} Meeting{selectedMeetingIds.size !== 1 ? 's' : ''}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          )}
          {step === 'analyze_focus' && !showResumeDialog && (
            <div className="flex justify-between">
              <Button onClick={() => setStep('select_meetings')} variant="secondary">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button
                onClick={handleContinueFromFocusAreas}
                variant="default"
                disabled={focusAreas.length > 0 && selectedFocusAreaIds.size === 0}
              >
                {focusAreas.length === 0 
                  ? 'Continue' 
                  : `Continue with ${selectedFocusAreaIds.size} Focus Area${selectedFocusAreaIds.size !== 1 ? 's' : ''}`}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}
          {step === 'loading' && !showResumeDialog && (
            <div className="flex justify-between">
              <Button onClick={() => setStep('analyze_focus')} variant="secondary" disabled={loading}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              {goals && goals.length > 0 && !loading && (
                <Button onClick={() => setStep('review_goals')} variant="default">
                  Continue to Review
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          )}
          {step === 'review_goals' && !showResumeDialog && (
            <div className="flex justify-between">
              <Button onClick={handleRegenerateGoals} variant="secondary" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Regenerate Goals
              </Button>
              <div className="flex gap-2">
                <Button onClick={() => setStep('loading')} variant="secondary">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button onClick={handleApproveGoals} variant="default">
                  Approve & Continue
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}
          {step === 'choose_format' && !showResumeDialog && (
            <div className="flex justify-end">
              <Button onClick={() => setStep('review_goals')} variant="secondary">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            </div>
          )}
          {step === 'configure_document' && !showResumeDialog && (
            <div className="flex justify-between">
              <Button onClick={() => setStep('choose_format')} variant="secondary">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button onClick={handleGenerateDocument} variant="default">
                Generate {selectedFormat === 'sow' ? 'SOW' : selectedFormat === 'email' ? 'Email Proposal' : selectedFormat === 'markdown' ? 'Markdown Proposal' : 'Proposal'}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}
          {step === 'preview' && !showResumeDialog && (
            <div className="flex justify-between">
              <Button onClick={() => setStep('choose_format')} variant="secondary">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <div className="flex gap-2">
                <Button onClick={() => {
                  setShouldClose(true);
                  handleClose();
                }} variant="secondary">
                  Cancel
                </Button>
                <Button onClick={handleSave} variant="default" disabled={!finalContent || loading}>
                  Save & Share
                </Button>
              </div>
            </div>
          )}
          {step === 'share' && !showResumeDialog && (
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  clearWizardState(storageKey);
                  setShouldClose(true);
                  handleClose();
                }}
                variant="default"
              >
                Done
              </Button>
            </div>
          )}
        </div>
      </DialogContent>

      {/* WIZ-003 / TPL-001: Save as Template Modal */}
      {savedProposalId && orgId && (
        <SaveTemplateModal
          open={showSaveTemplateModal}
          onOpenChange={setShowSaveTemplateModal}
          proposalId={savedProposalId}
          orgId={orgId}
          defaultName={`${companyName || contactName || ''} Proposal Template`.trim()}
        />
      )}
    </Dialog>
  );
}

