import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Heart, ArrowRight } from 'lucide-react';

interface GoodbyeScreenProps {
  organizationName?: string;
  onRedirectComplete?: () => void;
}

export function GoodbyeScreen({ organizationName = 'use60', onRedirectComplete }: GoodbyeScreenProps) {
  const [showRedirectHint, setShowRedirectHint] = useState(false);

  useEffect(() => {
    // Show redirect hint after 3 seconds
    const hintTimer = setTimeout(() => {
      setShowRedirectHint(true);
    }, 3000);

    // Auto-redirect after 5 seconds
    const redirectTimer = setTimeout(() => {
      if (onRedirectComplete) {
        onRedirectComplete();
      } else {
        window.location.href = '/learnmore';
      }
    }, 5000);

    return () => {
      clearTimeout(hintTimer);
      clearTimeout(redirectTimer);
    };
  }, [onRedirectComplete]);

  const handleRedirectNow = () => {
    if (onRedirectComplete) {
      onRedirectComplete();
    } else {
      window.location.href = '/learnmore';
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="text-center max-w-md"
      >
        {/* Icon */}
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="mb-6"
        >
          <Heart className="w-16 h-16 text-[#37bd7e] mx-auto" />
        </motion.div>

        {/* Main Message */}
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
          We hope you come back soon!
        </h1>

        {/* Subtext */}
        <p className="text-gray-600 dark:text-gray-400 text-lg mb-8">
          Thank you for using <span className="font-semibold text-gray-900 dark:text-white">{organizationName}</span>.
          Your journey with us has been valuable, and we're always here if you need us.
        </p>

        {/* Redirect Hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: showRedirectHint ? 1 : 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">
            Redirecting in a moment...
          </p>
        </motion.div>

        {/* Redirect Button */}
        <motion.button
          onClick={handleRedirectNow}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="inline-flex items-center gap-2 px-6 py-3 bg-[#37bd7e] hover:bg-[#2da76c] text-white font-semibold rounded-xl transition-colors"
        >
          Continue
          <ArrowRight className="w-4 h-4" />
        </motion.button>
      </motion.div>
    </div>
  );
}
