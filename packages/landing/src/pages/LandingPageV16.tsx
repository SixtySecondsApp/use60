/**
 * LandingPageV16 — V15 layout with ground-up rebuilt interactive demo
 *
 * Page flow: Hero → LogoBar → Demo → Benefits → Integrations → Stats → Testimonials → CTA → Footer
 */

import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Shared design infrastructure (from V10)
import { ScrollProgressBar } from '../components/landing-v10/ScrollProgressBar';
import { NavbarV10 } from '../components/landing-v10/NavbarV10';
import { LogoBarV10 } from '../components/landing-v10/LogoBarV10';
import { FooterV10 } from '../components/landing-v10/FooterV10';

// V13 hero
import { HeroV13 } from '../components/landing-v13/HeroV13';

// V16 demo (ground-up rebuild)
import { InteractiveDemoV16 } from '../components/landing-v16/InteractiveDemoV16';

// V14 benefits
import { BenefitsSectionV14 } from '../components/landing-v14/BenefitsSectionV14';

// V11 content sections
import { StatsCounterV11 } from '../components/landing-v11/StatsCounterV11';
import { TestimonialsV11 } from '../components/landing-v11/TestimonialsV11';
import { FinalCTAV11 } from '../components/landing-v11/FinalCTAV11';

// V13 integrations
import { IntegrationsV13 } from '../components/landing-v13/IntegrationsV13';

export function LandingPageV16() {
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

      <HeroV13 onTryDemo={handleTryDemo} />
      <LogoBarV10 />

      {/* Interactive Demo — V16 ground-up rebuild */}
      <InteractiveDemoV16 />

      {/* Benefits — V14 */}
      <BenefitsSectionV14 />

      <IntegrationsV13 />
      <StatsCounterV11 />
      <TestimonialsV11 />
      <FinalCTAV11 />
      <FooterV10 />
    </div>
  );
}
