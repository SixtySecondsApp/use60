/**
 * LandingPageV18 — Premium dark blue glassy landing page
 *
 * Always dark. Uses the app's dark mode palette shifted to navy.
 * Glass morphism cards, blue accents, subtle blue glows throughout.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { ScrollProgressBar } from '../components/landing-v10/ScrollProgressBar';
import { NavbarV10 } from '../components/landing-v10/NavbarV10';
import { InteractiveDemoV17 } from '../components/landing-v17/InteractiveDemoV17';

import {
  HeroV18,
  LogoBarV18,
  BenefitsV18,
  IntegrationsV18,
  StatsV18,
  TestimonialsV18,
  CTAV18,
  FooterV18,
} from '../components/landing-v18/PremiumSections';

const THEME_KEY = 'v18-theme';

export function LandingPageV18() {
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === null ? true : stored === 'dark';
  });
  const navigate = useNavigate();

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.removeAttribute('data-theme');
    }
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    return () => {
      document.documentElement.classList.remove('dark');
      document.documentElement.removeAttribute('data-theme');
    };
  }, [isDark]);

  const handleToggleTheme = useCallback(() => setIsDark((prev) => !prev), []);
  const handleTryDemo = useCallback(
    (url: string) => navigate(`/t/${url}`),
    [navigate],
  );

  return (
    <div className={`min-h-screen overflow-x-hidden transition-colors duration-300 ${isDark ? 'bg-[#070b18] text-gray-100' : 'bg-white text-gray-900'}`}>
      <ScrollProgressBar />
      <NavbarV10 isDark={isDark} onToggleTheme={handleToggleTheme} />

      <HeroV18 onTryDemo={handleTryDemo} />
      <LogoBarV18 />

      {/* Interactive Demo — V17 (already app-styled) */}
      <InteractiveDemoV17 />

      <BenefitsV18 />
      <IntegrationsV18 />
      <StatsV18 />
      <TestimonialsV18 />
      <CTAV18 />
      <FooterV18 />
    </div>
  );
}
