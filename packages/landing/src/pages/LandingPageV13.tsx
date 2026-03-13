/**
 * LandingPageV13 — Best of V10 (design) + V11 (content)
 *
 * V10 design: blue/emerald accents, pure black dark mode, aurora, parallax, pipeline mockup
 * V11 content: 5-act workflow, COO persona, "Controls everything" integrations,
 *              4-tab showcase, command center demo, system-focused copy
 */

import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// V10 design infrastructure
import { ScrollProgressBar } from '../components/landing-v10/ScrollProgressBar';
import { NavbarV10 } from '../components/landing-v10/NavbarV10';
import { HeroV13 } from '../components/landing-v13/HeroV13';
import { LogoBarV10 } from '../components/landing-v10/LogoBarV10';
import { FeatureNarrativeV10 } from '../components/landing-v10/FeatureNarrativeV10';
import { SignalsV10 } from '../components/landing-v10/SignalsV10';
import { TestimonialInlineV10 } from '../components/landing-v10/TestimonialInlineV10';
import { FooterV10 } from '../components/landing-v10/FooterV10';
import { SmartCTA } from '../components/landing-v10/SmartCTA';

// V11 content sections
import { CommandCenterDemo } from '../components/landing-v11/CommandCenterDemo';
import { ValuePropV11 } from '../components/landing-v11/ValuePropV11';
import { WorkflowDemoV11 } from '../components/landing-v11/WorkflowDemoV11';
import { PersonasV11 } from '../components/landing-v11/PersonasV11';
import { ShowcaseTabsV11 } from '../components/landing-v11/ShowcaseTabsV11';
import { StatsCounterV11 } from '../components/landing-v11/StatsCounterV11';
import { TestimonialsV11 } from '../components/landing-v11/TestimonialsV11';
import { FinalCTAV11 } from '../components/landing-v11/FinalCTAV11';

// V13 custom sections
import { IntegrationsV13 } from '../components/landing-v13/IntegrationsV13';
import { FeatureGridV13 } from '../components/landing-v13/FeatureGridV13';

export function LandingPageV13() {
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

      {/* V13 hero — V1-style subtle glow + grid, V10 content */}
      <HeroV13 onTryDemo={handleTryDemo} />
      <LogoBarV10 />

      {/* V11 command center demo — voice → find → enrich → engage */}
      <CommandCenterDemo />

      {/* V11 value prop — "Your sales stack is broken" */}
      <ValuePropV11 />

      {/* V11 workflow demo — 5 acts including outreach */}
      <WorkflowDemoV11 />

      {/* V11 personas — Solo Founders, COO/Revenue Leader, Sales Managers */}
      <PersonasV11 />

      {/* V10 feature narrative — Before / During / After with tilt mockups */}
      <FeatureNarrativeV10 />

      {/* V11 showcase tabs — 4 tabs including proposal */}
      <ShowcaseTabsV11 />

      {/* V11 stats — 15hrs, 48hrs to go live, 94%, $255K saved */}
      <StatsCounterV11 />

      {/* V10 testimonial inline */}
      <TestimonialInlineV10
        quote="We tried Clay, Apollo, and three other tools. 60 is the only one that actually does the work instead of just showing you data."
        author="Sarah T."
        role="Head of Revenue, Growth-stage SaaS"
      />

      {/* V10 signals — deal alerts, buyer signals, pipeline momentum */}
      <SignalsV10 />

      {/* V13 feature grid — V10 grid + Command Center card */}
      <FeatureGridV13 />

      {/* V13 integrations — V11 list cleaned (no HeyGen/ElevenLabs, LinkedIn comingSoon) */}
      <IntegrationsV13 />

      {/* V11 testimonials */}
      <TestimonialsV11 />

      {/* V11 final CTA — magnetic button */}
      <FinalCTAV11 />

      {/* V10 footer + smart CTA */}
      <FooterV10 />
      <SmartCTA />
    </div>
  );
}
