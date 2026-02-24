import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Trash2, Check, Sparkles, PenTool, Save, Mail, Zap, Bot, Cpu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { SalesTemplateService, type UserWritingStyle } from '@/lib/services/salesTemplateService';
import { EmailTrainingWizard } from '@/components/ai-voice';
import { supabase } from '@/lib/supabase/clientV2';
import logger from '@/lib/utils/logger';
import { useCopilot } from '@/lib/contexts/CopilotContext';

export default function AIPersonalizationSettings() {
  const [styles, setStyles] = useState<UserWritingStyle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [showTrainingWizard, setShowTrainingWizard] = useState(false);
  const [emailSignOff, setEmailSignOff] = useState('');
  const [emailSignOffSaving, setEmailSignOffSaving] = useState(false);
  const [currentStyle, setCurrentStyle] = useState<Partial<UserWritingStyle>>({
    name: '',
    tone_description: '',
    examples: ['']
  });

  // CPT-003: Copilot engine preference
  const {
    copilotEnginePreference,
    setCopilotEnginePreference,
    isLoadingEnginePreference,
  } = useCopilot();
  const [engineSaving, setEngineSaving] = useState(false);

  useEffect(() => {
    fetchStyles();
    fetchEmailSignOff();
  }, []);

  const fetchEmailSignOff = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('user_tone_settings')
        .select('email_sign_off')
        .eq('user_id', user.id)
        .eq('content_type', 'email')
        .maybeSingle();
      if (data?.email_sign_off) {
        setEmailSignOff(data.email_sign_off);
      }
    } catch (error) {
      logger.error('Failed to load email sign-off:', error);
    }
  };

  const saveEmailSignOff = async () => {
    try {
      setEmailSignOffSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('user_tone_settings')
        .upsert({
          user_id: user.id,
          content_type: 'email',
          email_sign_off: emailSignOff || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,content_type' });
      if (error) throw error;
      toast.success('Email sign-off saved');
    } catch (error: any) {
      toast.error(error.message || 'Failed to save email sign-off');
    } finally {
      setEmailSignOffSaving(false);
    }
  };

  const fetchStyles = async () => {
    try {
      setIsLoading(true);
      const data = await SalesTemplateService.getWritingStyles();
      setStyles(data);
    } catch (error) {
      toast.error('Failed to load writing styles');
    } finally {
      setIsLoading(false);
    }
  };

  // CPT-003: Save engine preference
  const handleEngineChange = async (pref: 'autonomous' | 'classic') => {
    if (pref === copilotEnginePreference) return;
    setEngineSaving(true);
    try {
      await setCopilotEnginePreference(pref);
      toast.success(
        pref === 'autonomous'
          ? 'Switched to Autonomous engine (Claude)'
          : 'Switched to Classic engine (Gemini)'
      );
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save copilot engine preference');
    } finally {
      setEngineSaving(false);
    }
  };

  const handleSave = async () => {
    const name = currentStyle.name?.trim();
    const toneDescription = currentStyle.tone_description?.trim();

    if (!name || !toneDescription) {
      toast.error('Please fill in all fields');
      return;
    }

    try {
      // Filter empty examples
      const cleanExamples = (currentStyle.examples || []).filter(ex => ex.trim());

      await SalesTemplateService.createWritingStyle({
        name,
        tone_description: toneDescription,
        examples: cleanExamples,
        is_default: styles.length === 0 // Make default if it's the first one
      });

      toast.success('Writing style saved');
      setIsEditing(false);
      setCurrentStyle({ name: '', tone_description: '', examples: [''] });
      fetchStyles();
    } catch (error) {
      toast.error('Failed to save writing style');
    }
  };

  const addExampleField = () => {
    setCurrentStyle(prev => ({
      ...prev,
      examples: [...(prev.examples || []), '']
    }));
  };

  const updateExample = (index: number, value: string) => {
    const newExamples = [...(currentStyle.examples || [])];
    newExamples[index] = value;
    setCurrentStyle(prev => ({ ...prev, examples: newExamples }));
  };

  const removeExample = (index: number) => {
    const newExamples = currentStyle.examples?.filter((_, i) => i !== index);
    setCurrentStyle(prev => ({ ...prev, examples: newExamples }));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Writing Style & AI Voice</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Train the AI to write exactly like you by providing examples and tone instructions.
          </p>
        </div>
        {!isEditing && (
          <Button onClick={() => setIsEditing(true)} className="bg-[#37bd7e] hover:bg-[#2da76c]">
            <Plus className="w-4 h-4 mr-2" />
            New Writing Style
          </Button>
        )}
      </div>

      {/* CPT-003: Copilot Engine */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <div className="p-2 rounded-lg bg-[#37bd7e]/10">
              <Bot className="w-5 h-5 text-[#37bd7e]" />
            </div>
            Copilot Engine
          </CardTitle>
          <CardDescription>
            Choose which AI engine powers your copilot. Switching engines starts a fresh conversation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingEnginePreference ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">Loading preference...</div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Autonomous option */}
              <button
                type="button"
                disabled={engineSaving}
                onClick={() => handleEngineChange('autonomous')}
                className={[
                  'flex-1 flex items-start gap-3 rounded-lg border p-4 text-left transition-all',
                  copilotEnginePreference === 'autonomous'
                    ? 'border-[#37bd7e] bg-[#37bd7e]/5 ring-1 ring-[#37bd7e]'
                    : 'border-gray-200 dark:border-gray-700 hover:border-[#37bd7e]/50 hover:bg-[#37bd7e]/5',
                  engineSaving ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
                ].join(' ')}
              >
                <div className="mt-0.5 flex-shrink-0">
                  <Sparkles className="w-5 h-5 text-[#37bd7e]" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Autonomous
                    </span>
                    <Badge variant="outline" className="bg-[#37bd7e]/10 text-[#37bd7e] border-[#37bd7e]/20 text-xs">
                      Claude
                    </Badge>
                    {copilotEnginePreference === 'autonomous' && (
                      <Check className="w-4 h-4 text-[#37bd7e] ml-auto" />
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Powered by Anthropic Claude. Uses native tool-use for agentic actions, skill-first execution, and streaming responses. Recommended for most users.
                  </p>
                </div>
              </button>

              {/* Classic option */}
              <button
                type="button"
                disabled={engineSaving}
                onClick={() => handleEngineChange('classic')}
                className={[
                  'flex-1 flex items-start gap-3 rounded-lg border p-4 text-left transition-all',
                  copilotEnginePreference === 'classic'
                    ? 'border-blue-500 bg-blue-500/5 ring-1 ring-blue-500'
                    : 'border-gray-200 dark:border-gray-700 hover:border-blue-500/50 hover:bg-blue-500/5',
                  engineSaving ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
                ].join(' ')}
              >
                <div className="mt-0.5 flex-shrink-0">
                  <Cpu className="w-5 h-5 text-blue-500" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Classic
                    </span>
                    <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-xs">
                      Gemini
                    </Badge>
                    {copilotEnginePreference === 'classic' && (
                      <Check className="w-4 h-4 text-blue-500 ml-auto" />
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Powered by Google Gemini. Features 48 rich response panels, deterministic workflow routing, and the full preview-confirm HITL pattern.
                  </p>
                </div>
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Email Sign-Off */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <div className="p-2 rounded-lg bg-[#37bd7e]/10">
              <Mail className="w-5 h-5 text-[#37bd7e]" />
            </div>
            Email Sign-Off
          </CardTitle>
          <CardDescription>
            How you close off emails. Used by AI when generating outreach sequences and follow-ups.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2 max-w-sm">
            <textarea
              value={emailSignOff}
              onChange={(e) => setEmailSignOff(e.target.value)}
              placeholder={"e.g.\nBest regards,\nAndrew"}
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
            />
            <Button
              onClick={saveEmailSignOff}
              disabled={emailSignOffSaving}
              className="bg-[#37bd7e] hover:bg-[#2da76c] w-fit"
            >
              <Save className="w-4 h-4 mr-2" />
              {emailSignOffSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Train from Emails Card */}
      {!isEditing && (
        <Card className="border-2 border-dashed border-[#37bd7e]/30 bg-gradient-to-br from-[#37bd7e]/5 to-transparent">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <div className="p-2 rounded-lg bg-[#37bd7e]/10">
                <Mail className="w-5 h-5 text-[#37bd7e]" />
              </div>
              Train AI Voice from Your Emails
              <Badge variant="outline" className="ml-2 bg-[#37bd7e]/10 text-[#37bd7e] border-[#37bd7e]/20">
                <Zap className="w-3 h-3 mr-1" />
                Recommended
              </Badge>
            </CardTitle>
            <CardDescription>
              Automatically analyze your last 20 sent emails to extract your unique writing style,
              tone, and patterns. The AI will learn to write exactly like you.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => setShowTrainingWizard(true)}
              className="bg-[#37bd7e] hover:bg-[#2da76c]"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Train from Sent Emails
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Email Training Wizard Modal */}
      <EmailTrainingWizard
        open={showTrainingWizard}
        onClose={() => setShowTrainingWizard(false)}
        onComplete={fetchStyles}
      />

      {isEditing && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-lg p-6 space-y-4"
        >
          <div className="flex items-center gap-2 text-[#37bd7e] mb-2">
            <Sparkles className="w-5 h-5" />
            <h3 className="font-medium">Create New Style Manually</h3>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Style Name</label>
            <Input
              placeholder="e.g., Professional Direct, Friendly Casual"
              value={currentStyle.name}
              onChange={(e) => setCurrentStyle(s => ({ ...s, name: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Tone Description</label>
            <Textarea
              placeholder="Describe the tone (e.g., 'Direct, value-focused, minimal fluff. Use short sentences.')"
              value={currentStyle.tone_description}
              onChange={(e) => setCurrentStyle(s => ({ ...s, tone_description: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Example Emails (The AI mimics this)</label>
            {currentStyle.examples?.map((ex, idx) => (
              <div key={idx} className="flex gap-2">
                <Textarea
                  placeholder="Paste a real email you sent that performed well..."
                  value={ex}
                  onChange={(e) => updateExample(idx, e.target.value)}
                  className="min-h-[80px]"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeExample(idx)}
                  className="mt-2 text-red-400 hover:text-red-500 hover:bg-red-500/10"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addExampleField} className="mt-2">
              <Plus className="w-3 h-3 mr-2" />
              Add Another Example
            </Button>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
            <Button onClick={handleSave} className="bg-[#37bd7e] hover:bg-[#2da76c]">
              <Save className="w-4 h-4 mr-2" />
              Save Style
            </Button>
          </div>
        </motion.div>
      )}

      <div className="grid gap-4">
        {styles.map((style) => (
          <Card key={style.id} className="border-l-4 border-l-[#37bd7e]">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {style.name}
                    {style.is_default && (
                      <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                        Default
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {style.tone_description}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon">
                    <PenTool className="w-4 h-4 text-gray-400" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Training Data ({style.examples.length} examples)</p>
                <div className="bg-gray-100 dark:bg-gray-800 rounded p-3 text-sm italic text-gray-600 dark:text-gray-300">
                  "{style.examples[0]}"
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {!isLoading && styles.length === 0 && !isEditing && (
          <div className="text-center py-12 bg-gray-50 dark:bg-gray-900/30 rounded-lg border border-dashed border-gray-300 dark:border-gray-700">
            <Sparkles className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">No Styles Yet</h3>
            <p className="text-sm text-gray-500 mb-4">Create a writing style to teach the AI your voice.</p>
            <Button onClick={() => setIsEditing(true)} variant="outline">Create Your First Style</Button>
          </div>
        )}
      </div>
    </div>
  );
}







































