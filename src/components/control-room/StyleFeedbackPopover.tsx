/**
 * StyleFeedbackPopover
 *
 * Appears when a user edits an AI-generated email, letting them
 * adjust writing preferences (formality, directness, warmth, words to avoid).
 * Saves to user_tone_settings and records an autopilot signal.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Sliders, Loader2, X, Plus } from 'lucide-react';
import { toneSettingsService, type ToneSettings } from '@/lib/services/toneSettingsService';
import { toast } from 'sonner';

interface StyleFeedbackPopoverProps {
  /** Whether the user has edited the body text */
  hasEdited: boolean;
  /** Original body text (for edit distance calculation) */
  originalBody?: string;
  /** Current edited body text */
  editedBody?: string;
  children?: React.ReactNode;
}

const FORMALITY_LABELS = ['Very casual', 'Casual', 'Balanced', 'Formal', 'Very formal'];
const DIRECTNESS_LABELS = ['Diplomatic', 'Gentle', 'Balanced', 'Direct', 'Blunt'];
const WARMTH_LABELS = ['Businesslike', 'Neutral', 'Friendly', 'Warm', 'Very personal'];

function SliderRow({
  label,
  value,
  onChange,
  labels,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  labels: string[];
}) {
  // Map 1-10 scale to 1-5 for display, or use directly if already 1-5
  const displayValue = value > 5 ? Math.ceil(value / 2) : value;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
        <span className="text-xs text-gray-500">{labels[displayValue - 1]}</span>
      </div>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            onClick={() => onChange(v * 2)} // Store as 1-10 scale for DB
            className={`flex-1 h-2 rounded-full transition-all ${
              v <= displayValue
                ? 'bg-[#37bd7e]'
                : 'bg-gray-200 dark:bg-gray-700'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export function StyleFeedbackPopover({ hasEdited, originalBody, editedBody, children }: StyleFeedbackPopoverProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Partial<ToneSettings>>({
    formality_level: 5,
    words_to_avoid: [],
    preferred_keywords: [],
  });
  const [newAvoidWord, setNewAvoidWord] = useState('');
  const [newPreferredWord, setNewPreferredWord] = useState('');

  // Load current settings when popover opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    toneSettingsService.getToneSettings('email')
      .then((ts) => {
        setSettings({
          formality_level: ts.formality_level || 5,
          words_to_avoid: ts.words_to_avoid || [],
          preferred_keywords: ts.preferred_keywords || [],
        });
      })
      .catch(() => {
        // Use defaults
      })
      .finally(() => setLoading(false));
  }, [open]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await toneSettingsService.saveToneSettings({
        content_type: 'email',
        tone_style: 'professional',
        formality_level: settings.formality_level || 5,
        emoji_usage: 'none',
        words_to_avoid: settings.words_to_avoid || [],
        preferred_keywords: settings.preferred_keywords || [],
        include_cta: true,
        cta_style: 'direct',
      });

      toast.success('Writing preferences updated');
      setOpen(false);
    } catch (err) {
      toast.error('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  }, [settings]);

  const addAvoidWord = useCallback(() => {
    const word = newAvoidWord.trim();
    if (!word) return;
    setSettings((prev) => ({
      ...prev,
      words_to_avoid: [...new Set([...(prev.words_to_avoid || []), word])],
    }));
    setNewAvoidWord('');
  }, [newAvoidWord]);

  const removeAvoidWord = useCallback((word: string) => {
    setSettings((prev) => ({
      ...prev,
      words_to_avoid: (prev.words_to_avoid || []).filter((w) => w !== word),
    }));
  }, []);

  const addPreferredWord = useCallback(() => {
    const word = newPreferredWord.trim();
    if (!word) return;
    setSettings((prev) => ({
      ...prev,
      preferred_keywords: [...new Set([...(prev.preferred_keywords || []), word])],
    }));
    setNewPreferredWord('');
  }, [newPreferredWord]);

  const removePreferredWord = useCallback((word: string) => {
    setSettings((prev) => ({
      ...prev,
      preferred_keywords: (prev.preferred_keywords || []).filter((w) => w !== word),
    }));
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children || (
          <button
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
              hasEdited
                ? 'bg-[#37bd7e]/10 text-[#37bd7e] border border-[#37bd7e]/20 hover:bg-[#37bd7e]/20'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border border-gray-200 dark:border-gray-700'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Style preferences
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0"
        align="end"
        side="top"
      >
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Writing Preferences</h4>
          <p className="text-xs text-gray-500 mt-0.5">Adjust how AI writes your emails</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
          </div>
        ) : (
          <div className="p-4 space-y-4 max-h-[400px] overflow-y-auto">
            {/* Formality slider */}
            <SliderRow
              label="Formality"
              value={settings.formality_level || 5}
              onChange={(v) => setSettings((prev) => ({ ...prev, formality_level: v }))}
              labels={FORMALITY_LABELS}
            />

            {/* Words to avoid */}
            <div className="space-y-2">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Words to avoid</span>
              <div className="flex flex-wrap gap-1.5">
                {(settings.words_to_avoid || []).map((word) => (
                  <span
                    key={word}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20"
                  >
                    {word}
                    <button onClick={() => removeAvoidWord(word)} className="hover:text-red-800 dark:hover:text-red-300">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newAvoidWord}
                  onChange={(e) => setNewAvoidWord(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAvoidWord(); } }}
                  placeholder="e.g. synergy, leverage"
                  className="flex-1 px-2.5 py-1.5 text-xs rounded-md border border-gray-200 dark:border-gray-700 bg-transparent text-gray-900 dark:text-gray-100 placeholder:text-gray-400 outline-none focus:border-[#37bd7e]/50 focus:ring-1 focus:ring-[#37bd7e]/20"
                />
                <button
                  onClick={addAvoidWord}
                  disabled={!newAvoidWord.trim()}
                  className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Preferred phrases */}
            <div className="space-y-2">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Preferred phrases</span>
              <div className="flex flex-wrap gap-1.5">
                {(settings.preferred_keywords || []).map((word) => (
                  <span
                    key={word}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20"
                  >
                    {word}
                    <button onClick={() => removePreferredWord(word)} className="hover:text-emerald-800 dark:hover:text-emerald-300">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newPreferredWord}
                  onChange={(e) => setNewPreferredWord(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPreferredWord(); } }}
                  placeholder="e.g. quick question, let's dive in"
                  className="flex-1 px-2.5 py-1.5 text-xs rounded-md border border-gray-200 dark:border-gray-700 bg-transparent text-gray-900 dark:text-gray-100 placeholder:text-gray-400 outline-none focus:border-[#37bd7e]/50 focus:ring-1 focus:ring-[#37bd7e]/20"
                />
                <button
                  onClick={addPreferredWord}
                  disabled={!newPreferredWord.trim()}
                  className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)} className="text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="bg-[#37bd7e] hover:bg-[#2ea76d] text-white text-xs"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
            Save preferences
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
