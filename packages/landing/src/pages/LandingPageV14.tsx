/**
 * LandingPageV14 — Polished V13 with unified demo + benefits
 *
 * Replaces 7 redundant sections with 2 new focused sections:
 * - InteractiveDemoV14: 6-chapter walkthrough (Find → Send → Record → Analyze → Follow Up → Nurture)
 * - BenefitsSectionV14: Benefits-focused feature showcase with auto-cycling tabs
 *
 * Page flow: Hero → LogoBar → Demo → Benefits → Stats → Testimonials → Integrations → CTA → Footer
 */

import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Shared design infrastructure (from V10)
import { ScrollProgressBar } from '../components/landing-v10/ScrollProgressBar';
import { NavbarV10 } from '../components/landing-v10/NavbarV10';
import { LogoBarV10 } from '../components/landing-v10/LogoBarV10';
import { FooterV10 } from '../components/landing-v10/FooterV10';

// V13 hero (V1-style subtle glow + V10 content)
import { HeroV13 } from '../components/landing-v13/HeroV13';

// V14 new sections
import { InteractiveDemoV14 } from '../components/landing-v14/InteractiveDemoV14';
import { BenefitsSectionV14 } from '../components/landing-v14/BenefitsSectionV14';

// V11 content sections (kept)
import { StatsCounterV11 } from '../components/landing-v11/StatsCounterV11';
import { TestimonialsV11 } from '../components/landing-v11/TestimonialsV11';
import { FinalCTAV11 } from '../components/landing-v11/FinalCTAV11';

// V13 integrations
import { IntegrationsV13 } from '../components/landing-v13/IntegrationsV13';

export function LandingPageV14() {
  const [isDark, setIsDark] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.removeAttribute('data-theme');
    }
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
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-gray-900 dark:text-gray-100 overflow-x-hidden transition-colors duration-300">
      <ScrollProgressBar />
      <NavbarV10 isDark={isDark} onToggleTheme={handleToggleTheme} />

      {/* Hero — V1-style subtle glow, full viewport */}
      <HeroV13 onTryDemo={handleTryDemo} />
      <LogoBarV10 />

      {/* Interactive Demo — 6 chapters: Find → Send → Record → Analyze → Follow Up → Nurture */}
      <InteractiveDemoV14 />

      {/* Benefits — replaces FeatureNarrative, ShowcaseTabs, FeatureGrid, Signals, ValueProp, Personas */}
      <BenefitsSectionV14 />

      {/* Integrations */}
      <IntegrationsV13 />

      {/* Stats — 15hrs saved, 48hrs live, 94% follow-up, $255K saved */}
      <StatsCounterV11 />

      {/* Testimonials */}
      <TestimonialsV11 />

      {/* Final CTA */}
      <FinalCTAV11 />

      {/* Footer */}
      <FooterV10 />
    </div>
  );
}
