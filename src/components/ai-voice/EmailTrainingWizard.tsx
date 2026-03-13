/**
 * EmailTrainingWizard Component
 *
 * Multi-step wizard for training AI writing style from sent emails.
 * Steps: Fetch Emails → Select Emails → Analyze → Preview & Edit → Save
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Mail,
  Loader2,
  Check,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useWritingStyleTraining } from '@/lib/hooks/useWritingStyleTraining';
import { WritingStyleTrainingService } from '@/lib/services/writingStyleTrainingService';
import type { EmailForTraining } from '@/lib/types/writingStyle';

interface EmailTrainingWizardProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export function EmailTrainingWizard({
  open,
  onClose,
  onComplete,
}: EmailTrainingWizardProps) {
  const {
    state,
    fetchEmails,
    toggleEmailSelection,
    selectAll,
    deselectAll,
    analyzeSelectedEmails,
    updateExtractedStyle,
    saveStyle,
    reset,
    goBack,
    selectedCount,
    canAnalyze,
    isLoading,
  } = useWritingStyleTraining();

  // Store full emails for analysis
  const [fullEmails, setFullEmails] = useState<EmailForTraining[]>([]);
  const [styleName, setStyleName] = useState('');
  const [setAsDefault, setSetAsDefault] = useState(true);
  const [emailCount, setEmailCount] = useState(20);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Start fetching when opened
  useEffect(() => {
    if (open && state.step === 'idle') {
      handleStartFetch(20);
    }
  }, [open]);

  // Fetch emails and store full data
  const handleStartFetch = async (count: number) => {
    const result = await WritingStyleTrainingService.fetchSentEmails(count);
    if (result.success && result.emails) {
      setFullEmails(result.emails);
    }
    // The hook handles the rest
    fetchEmails(count);
  };

  // Load more emails
  const handleLoadMore = async () => {
    const newCount = emailCount + 20;
    setEmailCount(newCount);
    setIsLoadingMore(true);

    const result = await WritingStyleTrainingService.fetchSentEmails(newCount);
    if (result.success && result.emails) {
      setFullEmails(result.emails);
      // Update the hook state with new emails
      fetchEmails(newCount);
    }
    setIsLoadingMore(false);
  };

  // Handle analyze
  const handleAnalyze = () => {
    analyzeSelectedEmails(fullEmails);
  };

  // Handle save
  const handleSave = async () => {
    const name = styleName.trim() || state.extractedStyle?.name || 'My Style';
    const success = await saveStyle(name, setAsDefault);
    if (success) {
      onComplete();
      handleClose();
    }
  };

  // Handle close
  const handleClose = () => {
    reset();
    setFullEmails([]);
    setStyleName('');
    setSetAsDefault(true);
    setEmailCount(20);
    setIsLoadingMore(false);
    onClose();
  };

  // Update style name when extracted
  useEffect(() => {
    if (state.extractedStyle?.name && !styleName) {
      setStyleName(state.extractedStyle.name);
    }
  }, [state.extractedStyle?.name]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-[#37bd7e]" />
            Train AI Voice from Emails
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6">
          <AnimatePresence mode="wait">
            {/* Step: Fetching */}
            {state.step === 'fetching' && (
              <motion.div
                key="fetching"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="py-8 text-center"
              >
                <Loader2 className="w-12 h-12 animate-spin text-[#37bd7e] mx-auto mb-4" />
                <p className="text-lg font-medium">Fetching your sent emails...</p>
                <p className="text-sm text-gray-500 mt-1">
                  Looking at your last 90 days of sent emails
                </p>
                <Progress value={state.progress} className="mt-4 max-w-xs mx-auto" />
              </motion.div>
            )}

            {/* Step: Selecting */}
            {state.step === 'selecting' && (
              <motion.div
                key="selecting"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4 pb-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Select emails to analyze</p>
                    <p className="text-sm text-gray-500">
                      {selectedCount} of {state.emails.length} selected (min 5)
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={selectAll}>
                      Select All
                    </Button>
                    <Button variant="ghost" size="sm" onClick={deselectAll}>
                      Deselect All
                    </Button>
                  </div>
                </div>

                <div className="max-h-[350px] overflow-y-auto border rounded-lg divide-y">
                  {state.emails.map((email) => (
                    <div
                      key={email.id}
                      className={`p-3 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-900/50 cursor-pointer transition-colors ${
                        email.selected ? 'bg-[#37bd7e]/5' : ''
                      }`}
                      onClick={() => toggleEmailSelection(email.id)}
                    >
                      <Checkbox
                        checked={email.selected}
                        onCheckedChange={() => toggleEmailSelection(email.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {email.subject}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          To: {email.recipient}
                        </p>
                        <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                          {email.snippet}
                        </p>
                      </div>
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        {new Date(email.sent_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Load More Button */}
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLoadMore}
                    disabled={isLoadingMore}
                    className="text-xs"
                  >
                    {isLoadingMore ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        Load 20 More Emails
                      </>
                    )}
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Step: Analyzing */}
            {state.step === 'analyzing' && (
              <motion.div
                key="analyzing"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="py-8 text-center"
              >
                <div className="relative w-16 h-16 mx-auto mb-4">
                  <Sparkles className="w-16 h-16 text-[#37bd7e]" />
                  <Loader2 className="w-8 h-8 animate-spin text-[#37bd7e] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <p className="text-lg font-medium">Analyzing your writing style...</p>
                <p className="text-sm text-gray-500 mt-1">
                  AI is extracting patterns from {selectedCount} emails
                </p>
                <Progress value={state.progress} className="mt-4 max-w-xs mx-auto" />
              </motion.div>
            )}

            {/* Step: Preview */}
            {state.step === 'preview' && state.extractedStyle && (
              <motion.div
                key="preview"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4 pb-4"
              >
                <div className="bg-[#37bd7e]/5 border border-[#37bd7e]/20 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-5 h-5 text-[#37bd7e]" />
                    <span className="font-medium text-[#37bd7e]">
                      Style Extracted Successfully!
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Review and customize your writing style below.
                  </p>
                </div>

                {/* Style Name */}
                <div className="space-y-2">
                  <Label>Style Name</Label>
                  <Input
                    value={styleName}
                    onChange={(e) => setStyleName(e.target.value)}
                    placeholder="e.g., Professional Direct, Warm Conversational"
                  />
                </div>

                {/* Tone Description */}
                <div className="space-y-2">
                  <Label>Tone Description</Label>
                  <Textarea
                    value={state.extractedStyle.tone_description}
                    onChange={(e) =>
                      updateExtractedStyle({ tone_description: e.target.value })
                    }
                    className="min-h-[80px]"
                  />
                </div>

                {/* Tone Characteristics */}
                <div className="space-y-2">
                  <Label>Detected Characteristics</Label>
                  <div className="flex flex-wrap gap-2">
                    <ToneBadge
                      label="Formality"
                      value={state.extractedStyle.tone.formality}
                      lowLabel="Casual"
                      highLabel="Formal"
                    />
                    <ToneBadge
                      label="Directness"
                      value={state.extractedStyle.tone.directness}
                      lowLabel="Diplomatic"
                      highLabel="Direct"
                    />
                    <ToneBadge
                      label="Warmth"
                      value={state.extractedStyle.tone.warmth}
                      lowLabel="Businesslike"
                      highLabel="Warm"
                    />
                  </div>
                </div>

                {/* Common Phrases */}
                {state.extractedStyle.vocabulary.common_phrases.length > 0 && (
                  <div className="space-y-2">
                    <Label>Common Phrases</Label>
                    <div className="flex flex-wrap gap-1">
                      {state.extractedStyle.vocabulary.common_phrases.map((phrase, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          "{phrase}"
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Greetings & Signoffs */}
                <div className="grid grid-cols-2 gap-4">
                  {state.extractedStyle.greetings_signoffs.greetings.length > 0 && (
                    <div className="space-y-1">
                      <Label className="text-xs">Greetings</Label>
                      <div className="flex flex-wrap gap-1">
                        {state.extractedStyle.greetings_signoffs.greetings.map((g, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {g}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {state.extractedStyle.greetings_signoffs.signoffs.length > 0 && (
                    <div className="space-y-1">
                      <Label className="text-xs">Sign-offs</Label>
                      <div className="flex flex-wrap gap-1">
                        {state.extractedStyle.greetings_signoffs.signoffs.map((s, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Example Excerpts */}
                {state.extractedStyle.example_excerpts.length > 0 && (
                  <div className="space-y-2">
                    <Label>Example Excerpts</Label>
                    <div className="space-y-2">
                      {state.extractedStyle.example_excerpts.slice(0, 3).map((ex, i) => (
                        <p
                          key={i}
                          className="text-sm italic text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded p-2"
                        >
                          "{ex}"
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Set as Default */}
                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={setAsDefault}
                      onCheckedChange={setSetAsDefault}
                      id="default-switch"
                    />
                    <Label htmlFor="default-switch" className="text-sm">
                      Set as default style
                    </Label>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    Confidence: {Math.round(state.extractedStyle.analysis_confidence * 100)}%
                  </Badge>
                </div>
              </motion.div>
            )}

            {/* Step: Saving */}
            {state.step === 'saving' && (
              <motion.div
                key="saving"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="py-8 text-center"
              >
                <Loader2 className="w-12 h-12 animate-spin text-[#37bd7e] mx-auto mb-4" />
                <p className="text-lg font-medium">Saving your style...</p>
              </motion.div>
            )}

            {/* Step: Complete */}
            {state.step === 'complete' && (
              <motion.div
                key="complete"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="py-8 text-center"
              >
                <CheckCircle2 className="w-16 h-16 text-[#37bd7e] mx-auto mb-4" />
                <p className="text-lg font-medium">Style Saved!</p>
                <p className="text-sm text-gray-500 mt-1">
                  Your AI voice has been trained from your emails.
                </p>
                <Button onClick={handleClose} className="mt-4">
                  Done
                </Button>
              </motion.div>
            )}

            {/* Step: Error */}
            {state.step === 'error' && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="py-8 text-center"
              >
                <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                <p className="text-lg font-medium text-red-600">
                  Something went wrong
                </p>
                <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
                  {state.error}
                </p>
                <div className="flex gap-2 justify-center mt-4">
                  <Button variant="outline" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button onClick={() => { reset(); handleStartFetch(20); }}>
                    Try Again
                  </Button>
                </div>
              </motion.div>
            )}
        </AnimatePresence>
        </div>

        {/* Fixed Footer for Steps with Actions */}
        {state.step === 'selecting' && (
          <div className="border-t px-6 py-4 bg-background">
            <div className="flex justify-between">
              <Button variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleAnalyze}
                disabled={!canAnalyze}
                className="bg-[#37bd7e] hover:bg-[#2da76c]"
              >
                Analyze {selectedCount} Emails
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
        {state.step === 'preview' && state.extractedStyle && (
          <div className="border-t px-6 py-4 bg-background">
            <div className="flex justify-between">
              <Button variant="ghost" onClick={goBack}>
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
              <Button
                onClick={handleSave}
                className="bg-[#37bd7e] hover:bg-[#2da76c]"
              >
                <Check className="w-4 h-4 mr-1" />
                Save Style
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Helper component for tone badges
function ToneBadge({
  label,
  value,
  lowLabel,
  highLabel,
}: {
  label: string;
  value: number;
  lowLabel: string;
  highLabel: string;
}) {
  const displayValue = value <= 2 ? lowLabel : value >= 4 ? highLabel : 'Balanced';
  const color =
    value <= 2
      ? 'bg-blue-500/10 text-blue-600'
      : value >= 4
      ? 'bg-purple-500/10 text-purple-600'
      : 'bg-gray-500/10 text-gray-600';

  return (
    <Badge variant="outline" className={`${color} border-0`}>
      {label}: {displayValue}
    </Badge>
  );
}

export default EmailTrainingWizard;
