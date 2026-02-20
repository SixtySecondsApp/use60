import { useState, useEffect } from 'react';
import { Mail, Check, ArrowRight, ArrowLeft, ExternalLink, Sparkles, ScanSearch, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useSetupWizard } from '@/lib/hooks/useSetupWizard';
import { useWritingStyleTraining } from '@/lib/hooks/useWritingStyleTraining';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

function ToneBadge({ label, value }: { label: string; value: number }) {
  const levels = ['Low', 'Moderate', 'Balanced', 'High', 'Very High'];
  const colors = [
    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
    'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  ];
  const idx = Math.min(Math.max(Math.round(value) - 1, 0), 4);

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', colors[idx])}>
        {levels[idx]} ({value}/5)
      </span>
    </div>
  );
}

export function FollowUpSetupStep() {
  const { steps, setCurrentStep, completeStep, google } = useSetupWizard();
  const { user } = useAuth();
  const { activeOrgId } = useOrgStore();
  const completed = steps.followups.completed;

  const training = useWritingStyleTraining();
  const { state } = training;
  const [saving, setSaving] = useState(false);
  const [existingConfig, setExistingConfig] = useState<{ hasStyle: boolean; hasSignOff: boolean; styleName?: string; signOff?: string } | null>(null);

  // Check for existing writing style or sign-off
  useEffect(() => {
    if (!user?.id || completed) return;
    (async () => {
      const [styleRes, signOffRes] = await Promise.all([
        supabase.from('user_writing_styles').select('name').eq('user_id', user.id).eq('is_default', true).maybeSingle(),
        supabase.from('user_tone_settings').select('email_sign_off').eq('user_id', user.id).eq('content_type', 'email').maybeSingle(),
      ]);
      const hasStyle = !!styleRes.data?.name;
      const hasSignOff = !!signOffRes.data?.email_sign_off;
      if (hasStyle || hasSignOff) {
        setExistingConfig({
          hasStyle,
          hasSignOff,
          styleName: styleRes.data?.name,
          signOff: signOffRes.data?.email_sign_off,
        });
      }
    })();
  }, [user?.id, completed]);

  const alreadyConfigured = !!existingConfig && !completed;

  // Auto-select all emails and start analysis when fetching completes
  useEffect(() => {
    if (state.step === 'selecting' && state.selectedIds.length >= 5) {
      // Automatically analyze all fetched emails (skip manual selection for wizard flow)
      const fullEmails = state.emails.map(e => ({
        id: e.id,
        subject: e.subject,
        body: '', // Will be fetched by the analyze service
        snippet: e.snippet,
        recipient: e.recipient,
        sent_at: e.sent_at,
        word_count: 0,
      }));
      training.analyzeSelectedEmails(fullEmails);
    }
  }, [state.step]);

  const handleConfirmConfigured = async () => {
    if (!user?.id || !activeOrgId) return;
    setSaving(true);
    try {
      const result = await completeStep(user.id, activeOrgId, 'followups');
      if (result.creditsAwarded) {
        toast.success(`+${result.creditsAmount} credits earned!`, { description: 'Email style confirmed' });
      }
      if (!result.allCompleted) {
        setCurrentStep('test');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleAnalyze = () => {
    training.fetchEmails(20);
  };

  const handleSaveAndContinue = async () => {
    if (!user?.id || !activeOrgId) return;
    setSaving(true);
    try {
      // Save the writing style if we have one
      if (state.extractedStyle) {
        await training.saveStyle(state.extractedStyle.name || 'My Email Style', true);
      }
      // Complete the wizard step
      const result = await completeStep(user.id, activeOrgId, 'followups');
      if (result.creditsAwarded) {
        toast.success(`+${result.creditsAmount} credits earned!`, { description: 'Email style configured' });
      }
      if (!result.allCompleted) {
        setCurrentStep('test');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    if (!user?.id || !activeOrgId) return;
    const result = await completeStep(user.id, activeOrgId, 'followups');
    if (result.creditsAwarded) {
      toast.success('+60 credits earned!', { description: 'Follow-up step completed' });
    }
    setCurrentStep('test');
  };

  const isAnalyzing = state.step === 'fetching' || state.step === 'analyzing' || state.step === 'selecting';
  const hasResults = state.step === 'preview' && state.extractedStyle;
  const hasError = state.step === 'error';

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className={cn(
          'flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center',
          completed ? 'bg-green-100 dark:bg-green-900/30' : 'bg-indigo-100 dark:bg-indigo-900/30'
        )}>
          {completed ? (
            <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
          ) : (
            <Mail className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          )}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Learn Your Email Style
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            We'll analyze your sent emails to match your tone of voice and sign-off.
          </p>
        </div>
      </div>

      {completed ? (
        <div className="rounded-xl border border-green-200 dark:border-green-700/50 bg-green-50 dark:bg-green-900/10 p-4">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400">
              Email style configured
            </span>
          </div>
        </div>
      ) : alreadyConfigured && existingConfig ? (
        /* Already configured state */
        <div className="rounded-xl border border-green-200 dark:border-green-700/50 bg-green-50 dark:bg-green-900/10 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400">
              Email style already configured
            </span>
          </div>
          {existingConfig.styleName && (
            <div className="text-xs text-green-600/80 dark:text-green-400/70">
              Writing style: <span className="font-medium">{existingConfig.styleName}</span>
            </div>
          )}
          {existingConfig.signOff && (
            <div className="text-xs text-green-600/80 dark:text-green-400/70">
              Sign-off: <span className="font-medium whitespace-pre-line">{existingConfig.signOff}</span>
            </div>
          )}
          <Button
            onClick={handleConfirmConfigured}
            disabled={saving}
            className="w-full h-10 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg"
          >
            {saving ? 'Confirming...' : 'Confirm & Earn +60 Credits'}
          </Button>
          <a
            href="/settings/ai-personalization"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1 text-xs text-green-600/60 dark:text-green-400/50 hover:text-green-700 dark:hover:text-green-300 transition-colors"
          >
            Fine-tune settings
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      ) : isAnalyzing ? (
        /* Analyzing state */
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-700/50 bg-indigo-50/50 dark:bg-indigo-900/10 p-5">
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="relative">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                <ScanSearch className="w-6 h-6 text-indigo-500 animate-pulse" />
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {state.step === 'fetching' && 'Fetching your sent emails...'}
                {state.step === 'selecting' && 'Preparing emails for analysis...'}
                {state.step === 'analyzing' && 'Analyzing your writing style...'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {state.step === 'fetching' && 'Reading your last 90 days of sent emails'}
                {state.step === 'selecting' && `Found ${state.emails.length} emails`}
                {state.step === 'analyzing' && 'AI is detecting your tone, vocabulary, and sign-off patterns'}
              </p>
            </div>
            <Progress value={state.progress} className="w-full max-w-xs h-1.5" />
          </div>
        </div>
      ) : hasResults && state.extractedStyle ? (
        /* Results state */
        <div className="rounded-xl border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/50 p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              Style Detected
            </span>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              {Math.round(state.extractedStyle.analysis_confidence * 100)}% confidence
            </span>
          </div>

          {/* Tone description */}
          <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
            {state.extractedStyle.tone_description}
          </p>

          {/* Tone badges */}
          <div className="space-y-2">
            <ToneBadge label="Formality" value={state.extractedStyle.tone.formality} />
            <ToneBadge label="Directness" value={state.extractedStyle.tone.directness} />
            <ToneBadge label="Warmth" value={state.extractedStyle.tone.warmth} />
          </div>

          {/* Sign-offs */}
          {state.extractedStyle.greetings_signoffs.signoffs.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                Your sign-offs
              </p>
              <div className="flex flex-wrap gap-1.5">
                {state.extractedStyle.greetings_signoffs.signoffs.map((s, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded-md bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Common phrases */}
          {state.extractedStyle.vocabulary.common_phrases.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                Common phrases
              </p>
              <div className="flex flex-wrap gap-1.5">
                {state.extractedStyle.vocabulary.common_phrases.slice(0, 5).map((p, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded-md bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 italic">
                    "{p}"
                  </span>
                ))}
              </div>
            </div>
          )}

          <Button
            onClick={handleSaveAndContinue}
            disabled={saving}
            className="w-full h-10 bg-indigo-500 hover:bg-indigo-600 text-white font-medium rounded-lg"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </span>
            ) : (
              'Save Style & Continue'
            )}
          </Button>

          <a
            href="/settings/ai-personalization"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            Fine-tune in advanced settings
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      ) : (
        /* Initial state / error state */
        <div className="rounded-xl border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/50 p-5">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 mb-1">
              <ScanSearch className="w-6 h-6 text-indigo-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                Analyze your sent emails
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
                We'll scan your recent sent emails to learn how you write — your tone, vocabulary, greetings, and sign-offs.
                AI-generated emails will sound like you.
              </p>
            </div>

            {hasError && (
              <div className="rounded-lg border border-red-200 dark:border-red-700/50 bg-red-50 dark:bg-red-900/10 p-3">
                <p className="text-xs text-red-600 dark:text-red-400">
                  {state.error}
                </p>
              </div>
            )}

            {!google.isConnected ? (
              <div className="rounded-lg border border-amber-200 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/10 p-3">
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Connect Google Calendar first to enable email analysis.
                </p>
              </div>
            ) : (
              <Button
                onClick={handleAnalyze}
                disabled={training.isLoading}
                className="w-full h-10 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-medium rounded-lg"
              >
                <ScanSearch className="w-4 h-4 mr-2" />
                Analyze My Emails
              </Button>
            )}
          </div>

          <a
            href="/settings/ai-personalization"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors mt-4"
          >
            Or configure manually
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      <div className="flex justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCurrentStep('crm')}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={completed ? () => setCurrentStep('test') : handleSkip}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          {completed ? 'Continue' : 'Skip for now'}
          <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
