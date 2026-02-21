import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import HeroSectionV8 from '../components/components-v5/HeroSectionV8';
import {
  IntegrationsSectionV4,
  FAQSectionV4,
  FinalCTA,
  LandingFooter,
} from '../components/components-v4';
import { useForceDarkMode } from '../lib/hooks/useForceDarkMode';
import { usePublicBrandingSettings } from '../lib/hooks/useBrandingSettings';
import { getLoginUrl } from '../lib/utils/siteUrl';

export default function HeroV8Preview() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useForceDarkMode();

  const { logoDark } = usePublicBrandingSettings();

  const handleNavClick = () => setMobileMenuOpen(false);

  // Smooth scroll for anchor links
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
    <div className="min-h-screen text-gray-100 transition-colors duration-300" style={{ backgroundColor: '#06060C' }}>
      {/* Fixed Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl border-b transition-colors duration-300" style={{ backgroundColor: 'rgba(6,6,12,0.90)', borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <motion.a href="/" className="flex items-center gap-3" whileHover={{ scale: 1.02 }}>
              <img src={logoDark} alt="60" className="h-10 w-auto" />
            </motion.a>

            {/* Desktop links */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#how-it-works" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">How It Works</a>
              <a href="#integrations" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Integrations</a>
              <a href="#faq" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">FAQ</a>
            </div>

            <div className="flex items-center gap-3 sm:gap-4">
              <a href={getLoginUrl()} className="text-sm font-medium text-gray-400 hover:text-white transition-colors hidden sm:block">
                Log In
              </a>
              <motion.a
                href="/waitlist"
                className="hidden sm:block px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-all shadow-lg shadow-blue-900/30"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Sign Up
              </motion.a>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-lg text-gray-400 hover:bg-gray-800 transition-colors"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden border-t backdrop-blur-xl"
              style={{ backgroundColor: 'rgba(6,6,12,0.95)', borderColor: 'rgba(255,255,255,0.06)' }}
            >
              <div className="px-4 py-4 space-y-3">
                {[['#how-it-works', 'How It Works'], ['#integrations', 'Integrations'], ['#faq', 'FAQ']].map(([href, label]) => (
                  <a key={href} href={href} onClick={handleNavClick} className="block py-2 px-3 rounded-lg text-base font-medium text-gray-300 hover:bg-gray-800 transition-colors">
                    {label}
                  </a>
                ))}
                <div className="pt-3 border-t space-y-3" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <a href={getLoginUrl()} onClick={handleNavClick} className="block py-2 px-3 rounded-lg text-base font-medium text-gray-300 hover:bg-gray-800 transition-colors">
                    Log In
                  </a>
                  <a href="/waitlist" onClick={handleNavClick} className="block py-3 px-4 rounded-xl bg-blue-600 text-white text-center text-base font-semibold hover:bg-blue-700 transition-all">
                    Sign Up
                  </a>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Page Content */}
      <main className="relative overflow-x-hidden">
        <HeroSectionV8 />
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
