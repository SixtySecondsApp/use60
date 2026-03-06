import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { staggerContainer, slideUp, fadeIn } from './onboarding/animation-variants';

interface WelcomeSplashProps {
  firstName: string;
  companyName: string;
  onDismiss: () => void;
}

export function WelcomeSplash({ firstName, companyName, onDismiss }: WelcomeSplashProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3500);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-lg"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      onClick={onDismiss}
    >
      <motion.div
        className="max-w-md w-full px-8 text-center"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        onClick={(e) => e.stopPropagation()}
      >
        <motion.div variants={slideUp} className="flex flex-wrap justify-center gap-x-2">
          <span className="text-2xl font-bold text-white">Welcome to your Command Centre,</span>
          <span className="text-2xl font-bold text-violet-400">{firstName}</span>
        </motion.div>

        <motion.p variants={slideUp} className="text-base text-gray-400 mt-3">
          {companyName}'s AI sales teammate is ready to get to work.
        </motion.p>

        <motion.p variants={fadeIn} className="text-sm text-gray-500 mt-6">
          Let me show you around...
        </motion.p>
      </motion.div>
    </motion.div>
  );
}
