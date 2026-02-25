import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import HeroSectionV9 from '../components/components-v5/HeroSectionV9';
import {
  IntegrationsSectionV4,
  FAQSectionV4,
  FinalCTA,
  LandingFooter,
} from '../components/components-v4';
import { useForceDarkMode } from '../lib/hooks/useForceDarkMode';
import { usePublicBrandingSettings } from '../lib/hooks/useBrandingSettings';
import { getLoginUrl } from '../lib/utils/siteUrl';

export default function HeroV9Preview() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useForceDarkMode();

  const { logoDark } = usePublicBrandingSettings();

  const handleNavClick = () => setMobileMenuOpen(false);

  useEffect(() => {
    const handleAnchorClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a[href^="#"]');
      if (anchor) {
        const href = anchor.getAttribute('href');
        if (href?.startsWith('#')) {
          e.preventDefault();
          document.getElementById(href.substring(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    };
    document.addEventListener('click', handleAnchorClick);
    return () => document.removeEventListener('click', handleAnchorClick);
  }, []);

  return (
    <div className="min-h-screen text-gray-100 transition-colors duration-300" style={{ backgroundColor: '#09090b' }}>
      {/* Fixed Nav */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 border-b transition-colors duration-300"
        style={{ backgroundColor: 'rgba(9,9,11,0.90)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderColor: 'rgba(255,255,255,0.08)' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <motion.a href="/" className="flex items-center gap-3" whileHover={{ scale: 1.02 }}>
              <img src={logoDark} alt="60" className="h-10 w-auto" />
            </motion.a>

            <div className="hidden md:flex items-center gap-8">
              <a href="#integrations" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">Integrations</a>
              <a href="#faq" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">FAQ</a>
            </div>

            <div className="flex items-center gap-3 sm:gap-4">
              <a href={getLoginUrl()} className="text-sm font-medium text-zinc-400 hover:text-white transition-colors hidden sm:block">
                Log In
              </a>
              <motion.a
                href="/waitlist"
                className="hidden sm:block px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition-all"
                style={{ backgroundColor: '#8B5CF6', boxShadow: '0 1px 2px rgba(0,0,0,0.4), 0 0 24px rgba(139,92,246,0.15)' }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Sign Up
              </motion.a>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-lg text-zinc-400 hover:bg-white/5 transition-colors"
                aria-label="Toggle mobile menu"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden border-t"
              style={{ backgroundColor: 'rgba(9,9,11,0.95)', borderColor: 'rgba(255,255,255,0.08)' }}
            >
              <div className="px-4 py-4 space-y-3">
                {[['#integrations', 'Integrations'], ['#faq', 'FAQ']].map(([href, label]) => (
                  <a key={href} href={href} onClick={handleNavClick} className="block py-2 px-3 rounded-lg text-base font-medium text-zinc-300 hover:bg-white/5 transition-colors">
                    {label}
                  </a>
                ))}
                <div className="pt-3 border-t space-y-3" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                  <a href={getLoginUrl()} onClick={handleNavClick} className="block py-2 px-3 rounded-lg text-base font-medium text-zinc-300 hover:bg-white/5 transition-colors">
                    Log In
                  </a>
                  <a
                    href="/waitlist"
                    onClick={handleNavClick}
                    className="block py-3 px-4 rounded-xl text-white text-center text-base font-semibold transition-all"
                    style={{ backgroundColor: '#8B5CF6' }}
                  >
                    Sign Up
                  </a>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      <main className="relative overflow-x-hidden">
        <HeroSectionV9 />
        <div id="integrations">
          <IntegrationsSectionV4 />
        </div>
        <div id="faq">
          <FAQSectionV4 />
        </div>
        <FinalCTA />
      </main>

      <LandingFooter />
    </div>
  );
}
