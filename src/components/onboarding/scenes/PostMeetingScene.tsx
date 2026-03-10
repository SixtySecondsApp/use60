import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, Mail } from 'lucide-react';
import { slideUp, fadeIn, shimmerBar } from '../animation-variants';
import type { WalkthroughData } from '../walkthrough-data';

interface PostMeetingSceneProps {
  data: WalkthroughData['postMeeting'];
  onComplete: () => void;
}

const checkboxSpring = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 15,
};

export function PostMeetingScene({ data, onComplete }: PostMeetingSceneProps) {
  const [showShimmer, setShowShimmer] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [checkedItems, setCheckedItems] = useState<boolean[]>([false, false, false]);

  useEffect(() => {
    // 0s: header is immediate (rendered)
    // 0.5s: shimmer appears
    const t1 = setTimeout(() => setShowShimmer(true), 500);
    // 2s: shimmer ends (0.5 + 1.5s), summary appears
    const t2 = setTimeout(() => {
      setShowShimmer(false);
      setShowSummary(true);
    }, 2000);
    // 2.4s: actions card (400ms after summary)
    const t3 = setTimeout(() => setShowActions(true), 2400);
    // 3.4s: checkboxes animate to checked (1s after actions)
    const t4 = setTimeout(() => {
      setCheckedItems([true, false, false]);
    }, 3400);
    const t5 = setTimeout(() => {
      setCheckedItems([true, true, false]);
    }, 3700);
    const t6 = setTimeout(() => {
      setCheckedItems([true, true, true]);
    }, 4000);
    // 2.8s: email card (400ms after actions)
    const t7 = setTimeout(() => setShowEmail(true), 2800);
    // 7s: complete
    const t8 = setTimeout(() => onComplete(), 7000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
      clearTimeout(t6);
      clearTimeout(t7);
      clearTimeout(t8);
    };
  }, [onComplete]);

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-3 w-full"
    >
      {/* Header — immediate */}
      <div className="flex items-start gap-2">
        <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-white">
            Meeting Complete — NovaTech Demo
          </p>
          <p className="text-xs text-gray-400">
            Duration: {data.duration} | Recorded by 60
          </p>
        </div>
      </div>

      {/* Shimmer bar */}
      <AnimatePresence>
        {showShimmer && (
          <motion.div
            key="shimmer-wrapper"
            variants={fadeIn}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            className="flex flex-col gap-1.5"
          >
            <p className="text-xs text-gray-400">60 is processing...</p>
            <motion.div
              className="h-1.5 rounded-full"
              {...shimmerBar}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Summary card */}
      <AnimatePresence>
        {showSummary && (
          <motion.div
            key="summary-card"
            variants={slideUp}
            initial="hidden"
            animate="show"
            className="rounded-lg bg-gray-800/60 border border-gray-700/40 border-l-2 border-l-violet-500 p-3"
          >
            <p className="text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
              Summary
            </p>
            <p className="text-sm text-gray-200 mb-2">{data.summary}</p>
            <ul className="flex flex-col gap-1">
              {data.keyPoints.map((point, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-gray-300">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
                  {point}
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action items card */}
      <AnimatePresence>
        {showActions && (
          <motion.div
            key="actions-card"
            variants={slideUp}
            initial="hidden"
            animate="show"
            className="rounded-lg bg-gray-800/60 border border-gray-700/40 border-l-2 border-l-violet-500 p-3"
          >
            <p className="text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
              Action Items
            </p>
            <ul className="flex flex-col gap-2">
              {data.actionItems.map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <motion.div
                    className="mt-0.5 shrink-0"
                    animate={
                      checkedItems[i]
                        ? { scale: [0, 1.2, 1] }
                        : { scale: 1 }
                    }
                    transition={checkedItems[i] ? checkboxSpring : undefined}
                  >
                    {checkedItems[i] ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-gray-600" />
                    )}
                  </motion.div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-200">{item.text}</p>
                    <p className="text-xs text-gray-500">
                      {item.assignee} · due {item.deadline}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Follow-up email card */}
      <AnimatePresence>
        {showEmail && (
          <motion.div
            key="email-card"
            variants={slideUp}
            initial="hidden"
            animate="show"
            className="rounded-lg bg-gray-800/60 border border-gray-700/40 border-l-2 border-l-violet-500 p-3"
          >
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Follow-up Email
              </p>
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-amber-900/20 border border-amber-700/40 text-amber-300">
                <Mail className="w-3 h-3" />
                not sent
              </span>
            </div>
            <p className="text-xs font-medium text-gray-200 mb-1">
              {data.followUpEmail.subject}
            </p>
            <p className="text-xs text-gray-400 line-clamp-3">
              {data.followUpEmail.body}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
