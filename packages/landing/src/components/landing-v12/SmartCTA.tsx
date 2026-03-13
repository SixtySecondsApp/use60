import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

export function SmartCTA() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = () => {
      // Only show after scrolling 85% of the page
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
              bg-gradient-to-r from-violet-600 to-blue-500 text-white
              shadow-lg shadow-violet-600/25 hover:shadow-[0_0_30px_-5px_rgba(124,58,237,0.5)]
              transition-all hover:scale-105"
          >
            Get Started <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
