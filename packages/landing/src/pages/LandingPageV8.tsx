/**
 * LandingPageV8 — Harmonic-inspired with dark/light toggle
 * Reference: harmonic.ai/solutions/gtm
 * Route: /v8
 */

import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { NavbarV8 } from '../components/landing-v8/NavbarV8';
import { HeroV8 } from '../components/landing-v8/HeroV8';
import { LogoBarV8 } from '../components/landing-v8/LogoBarV8';
import { ValuePropV8 } from '../components/landing-v8/ValuePropV8';
import { FeatureNarrativeV8 } from '../components/landing-v8/FeatureNarrativeV8';
import { ShowcasePreviewV8 } from '../components/landing-v8/ShowcasePreviewV8';
import { SignalsV8 } from '../components/landing-v8/SignalsV8';
import { TestimonialInlineV8 } from '../components/landing-v8/TestimonialInlineV8';
import { FeatureGridV8 } from '../components/landing-v8/FeatureGridV8';
import { IntegrationsV8 } from '../components/landing-v8/IntegrationsV8';
import { TestimonialsV8 } from '../components/landing-v8/TestimonialsV8';
import { FinalCTAV8 } from '../components/landing-v8/FinalCTAV8';
import { FooterV8 } from '../components/landing-v8/FooterV8';

export function LandingPageV8() {
  const [isDark, setIsDark] = useState(false);
  const navigate = useNavigate();

  // Toggle dark class on <html> so Tailwind dark: variants work globally
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
    }
    return () => {
      // Clean up on unmount — restore system preference
      document.documentElement.classList.remove('dark');
      document.documentElement.removeAttribute('data-theme');
    };
  }, [isDark]);

  const handleToggleTheme = useCallback(() => {
    setIsDark((prev) => !prev);
  }, []);

  const handleNavBookDemo = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleTryDemo = useCallback(
    (url: string) => {
      navigate(`/t/${url}`);
    },
    [navigate],
  );

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-gray-900 dark:text-gray-100 overflow-x-hidden transition-colors duration-300">
      <NavbarV8
        onBookDemo={handleNavBookDemo}
        isDark={isDark}
        onToggleTheme={handleToggleTheme}
      />
      <HeroV8 onTryDemo={handleTryDemo} />
      <LogoBarV8 />
      <ValuePropV8 />
      <FeatureNarrativeV8 />
      <ShowcasePreviewV8 />
      <TestimonialInlineV8
        quote="My team was using 60 for meeting prep and follow-ups — and pretty quickly they just wanted it on everything."
        author="Rachel M."
        role="Account Executive"
      />
      <SignalsV8 />
      <FeatureGridV8 />
      <IntegrationsV8 />
      <TestimonialsV8 />
      <FinalCTAV8 onBookDemo={(email: string) => {
        window.open(
          `https://cal.com/use60/demo?email=${encodeURIComponent(email)}`,
          '_blank',
        );
      }} />
      <FooterV8 />
    </div>
  );
}
