import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getLoginUrl } from '../../lib/utils/siteUrl';
import { springs, easings } from '../../lib/animation-tokens';

interface NavbarV5Props {
  onTryFree: () => void;
}

export function NavbarV5({ onTryFree }: NavbarV5Props) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        scrolled
          ? 'bg-zinc-950/80 backdrop-blur-lg border-b border-white/[0.06]'
          : 'bg-transparent'
      )}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between px-5 sm:px-6 h-14">
        {/* Logo */}
        <a href="/" className="text-lg font-bold text-white tracking-tight">
          60
        </a>

        {/* Desktop links */}
        <div className="hidden sm:flex items-center gap-6">
          <a
            href="/pricing"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Pricing
          </a>
          <a
            href={getLoginUrl()}
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Log in
          </a>
          <motion.button
            onClick={onTryFree}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            transition={springs.press}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-white text-zinc-950 hover:bg-zinc-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          >
            Try free
          </motion.button>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="sm:hidden p-2 -mr-2 text-zinc-400 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded-lg"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: easings.default }}
            className="sm:hidden overflow-hidden bg-zinc-950/95 backdrop-blur-lg border-b border-white/[0.06]"
          >
            <div className="flex flex-col gap-1 px-5 pb-5 pt-2">
              <a
                href="/pricing"
                className="py-3 text-sm text-zinc-400 hover:text-white transition-colors"
              >
                Pricing
              </a>
              <a
                href={getLoginUrl()}
                className="py-3 text-sm text-zinc-400 hover:text-white transition-colors"
              >
                Log in
              </a>
              <motion.button
                onClick={() => {
                  setMobileOpen(false);
                  onTryFree();
                }}
                whileTap={{ scale: 0.97 }}
                transition={springs.press}
                className="mt-2 w-full py-3 rounded-lg text-sm font-semibold bg-white text-zinc-950 hover:bg-zinc-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              >
                Try free
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
