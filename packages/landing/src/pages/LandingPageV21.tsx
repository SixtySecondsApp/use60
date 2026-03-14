/**
 * LandingPageV21 — 5 strategic improvements over V20
 *
 * New in V21:
 *   1. CredibilityBar: Founder credibility + stats (replaces generic logo bar)
 *   2. ProductShowcase: Cinematic passive dashboard preview
 *   3. WhoItsFor: Persona cards for self-qualification
 *   4. Testimonials: Headshot photos + company names + star ratings
 *   5. CTA: Pricing anchor near conversion button
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { ScrollProgressBar } from '../components/landing-v10/ScrollProgressBar';
import { NavbarV19 } from '../components/landing-v19/NavbarV19';
import { InteractiveDemoV20 } from '../components/landing-v20/InteractiveDemoV20';
import { encodeDemoUrl } from './DemoLanding';

// Reuse unchanged sections from V20
import {
  HeroV20,
  BenefitsV20,
  IntegrationsV20,
  StatsV20,
  FooterV20,
} from '../components/landing-v20/PremiumSectionsV20';

// New/modified sections for V21
import {
  CredibilityBarV21,
  ProductShowcaseV21,
  WhoItsForV21,
  TestimonialsV21,
  CTAV21,
} from '../components/landing-v21/PremiumSectionsV21';

const THEME_KEY = 'v19-theme';

export function LandingPageV21() {
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
      <CredibilityBarV21 />

      <InteractiveDemoV20 />

      <WhoItsForV21 />
      <BenefitsV20 />
      <ProductShowcaseV21 />

      <IntegrationsV20 />
      <StatsV20 />
      <TestimonialsV21 />
      <CTAV21 />
      <FooterV20 />
    </div>
  );
}
