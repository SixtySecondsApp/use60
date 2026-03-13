import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { ScrollProgressBar } from '../components/landing-v10/ScrollProgressBar';
import { NavbarV10 } from '../components/landing-v10/NavbarV10';
import { HeroV10 } from '../components/landing-v10/HeroV10';
import { LogoBarV10 } from '../components/landing-v10/LogoBarV10';
import { WorkflowDemoV10 } from '../components/landing-v10/WorkflowDemoV10';
import { ValuePropV10 } from '../components/landing-v10/ValuePropV10';
import { PersonasV10 } from '../components/landing-v10/PersonasV10';
import { FeatureNarrativeV10 } from '../components/landing-v10/FeatureNarrativeV10';
import { ShowcaseTabsV10 } from '../components/landing-v10/ShowcaseTabsV10';
import { StatsCounterV10 } from '../components/landing-v10/StatsCounterV10';
import { TestimonialInlineV10 } from '../components/landing-v10/TestimonialInlineV10';
import { SignalsV10 } from '../components/landing-v10/SignalsV10';
import { FeatureGridV10 } from '../components/landing-v10/FeatureGridV10';
import { IntegrationsV10 } from '../components/landing-v10/IntegrationsV10';
import { TestimonialsV10 } from '../components/landing-v10/TestimonialsV10';
import { FinalCTAV10 } from '../components/landing-v10/FinalCTAV10';
import { FooterV10 } from '../components/landing-v10/FooterV10';
import { SmartCTA } from '../components/landing-v10/SmartCTA';

export function LandingPageV10() {
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
      <NavbarV10 isDark={isDark} onToggleTheme={handleToggleTheme} />
      <HeroV10 onTryDemo={handleTryDemo} />
      <LogoBarV10 />
      <WorkflowDemoV10 />
      <ValuePropV10 />
      <PersonasV10 />
      <FeatureNarrativeV10 />
      <ShowcaseTabsV10 />
      <StatsCounterV10 />
      <TestimonialInlineV10
        quote="We tried Clay, Apollo, and three other tools. 60 is the only one that actually does the work instead of just showing you data."
        author="Sarah T."
        role="Head of Revenue, Growth-stage SaaS"
      />
      <SignalsV10 />
      <FeatureGridV10 />
      <IntegrationsV10 />
      <TestimonialsV10 />
      <FinalCTAV10 />
      <FooterV10 />
      <SmartCTA />
    </div>
  );
}
