import { motion } from 'framer-motion';
import { Network, Cpu, CheckCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import architectureSvg from './svg/ArchitectureGraph.svg?raw';

const stagger = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.25, 0.4, 0, 1] },
  },
};

interface ConceptCard {
  icon: LucideIcon;
  headline: string;
  body: string;
  footer: string;
}

const CARDS: ConceptCard[] = [
  {
    icon: Network,
    headline: 'Everything connected.',
    body: '60 builds a live graph of your deals, contacts, meetings, emails, and activities. Every follow-up knows the full deal history. Every meeting prep knows what was said last time. No context is ever lost.',
    footer: 'HubSpot \u00b7 Attio \u00b7 Gmail \u00b7 Outlook \u00b7 Google Calendar \u00b7 Fathom \u00b7 Slack',
  },
  {
    icon: Cpu,
    headline: '127 skills. One brain.',
    body: 'Follow-up drafting, meeting prep, deal health scoring, pipeline alerts, prospect research, proposal generation \u2014 each is a purpose-built skill the AI can invoke. Skills chain together into sequences. The engine picks the right skill for the moment.',
    footer: '127 atomic skills \u00b7 25 sequences \u00b7 Semantic routing',
  },
  {
    icon: CheckCircle,
    headline: 'Acts first. Asks second.',
    body: "60 doesn\u2019t wait for you to ask. It detects that a follow-up is needed, drafts it, and puts it in your Slack with Send / Edit / Dismiss. You stay in control. The AI gets faster over time \u2014 it tracks your edits and learns your preferences.",
    footer: 'One-tap approve \u00b7 Learning loop \u00b7 Trust builds over time',
  },
];

export function ArchitectureV7() {
  return (
    <section className="bg-[#0c0c0c] py-28 md:py-36">
      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-40px' }}
          className="mb-16"
        >
          <motion.p
            variants={fadeUp}
            className="text-xs uppercase tracking-widest text-stone-500 font-medium mb-4"
          >
            The command center
          </motion.p>
          <motion.h2
            variants={fadeUp}
            className="font-display font-bold text-4xl md:text-5xl text-stone-100 tracking-tight"
          >
            60 sees everything. Then does something about it.
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className="mt-5 text-stone-400 text-lg max-w-3xl"
          >
            Most AI tools see one channel. 60 connects to your CRM, calendar,
            email, meetings, and Slack &mdash; then builds a unified picture of
            every deal, every contact, every conversation. When something needs
            to happen, it acts.
          </motion.p>
        </motion.div>

        {/* Animated context graph */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-40px' }}
          className="mb-16 flex justify-center"
        >
          <div
            className="w-full max-w-2xl opacity-80"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: architectureSvg }}
          />
        </motion.div>

        {/* Concept cards */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-40px' }}
          className="grid grid-cols-1 md:grid-cols-3 gap-5"
        >
          {CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.headline}
                variants={fadeUp}
                className="bg-[#161616] border border-white/[0.08] rounded-xl p-6 md:p-8 hover:border-white/[0.14] transition-colors flex flex-col"
              >
                <Icon className="w-6 h-6 text-purple-400 mb-5" />
                <h3 className="font-display font-bold text-stone-100 text-lg mb-3">
                  {card.headline}
                </h3>
                <p className="text-stone-400 text-sm leading-relaxed flex-1">
                  {card.body}
                </p>
                <p className="mt-5 font-mono text-xs text-stone-500">
                  {card.footer}
                </p>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
