import { useRef, useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Eye, Sparkles, Rocket, ArrowDown, Check, BarChart3 } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Animation variants                                                 */
/* ------------------------------------------------------------------ */

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

/* ------------------------------------------------------------------ */
/*  3D tilt hook                                                       */
/* ------------------------------------------------------------------ */

function useTiltCard(maxTilt = 4) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({
    transform: 'perspective(800px) rotateY(0deg) rotateX(0deg)',
    transition: 'transform 0.4s ease',
  });
  const [spotlight, setSpotlight] = useState<React.CSSProperties>({ opacity: 0 });
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (reducedMotion || !cardRef.current) return;
      const rect = cardRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const rotateY = (x - 0.5) * maxTilt * 2;
      const rotateX = (0.5 - y) * maxTilt * 2;
      setStyle({
        transform: `perspective(800px) rotateY(${rotateY}deg) rotateX(${rotateX}deg)`,
        transition: 'transform 0.1s ease',
      });
      setSpotlight({
        opacity: 0.08,
        background: `radial-gradient(circle at ${x * 100}% ${y * 100}%, rgba(59,130,246,0.3), transparent 60%)`,
      });
    },
    [maxTilt, reducedMotion],
  );

  const handleMouseLeave = useCallback(() => {
    setStyle({
      transform: 'perspective(800px) rotateY(0deg) rotateX(0deg)',
      transition: 'transform 0.4s ease',
    });
    setSpotlight({ opacity: 0 });
  }, []);

  return { cardRef, style, spotlight, handleMouseMove, handleMouseLeave };
}

/* ------------------------------------------------------------------ */
/*  Competitor ad data                                                 */
/* ------------------------------------------------------------------ */

const COMPETITOR_ADS = [
  {
    company: 'Gong',
    domain: 'gong.io',
    headline: 'See why 4,000+ revenue teams chose Gong',
    impressions: '14.2K',
  },
  {
    company: 'Salesloft',
    domain: 'salesloft.com',
    headline: 'The AI-powered revenue workflow platform',
    impressions: '8.7K',
  },
  {
    company: 'Outreach',
    domain: 'outreach.io',
    headline: 'Outreach your competition with sales execution',
    impressions: '11.3K',
  },
];

/* ------------------------------------------------------------------ */
/*  Panel 1 — Capture                                                  */
/* ------------------------------------------------------------------ */

function CapturePanel() {
  const { cardRef, style, spotlight, handleMouseMove, handleMouseLeave } = useTiltCard(3);

  return (
    <motion.div
      variants={fadeUp}
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={style}
      className="relative bg-white dark:bg-[#111] border border-gray-200 dark:border-white/10 rounded-xl p-5 overflow-hidden"
    >
      <div
        className="absolute inset-0 pointer-events-none rounded-xl transition-opacity duration-300"
        style={spotlight}
        aria-hidden="true"
      />

      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 bg-blue-50 dark:bg-emerald-500/10 rounded-lg flex items-center justify-center">
            <Eye className="w-4 h-4 text-blue-600 dark:text-emerald-500" />
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-900 dark:text-white">Capture</div>
            <div className="text-[10px] text-gray-400 dark:text-gray-500">LinkedIn Ad Library</div>
          </div>
        </div>

        <div className="space-y-2.5">
          {COMPETITOR_ADS.map((ad) => (
            <div
              key={ad.company}
              className="bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.06] rounded-lg px-3 py-2.5"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <img
                  src={`https://img.logo.dev/${ad.domain}?token=pk_a8aC4bVBTOqGZ_529P0GBw`}
                  alt={ad.company}
                  className="w-5 h-5 rounded"
                  loading="lazy"
                />
                <span className="text-xs font-semibold text-gray-900 dark:text-white">{ad.company}</span>
                <span className="text-[10px] text-gray-400 dark:text-zinc-500 bg-gray-100 dark:bg-white/5 px-1.5 py-0.5 rounded ml-auto">
                  Sponsored
                </span>
              </div>
              <div className="text-[11px] text-gray-600 dark:text-zinc-300 mb-1.5">{ad.headline}</div>
              <div className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-zinc-500">
                <BarChart3 className="w-3 h-3" />
                {ad.impressions} impressions
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Panel 2 — Remix                                                    */
/* ------------------------------------------------------------------ */

function RemixPanel() {
  const { cardRef, style, spotlight, handleMouseMove, handleMouseLeave } = useTiltCard(3);

  return (
    <motion.div
      variants={fadeUp}
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={style}
      className="relative bg-white dark:bg-[#111] border border-gray-200 dark:border-white/10 rounded-xl p-5 overflow-hidden"
    >
      <div
        className="absolute inset-0 pointer-events-none rounded-xl transition-opacity duration-300"
        style={spotlight}
        aria-hidden="true"
      />

      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 bg-blue-50 dark:bg-emerald-500/10 rounded-lg flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-blue-600 dark:text-emerald-500" />
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-900 dark:text-white">Remix</div>
            <div className="text-[10px] text-gray-400 dark:text-gray-500">AI Creative Generation</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Original */}
          <div className="bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.06] rounded-lg px-3 py-2.5">
            <div className="text-[10px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-2">
              Original
            </div>
            <div className="flex items-center gap-1.5 mb-2">
              <img
                src="https://img.logo.dev/gong.io?token=pk_a8aC4bVBTOqGZ_529P0GBw"
                alt="Gong"
                className="w-4 h-4 rounded"
                loading="lazy"
              />
              <span className="text-[10px] text-gray-500 dark:text-zinc-400">Gong</span>
            </div>
            <div className="text-[11px] text-gray-600 dark:text-zinc-300 leading-relaxed">
              "See why 4,000+ revenue teams chose Gong"
            </div>
            <div className="w-full h-16 bg-gradient-to-br from-purple-100 to-purple-200 dark:from-purple-500/10 dark:to-purple-500/5 rounded mt-2" />
          </div>

          {/* Remixed */}
          <div className="bg-blue-50/50 dark:bg-emerald-500/5 border border-blue-200 dark:border-emerald-500/20 rounded-lg px-3 py-2.5">
            <div className="flex items-center gap-1 mb-2">
              <span className="text-[10px] font-semibold text-blue-600 dark:text-emerald-400 uppercase tracking-wider">
                Your Version
              </span>
              <Sparkles className="w-3 h-3 text-blue-600 dark:text-emerald-400" />
            </div>
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-4 h-4 rounded bg-blue-600 dark:bg-emerald-500 flex items-center justify-center text-white text-[8px] font-bold">
                60
              </div>
              <span className="text-[10px] text-blue-600 dark:text-emerald-400">Your Brand</span>
            </div>
            <div className="text-[11px] text-gray-600 dark:text-zinc-300 leading-relaxed">
              "See why fast-growing teams trust 60 to run their pipeline"
            </div>
            <div className="w-full h-16 bg-gradient-to-br from-blue-100 to-emerald-100 dark:from-blue-500/10 dark:to-emerald-500/10 rounded mt-2 flex items-center justify-center">
              <span className="text-[10px] text-blue-600 dark:text-emerald-400 font-medium">Image generated</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Panel 3 — Launch                                                   */
/* ------------------------------------------------------------------ */

function LaunchPanel() {
  const { cardRef, style, spotlight, handleMouseMove, handleMouseLeave } = useTiltCard(3);
  const [pushed, setPushed] = useState(false);

  return (
    <motion.div
      variants={fadeUp}
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={style}
      className="relative bg-white dark:bg-[#111] border border-gray-200 dark:border-white/10 rounded-xl p-5 overflow-hidden"
    >
      <div
        className="absolute inset-0 pointer-events-none rounded-xl transition-opacity duration-300"
        style={spotlight}
        aria-hidden="true"
      />

      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 bg-blue-50 dark:bg-emerald-500/10 rounded-lg flex items-center justify-center">
            <Rocket className="w-4 h-4 text-blue-600 dark:text-emerald-500" />
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-900 dark:text-white">Launch</div>
            <div className="text-[10px] text-gray-400 dark:text-gray-500">Push to LinkedIn Ads</div>
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.06] rounded-lg p-4">
          <div className="space-y-3 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-gray-500 dark:text-zinc-400">Budget</span>
              <span className="font-mono font-medium text-gray-900 dark:text-white">$50/day</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500 dark:text-zinc-400">Audience</span>
              <span className="text-gray-900 dark:text-white">Sales Leaders, 50-200 employees</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500 dark:text-zinc-400">Creative</span>
              <span className="text-blue-600 dark:text-emerald-400">AI-remixed from Gong ad</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500 dark:text-zinc-400">Status</span>
              <span className={`font-medium ${pushed ? 'text-green-500' : 'text-amber-500'}`}>
                {pushed ? 'Live' : 'Ready to push'}
              </span>
            </div>
          </div>

          <button
            onClick={() => setPushed(true)}
            className={`mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
              pushed
                ? 'bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-500/20'
                : 'bg-blue-600 dark:bg-emerald-500 text-white hover:bg-blue-700 dark:hover:bg-emerald-600'
            }`}
          >
            {pushed ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Pushed to LinkedIn
              </>
            ) : (
              <>
                <Rocket className="w-3.5 h-3.5" />
                Push to LinkedIn
              </>
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Connecting arrow                                                   */
/* ------------------------------------------------------------------ */

function ConnectorArrow() {
  return (
    <motion.div
      variants={fadeUp}
      className="flex items-center justify-center py-2"
    >
      <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 flex items-center justify-center">
        <ArrowDown className="w-4 h-4 text-gray-400 dark:text-zinc-500" />
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  LinkedInIntelV11                                                   */
/* ------------------------------------------------------------------ */

export function LinkedInIntelV11() {
  return (
    <section className="bg-gray-50 dark:bg-[#111] py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="text-center mb-16"
        >
          <p className="text-sm font-medium text-blue-600 dark:text-emerald-500 mb-4 tracking-wide uppercase">
            LinkedIn Intelligence
          </p>
          <h2 className="font-display font-bold text-3xl md:text-5xl text-gray-900 dark:text-white tracking-tight">
            See what your competitors run. Remix it. Launch yours.
          </h2>
          <p className="mt-4 text-gray-500 dark:text-zinc-400 text-lg font-body max-w-2xl mx-auto">
            Capture competitor ads from the LinkedIn Ad Library, remix their creatives with AI, and push directly to your campaigns — all from one screen.
          </p>
        </motion.div>

        {/* 3 panels with connecting arrows */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="max-w-lg mx-auto"
        >
          <CapturePanel />
          <ConnectorArrow />
          <RemixPanel />
          <ConnectorArrow />
          <LaunchPanel />
        </motion.div>
      </div>
    </section>
  );
}
