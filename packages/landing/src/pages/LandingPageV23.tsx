/**
 * LandingPageV23 — Founding Member Lifetime Deal + Pricing
 *
 * Builds on V22 with:
 *   - PricingSectionV23: 3-plan grid (Basic, Founding Member, Pro)
 *   - CostComparisonV23: Interactive savings calculator
 *   - HowBYOKWorksV23: 3-step API key explainer
 *   - CreditPacksPreviewV23: Add-on credit packs for integrations
 *   - PricingFAQV23: Pricing-specific FAQ (replaces general FAQ)
 *
 * Founding Member rules:
 *   - $299 one-time, lifetime Pro access
 *   - BYOK (bring your own Claude API key)
 *   - New users only (not free trial converts)
 *   - 30-day money-back guarantee
 *   - Limited to 100 spots
 *   - Integration actions still require credit packs
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { ScrollProgressBar } from '../components/landing-v10/ScrollProgressBar';
import { NavbarV19 } from '../components/landing-v19/NavbarV19';
import { InteractiveDemoV22 } from '../components/landing-v22/InteractiveDemoV22';
import { encodeDemoUrl } from './DemoLanding';

// Reuse unchanged sections from V20
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
} from '../components/landing-v22/PremiumSectionsV22';

// V23 pricing sections
import {
  PricingSectionV23,
  CostComparisonV23,
  HowBYOKWorksV23,
  CreditPacksPreviewV23,
  PricingFAQV23,
  detectCurrency,
} from '../components/landing-v23/PricingV23';
import type { Currency } from '../components/landing-v23/PricingV23';

const THEME_KEY = 'v19-theme';

export function LandingPageV23() {
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === null ? true : stored === 'dark';
  });
  const navigate = useNavigate();

  const [benefitJumpIndex, setBenefitJumpIndex] = useState<number | null>(null);
  const benefitsRef = useRef<HTMLDivElement>(null);

  // Currency detection from browser locale/timezone
  const [currency, setCurrency] = useState<Currency>('USD');
  useEffect(() => { setCurrency(detectCurrency()); }, []);

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
    benefitsRef.current?.scrollIntoView({ behavior: 'smooth' });
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

      {/* V23: Pricing & Founding Member sections */}
      <PricingSectionV23 currency={currency} onCurrencyChange={setCurrency} />
      <CostComparisonV23 currency={currency} />
      <HowBYOKWorksV23 />
      <CreditPacksPreviewV23 currency={currency} />
      <PricingFAQV23 />

      <FooterV20 />
    </div>
  );
}
