/**
 * LandingPageV22 — 11 improvements over V21
 *
 * New in V22:
 *   #0  InteractiveDemoV22: Hover-pause bug fix (step cards only)
 *   #1  Tighter section spacing (~30% reduction on V22-owned sections)
 *   #2  IntegrationMarqueeV22: Auto-scrolling logo strip
 *   #3  StickyCTABar: Fixed bar below navbar
 *   #4  BeforeAfterV22: "Without 60" vs "With 60" comparison
 *   #5  FAQV22: Accordion before CTA
 *   #6  CredibilityBarV22: Animated count-up on scroll
 *   #7  CTAV22: Trust badges below CTA button
 *   #8  ComparisonTableV22: "60 vs 5 tools" grid
 *   #9  TestimonialsV22: Mobile drag carousel
 *   #10 WhoItsForV22 + BenefitsV22: Persona-to-benefit deep links
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { ScrollProgressBar } from '../components/landing-v10/ScrollProgressBar';
import { NavbarV19 } from '../components/landing-v19/NavbarV19';
import { InteractiveDemoV22 } from '../components/landing-v22/InteractiveDemoV22';
import { encodeDemoUrl } from './DemoLanding';

// Reuse unchanged sections from V20/V21
import {
  HeroV20,
  IntegrationsV20,
  FooterV20,
} from '../components/landing-v20/PremiumSectionsV20';


// V22 sections
import {
  CredibilityBarV22,
  IntegrationMarqueeV22,
  WhoItsForV22,
  BeforeAfterV22,
  BenefitsV22,
  ComparisonTableV22,
  VideoSectionV22,
  StatsWithContextV22,
  TestimonialsV22,
  FAQV22,
  CTAV22,
} from '../components/landing-v22/PremiumSectionsV22';

const THEME_KEY = 'v19-theme';

export function LandingPageV22() {
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === null ? true : stored === 'dark';
  });
  const navigate = useNavigate();

  // Persona-to-benefit deep link state (#10)
  const [benefitJumpIndex, setBenefitJumpIndex] = useState<number | null>(null);
  const benefitsRef = useRef<HTMLDivElement>(null);

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

  const handlePersonaClick = useCallback((benefitIndex: number) => {
    setBenefitJumpIndex(benefitIndex);
    // Scroll to benefits section
    benefitsRef.current?.scrollIntoView({ behavior: 'smooth' });
    // Reset after animation completes
    setTimeout(() => setBenefitJumpIndex(null), 500);
  }, []);

  return (
    <div className={`min-h-screen overflow-x-hidden transition-colors duration-300 ${isDark ? 'bg-[#070b18] text-gray-100' : 'bg-white text-gray-900'}`}>
      <ScrollProgressBar />
      <NavbarV19 isDark={isDark} onToggleTheme={handleToggleTheme} />

      <HeroV20 onTryDemo={handleTryDemo} />
      <CredibilityBarV22 />
      <IntegrationMarqueeV22 />

      <InteractiveDemoV22 />

      <WhoItsForV22 onPersonaClick={handlePersonaClick} />
      <BeforeAfterV22 />

      <div ref={benefitsRef}>
        <BenefitsV22 jumpToIndex={benefitJumpIndex} />
      </div>

      <ComparisonTableV22 />
      <VideoSectionV22 />
      <IntegrationsV20 />
      <StatsWithContextV22 />
      <TestimonialsV22 />
      <FAQV22 />
      <CTAV22 />
      <FooterV20 />
    </div>
  );
}
