import { motion } from 'framer-motion';

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
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

interface TimelineEntry {
  time: string;
  title: string;
  description: string;
  isAha?: boolean;
  ahaLine?: string;
  ahaStats?: string;
}

const TIMELINE: TimelineEntry[] = [
  {
    time: '8:30 AM',
    title: 'Morning brief arrives',
    description:
      'Slack DM from 60: 3 meetings today, 2 follow-ups pending approval, 1 deal flagged. You scan it in 30 seconds.',
  },
  {
    time: '9:00 AM',
    title: 'Meeting prep, already done',
    description:
      'TechCorp discovery call at 10. Brief auto-delivered: Sarah Chen (VP Sales, met 2x), Marcus Liu (RevOps, first meeting). Competitor: evaluating Gong.',
  },
  {
    time: '10:00 AM',
    title: 'Discovery call with TechCorp',
    description:
      'You walk in sharp. Sarah mentions pipeline visibility. Marcus asks about HubSpot integration. 60 listens via Fathom.',
  },
  {
    time: '10:45 AM',
    title: 'Call ends',
    description:
      '60 processes the transcript. Action items extracted: send HubSpot integration doc, schedule RevOps demo, prepare pricing.',
  },
  {
    time: '11:30 AM',
    title: 'Follow-up draft ready',
    description:
      'Slack DM from 60. The email references the pipeline conversation, includes HubSpot doc, suggests Thursday for demo. You tap Send.',
  },
  {
    time: '1:00 PM',
    title: 'Acme proposal review',
    description:
      'Brief flagged: no response to pricing email in 5 days. Talking point: address pricing directly, offer pilot.',
  },
  {
    time: '3:30 PM',
    title: 'CloudBase check-in',
    description:
      'Renewal in 14 days. Usage dropped from 5 to 3 users. Risk: churn. Talking point: expansion, show ROI.',
  },
  {
    time: '5:00 PM',
    title: 'Daily digest',
    description: '',
    isAha: true,
    ahaStats:
      'Today: 3 meetings prepped \u00b7 2 follow-ups sent \u00b7 1 deal moved to Proposal \u00b7 Pipeline updated automatically',
    ahaLine: 'You spent 0 minutes on admin today.',
  },
];

export function WorkflowCaseStudyV7() {
  return (
    <section className="bg-[#0c0c0c] py-28 md:py-36">
      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="max-w-3xl mb-14"
        >
          <motion.p
            variants={fadeUp}
            className="text-stone-500 text-sm font-medium tracking-wide uppercase mb-4"
          >
            A day with 60
          </motion.p>

          <motion.h2
            variants={fadeUp}
            className="font-display font-bold text-4xl md:text-5xl tracking-tight text-stone-100 leading-[1.1]"
          >
            Tuesday. Three meetings. Zero admin.
          </motion.h2>
        </motion.div>

        {/* Timeline */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="relative"
        >
          {/* Vertical line */}
          <div
            className="absolute left-[72px] md:left-[88px] top-0 bottom-0 w-px bg-white/[0.08]"
            aria-hidden="true"
          />

          <div className="space-y-6">
            {TIMELINE.map((entry, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                className="relative flex gap-6 md:gap-8"
              >
                {/* Time column */}
                <div className="w-[60px] md:w-[72px] shrink-0 pt-1">
                  <span
                    className={`font-mono text-sm ${
                      entry.isAha ? 'text-amber-400' : 'text-stone-500'
                    }`}
                  >
                    {entry.time}
                  </span>
                </div>

                {/* Dot on the line */}
                <div className="relative shrink-0 flex items-start pt-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      entry.isAha ? 'bg-amber-400' : 'bg-stone-500'
                    }`}
                  />
                </div>

                {/* Content card */}
                {entry.isAha ? (
                  <div className="flex-1 bg-amber-400/10 border border-amber-400/20 rounded-xl p-6 mb-2">
                    <h3 className="font-display font-bold text-stone-100 text-lg mb-4">
                      {entry.title}
                    </h3>
                    <p className="font-mono text-sm text-stone-300 leading-relaxed mb-4">
                      {entry.ahaStats}
                    </p>
                    <p className="text-amber-400 font-display font-bold text-lg">
                      {entry.ahaLine}
                    </p>
                  </div>
                ) : (
                  <div className="flex-1 bg-[#161616] border border-white/[0.08] rounded-xl p-6 mb-2 hover:border-white/[0.14] transition-colors">
                    <h3 className="font-display font-bold text-stone-100 text-base mb-2">
                      {entry.title}
                    </h3>
                    <p className="text-stone-400 text-sm leading-relaxed">
                      {entry.description}
                    </p>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
