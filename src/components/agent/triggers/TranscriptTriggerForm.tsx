/**
 * TranscriptTriggerForm
 * Config form for trigger_type='transcript_phrase'
 */

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { X, Plus } from 'lucide-react';

export interface TranscriptTriggerConfig {
  phrases: string[];
  match_mode: 'any' | 'all';
  case_sensitive: boolean;
  use_regex: boolean;
  description?: string;
}

interface Props {
  value: TranscriptTriggerConfig;
  onChange: (config: TranscriptTriggerConfig) => void;
  disabled?: boolean;
}

export default function TranscriptTriggerForm({ value, onChange, disabled }: Props) {
  const [inputPhrase, setInputPhrase] = useState('');

  function addPhrase() {
    const trimmed = inputPhrase.trim();
    if (!trimmed || value.phrases.includes(trimmed)) return;
    onChange({ ...value, phrases: [...value.phrases, trimmed] });
    setInputPhrase('');
  }

  function removePhrase(phrase: string) {
    onChange({ ...value, phrases: value.phrases.filter((p) => p !== phrase) });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addPhrase();
    }
  }

  return (
    <div className="space-y-4">
      {/* Phrase input */}
      <div className="space-y-1.5">
        <Label>Trigger Phrases</Label>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          SOP fires when any (or all) of these phrases appear in a meeting transcript.
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="e.g. competitor, pricing, proposal"
            value={inputPhrase}
            onChange={(e) => setInputPhrase(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
          />
          <Button type="button" variant="outline" size="sm" onClick={addPhrase} disabled={disabled || !inputPhrase.trim()}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        {value.phrases.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {value.phrases.map((phrase) => (
              <Badge key={phrase} variant="secondary" className="flex items-center gap-1 pr-1">
                <span className="text-xs">{phrase}</span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removePhrase(phrase)}
                    className="hover:text-red-500 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Match mode */}
      <div className="space-y-1.5">
        <Label>Match Mode</Label>
        <div className="flex gap-2">
          {(['any', 'all'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => !disabled && onChange({ ...value, match_mode: mode })}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                value.match_mode === mode
                  ? 'bg-[#37bd7e] text-white border-[#37bd7e]'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-[#37bd7e]/50'
              }`}
              disabled={disabled}
            >
              Match {mode === 'any' ? 'Any' : 'All'}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400">
          {value.match_mode === 'any'
            ? 'Fires if at least one phrase is found (OR logic)'
            : 'Fires only if all phrases are found (AND logic)'}
        </p>
      </div>

      {/* Options */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">Case Sensitive</Label>
            <p className="text-xs text-gray-400">Match exact casing of phrases</p>
          </div>
          <Switch
            checked={value.case_sensitive}
            onCheckedChange={(checked) => !disabled && onChange({ ...value, case_sensitive: checked })}
            disabled={disabled}
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">Use Regex</Label>
            <p className="text-xs text-gray-400">Treat phrases as regular expressions</p>
          </div>
          <Switch
            checked={value.use_regex}
            onCheckedChange={(checked) => !disabled && onChange({ ...value, use_regex: checked })}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}
