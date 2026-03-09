/**
 * SandboxProposals
 *
 * Showcase view for the proposal generation feature.
 * Shows a list of pre-loaded proposals with a live generation animation
 * running at 2x speed, then reveals a fully rendered proposal preview.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Eye,
  Send,
  Clock,
  DollarSign,
  ChevronLeft,
  AlertTriangle,
  Lightbulb,
  Route,
  Calendar,
  FileCheck,
  type LucideIcon,
} from 'lucide-react';
import { useSandboxData } from '../data/SandboxDataProvider';
import type { SandboxProposal } from '../data/sandboxTypes';

// ─── Constants ─────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: LucideIcon }> = {
  draft: { label: 'Draft', color: 'text-gray-400 bg-gray-400/10 border-gray-400/20', icon: Clock },
  sent: { label: 'Sent', color: 'text-blue-400 bg-blue-400/10 border-blue-400/20', icon: Send },
  viewed: { label: 'Viewed', color: 'text-violet-400 bg-violet-400/10 border-violet-400/20', icon: Eye },
  signed: { label: 'Signed', color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20', icon: CheckCircle2 },
};

const SECTION_ICONS: Record<string, LucideIcon> = {
  executive_summary: FileText,
  problem: AlertTriangle,
  solution: Lightbulb,
  approach: Route,
  timeline: Calendar,
  pricing: DollarSign,
  terms: FileCheck,
};

/** Generation steps shown in the progress panel (2x speed) */
const GENERATION_STEPS = [
  { label: 'Analyzing deal context...', duration: 600 },
  { label: 'Pulling meeting transcripts...', duration: 500 },
  { label: 'Extracting key requirements...', duration: 700 },
  { label: 'Generating executive summary...', duration: 800 },
  { label: 'Writing problem statement...', duration: 600 },
  { label: 'Crafting solution overview...', duration: 700 },
  { label: 'Building timeline...', duration: 500 },
  { label: 'Calculating pricing...', duration: 600 },
  { label: 'Finalizing terms...', duration: 400 },
  { label: 'Applying brand styling...', duration: 300 },
];

// ─── Component ─────────────────────────────────────────────────

export default function SandboxProposals() {
  const { data } = useSandboxData();
  const proposals = data.proposals;

  const [selectedProposal, setSelectedProposal] = useState<SandboxProposal | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState(0);
  const [revealedSections, setRevealedSections] = useState<number>(0);
  const [generationDone, setGenerationDone] = useState(false);
  const [autoPlayed, setAutoPlayed] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // Auto-play generation on first proposal (the featured one)
  useEffect(() => {
    if (autoPlayed || proposals.length === 0) return;
    setAutoPlayed(true);

    const timer = setTimeout(() => {
      startGeneration(proposals[0]);
    }, 800);
    return () => clearTimeout(timer);
  }, [proposals]); // eslint-disable-line react-hooks/exhaustive-deps

  const startGeneration = useCallback((proposal: SandboxProposal) => {
    setSelectedProposal(proposal);
    setIsGenerating(true);
    setGenerationStep(0);
    setRevealedSections(0);
    setGenerationDone(false);
  }, []);

  // Step through generation phases at 2x speed
  useEffect(() => {
    if (!isGenerating) return;
    if (generationStep >= GENERATION_STEPS.length) {
      // Generation complete — start revealing sections
      setIsGenerating(false);
      setGenerationDone(true);
      return;
    }

    const timer = setTimeout(() => {
      setGenerationStep((s) => s + 1);
    }, GENERATION_STEPS[generationStep].duration);

    return () => clearTimeout(timer);
  }, [isGenerating, generationStep]);

  // Reveal proposal sections one by one after generation
  useEffect(() => {
    if (!generationDone || !selectedProposal) return;
    if (revealedSections >= selectedProposal.sections.length) return;

    const timer = setTimeout(() => {
      setRevealedSections((s) => s + 1);
      // Auto-scroll preview
      if (previewRef.current) {
        previewRef.current.scrollTo({
          top: previewRef.current.scrollHeight,
          behavior: 'smooth',
        });
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [generationDone, revealedSections, selectedProposal]);

  const handleBack = useCallback(() => {
    setSelectedProposal(null);
    setIsGenerating(false);
    setGenerationDone(false);
    setRevealedSections(0);
  }, []);

  const handleViewProposal = useCallback((proposal: SandboxProposal) => {
    setSelectedProposal(proposal);
    setIsGenerating(false);
    setGenerationDone(true);
    setRevealedSections(proposal.sections.length);
  }, []);

  // ─── Proposal List View ─────────────────────────────────────

  if (!selectedProposal) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Proposals</h1>
            <p className="text-sm text-gray-400 mt-1">
              AI-generated proposals from your deal context and meeting transcripts
            </p>
          </div>
          <button
            onClick={() => proposals[0] && startGeneration(proposals[0])}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#37bd7e] hover:bg-[#2da76c] text-white text-sm font-medium transition-colors"
          >
            <FileText className="w-4 h-4" />
            Generate Proposal
          </button>
        </div>

        {/* Proposal cards */}
        <div className="space-y-3">
          {proposals.map((proposal, i) => {
            const status = STATUS_CONFIG[proposal.status] ?? STATUS_CONFIG.draft;
            const StatusIcon = status.icon;
            const relativeTime = getRelativeTime(proposal.created_at);

            return (
              <motion.div
                key={proposal.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.08 }}
                onClick={() => handleViewProposal(proposal)}
                className="group rounded-xl border border-gray-700/30 bg-gray-900/40 backdrop-blur-xl p-4 cursor-pointer hover:border-gray-600/50 hover:bg-gray-800/40 transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${proposal.brand_color}20`, borderColor: `${proposal.brand_color}30` }}
                    >
                      <FileText className="w-5 h-5" style={{ color: proposal.brand_color }} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-white truncate group-hover:text-[#37bd7e] transition-colors">
                        {proposal.title}
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {proposal.contact_name} at {proposal.company_name}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-sm font-medium text-gray-300">
                      ${(proposal.value / 1000).toFixed(0)}K
                    </span>
                    <span className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium border ${status.color}`}>
                      <StatusIcon className="w-3 h-3" />
                      {status.label}
                    </span>
                    <span className="text-[11px] text-gray-600">{relativeTime}</span>
                    <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
                  </div>
                </div>

                {/* Section count */}
                <div className="flex items-center gap-4 mt-3 ml-13">
                  <span className="text-[11px] text-gray-600">
                    {proposal.sections.length} sections
                  </span>
                  <div className="flex items-center gap-1">
                    {proposal.sections.filter((s) => s.type !== 'cover').slice(0, 5).map((section) => {
                      const Icon = SECTION_ICONS[section.type] ?? FileText;
                      return (
                        <div
                          key={section.id}
                          className="w-5 h-5 rounded flex items-center justify-center bg-gray-800/50"
                          title={section.title}
                        >
                          <Icon className="w-3 h-3 text-gray-500" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* CTA */}
        <div className="rounded-2xl p-5 bg-gradient-to-r from-[#37bd7e]/10 via-[#37bd7e]/5 to-transparent border border-[#37bd7e]/20 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">
              Proposals generated from your deal context in seconds
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Meeting transcripts, deal data, and CRM context — all woven into professional proposals
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[#37bd7e] text-sm font-medium flex-shrink-0">
            Try it free
            <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      </div>
    );
  }

  // ─── Generation + Preview View ──────────────────────────────

  const progressPercent = isGenerating
    ? Math.round((generationStep / GENERATION_STEPS.length) * 100)
    : 100;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleBack}
          className="p-1.5 rounded-lg bg-gray-800/50 text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-white truncate">{selectedProposal.title}</h1>
          <p className="text-xs text-gray-500">
            {selectedProposal.contact_name} at {selectedProposal.company_name} — ${(selectedProposal.value / 1000).toFixed(0)}K
          </p>
        </div>
      </div>

      <div className="flex gap-4 h-[calc(100vh-14rem)]">
        {/* Left: Proposal preview */}
        <div
          ref={previewRef}
          className="flex-1 rounded-2xl border border-gray-700/30 bg-white/[0.03] backdrop-blur-xl overflow-y-auto"
        >
          <AnimatePresence>
            {isGenerating && (
              <motion.div
                key="generating"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center h-full text-center p-8"
              >
                <div className="w-16 h-16 rounded-2xl bg-[#37bd7e]/10 border border-[#37bd7e]/20 flex items-center justify-center mb-6">
                  <Loader2 className="w-8 h-8 text-[#37bd7e] animate-spin" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Generating Proposal</h3>
                <p className="text-sm text-gray-400 mb-6 max-w-sm">
                  Analyzing deal context, meeting transcripts, and CRM data to build a tailored proposal...
                </p>
                {/* Progress bar */}
                <div className="w-full max-w-xs">
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-[#37bd7e] rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPercent}%` }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                    />
                  </div>
                  <p className="text-xs text-gray-600 mt-2 font-mono">{progressPercent}%</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {generationDone && (
            <div>
              {selectedProposal.sections.slice(0, revealedSections).map((section, i) => (
                <motion.div
                  key={section.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                >
                  {section.type === 'cover' ? (
                    <CoverSection
                      title={selectedProposal.title}
                      contactName={selectedProposal.contact_name}
                      companyName={selectedProposal.company_name}
                      brandColor={selectedProposal.brand_color}
                    />
                  ) : (
                    <ContentSection
                      section={section}
                      index={i}
                      brandColor={selectedProposal.brand_color}
                    />
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Generation progress sidebar */}
        <div className="hidden lg:block w-72 flex-shrink-0 space-y-3">
          {/* Progress steps */}
          <div className="rounded-2xl border bg-gray-900/40 backdrop-blur-xl border-gray-700/30 p-4">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              {isGenerating ? 'Generating' : 'Complete'}
            </h4>
            <div className="space-y-2">
              {GENERATION_STEPS.map((step, i) => {
                const isDone = i < generationStep;
                const isCurrent = i === generationStep && isGenerating;
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-2 text-xs transition-all duration-200 ${
                      isDone ? 'text-gray-500' : isCurrent ? 'text-white' : 'text-gray-700'
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle2 className="w-3 h-3 text-[#37bd7e] flex-shrink-0" />
                    ) : isCurrent ? (
                      <Loader2 className="w-3 h-3 text-[#37bd7e] animate-spin flex-shrink-0" />
                    ) : (
                      <div className="w-3 h-3 rounded-full border border-gray-700 flex-shrink-0" />
                    )}
                    <span className="truncate">{step.label.replace('...', '')}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Proposal info */}
          <div className="rounded-2xl border bg-gray-900/40 backdrop-blur-xl border-gray-700/30 p-4">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Context Sources
            </h4>
            <div className="space-y-2 text-xs">
              {[
                { label: 'Meeting transcripts', value: '3 calls' },
                { label: 'Deal data', value: `$${(selectedProposal.value / 1000).toFixed(0)}K` },
                { label: 'Email threads', value: '7 messages' },
                { label: 'CRM notes', value: '4 entries' },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-gray-400">{item.label}</span>
                  <span className="text-gray-600">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions (when done) */}
          {generationDone && revealedSections >= (selectedProposal?.sections.length ?? 0) && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="rounded-2xl border bg-gray-900/40 backdrop-blur-xl border-gray-700/30 p-4 space-y-2"
            >
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Actions
              </h4>
              {[
                { icon: Send, label: 'Send to client', color: 'text-[#37bd7e]' },
                { icon: Eye, label: 'Preview as PDF', color: 'text-blue-400' },
                { icon: FileText, label: 'Edit sections', color: 'text-violet-400' },
              ].map((action) => (
                <button
                  key={action.label}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-gray-300 hover:bg-gray-800/50 transition-colors"
                >
                  <action.icon className={`w-3.5 h-3.5 ${action.color}`} />
                  {action.label}
                </button>
              ))}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────

function CoverSection({
  title,
  contactName,
  companyName,
  brandColor,
}: {
  title: string;
  contactName: string;
  companyName: string;
  brandColor: string;
}) {
  return (
    <div className="relative flex flex-col items-center justify-center text-center px-8 py-16 border-b border-gray-800/50">
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{ backgroundColor: brandColor }}
      />
      <p
        className="text-[11px] font-semibold uppercase tracking-widest mb-4"
        style={{ color: brandColor }}
      >
        {companyName}
      </p>
      <h1 className="text-2xl md:text-3xl font-bold text-white mb-3 leading-tight max-w-lg">
        {title}
      </h1>
      <p className="text-sm text-gray-400 mb-4">
        Prepared for <span className="font-medium text-gray-200">{contactName}</span>
      </p>
      <p className="text-xs text-gray-600">
        {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
    </div>
  );
}

function ContentSection({
  section,
  index,
  brandColor,
}: {
  section: SandboxProposal['sections'][0];
  index: number;
  brandColor: string;
}) {
  const Icon = SECTION_ICONS[section.type] ?? FileText;
  const isEven = index % 2 === 0;

  return (
    <div
      className={`px-6 md:px-10 py-8 border-b border-gray-800/30 last:border-b-0 ${
        isEven ? 'bg-transparent' : 'bg-white/[0.02]'
      }`}
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-1 h-6 rounded-full flex-shrink-0"
          style={{ backgroundColor: brandColor }}
        />
        <Icon className="w-4 h-4 flex-shrink-0" style={{ color: brandColor }} />
        <h2 className="text-lg font-semibold text-white">{section.title}</h2>
      </div>
      <div
        className="ml-8 text-sm text-gray-300 leading-relaxed prose prose-sm prose-invert max-w-none
          prose-p:text-gray-300 prose-li:text-gray-300 prose-strong:text-white
          prose-th:text-gray-200 prose-td:text-gray-300
          prose-table:border-gray-700 prose-th:border-gray-700 prose-td:border-gray-700/50
          prose-th:bg-gray-800/50 prose-th:px-3 prose-th:py-2
          prose-td:px-3 prose-td:py-2"
        dangerouslySetInnerHTML={{ __html: section.content }}
      />
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────

function getRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}
