import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Calendar } from 'lucide-react';
import { slideUp } from '../animation-variants';
import { useTypewriter } from '../useTypewriter';
import type { WalkthroughData } from '../walkthrough-data';

interface MeetingDetectedSceneProps {
  data: WalkthroughData['meetingCard'];
  onComplete: () => void;
}

export function MeetingDetectedScene({ data, onComplete }: MeetingDetectedSceneProps) {
  const { displayText } = useTypewriter(data.statusText ? '60 is preparing your meeting brief...' : '', 35, 600);

  useEffect(() => {
    const timer = setTimeout(onComplete, 3000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div
      variants={slideUp}
      initial="hidden"
      animate="show"
      className="rounded-xl bg-gray-900/80 backdrop-blur-sm border border-gray-700/50 p-5 w-full max-w-sm mx-auto"
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="mt-0.5"
        >
          <motion.div
            animate={{ scale: [1, 1.12, 1] }}
            transition={{ duration: 1.2, ease: 'easeInOut', repeat: 1, delay: 0.3 }}
            className="w-9 h-9 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center"
          >
            <Calendar className="w-4.5 h-4.5 text-violet-400" size={18} />
          </motion.div>
        </motion.div>

        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 mb-0.5">{data.date}</p>
          <p className="text-sm font-semibold text-gray-100 leading-snug truncate">
            {data.title}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {data.prospect}, {data.prospectRole} at {data.prospectCompany}
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="mt-4 border-t border-gray-700/50" />

      {/* Typewriter status */}
      <div className="mt-3 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse flex-shrink-0" />
        <p className="text-xs text-violet-300 font-medium min-h-[1rem]">
          {displayText}
          <span className="inline-block w-0.5 h-3 bg-violet-400 ml-0.5 align-middle animate-pulse" />
        </p>
      </div>
    </motion.div>
  );
}
