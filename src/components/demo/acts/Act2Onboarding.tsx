// src/components/demo/acts/Act2Onboarding.tsx
// Act 2: Simulated onboarding wizard using fictional Meridian AI data.
// Auto-steps through 5 scenes with animated transitions.

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Circle,
  Edit3,
  Globe,
  Loader2,
  Mail,
  Package,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { enrichmentData, inferredConfigItems } from '../data/meridianAI';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACCENT = '#6C5CE7';
const TYPING_SPEED = 45; // ms per character
const STAGE_DELAY = 500; // ms between enrichment stages

const toneCallouts: Record<number, string> = {
  2: "I've analyzed Meridian AI. Based on your enterprise SaaS motion and Series B stage, here's what I found.",
  3: "I've pre-configured your AI teammate with MEDDIC methodology and mid-market defaults. Review and adjust anything I got wrong.",
  4: "Your AI teammate is 42% configured. It'll learn the rest from your daily workflow over the next few weeks.",
};

// ---------------------------------------------------------------------------
// Step 0: Email Input
// ---------------------------------------------------------------------------

function EmailInputStep({ onComplete }: { onComplete: () => void }) {
  const [typedText, setTypedText] = useState('');
  const [domainDetected, setDomainDetected] = useState(false);
  const email = 'sarah@meridian-ai.com';
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let idx = 0;
    intervalRef.current = setInterval(() => {
      idx++;
      setTypedText(email.slice(0, idx));
      if (idx >= email.length) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setTimeout(() => setDomainDetected(true), 400);
      }
    }, TYPING_SPEED);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="text-center space-y-2">
        <h3 className="text-xl font-bold text-white">Let's set up your AI teammate</h3>
        <p className="text-sm text-gray-400">Enter your work email and we'll do the rest</p>
      </div>

      <div className="max-w-md mx-auto">
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <div className="w-full bg-gray-800 border border-gray-700 rounded-lg py-3 pl-10 pr-4 text-sm text-white font-mono">
            {typedText}
            <motion.span
              animate={{ opacity: [1, 0] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
              className="inline-block w-0.5 h-4 bg-violet-400 ml-0.5 align-middle"
            />
          </div>
        </div>

        <AnimatePresence>
          {domainDetected && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex items-center gap-2 mt-3 text-sm text-emerald-400"
            >
              <CheckCircle2 className="w-4 h-4" />
              Corporate domain detected — <span className="font-semibold">meridian-ai.com</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {domainDetected && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="flex justify-center"
        >
          <button
            onClick={onComplete}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: ACCENT }}
          >
            Continue
            <ChevronRight className="w-4 h-4" />
          </button>
        </motion.div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Enrichment Loading
// ---------------------------------------------------------------------------

const enrichmentStages = [
  'Scanning website...',
  'Analyzing industry...',
  'Detecting products...',
  'Finding competitors...',
  'Building AI profile...',
];

function EnrichmentLoadingStep({ onComplete }: { onComplete: () => void }) {
  const [completedStages, setCompletedStages] = useState<number[]>([]);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    enrichmentStages.forEach((_, i) => {
      timers.push(
        setTimeout(() => {
          setCompletedStages((prev) => [...prev, i]);
        }, STAGE_DELAY * (i + 1)),
      );
    });
    // Auto-advance after all stages complete + a brief pause
    timers.push(
      setTimeout(() => {
        onCompleteRef.current();
      }, STAGE_DELAY * (enrichmentStages.length + 1) + 600),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  const allDone = completedStages.length === enrichmentStages.length;

  return (
    <div className="space-y-4">
      <div className="text-center space-y-2">
        <h3 className="text-xl font-bold text-white">Researching your company</h3>
        <p className="text-sm text-gray-400">Analyzing meridian-ai.com to auto-configure your AI teammate</p>
      </div>

      <div className="max-w-sm mx-auto space-y-2">
        {enrichmentStages.map((stage, i) => {
          const done = completedStages.includes(i);
          const active = !done && completedStages.length === i;

          return (
            <motion.div
              key={stage}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex items-center gap-3 text-sm py-1"
            >
              {done ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : active ? (
                <Loader2 className="w-4 h-4 text-violet-400 animate-spin shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-gray-600 shrink-0" />
              )}
              <span className={done ? 'text-gray-300' : active ? 'text-violet-300' : 'text-gray-500'}>
                {stage}
              </span>
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence>
        {allDone && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="flex justify-center"
          >
            <button
              onClick={onComplete}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90"
              style={{ backgroundColor: ACCENT }}
            >
              View Results
              <ChevronRight className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Enrichment Result
// ---------------------------------------------------------------------------

function EnrichmentResultStep({ onComplete }: { onComplete: () => void }) {
  const d = enrichmentData;

  return (
    <div className="space-y-4">
      <div className="text-center space-y-2">
        <h3 className="text-xl font-bold text-white">Company Profile Discovered</h3>
      </div>

      <div className="max-w-lg mx-auto">
        <div className="rounded-xl overflow-hidden border border-gray-700">
          {/* Gradient header */}
          <div className="bg-gradient-to-r from-violet-600 to-purple-600 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                <Globe className="w-5 h-5 text-white" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white">{d.companyName}</h4>
                <p className="text-xs text-violet-200">{d.domain} &middot; {d.industry}</p>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="bg-gray-900 p-4 space-y-4">
            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Employees', value: String(d.employeeCount) },
                { label: 'Stage', value: d.fundingStage },
                { label: 'Funding', value: d.totalFunding },
              ].map((s) => (
                <div key={s.label} className="bg-gray-800 rounded-lg p-2 text-center">
                  <div className="text-xs text-gray-400">{s.label}</div>
                  <div className="text-sm font-semibold text-white">{s.value}</div>
                </div>
              ))}
            </div>

            {/* Description */}
            <p className="text-xs text-gray-400 leading-relaxed">{d.description}</p>

            {/* Products */}
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Package className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-xs font-semibold text-gray-300">Products</span>
              </div>
              <div className="space-y-1">
                {d.products.map((p) => (
                  <div key={p.name} className="bg-gray-800 rounded px-2.5 py-1.5">
                    <div className="text-xs font-medium text-white">{p.name}</div>
                    <div className="text-[10px] text-gray-400">{p.description}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Competitors */}
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Shield className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-xs font-semibold text-gray-300">Competitors</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {d.competitors.map((c) => (
                  <span key={c.name} className="text-[10px] bg-gray-800 text-gray-300 px-2 py-1 rounded-full">
                    {c.name}
                  </span>
                ))}
              </div>
            </div>

            {/* ICP */}
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Target className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-xs font-semibold text-gray-300">ICP Summary</span>
              </div>
              <p className="text-xs text-gray-400">{d.icp.companyProfile}</p>
              <p className="text-xs text-gray-400 mt-0.5">Buyer: {d.icp.buyerPersona}</p>
            </div>

            {/* Value Props */}
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-xs font-semibold text-gray-300">Value Propositions</span>
              </div>
              <div className="space-y-0.5">
                {d.valuePropositions.map((vp) => (
                  <div key={vp} className="flex items-start gap-1.5 text-xs text-gray-400">
                    <Check className="w-3 h-3 text-emerald-400 mt-0.5 shrink-0" />
                    {vp}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <button
          onClick={onComplete}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90"
          style={{ backgroundColor: ACCENT }}
        >
          Configure Agent
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Agent Config Confirm
// ---------------------------------------------------------------------------

const confidenceColors = {
  high: 'bg-emerald-400',
  medium: 'bg-amber-400',
  low: 'bg-red-400',
};

const categoryIcons: Record<string, React.ReactNode> = {
  'Company Profile': <Users className="w-3.5 h-3.5 text-violet-400" />,
  'Sales Process': <Target className="w-3.5 h-3.5 text-violet-400" />,
  'Pipeline and Deals': <TrendingUp className="w-3.5 h-3.5 text-violet-400" />,
};

function AgentConfigStep({ onComplete }: { onComplete: () => void }) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Group items by category
  const grouped = useMemo(() => {
    const map = new Map<string, typeof inferredConfigItems>();
    for (const item of inferredConfigItems) {
      const list = map.get(item.category) || [];
      list.push(item);
      map.set(item.category, list);
    }
    return map;
  }, []);

  const visibleItems = showAdvanced ? inferredConfigItems : inferredConfigItems.slice(0, 7);
  const hiddenCount = inferredConfigItems.length - 7;

  // Group visible items
  const visibleGrouped = useMemo(() => {
    const map = new Map<string, typeof inferredConfigItems>();
    for (const item of visibleItems) {
      const list = map.get(item.category) || [];
      list.push(item);
      map.set(item.category, list);
    }
    return map;
  }, [visibleItems]);

  return (
    <div className="space-y-4">
      <div className="text-center space-y-2">
        <h3 className="text-xl font-bold text-white">Agent Configuration</h3>
        <p className="text-sm text-gray-400">
          {inferredConfigItems.length} settings auto-detected. Review and adjust as needed.
        </p>
      </div>

      <div className="max-w-lg mx-auto space-y-4">
        {Array.from(visibleGrouped.entries()).map(([category, items]) => (
          <div key={category}>
            <div className="flex items-center gap-1.5 mb-2">
              {categoryIcons[category] ?? <Zap className="w-3.5 h-3.5 text-violet-400" />}
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{category}</span>
            </div>
            <div className="space-y-1">
              {items.map((item) => (
                <div
                  key={item.key}
                  className="group flex items-center justify-between bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 hover:border-violet-600/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${confidenceColors[item.confidence]}`} />
                    <div className="min-w-0">
                      <div className="text-xs text-gray-400">{item.label}</div>
                      <div className="text-sm text-white font-medium truncate">{item.value}</div>
                    </div>
                  </div>
                  {item.editable && (
                    <Edit3 className="w-3.5 h-3.5 text-gray-600 group-hover:text-violet-400 transition-colors shrink-0 ml-2" />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Show Advanced toggle */}
        {!showAdvanced && hiddenCount > 0 && (
          <button
            onClick={() => setShowAdvanced(true)}
            className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors mx-auto"
          >
            <ChevronDown className="w-3.5 h-3.5" />
            Show {hiddenCount} Advanced Settings
          </button>
        )}
        {showAdvanced && (
          <button
            onClick={() => setShowAdvanced(false)}
            className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors mx-auto"
          >
            <ChevronUp className="w-3.5 h-3.5" />
            Hide Advanced Settings
          </button>
        )}

        {/* Confidence legend */}
        <div className="flex items-center justify-center gap-4 text-[10px] text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400" /> High confidence
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-400" /> Medium
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-400" /> Low — review recommended
          </span>
        </div>

        <div className="flex justify-center">
          <button
            onClick={onComplete}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: ACCENT }}
          >
            <CheckCircle2 className="w-4 h-4" />
            Confirm Configuration
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4: Completeness
// ---------------------------------------------------------------------------

const categoryBreakdown = [
  { name: 'Company Profile', filled: 6, total: 10 },
  { name: 'Sales Process', filled: 4, total: 12 },
  { name: 'Pipeline and Deals', filled: 4, total: 11 },
];

function CompletenessStep() {
  const pct = 42;

  return (
    <div className="space-y-4">
      <div className="text-center space-y-2">
        <h3 className="text-xl font-bold text-white">Configuration Complete</h3>
        <p className="text-sm text-gray-400">Your AI teammate is ready to start learning</p>
      </div>

      <div className="max-w-md mx-auto">
        <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-5 space-y-4">
          {/* Tier badge */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-400" />
              <span className="text-sm font-semibold text-white">Configuration Completeness</span>
            </div>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
              style={{ backgroundColor: ACCENT }}
            >
              TUNED
            </span>
          </div>

          {/* Progress bar */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-2xl font-bold text-white">{pct}%</span>
              <span className="text-xs text-gray-400">14 of 33 items set</span>
            </div>
            <div className="h-2.5 bg-gray-700 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
                className="h-full rounded-full"
                style={{ backgroundColor: ACCENT }}
              />
            </div>
            <p className="text-[10px] text-gray-500 mt-1.5">14 auto-detected from enrichment and AI inference</p>
          </div>

          {/* Category mini-bars */}
          <div className="space-y-2.5">
            {categoryBreakdown.map((cat) => {
              const catPct = Math.round((cat.filled / cat.total) * 100);
              return (
                <div key={cat.name}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-300">{cat.name}</span>
                    <span className="text-gray-500">
                      {cat.filled}/{cat.total}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${catPct}%` }}
                      transition={{ duration: 0.8, delay: 0.3, ease: 'easeOut' }}
                      className="h-full rounded-full bg-violet-500/70"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* What happens next */}
          <div className="bg-gray-900/50 rounded-lg p-3 space-y-1.5">
            <div className="text-xs font-semibold text-gray-300">What happens next</div>
            <div className="space-y-1">
              {[
                'Your AI teammate will begin learning from your daily workflow',
                'Configuration questions will appear in Slack over the coming weeks',
                'Accuracy improves automatically as you use the platform',
              ].map((item) => (
                <div key={item} className="flex items-start gap-1.5 text-[11px] text-gray-400">
                  <ChevronRight className="w-3 h-3 text-violet-400 mt-0.5 shrink-0" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tone Callout
// ---------------------------------------------------------------------------

function ToneCallout({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.4 }}
      className="max-w-lg mx-auto mt-4"
    >
      <div className="flex items-start gap-2.5 bg-violet-950/30 border border-violet-800/30 rounded-lg px-4 py-3">
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5"
          style={{ backgroundColor: ACCENT }}
        >
          <Sparkles className="w-3 h-3 text-white" />
        </div>
        <p className="text-xs text-violet-300/90 leading-relaxed italic">{text}</p>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Act2Onboarding() {
  const [step, setStep] = useState(0);

  const advance = useCallback(() => {
    setStep((s) => Math.min(s + 1, 4));
  }, []);

  // Step indicator dots
  const stepLabels = ['Email', 'Enriching', 'Results', 'Config', 'Completeness'];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-1">
        {stepLabels.map((label, i) => (
          <React.Fragment key={label}>
            <div className="flex items-center gap-1.5">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold transition-colors ${
                  i < step
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : i === step
                      ? 'text-white'
                      : 'bg-gray-800 text-gray-500'
                }`}
                style={i === step ? { backgroundColor: ACCENT } : undefined}
              >
                {i < step ? <Check className="w-3 h-3" /> : i + 1}
              </div>
              <span
                className={`text-[10px] hidden sm:inline ${
                  i === step ? 'text-gray-300' : 'text-gray-600'
                }`}
              >
                {label}
              </span>
            </div>
            {i < stepLabels.length - 1 && (
              <div
                className={`w-6 h-px mx-1 ${
                  i < step ? 'bg-emerald-500/40' : 'bg-gray-700'
                }`}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Step content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
        >
          {step === 0 && <EmailInputStep onComplete={advance} />}
          {step === 1 && <EnrichmentLoadingStep onComplete={advance} />}
          {step === 2 && <EnrichmentResultStep onComplete={advance} />}
          {step === 3 && <AgentConfigStep onComplete={advance} />}
          {step === 4 && <CompletenessStep />}
        </motion.div>
      </AnimatePresence>

      {/* Tone callout */}
      <AnimatePresence mode="wait">
        {toneCallouts[step] && (
          <motion.div
            key={`tone-${step}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <ToneCallout text={toneCallouts[step]} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
