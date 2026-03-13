/**
 * LandingPageV19 — Premium polished landing page
 *
 * Built on V18 with: gradient headline, animated CTA borders, testimonial avatars,
 * cinematic section reveals, integration hover effects, benefits illustration polish.
 * Theme persists via localStorage. Demo URLs are encrypted (base64).
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { ScrollProgressBar } from '../components/landing-v10/ScrollProgressBar';
import { NavbarV19 } from '../components/landing-v19/NavbarV19';
import { InteractiveDemoV17 } from '../components/landing-v17/InteractiveDemoV17';
import { encodeDemoUrl } from './DemoLanding';

import {
  HeroV19,
  LogoBarV19,
  BenefitsV19,
  IntegrationsV19,
  StatsV19,
  TestimonialsV19,
  CTAV19,
  FooterV19,
} from '../components/landing-v19/PremiumSectionsV19';

const THEME_KEY = 'v19-theme';

export function LandingPageV19() {
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
    (url: string) => navigate(`/d/${encodeDemoUrl(url)}`),
    [navigate],
  );

  return (
    <div className={`min-h-screen overflow-x-hidden transition-colors duration-300 ${isDark ? 'bg-[#070b18] text-gray-100' : 'bg-white text-gray-900'}`}>
      <ScrollProgressBar />
      <NavbarV19 isDark={isDark} onToggleTheme={handleToggleTheme} />

      <HeroV19 onTryDemo={handleTryDemo} />
      <LogoBarV19 />

      {/* Interactive Demo — V17 */}
      <InteractiveDemoV17 />

      <BenefitsV19 />
      <IntegrationsV19 />
      <StatsV19 />
      <TestimonialsV19 />
      <CTAV19 />
      <FooterV19 />
    </div>
  );
}
