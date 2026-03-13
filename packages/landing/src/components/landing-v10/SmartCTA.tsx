import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

export function SmartCTA() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = () => {
      // Only show after scrolling 90% of the page
      const scrollPercent = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight);
      setVisible(scrollPercent > 0.85);
    };
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed bottom-6 right-6 z-[45]"
        >
          <a
            href="https://app.use60.com/signup"
            className="flex items-center gap-2 px-5 py-3 rounded-full text-sm font-semibold
              bg-blue-600 dark:bg-emerald-500 text-white hover:bg-blue-700 dark:hover:bg-emerald-600
              shadow-lg shadow-blue-600/25 dark:shadow-emerald-500/25 transition-all hover:scale-105"
          >
            Get Started <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
