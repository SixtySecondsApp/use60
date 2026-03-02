import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Brain } from 'lucide-react';
import { staggerContainer, slideUp } from '../animation-variants';
import type { WalkthroughData } from '../walkthrough-data';

interface MeetingPrepSceneProps {
  data: WalkthroughData['prep'] & WalkthroughData['meetingCard'];
  onComplete: () => void;
}

export function MeetingPrepScene({ data, onComplete }: MeetingPrepSceneProps) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 4000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div
      variants={slideUp}
      initial="hidden"
      animate="show"
      className="rounded-xl bg-gray-900/80 backdrop-blur-sm border border-gray-700/50 p-5 w-full max-w-sm mx-auto"
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center flex-shrink-0">
          <Brain className="text-violet-400" size={16} />
        </div>
        <h3 className="text-sm font-semibold text-gray-100">
          Meeting Brief — {data.prospectCompany} Demo
        </h3>
      </div>

      {/* Attendee Intel */}
      <div className="mb-4">
        <p className="text-[10px] font-semibold tracking-widest text-gray-500 uppercase mb-2">
          Attendee Intel
        </p>
        <motion.ul
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="space-y-1.5"
        >
          {data.attendeeIntel.map((item, i) => (
            <motion.li key={i} variants={slideUp} className="flex items-start gap-2">
              <span className="mt-1.5 w-1 h-1 rounded-full bg-violet-400 flex-shrink-0" />
              <p className="text-xs text-gray-300 leading-snug">{item}</p>
            </motion.li>
          ))}
        </motion.ul>
      </div>

      {/* Talking Points */}
      <div className="mb-4">
        <p className="text-[10px] font-semibold tracking-widest text-gray-500 uppercase mb-2">
          Talking Points for {data.prospectCompany}
        </p>
        <motion.ul
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="space-y-1.5"
        >
          {data.talkingPoints.map((item, i) => (
            <motion.li key={i} variants={slideUp} className="flex items-start gap-2">
              <span className="mt-1.5 w-1 h-1 rounded-full bg-violet-400 flex-shrink-0" />
              <p className="text-xs text-gray-300 leading-snug">{item}</p>
            </motion.li>
          ))}
        </motion.ul>
      </div>

      {/* Ready badge */}
      <div className="border-t border-gray-700/50 pt-3">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0.7, 1] }}
          transition={{ duration: 1.2, delay: 0.8 }}
          className="text-xs text-emerald-500 font-medium text-center"
        >
          Ready 12 hours before your meeting
        </motion.p>
      </div>
    </motion.div>
  );
}
