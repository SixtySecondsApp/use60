import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { NavbarV11 } from '../components/landing-v11/NavbarV11';
import { HeroV11 } from '../components/landing-v11/HeroV11';
import { LogoBarV11 } from '../components/landing-v11/LogoBarV11';
import { CommandCenterDemo } from '../components/landing-v11/CommandCenterDemo';
import { ValuePropV11 } from '../components/landing-v11/ValuePropV11';
import { WorkflowDemoV11 } from '../components/landing-v11/WorkflowDemoV11';
import { SystemVsHireV11 } from '../components/landing-v11/SystemVsHireV11';
import { PersonasV11 } from '../components/landing-v11/PersonasV11';
import { FeatureNarrativeV11 } from '../components/landing-v11/FeatureNarrativeV11';
import { ShowcaseTabsV11 } from '../components/landing-v11/ShowcaseTabsV11';
import { LinkedInIntelV11 } from '../components/landing-v11/LinkedInIntelV11';
import { VideoPersonalizationV11 } from '../components/landing-v11/VideoPersonalizationV11';
import { TestimonialInlineV11 } from '../components/landing-v11/TestimonialInlineV11';
import { StatsCounterV11 } from '../components/landing-v11/StatsCounterV11';
import { SignalsV11 } from '../components/landing-v11/SignalsV11';
import { FeatureGridV11 } from '../components/landing-v11/FeatureGridV11';
import { IntegrationsV11 } from '../components/landing-v11/IntegrationsV11';
import { TestimonialsV11 } from '../components/landing-v11/TestimonialsV11';
import { FinalCTAV11 } from '../components/landing-v11/FinalCTAV11';
import { FooterV11 } from '../components/landing-v11/FooterV11';
import { SmartCTA } from '../components/landing-v11/SmartCTA';
import { ScrollProgressBar } from '../components/landing-v11/ScrollProgressBar';

export function LandingPageV11() {
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

  const handleToggleTheme = useCallback(() => setIsDark((prev) => !prev), []);
  const handleTryDemo = useCallback((url: string) => navigate(`/t/${url}`), [navigate]);

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-gray-900 dark:text-gray-100 overflow-x-hidden transition-colors duration-300">
      <ScrollProgressBar />
      <NavbarV11
        isDark={isDark}
        onToggleTheme={handleToggleTheme}
      />
      <HeroV11 onTryDemo={handleTryDemo} />
      <LogoBarV11 />
      <CommandCenterDemo />
      <ValuePropV11 />
      <WorkflowDemoV11 />
      <SystemVsHireV11 />
      <PersonasV11 />
      <FeatureNarrativeV11 />
      <ShowcaseTabsV11 />
      <LinkedInIntelV11 />
      <VideoPersonalizationV11 />
      <TestimonialInlineV11
        quote="I thought this call was about video production. Twenty minutes later I'm watching an AI find leads, write sequences, and push campaigns — all from one screen. Maybe we don't need a sales leader. Maybe we need this."
        author="Grace E."
        role="COO, Scaling from $7M to $21M"
      />
      <StatsCounterV11 />
      <SignalsV11 />
      <FeatureGridV11 />
      <IntegrationsV11 />
      <TestimonialsV11 />
      <FinalCTAV11 />
      <FooterV11 />
      <SmartCTA />
    </div>
  );
}
