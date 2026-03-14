/**
 * LandingPageV20 — Animation-focused polish over V19
 *
 * New in V20:
 *   - Hero: Glass agent-action cards appearing/disappearing in bottom-right
 *   - How It Works: Scroll-locked chapter advancement (sticky section)
 *   - Find Prospects: Data cascade green pulse ripple on enrichment cells
 *   - Analyze Meeting: Radar ping on intent detection
 *   - Follow Up: Proposal takes 60% of demo area with page-flip reveal
 *   - Benefits: Illustrations hold animation state across tab switches
 *   - CTA: Mini dashboard preview with parallax tilt
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { ScrollProgressBar } from '../components/landing-v10/ScrollProgressBar';
import { NavbarV19 } from '../components/landing-v19/NavbarV19';
import { InteractiveDemoV20 } from '../components/landing-v20/InteractiveDemoV20';
import { encodeDemoUrl } from './DemoLanding';

import {
  HeroV20,
  LogoBarV20,
  BenefitsV20,
  IntegrationsV20,
  StatsV20,
  TestimonialsV20,
  CTAV20,
  FooterV20,
} from '../components/landing-v20/PremiumSectionsV20';

const THEME_KEY = 'v19-theme';

export function LandingPageV20() {
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

      <HeroV20 onTryDemo={handleTryDemo} />
      <LogoBarV20 />

      <InteractiveDemoV20 />

      <BenefitsV20 />
      <IntegrationsV20 />
      <StatsV20 />
      <TestimonialsV20 />
      <CTAV20 />
      <FooterV20 />
    </div>
  );
}
