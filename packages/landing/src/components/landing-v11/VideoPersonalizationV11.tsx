import { useRef, useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Video, Play, User, Eye, Clock } from 'lucide-react';

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
/*  Video prospect data                                                */
/* ------------------------------------------------------------------ */

const VIDEO_PROSPECTS = [
  {
    name: 'Sarah Chen',
    company: 'TechFlow',
    watched: 75,
    status: 'Watched 75%',
    color: 'text-green-500',
    bgColor: 'bg-green-50 dark:bg-green-500/10',
  },
  {
    name: 'James Liu',
    company: 'Propel AI',
    watched: 0,
    status: 'Not opened',
    color: 'text-gray-400 dark:text-zinc-500',
    bgColor: 'bg-gray-50 dark:bg-white/[0.03]',
  },
  {
    name: 'Maria Torres',
    company: 'CloudBase',
    watched: 100,
    status: 'Watched 100%',
    color: 'text-blue-500',
    bgColor: 'bg-blue-50 dark:bg-blue-500/10',
  },
];

/* ------------------------------------------------------------------ */
/*  VideoPersonalizationV11                                            */
/* ------------------------------------------------------------------ */

export function VideoPersonalizationV11() {
  const { cardRef, style, spotlight, handleMouseMove, handleMouseLeave } = useTiltCard(3);

  return (
    <section className="bg-white dark:bg-[#0a0a0a] py-24 md:py-32">
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
            Personalized Video
          </p>
          <h2 className="font-display font-bold text-3xl md:text-5xl text-gray-900 dark:text-white tracking-tight">
            Send yourself to every prospect. Literally.
          </h2>
          <p className="mt-4 text-gray-500 dark:text-zinc-400 text-lg font-body max-w-2xl mx-auto">
            Clone your voice and face. 60 creates personalized videos for each prospect — mentioning their name, company, and exactly why you're reaching out. Track every view.
          </p>
        </motion.div>

        {/* Demo mockup */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="max-w-3xl mx-auto"
        >
          <motion.div
            variants={fadeUp}
            ref={cardRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={style}
            className="relative bg-white dark:bg-[#111] border border-gray-200 dark:border-white/10 rounded-xl p-6 shadow-sm overflow-hidden"
          >
            {/* Spotlight overlay */}
            <div
              className="absolute inset-0 pointer-events-none rounded-xl transition-opacity duration-300"
              style={spotlight}
              aria-hidden="true"
            />

            <div className="relative z-10">
              <div className="flex flex-col md:flex-row gap-6">
                {/* Left side — Avatar setup */}
                <div className="flex-shrink-0 w-full md:w-48">
                  <div className="bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.06] rounded-xl p-5 text-center">
                    <div className="w-20 h-20 mx-auto bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-500/20 dark:to-emerald-500/20 rounded-full flex items-center justify-center mb-3">
                      <User className="w-10 h-10 text-blue-400 dark:text-emerald-400/60" />
                    </div>
                    <div className="text-xs font-semibold text-gray-900 dark:text-white mb-1">Your AI Clone</div>
                    <div className="text-[10px] text-gray-400 dark:text-zinc-500 mb-3">Voice + face trained</div>
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 text-[10px] font-medium rounded-full">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                      Ready
                    </div>
                  </div>
                </div>

                {/* Right side — Video thumbnails */}
                <div className="flex-1 space-y-3">
                  {VIDEO_PROSPECTS.map((prospect) => (
                    <div
                      key={prospect.name}
                      className="flex items-center gap-3 bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.06] rounded-lg p-3"
                    >
                      {/* Video thumbnail */}
                      <div className="w-20 h-14 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-zinc-700 dark:to-zinc-800 rounded-lg flex items-center justify-center shrink-0 relative overflow-hidden">
                        <Play className="w-5 h-5 text-white/80" />
                        {prospect.watched > 0 && (
                          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-400/30">
                            <div
                              className={`h-full rounded-full ${prospect.watched === 100 ? 'bg-blue-500' : 'bg-green-500'}`}
                              style={{ width: `${prospect.watched}%` }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-gray-900 dark:text-white">{prospect.name}</div>
                        <div className="text-[10px] text-gray-400 dark:text-zinc-500">{prospect.company}</div>
                      </div>

                      {/* Status */}
                      <div className={`flex items-center gap-1 text-[10px] font-medium ${prospect.color} shrink-0`}>
                        {prospect.watched > 0 ? (
                          <Eye className="w-3 h-3" />
                        ) : (
                          <Clock className="w-3 h-3" />
                        )}
                        {prospect.status}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bottom stats */}
              <div className="mt-5 pt-4 border-t border-gray-100 dark:border-white/[0.06] flex items-center justify-center gap-2 text-xs text-gray-400 dark:text-zinc-500">
                <Video className="w-3.5 h-3.5 text-blue-600 dark:text-emerald-400" />
                <span>3 videos generated in 47 seconds</span>
                <span className="text-gray-300 dark:text-zinc-700">|</span>
                <span>Delivered via LinkedIn + Email</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
