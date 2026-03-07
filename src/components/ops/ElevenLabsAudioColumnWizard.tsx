import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mic, Check } from 'lucide-react';
import { VoiceLibrary } from '@/components/settings/VoiceLibrary';

interface ColumnConfig {
  key: string;
  label: string;
  columnType: string;
  isEnrichment: boolean;
  integrationConfig?: Record<string, unknown>;
}

interface ElevenLabsAudioColumnWizardProps {
  tableId: string;
  orgId: string;
  existingColumns?: { key: string; label: string }[];
  onComplete: (config: ColumnConfig) => void;
  onCancel: () => void;
}

type Step = 'voice' | 'script';

export function ElevenLabsAudioColumnWizard({
  tableId,
  orgId,
  existingColumns = [],
  onComplete,
  onCancel,
}: ElevenLabsAudioColumnWizardProps) {
  const [step, setStep] = useState<Step>('voice');
  const [selectedVoice, setSelectedVoice] = useState<{ id: string; name: string } | null>(null);
  const [scriptTemplate, setScriptTemplate] = useState('');
  const [columnLabel, setColumnLabel] = useState('Audio');

  const columnKey = useMemo(() => {
    const base = 'elevenlabs_audio';
    const existing = new Set(existingColumns.map((c) => c.key));
    if (!existing.has(base)) return base;
    let i = 2;
    while (existing.has(`${base}_${i}`)) i++;
    return `${base}_${i}`;
  }, [existingColumns]);

  const handleComplete = () => {
    if (!selectedVoice) return;
    onComplete({
      key: columnKey,
      label: columnLabel.trim() || 'Audio',
      columnType: 'elevenlabs_audio',
      isEnrichment: false,
      integrationConfig: {
        voice_clone_id: selectedVoice.id,
        voice_name: selectedVoice.name,
        script_template: scriptTemplate,
        model_id: 'eleven_multilingual_v2',
      },
    });
  };

  return (
    <div className="space-y-5">
      {/* Step indicator */}
      <div className="flex items-center gap-3 text-xs text-gray-400">
        <span className={step === 'voice' ? 'text-white font-medium' : 'text-emerald-400'}>
          {step !== 'voice' && <Check className="w-3 h-3 inline mr-0.5" />}
          1. Choose Voice
        </span>
        <div className="w-6 h-px bg-gray-600" />
        <span className={step === 'script' ? 'text-white font-medium' : ''}>
          2. Script Template
        </span>
      </div>

      {/* ─── STEP: Voice ─────────────────────────────────────── */}
      {step === 'voice' && (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-3.5 py-3">
            <Mic className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
            <div className="text-sm text-gray-300">
              Select a voice from your library or clone a new one. Audio will be generated per row using this voice.
            </div>
          </div>

          <VoiceLibrary
            selectable
            selectedVoiceId={selectedVoice?.id}
            onSelectVoice={(voice) => setSelectedVoice({ id: voice.id, name: voice.name })}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
            <Button
              size="sm"
              disabled={!selectedVoice}
              onClick={() => setStep('script')}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* ─── STEP: Script ────────────────────────────────────── */}
      {step === 'script' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Column Name</Label>
            <Input
              value={columnLabel}
              onChange={(e) => setColumnLabel(e.target.value)}
              placeholder="Audio"
            />
          </div>

          <div className="space-y-2">
            <Label>Script Template</Label>
            <textarea
              value={scriptTemplate}
              onChange={(e) => setScriptTemplate(e.target.value)}
              placeholder={`Hey {{first_name}}, I noticed {{company}} is doing great things in {{industry}}...`}
              className="w-full h-32 rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-gray-100 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 resize-none"
            />
            <p className="text-xs text-gray-500">
              Use {'{{column_key}}'} to reference row values. Available columns:{' '}
              {existingColumns.slice(0, 5).map((c) => `{{${c.key}}}`).join(', ')}
              {existingColumns.length > 5 && '...'}
            </p>
          </div>

          <div className="rounded-lg border border-gray-700/50 bg-gray-800/50 p-3">
            <div className="text-xs text-gray-400 mb-1">Voice</div>
            <div className="text-sm text-gray-200">{selectedVoice?.name}</div>
          </div>

          <div className="flex justify-between pt-2">
            <Button variant="ghost" size="sm" onClick={() => setStep('voice')}>
              Back
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
              <Button
                size="sm"
                disabled={!scriptTemplate.trim()}
                onClick={handleComplete}
              >
                Add Audio Column
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
