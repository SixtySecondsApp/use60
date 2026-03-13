import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { NavbarV12 } from '../components/landing-v12/NavbarV12';
import { HeroV12 } from '../components/landing-v12/HeroV12';
import { LogoBarV12 } from '../components/landing-v12/LogoBarV12';
import { FeatureCardsV12 } from '../components/landing-v12/FeatureCardsV12';
import { WorkflowDemoV12 } from '../components/landing-v12/WorkflowDemoV12';
import { ShowcaseTabsV12 } from '../components/landing-v12/ShowcaseTabsV12';
import { StatsCalloutV12 } from '../components/landing-v12/StatsCalloutV12';
import { IntegrationsV12 } from '../components/landing-v12/IntegrationsV12';
import { TestimonialsV12 } from '../components/landing-v12/TestimonialsV12';
import { FinalCTAV12 } from '../components/landing-v12/FinalCTAV12';
import { FooterV12 } from '../components/landing-v12/FooterV12';
import { SmartCTA } from '../components/landing-v12/SmartCTA';
import { ScrollProgressBar } from '../components/landing-v12/ScrollProgressBar';

export function LandingPageV12() {
  // DEFAULT TO DARK MODE (HeyReach is dark-first)
  const [isDark, setIsDark] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
    }
    return () => {
      document.documentElement.classList.remove('dark');
      document.documentElement.removeAttribute('data-theme');
    };
  }, [isDark]);

  const handleToggleTheme = useCallback(() => setIsDark((prev) => !prev), []);
  const handleTryDemo = useCallback((url: string) => navigate(`/t/${url}`), [navigate]);

  return (
    <div className="min-h-screen bg-white dark:bg-[#070b1a] text-gray-900 dark:text-[#e1f0ff] overflow-x-hidden transition-colors duration-300">
      <ScrollProgressBar />
      <NavbarV12
        onGetStarted={() => window.open('https://app.use60.com/auth/signup', '_blank')}
        isDark={isDark}
        onToggleTheme={handleToggleTheme}
      />
      <HeroV12 onTryDemo={handleTryDemo} />
      <LogoBarV12 />
      <FeatureCardsV12 />
      <WorkflowDemoV12 />
      <ShowcaseTabsV12 />
      <StatsCalloutV12 />
      <IntegrationsV12 />
      <TestimonialsV12 />
      <FinalCTAV12 />
      <FooterV12 />
      <SmartCTA />
    </div>
  );
}
