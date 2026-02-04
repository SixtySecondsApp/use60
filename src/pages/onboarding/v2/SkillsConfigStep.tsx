/**
 * SkillsConfigStep
 *
 * Tab-based skill configuration wizard.
 * Users can edit AI-generated skill configurations or skip for later.
 */

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  ChevronRight,
  ChevronLeft,
  Clock,
  X,
  Target,
  Plus,
  Trash2,
  Loader,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { useOnboardingV2Store, SKILLS, SkillId } from '@/lib/stores/onboardingV2Store';
import { EditableItem, EditableTag, AddItemButton } from '@/components/onboarding';
import { toast } from 'sonner';

type SkillStatus = 'pending' | 'configured' | 'skipped';

// Input validation constants
const MAX_TEXTAREA_LENGTH = 2000;
const MAX_TAG_LENGTH = 100;
const MAX_ITEM_LENGTH = 500;

// Sanitize input to prevent injection attacks
const sanitizeInput = (input: string): string => {
  return input.trim().replace(/[<>]/g, '');
};

export function SkillsConfigStep() {
  const { skillConfigs, updateSkillConfig, setStep, saveAllSkills, organizationId, enrichment } =
    useOnboardingV2Store();

  const [currentSkillIndex, setCurrentSkillIndex] = useState(0);
  const [skillStatuses, setSkillStatuses] = useState<Record<SkillId, SkillStatus>>(() =>
    Object.fromEntries(SKILLS.map((s) => [s.id, 'pending'])) as Record<SkillId, SkillStatus>
  );
  const [loadingDuration, setLoadingDuration] = useState(0);
  const [showAddWordModal, setShowAddWordModal] = useState(false);
  const [newWordInput, setNewWordInput] = useState('');

  const activeSkill = SKILLS[currentSkillIndex];
  const activeConfig = skillConfigs[activeSkill.id];

  // Track how long we've been waiting for skills to load
  useEffect(() => {
    const interval = setInterval(() => {
      setLoadingDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Check if skills are still loading (enrichment complete but no configs yet)
  const isLoadingSkills = enrichment?.status === 'completed' && !skillConfigs[SKILLS[0].id];

  const getSkillStatus = (skillId: SkillId): SkillStatus => {
    return skillStatuses[skillId] || 'pending';
  };

  const moveNext = useCallback(async () => {
    if (currentSkillIndex < SKILLS.length - 1) {
      setCurrentSkillIndex(currentSkillIndex + 1);
    } else {
      // All skills reviewed, save and complete
      if (organizationId) {
        const success = await saveAllSkills(organizationId);
        if (success) {
          setStep('complete');
        }
      } else {
        setStep('complete');
      }
    }
  }, [currentSkillIndex, organizationId, saveAllSkills, setStep]);

  const movePrev = useCallback(() => {
    if (currentSkillIndex > 0) {
      setCurrentSkillIndex(currentSkillIndex - 1);
    }
  }, [currentSkillIndex]);

  const handleSaveSkill = useCallback(async () => {
    setSkillStatuses((prev) => ({
      ...prev,
      [activeSkill.id]: 'configured',
    }));
    await moveNext();
  }, [activeSkill.id, moveNext]);

  const handleSkipSkill = useCallback(async () => {
    setSkillStatuses((prev) => ({
      ...prev,
      [activeSkill.id]: 'skipped',
    }));
    await moveNext();
  }, [activeSkill.id, moveNext]);

  const renderSkillConfig = () => {
    if (!activeConfig) return null;

    switch (activeSkill.id) {
      case 'lead_qualification':
        return (
          <div className="space-y-4">
            {/* Qualification Criteria */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-300">
                  Qualification Criteria
                </label>
                <span className="text-xs px-2 py-0.5 rounded-full bg-violet-900/50 text-violet-300">
                  Click to edit
                </span>
              </div>
              <div className="space-y-1.5">
                {activeConfig.criteria?.map((item: string, i: number) => (
                  <EditableItem
                    key={i}
                    value={item}
                    onSave={(newValue) => {
                      const newCriteria = [...(activeConfig.criteria || [])];
                      newCriteria[i] = newValue;
                      updateSkillConfig('lead_qualification', { criteria: newCriteria });
                    }}
                    onDelete={() => {
                      updateSkillConfig('lead_qualification', {
                        criteria: activeConfig.criteria?.filter((_: string, idx: number) => idx !== i),
                      });
                    }}
                    icon={Check}
                    iconColor="text-green-500"
                  />
                ))}
                <AddItemButton
                  onAdd={(value) =>
                    updateSkillConfig('lead_qualification', {
                      criteria: [...(activeConfig.criteria || []), value],
                    })
                  }
                  placeholder="Add qualification criterion"
                />
              </div>
            </div>

            {/* Disqualifiers */}
            <div>
              <label className="text-sm font-medium mb-2 block text-gray-300">
                Disqualifiers
              </label>
              <div className="space-y-1.5">
                {activeConfig.disqualifiers?.map((item: string, i: number) => (
                  <EditableItem
                    key={i}
                    value={item}
                    onSave={(newValue) => {
                      const newDisqualifiers = [...(activeConfig.disqualifiers || [])];
                      newDisqualifiers[i] = newValue;
                      updateSkillConfig('lead_qualification', {
                        disqualifiers: newDisqualifiers,
                      });
                    }}
                    onDelete={() => {
                      updateSkillConfig('lead_qualification', {
                        disqualifiers: activeConfig.disqualifiers?.filter(
                          (_: string, idx: number) => idx !== i
                        ),
                      });
                    }}
                    icon={X}
                    iconColor="text-red-500"
                  />
                ))}
                <AddItemButton
                  onAdd={(value) =>
                    updateSkillConfig('lead_qualification', {
                      disqualifiers: [...(activeConfig.disqualifiers || []), value],
                    })
                  }
                  placeholder="Add disqualifier"
                />
              </div>
            </div>
          </div>
        );

      case 'lead_enrichment':
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-400">
                Questions to ask during lead enrichment:
              </p>
              <span className="text-xs px-2 py-0.5 rounded-full bg-violet-900/50 text-violet-300">
                Editable Suggestions
              </span>
            </div>
            {activeConfig.questions?.map((q: string, i: number) => (
              <div key={i} className="relative">
                <textarea
                  value={q}
                  onChange={(e) => {
                    if (e.target.value.length <= MAX_TEXTAREA_LENGTH) {
                      const newQuestions = [...(activeConfig.questions || [])];
                      newQuestions[i] = sanitizeInput(e.target.value);
                      updateSkillConfig('lead_enrichment', { questions: newQuestions });
                    }
                  }}
                  maxLength={MAX_TEXTAREA_LENGTH}
                  className="w-full p-3 pr-10 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none h-24 text-sm bg-gray-800 border-gray-700 text-white border"
                />
                <button
                  onClick={() =>
                    updateSkillConfig('lead_enrichment', {
                      questions: activeConfig.questions?.filter(
                        (_: string, idx: number) => idx !== i
                      ),
                    })
                  }
                  className="absolute top-2 right-2 p-1 rounded hover:bg-gray-700 text-gray-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              onClick={() =>
                updateSkillConfig('lead_enrichment', {
                  questions: [...(activeConfig.questions || []), ''],
                })
              }
              className="w-full p-3 border-2 border-dashed rounded-xl text-sm transition-colors flex items-center justify-center gap-2 border-gray-700 text-gray-500 hover:border-violet-500 hover:text-violet-400"
            >
              <Plus className="w-4 h-4" />
              Add question
            </button>
          </div>
        );

      case 'brand_voice':
        return (
          <div className="space-y-4">
            {/* Tone */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-300">Tone Description</label>
                <span className="text-xs px-2 py-0.5 rounded-full bg-violet-900/50 text-violet-300">
                  {(activeConfig.tone || '').length}/{MAX_TEXTAREA_LENGTH}
                </span>
              </div>
              <textarea
                value={activeConfig.tone || ''}
                onChange={(e) => {
                  if (e.target.value.length <= MAX_TEXTAREA_LENGTH) {
                    updateSkillConfig('brand_voice', { tone: sanitizeInput(e.target.value) });
                  }
                }}
                maxLength={MAX_TEXTAREA_LENGTH}
                className="w-full p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none h-32 text-sm bg-gray-800 border-gray-700 text-white border"
              />
            </div>

            {/* Words to Avoid */}
            <div>
              <label className="text-sm font-medium mb-2 block text-gray-300">
                Words to Avoid
              </label>
              <div className="flex flex-wrap gap-1.5">
                {activeConfig.avoid?.map((word: string, i: number) => (
                  <EditableTag
                    key={i}
                    value={word}
                    onSave={(newValue) => {
                      const sanitized = sanitizeInput(newValue);
                      if (sanitized.length > MAX_TAG_LENGTH) {
                        toast.error(`Word must be less than ${MAX_TAG_LENGTH} characters`);
                        return;
                      }
                      const newAvoid = [...(activeConfig.avoid || [])];
                      newAvoid[i] = sanitized;
                      updateSkillConfig('brand_voice', { avoid: newAvoid });
                    }}
                    onDelete={() => {
                      updateSkillConfig('brand_voice', {
                        avoid: activeConfig.avoid?.filter((_: string, idx: number) => idx !== i),
                      });
                    }}
                  />
                ))}
                <button
                  onClick={() => {
                    setShowAddWordModal(true);
                    setNewWordInput('');
                  }}
                  className="px-2.5 py-1 border border-dashed text-sm rounded-full transition-colors border-gray-700 text-gray-500 hover:border-violet-500 hover:text-violet-400"
                >
                  + Add
                </button>
              </div>
            </div>

            {/* Custom Add Word Modal */}
            <AnimatePresence>
              {showAddWordModal && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
                  onClick={() => setShowAddWordModal(false)}
                >
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-gray-900 rounded-xl border border-gray-800 p-6 max-w-sm w-full"
                  >
                    <h3 className="text-lg font-semibold text-white mb-4">Add Word to Avoid</h3>
                    <input
                      type="text"
                      value={newWordInput}
                      onChange={(e) => {
                        if (e.target.value.length <= MAX_TAG_LENGTH) {
                          setNewWordInput(e.target.value);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const sanitized = sanitizeInput(newWordInput);
                          if (sanitized.length === 0) {
                            toast.error('Please enter a word');
                            return;
                          }
                          updateSkillConfig('brand_voice', {
                            avoid: [...(activeConfig.avoid || []), sanitized],
                          });
                          setShowAddWordModal(false);
                          setNewWordInput('');
                        }
                      }}
                      placeholder="Enter word to avoid"
                      maxLength={MAX_TAG_LENGTH}
                      className="w-full p-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 mb-4 text-sm"
                      autoFocus
                    />
                    <p className="text-xs text-gray-500 mb-4">
                      {newWordInput.length}/{MAX_TAG_LENGTH} characters
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setShowAddWordModal(false)}
                        className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors text-sm font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          const sanitized = sanitizeInput(newWordInput);
                          if (sanitized.length === 0) {
                            toast.error('Please enter a word');
                            return;
                          }
                          updateSkillConfig('brand_voice', {
                            avoid: [...(activeConfig.avoid || []), sanitized],
                          });
                          setShowAddWordModal(false);
                          setNewWordInput('');
                        }}
                        className="flex-1 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition-colors text-sm font-medium"
                      >
                        Add
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );

      case 'objection_handling':
        return (
          <div className="space-y-3">
            {activeConfig.objections?.map(
              (obj: { trigger: string; response: string }, i: number) => (
                <div key={i} className="p-3 rounded-xl space-y-2 relative bg-gray-800">
                  <button
                    onClick={() =>
                      updateSkillConfig('objection_handling', {
                        objections: activeConfig.objections?.filter(
                          (_: { trigger: string; response: string }, idx: number) => idx !== i
                        ),
                      })
                    }
                    className="absolute top-2 right-2 p-1 rounded hover:bg-gray-700 text-gray-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-xs font-medium rounded bg-amber-900/50 text-amber-300">
                      Objection
                    </span>
                    <input
                      value={obj.trigger}
                      onChange={(e) => {
                        if (e.target.value.length <= MAX_ITEM_LENGTH) {
                          const newObjections = [...(activeConfig.objections || [])];
                          newObjections[i] = { ...obj, trigger: sanitizeInput(e.target.value) };
                          updateSkillConfig('objection_handling', { objections: newObjections });
                        }
                      }}
                      maxLength={MAX_ITEM_LENGTH}
                      placeholder="Enter objection (e.g., Price is too high)"
                      className="flex-1 text-sm font-medium bg-transparent outline-none text-gray-200 placeholder-gray-500"
                    />
                  </div>
                  <textarea
                    value={obj.response}
                    onChange={(e) => {
                      if (e.target.value.length <= MAX_TEXTAREA_LENGTH) {
                        const newObjections = [...(activeConfig.objections || [])];
                        newObjections[i] = { ...obj, response: sanitizeInput(e.target.value) };
                        updateSkillConfig('objection_handling', { objections: newObjections });
                      }
                    }}
                    maxLength={MAX_TEXTAREA_LENGTH}
                    className="w-full p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none h-40 text-sm bg-gray-900 border-gray-700 text-white border"
                  />
                </div>
              )
            )}
            <button
              onClick={() =>
                updateSkillConfig('objection_handling', {
                  objections: [
                    ...(activeConfig.objections || []),
                    { trigger: 'Enter objection here', response: '' },
                  ],
                })
              }
              className="w-full p-3 border-2 border-dashed rounded-xl text-sm transition-colors flex items-center justify-center gap-2 border-gray-700 text-gray-500 hover:border-violet-500 hover:text-violet-400"
            >
              <Plus className="w-4 h-4" />
              Add objection response
            </button>
          </div>
        );

      case 'icp':
        return (
          <div className="space-y-4">
            {/* Company Profile */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-300">
                  Ideal Company Profile
                </label>
                <span className="text-xs px-2 py-0.5 rounded-full bg-violet-900/50 text-violet-300">
                  {(activeConfig.companyProfile || '').length}/{MAX_TEXTAREA_LENGTH}
                </span>
              </div>
              <textarea
                value={activeConfig.companyProfile || ''}
                onChange={(e) => {
                  if (e.target.value.length <= MAX_TEXTAREA_LENGTH) {
                    updateSkillConfig('icp', { companyProfile: sanitizeInput(e.target.value) });
                  }
                }}
                maxLength={MAX_TEXTAREA_LENGTH}
                className="w-full p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none h-32 text-sm bg-gray-800 border-gray-700 text-white border"
              />
            </div>

            {/* Buyer Persona */}
            <div>
              <label className="text-sm font-medium mb-2 block text-gray-300">
                Buyer Persona
              </label>
              <div className="flex items-center justify-between mb-2">
                <span></span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-violet-900/50 text-violet-300">
                  {(activeConfig.buyerPersona || '').length}/{MAX_TEXTAREA_LENGTH}
                </span>
              </div>
              <textarea
                value={activeConfig.buyerPersona || ''}
                onChange={(e) => {
                  if (e.target.value.length <= MAX_TEXTAREA_LENGTH) {
                    updateSkillConfig('icp', { buyerPersona: sanitizeInput(e.target.value) });
                  }
                }}
                maxLength={MAX_TEXTAREA_LENGTH}
                className="w-full p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none h-32 text-sm bg-gray-800 border-gray-700 text-white border"
              />
            </div>

            {/* Buying Signals */}
            <div>
              <label className="text-sm font-medium mb-2 block text-gray-300">
                Buying Signals
              </label>
              <div className="space-y-1.5">
                {activeConfig.buyingSignals?.map((signal: string, i: number) => (
                  <EditableItem
                    key={i}
                    value={signal}
                    onSave={(newValue) => {
                      const newSignals = [...(activeConfig.buyingSignals || [])];
                      newSignals[i] = newValue;
                      updateSkillConfig('icp', { buyingSignals: newSignals });
                    }}
                    onDelete={() => {
                      updateSkillConfig('icp', {
                        buyingSignals: activeConfig.buyingSignals?.filter(
                          (_: string, idx: number) => idx !== i
                        ),
                      });
                    }}
                    icon={Target}
                    iconColor="text-green-500"
                  />
                ))}
                <AddItemButton
                  onAdd={(value) =>
                    updateSkillConfig('icp', {
                      buyingSignals: [...(activeConfig.buyingSignals || []), value],
                    })
                  }
                  placeholder="Add buying signal"
                />
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // Show loading screen while AI is building skills
  if (isLoadingSkills) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md mx-auto px-4"
      >
        <div className="rounded-2xl shadow-xl border border-gray-800 bg-gray-900 p-8 sm:p-12 text-center">
          <div className="flex justify-center mb-6">
            <div className="relative w-16 h-16">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0"
              >
                <Sparkles className="w-full h-full text-violet-400" />
              </motion.div>
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="w-2 h-2 bg-violet-400 rounded-full"
                />
              </div>
            </div>
          </div>

          <h2 className="text-xl font-bold text-white mb-2">Building with AI Results</h2>
          <p className="text-gray-400 mb-6">
            Generating personalized skill suggestions based on your company...
          </p>

          {/* Loading steps */}
          <div className="space-y-2.5 text-left mb-6">
            {[
              'Analyzing enrichment data',
              'Generating skill suggestions',
              'Building configuration',
            ].map((step, i) => (
              <motion.div
                key={i}
                animate={{
                  backgroundColor: ['rgba(88, 28, 135, 0)', 'rgba(88, 28, 135, 0.2)'],
                }}
                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }}
                className="flex items-center gap-3 py-2 px-3 rounded-lg"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                  className="flex-shrink-0"
                >
                  <Loader className="w-4 h-4 text-violet-400" />
                </motion.div>
                <span className="text-sm text-gray-300">{step}</span>
              </motion.div>
            ))}
          </div>

          {/* Time elapsed indicator */}
          <div className="flex items-center justify-center gap-1 text-xs text-gray-500">
            <Clock className="w-3 h-3" />
            <span>Building for {loadingDuration}s...</span>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full max-w-2xl mx-auto px-4"
    >
      <div className="rounded-2xl shadow-xl border border-gray-800 bg-gray-900 overflow-hidden">
        {/* Tab Navigation */}
        <div className="px-4 pt-4 border-b border-gray-800">
          <div className="flex gap-1 overflow-x-auto pb-0 scrollbar-hide">
            {SKILLS.map((skill, index) => {
              const Icon = skill.icon;
              const status = getSkillStatus(skill.id);
              const isActive = index === currentSkillIndex;

              return (
                <button
                  key={skill.id}
                  onClick={() => setCurrentSkillIndex(index)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap rounded-t-lg transition-all border-b-2 -mb-px ${
                    isActive
                      ? 'bg-gray-800 text-white border-violet-500'
                      : status === 'configured'
                        ? 'text-green-400 border-transparent hover:bg-gray-800'
                        : status === 'skipped'
                          ? 'text-gray-500 border-transparent hover:bg-gray-800'
                          : 'text-gray-400 border-transparent hover:bg-gray-800'
                  }`}
                >
                  {status === 'configured' && !isActive ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : status === 'skipped' && !isActive ? (
                    <Clock className="w-3.5 h-3.5" />
                  ) : (
                    <Icon className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden sm:inline">{skill.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6">
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">{activeSkill.name}</h3>
                <p className="text-sm text-gray-400">{activeSkill.description}</p>
              </div>
              <span className="text-sm text-gray-500">
                {currentSkillIndex + 1} of {SKILLS.length}
              </span>
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeSkill.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="max-h-[calc(100vh-300px)] overflow-y-auto pr-1"
            >
              {renderSkillConfig()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-4 border-t border-gray-800 bg-gray-900/50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={movePrev}
              disabled={currentSkillIndex === 0}
              className="p-2 rounded-lg transition-colors disabled:opacity-30 hover:bg-gray-800 text-gray-400"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={handleSkipSkill}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors text-gray-400 hover:bg-gray-800 hover:text-gray-300"
            >
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline">Skip for now</span>
            </button>
          </div>

          <button
            onClick={handleSaveSkill}
            className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-medium transition-all"
          >
            {currentSkillIndex === SKILLS.length - 1 ? 'Complete' : 'Save & Next'}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Start Over Link */}
        <div className="px-4 sm:px-6 py-3 border-t border-gray-800/50 text-center">
          <button
            onClick={() => useOnboardingV2Store.getState().reset()}
            className="text-xs text-gray-500 hover:text-gray-400 transition-colors"
          >
            Start Over
          </button>
        </div>
      </div>
    </motion.div>
  );
}
