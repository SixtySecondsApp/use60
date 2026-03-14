import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ThemeToggleV10 } from '../landing-v10/ThemeToggleV10';

const LOGO_ICON = 'https://ygdpgliavpxeugaajgrb.supabase.co/storage/v1/object/public/Logos/ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459/Icon.png';
const LOGO_LIGHT = 'https://ygdpgliavpxeugaajgrb.supabase.co/storage/v1/object/public/Logos/ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459/Light%20Mode%20Logo.png';
const LOGO_DARK = 'https://ygdpgliavpxeugaajgrb.supabase.co/storage/v1/object/public/Logos/ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459/Dark%20Mode%20Logo.png';

interface NavbarV19Props {
  isDark: boolean;
  onToggleTheme: () => void;
}

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Integrations', href: '#integrations' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Docs', href: '/docs' },
];

export function NavbarV19({ isDark, onToggleTheme }: NavbarV19Props) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const handleNavClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      if (!href.startsWith('#')) return; // Let normal links behave as usual

      e.preventDefault();
      const id = href.slice(1);
      const isHomePage = location.pathname === '/' || location.pathname === '/v23';

      if (isHomePage) {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
      } else {
        navigate(`/v23${href}`);
      }
    },
    [location.pathname, navigate],
  );

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/80 dark:bg-[#070b18]/80 backdrop-blur-xl shadow-[0_1px_0_0_rgba(0,0,0,0.06)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.06)]'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo — 25% bigger than V10 (h-7 → h-9) */}
        <a href="/v19" className="flex items-center">
          <img src={LOGO_ICON} alt="60" className="md:hidden h-9 w-auto" />
          <img src={isDark ? LOGO_DARK : LOGO_LIGHT} alt="use60" className="hidden md:block h-9 w-auto" />
        </a>

        {/* Desktop nav — 10% brighter + thicker */}
        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              onClick={(e) => handleNavClick(e, link.href)}
              className="text-sm font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-4">
          <a
            href="https://app.use60.com"
            className="hidden md:inline-flex text-sm font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Log in
          </a>
          <ThemeToggleV10 isDark={isDark} onToggle={onToggleTheme} />
          <a
            href="https://www.use60.com/waitlist"
            className="hidden md:inline-flex px-5 py-2 rounded-lg text-sm font-semibold
              bg-blue-600 dark:bg-emerald-500 text-white hover:bg-blue-700 dark:hover:bg-emerald-600 transition-colors
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          >
            Get Started
          </a>

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white transition-colors"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="md:hidden overflow-hidden bg-white/95 dark:bg-[#070b18]/95 backdrop-blur-xl border-b border-gray-100 dark:border-white/10"
          >
            <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col gap-4">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={(e) => {
                    handleNavClick(e, link.href);
                    setMobileOpen(false);
                  }}
                  className="text-base font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors py-2"
                >
                  {link.label}
                </a>
              ))}
              <a
                href="https://app.use60.com"
                className="text-base font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors py-2"
              >
                Log in
              </a>
              <a
                href="https://www.use60.com/waitlist"
                onClick={() => setMobileOpen(false)}
                className="mt-2 w-full px-5 py-3 rounded-lg text-sm font-semibold text-center
                  bg-blue-600 dark:bg-emerald-500 text-white hover:bg-blue-700 dark:hover:bg-emerald-600 transition-colors"
              >
                Get Started
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
