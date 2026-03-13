import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

export function FloatingCTA() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = () => setVisible(window.scrollY > window.innerHeight * 0.8);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[45] flex items-center gap-3 px-4 py-2.5 rounded-full
            bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl border border-gray-200 dark:border-white/10 shadow-lg"
        >
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="px-4 py-2 rounded-full text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Try the demo
          </button>
          <a
            href="https://app.use60.com/signup"
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold
              bg-blue-600 dark:bg-emerald-500 text-white hover:bg-blue-700 dark:hover:bg-emerald-600 transition-colors"
          >
            Get Started <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
