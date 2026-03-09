/**
 * NotetakerConnectionStep
 *
 * Onboarding step where users connect their notetaker of choice.
 * Supports Fathom (OAuth), Fireflies (API key), and 60 Notetaker (built-in).
 * On successful connection → shows an Instant Replay opt-in placeholder.
 * Skip button proceeds to complete onboarding.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronRight, Headphones, Loader2, Mic, Video, X } from 'lucide-react';
import { useFathomIntegration } from '@/lib/hooks/useFathomIntegration';
import { useFirefliesIntegration } from '@/lib/hooks/useFirefliesIntegration';
import { useOnboardingV2Store } from '@/lib/stores/onboardingV2Store';
import { InstantReplayPanel } from '@/components/onboarding/InstantReplayPanel';
import { toast } from 'sonner';

type NotetakerId = 'fathom' | 'fireflies' | 'sixty';

interface NotetakerCard {
  id: NotetakerId;
  name: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
  authType: 'oauth' | 'api_key' | 'builtin';
}

const NOTETAKERS: NotetakerCard[] = [
  {
    id: 'fathom',
    name: 'Fathom',
    description: 'Automatically record, transcribe and summarise your calls.',
    icon: Headphones,
    iconColor: 'text-violet-400',
    authType: 'oauth',
  },
  {
    id: 'fireflies',
    name: 'Fireflies',
    description: 'AI meeting notes synced from your Fireflies account via API key.',
    icon: Mic,
    iconColor: 'text-orange-400',
    authType: 'api_key',
  },
  {
    id: 'sixty',
    name: '60 Notetaker',
    description: 'Built-in notetaker powered by 60 — no extra accounts needed.',
    icon: Video,
    iconColor: 'text-blue-400',
    authType: 'builtin',
  },
];

export function NotetakerConnectionStep() {
  const { setStep, completeOnboarding } = useOnboardingV2Store();
  const fathom = useFathomIntegration();
  const fireflies = useFirefliesIntegration();

  const [connectingId, setConnectingId] = useState<NotetakerId | null>(null);
  const [showFirefliesInput, setShowFirefliesInput] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [connectedId, setConnectedId] = useState<NotetakerId | null>(null);
  const [isSkipping, setIsSkipping] = useState(false);

  // Determine already-connected state from hooks
  const isAlreadyConnected = (id: NotetakerId): boolean => {
    if (id === 'fathom') return fathom.isConnected;
    if (id === 'fireflies') return fireflies.isConnected;
    return false;
  };

  const handleConnect = async (id: NotetakerId) => {
    if (connectingId) return;

    if (id === 'fathom') {
      setConnectingId('fathom');
      try {
        const ok = await fathom.connectFathom();
        if (ok) {
          setConnectedId('fathom');
        }
      } finally {
        setConnectingId(null);
      }
      return;
    }

    if (id === 'fireflies') {
      setShowFirefliesInput(true);
      return;
    }

    if (id === 'sixty') {
      // 60 Notetaker is built-in — no auth required
      toast.success('60 Notetaker activated', {
        description: '60 will automatically join and record your calls.',
      });
      setConnectedId('sixty');
      return;
    }
  };

  const handleFirefliesSubmit = async () => {
    if (!apiKeyInput.trim()) {
      toast.error('Please enter your Fireflies API key');
      return;
    }
    setConnectingId('fireflies');
    try {
      const ok = await fireflies.connectFireflies(apiKeyInput.trim());
      if (ok) {
        setConnectedId('fireflies');
        setShowFirefliesInput(false);
        setApiKeyInput('');
      }
    } finally {
      setConnectingId(null);
    }
  };

  const handleSkip = async () => {
    if (isSkipping) return;
    setIsSkipping(true);
    try {
      await completeOnboarding();
    } catch {
      // completeOnboarding shows its own toast on error; just navigate
      setStep('complete');
    } finally {
      setIsSkipping(false);
    }
  };

  const handleContinue = async () => {
    setIsSkipping(true);
    try {
      await completeOnboarding();
    } catch {
      setStep('complete');
    } finally {
      setIsSkipping(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full max-w-lg mx-auto px-4"
    >
      <div className="rounded-2xl shadow-xl border border-gray-800 bg-gray-900 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-600 to-violet-700 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center">
              <Headphones className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-white text-lg">Connect Your Notetaker</h2>
              <p className="text-violet-100 text-sm">
                Sync meeting recordings so 60 can prep and follow up automatically.
              </p>
            </div>
          </div>
        </div>

        {/* Cards */}
        <div className="p-6 space-y-3">
          {NOTETAKERS.map((notetaker) => {
            const Icon = notetaker.icon;
            const alreadyConnected = isAlreadyConnected(notetaker.id);
            const isConnected = alreadyConnected || connectedId === notetaker.id;
            const isConnecting = connectingId === notetaker.id;

            return (
              <div
                key={notetaker.id}
                className={`rounded-xl border p-4 transition-colors ${
                  isConnected
                    ? 'border-green-700 bg-green-900/20'
                    : 'border-gray-700 bg-gray-800/50'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0">
                    <Icon className={`w-5 h-5 ${notetaker.iconColor}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-white text-sm">{notetaker.name}</p>
                      {isConnected && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-900/60 text-green-400 text-xs font-medium">
                          <Check className="w-3 h-3" />
                          Connected
                        </span>
                      )}
                    </div>
                    <p className="text-gray-400 text-xs mt-0.5">{notetaker.description}</p>
                  </div>

                  {!isConnected && (
                    <button
                      onClick={() => handleConnect(notetaker.id)}
                      disabled={!!connectingId}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex-shrink-0"
                    >
                      {isConnecting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Connect'
                      )}
                    </button>
                  )}
                </div>

                {/* Fireflies API key input */}
                <AnimatePresence>
                  {notetaker.id === 'fireflies' && showFirefliesInput && !isConnected && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 pt-3 border-t border-gray-700">
                        <label className="text-xs font-medium text-gray-400 block mb-1.5">
                          Fireflies API Key
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="password"
                            value={apiKeyInput}
                            onChange={(e) => setApiKeyInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleFirefliesSubmit();
                            }}
                            placeholder="Paste your API key here"
                            className="flex-1 px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                            autoFocus
                          />
                          <button
                            onClick={handleFirefliesSubmit}
                            disabled={connectingId === 'fireflies'}
                            className="px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:bg-gray-700 text-white text-sm font-medium transition-colors"
                          >
                            {connectingId === 'fireflies' ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              'Save'
                            )}
                          </button>
                          <button
                            onClick={() => {
                              setShowFirefliesInput(false);
                              setApiKeyInput('');
                            }}
                            className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1.5">
                          Find your API key in Fireflies Settings &rarr; Integrations &rarr; API Access.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}

          {/* Instant Replay panel — shown after first successful connection */}
          <AnimatePresence>
            {connectedId && (
              <InstantReplayPanel
                connectedId={connectedId}
                onSkip={handleSkip}
                onComplete={handleContinue}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Footer — only show when no notetaker connected yet */}
        {!connectedId && (
          <div className="px-6 pb-5 pt-2 flex items-center justify-between gap-3 border-t border-gray-800">
            <button
              onClick={handleSkip}
              disabled={isSkipping}
              className="text-sm text-gray-400 hover:text-gray-300 transition-colors disabled:opacity-50"
            >
              {isSkipping ? 'Setting up...' : 'Skip for now'}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
