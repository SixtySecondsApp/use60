import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { ScrollProgressBar } from '../components/landing-v9/ScrollProgressBar';
import { NavbarV9 } from '../components/landing-v9/NavbarV9';
import { HeroV9 } from '../components/landing-v9/HeroV9';
import { WorkflowDemoV9 } from '../components/landing-v9/WorkflowDemoV9';
import { LogoBarV9 } from '../components/landing-v9/LogoBarV9';
import { ValuePropV9 } from '../components/landing-v9/ValuePropV9';
import { FeatureNarrativeV9 } from '../components/landing-v9/FeatureNarrativeV9';
import { ShowcaseTabsV9 } from '../components/landing-v9/ShowcaseTabsV9';
import { StatsCounterV9 } from '../components/landing-v9/StatsCounterV9';
import { TestimonialInlineV9 } from '../components/landing-v9/TestimonialInlineV9';
import { SignalsV9 } from '../components/landing-v9/SignalsV9';
import { FeatureGridV9 } from '../components/landing-v9/FeatureGridV9';
import { IntegrationsV9 } from '../components/landing-v9/IntegrationsV9';
import { TestimonialsV9 } from '../components/landing-v9/TestimonialsV9';
import { FinalCTAV9 } from '../components/landing-v9/FinalCTAV9';
import { FooterV9 } from '../components/landing-v9/FooterV9';
import { FloatingCTA } from '../components/landing-v9/FloatingCTA';

export function LandingPageV9() {
  const [isDark, setIsDark] = useState(false);
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

  const handleToggleTheme = useCallback(() => setIsDark(prev => !prev), []);

  const handleTryDemo = useCallback((url: string) => {
    navigate(`/t/${url}`);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-gray-900 dark:text-gray-100 overflow-x-hidden transition-colors duration-300">
      <ScrollProgressBar />
      <NavbarV9 isDark={isDark} onToggleTheme={handleToggleTheme} />
      <HeroV9 onTryDemo={handleTryDemo} />
      <WorkflowDemoV9 />
      <LogoBarV9 />
      <ValuePropV9 />
      <FeatureNarrativeV9 />
      <ShowcaseTabsV9 />
      <StatsCounterV9 />
      <TestimonialInlineV9
        quote="My team was using 60 for meeting prep and follow-ups — and pretty quickly they just wanted it on everything."
        author="Rachel M."
        role="Account Executive"
      />
      <SignalsV9 />
      <FeatureGridV9 />
      <IntegrationsV9 />
      <TestimonialsV9 />
      <FinalCTAV9 />
      <FooterV9 />
      <FloatingCTA />
    </div>
  );
}
