/**
 * DemoSkillsOnboarding — Step 6
 *
 * Trimmed onboarding where research data pre-populates fields.
 * Framed as "confirm what we found" rather than "fill out your info."
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, ArrowRight, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ResearchData } from './demo-types';

// ============================================================================
// Editable field
// ============================================================================

function ConfirmField({
  label,
  value,
  delay,
}: {
  label: string;
  value: string;
  delay: number;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="bg-gray-800/40 rounded-xl border border-white/[0.06] p-3.5 sm:p-4
        motion-reduce:transition-none"
    >
      <div className="flex items-center justify-between mb-1.5 sm:mb-2">
        <p className="text-[10px] sm:text-[11px] font-mono text-gray-500 uppercase tracking-wider">
          {label}
        </p>
        {confirmed && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
            <Check className="w-3 h-3" /> Confirmed
          </span>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            className="w-full bg-gray-900/60 border border-gray-600/50 text-sm text-gray-200
              rounded-lg px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500
              focus-visible:border-transparent resize-none"
          />
          <button
            onClick={() => {
              setEditing(false);
              setConfirmed(true);
            }}
            className="text-xs text-violet-400 font-medium hover:text-violet-300 transition-colors
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:rounded"
          >
            Save
          </button>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs sm:text-sm text-gray-200 leading-relaxed">{text}</p>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {!confirmed && (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="p-1.5 rounded-md hover:bg-gray-700/50 transition-colors text-gray-500 hover:text-gray-300
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setConfirmed(true)}
                  className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg bg-emerald-500/15
                    text-emerald-400 text-[11px] sm:text-xs font-medium hover:bg-emerald-500/25 transition-colors
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <Check className="w-3 h-3" />
                  Correct
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ============================================================================
// Skills toggle group
// ============================================================================

const DEMO_SKILLS = [
  { id: 'outreach', label: 'Cold Outreach', desc: 'Personalised email sequences', defaultOn: true },
  { id: 'meetings', label: 'Meeting Prep', desc: 'Pre-meeting briefs and intel', defaultOn: true },
  { id: 'pipeline', label: 'Pipeline Management', desc: 'Deal scoring and risk alerts', defaultOn: true },
  { id: 'proposals', label: 'Proposal Drafting', desc: 'Auto-generated proposals', defaultOn: true },
  { id: 'enrichment', label: 'Contact Enrichment', desc: 'Real-time contact & company data', defaultOn: true },
  { id: 'tasks', label: 'Task Automation', desc: 'Auto-create follow-up tasks', defaultOn: false },
];

type SkillItem = { id: string; label: string; desc: string; defaultOn: boolean };

function SkillToggle({
  skill,
  delay,
}: {
  skill: SkillItem;
  delay: number;
}) {
  const [enabled, setEnabled] = useState(skill.defaultOn);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="flex items-center justify-between py-2.5 sm:py-3 motion-reduce:transition-none"
    >
      <div className="min-w-0 pr-3">
        <p className="text-xs sm:text-sm font-medium text-gray-200 truncate">{skill.label}</p>
        <p className="text-[11px] sm:text-xs text-gray-500 truncate">{skill.desc}</p>
      </div>
      <button
        onClick={() => setEnabled((e) => !e)}
        role="switch"
        aria-checked={enabled}
        className={cn(
          'w-10 h-6 rounded-full transition-colors duration-200 relative shrink-0',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900',
          enabled ? 'bg-violet-500' : 'bg-gray-700'
        )}
      >
        <span
          className={cn(
            'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200',
            enabled ? 'translate-x-5' : 'translate-x-1'
          )}
        />
      </button>
    </motion.div>
  );
}

// ============================================================================
// Component
// ============================================================================

interface DemoSkillsOnboardingProps {
  research: ResearchData;
  onComplete: () => void;
}

export function DemoSkillsOnboarding({ research, onComplete }: DemoSkillsOnboardingProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      className="min-h-[100dvh] flex flex-col items-center justify-center px-4 sm:px-6 py-8 sm:py-12"
    >
      <div className="w-full max-w-lg sm:max-w-xl mx-auto">
        <div className="bg-gray-900/80 backdrop-blur-sm border border-white/[0.06] rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-violet-600 to-violet-700 px-5 sm:px-6 py-4 sm:py-5">
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">Configure Your Agents</h2>
            <p className="text-violet-100/90 text-xs sm:text-sm mt-1">
              We found this about your business &mdash; confirm or edit.
            </p>
          </div>

          {/* Body */}
          <div className="p-4 sm:p-6 space-y-3 sm:space-y-4 max-h-[60vh] sm:max-h-[65vh] overflow-y-auto">
            <ConfirmField
              label="Company"
              value={research.company.name}
              delay={0.1}
            />
            <ConfirmField
              label="Industry / Vertical"
              value={research.company.vertical}
              delay={0.2}
            />
            <ConfirmField
              label="What you sell"
              value={research.company.product_summary}
              delay={0.3}
            />
            <ConfirmField
              label="Ideal Customer"
              value={`${research.company.icp.title} at ${research.company.icp.company_size} companies in ${research.company.icp.industry}`}
              delay={0.4}
            />

            {/* Divider */}
            <div className="border-t border-white/[0.05] pt-3 sm:pt-4 mt-3 sm:mt-4">
              <p className="text-xs sm:text-sm font-semibold text-gray-200 mb-2 sm:mb-3">Agent Skills</p>
              <div className="divide-y divide-white/[0.04]">
                {(research.suggested_skills?.length ? research.suggested_skills : DEMO_SKILLS).map((skill, i) => (
                  <SkillToggle key={skill.id} skill={skill} delay={0.5 + i * 0.06} />
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-white/[0.05] px-5 sm:px-6 py-4 bg-gray-900/50">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              onClick={onComplete}
              className={cn(
                'w-full py-3 rounded-xl font-semibold text-sm',
                'bg-violet-600 hover:bg-violet-700 text-white transition-colors',
                'flex items-center justify-center gap-2',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900',
                'motion-reduce:transform-none'
              )}
            >
              Launch Copilot Demo
              <ArrowRight className="w-4 h-4" />
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
