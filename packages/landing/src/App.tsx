import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
// Deploy trigger: 2026-03-03
import { MeetingsLandingV4 } from './pages/MeetingsLandingV4';
import { LandingPage } from './pages/LandingPage';
import  WaitlistLanding  from './pages/WaitlistLanding';
import EarlyAccessLanding from './pages/EarlyAccessLanding';
import LeaderboardLookup from './pages/LeaderboardLookup';
import WaitlistStatus from './pages/WaitlistStatus';
import WaitlistThankYouPage from './pages/WaitlistThankYouPage';
import { PricingPage } from './pages/PricingPage';
import { WaitlistLandingPage } from './pages/WaitlistLandingPage';
import { WaitlistLandingPopup } from './pages/WaitlistLandingPopup';
import { IntroductionPage } from './pages/IntroductionPage';
import { IntroPage } from './pages/IntroPage';
import { IntroducingPage } from './pages/IntroducingPage';
import { LearnMore } from './pages/LearnMore';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { TermsOfServicePage } from './pages/TermsOfServicePage';
import HeroV5Preview from './pages/HeroV5Preview';
import HeroV5AltPreview from './pages/HeroV5AltPreview';
import HeroV5BPreview from './pages/HeroV5BPreview';
import HeroV6Preview from './pages/HeroV6Preview';
import HeroV7Preview from './pages/HeroV7Preview';
import HeroV8Preview from './pages/HeroV8Preview';
import HeroV9Preview from './pages/HeroV9Preview';
import HeroV10Preview from './pages/HeroV10Preview';
import HeroV11Preview from './pages/HeroV11Preview';
import DemoExperience from './demo/DemoExperience';
import DemoExperienceV2 from './demo-v2/DemoExperience';
import { LandingPageV5 } from './pages/LandingPageV5';
import { LandingPageV6 } from './pages/LandingPageV6';
import { LandingPageV7 } from './pages/LandingPageV7';
import { lazy, Suspense } from 'react';

const CampaignLanding = lazy(() => import('./pages/CampaignLanding'));
const DemoPage = lazy(() => import('./pages/DemoPage'));
const LandingPageV8 = lazy(() => import('./pages/LandingPageV8').then(m => ({ default: m.LandingPageV8 })));
const LandingPageV9 = lazy(() => import('./pages/LandingPageV9').then(m => ({ default: m.LandingPageV9 })));
const LandingPageV10 = lazy(() => import('./pages/LandingPageV10').then(m => ({ default: m.LandingPageV10 })));
const LandingPageV11 = lazy(() => import('./pages/LandingPageV11').then(m => ({ default: m.LandingPageV11 })));
const LandingPageV12 = lazy(() => import('./pages/LandingPageV12').then(m => ({ default: m.LandingPageV12 })));
const LandingPageV13 = lazy(() => import('./pages/LandingPageV13').then(m => ({ default: m.LandingPageV13 })));
const LandingPageV14 = lazy(() => import('./pages/LandingPageV14').then(m => ({ default: m.LandingPageV14 })));
const LandingPageV15 = lazy(() => import('./pages/LandingPageV15').then(m => ({ default: m.LandingPageV15 })));
const LandingPageV16 = lazy(() => import('./pages/LandingPageV16').then(m => ({ default: m.LandingPageV16 })));
const LandingPageV17 = lazy(() => import('./pages/LandingPageV17').then(m => ({ default: m.LandingPageV17 })));
const LandingPageV18 = lazy(() => import('./pages/LandingPageV18').then(m => ({ default: m.LandingPageV18 })));
const LandingPageV19 = lazy(() => import('./pages/LandingPageV19').then(m => ({ default: m.LandingPageV19 })));
const LandingPageV20 = lazy(() => import('./pages/LandingPageV20').then(m => ({ default: m.LandingPageV20 })));
const LandingPageV21 = lazy(() => import('./pages/LandingPageV21').then(m => ({ default: m.LandingPageV21 })));
const LandingPageV22 = lazy(() => import('./pages/LandingPageV22').then(m => ({ default: m.LandingPageV22 })));
const LandingPageV23 = lazy(() => import('./pages/LandingPageV23').then(m => ({ default: m.LandingPageV23 })));
const DemoLanding = lazy(() => import('./pages/DemoLanding'));
const PublicDocsPage = lazy(() => import('./pages/PublicDocsPage'));
import { getAppUrl } from './lib/utils/siteUrl';
import { trackPageView } from './lib/pageViewTracker';
import { CookieConsentBanner } from './lib/consent/CookieConsentBanner';

// Initialize i18next for internationalization
import './lib/i18n/config';

// Component to track page views on route changes
function PageViewTracker() {
  const location = useLocation();

  useEffect(() => {
    // Track page view on route change
    trackPageView();
  }, [location.pathname, location.search]);

  return null;
}

function App() {
  return (
    <BrowserRouter>
      <PageViewTracker />
      <CookieConsentBanner />
      <Toaster position="top-center" richColors closeButton />
      <Routes>
        <Route path="/landing" element={<MeetingsLandingV4 />} />
        <Route path="/waitlist" element={<EarlyAccessLanding />} />
        <Route path="/waitlist/thank-you" element={<WaitlistThankYouPage />} />
        <Route path="/waitlist/status/:id" element={<WaitlistStatus />} />
        <Route path="/join" element={<WaitlistLandingPopup />} />
        <Route path="/introduction" element={<IntroductionPage />} />
        <Route path="/intro" element={<IntroPage />} />
        <Route path="/introducing" element={<IntroducingPage />} />
        <Route path="/learnmore" element={<LearnMore />} />

        {/* Leaderboard */}
        <Route path="/waitlist/leaderboard" element={<LeaderboardLookup />} />
        <Route path="/leaderboard" element={<LeaderboardLookup />} />
        <Route path="/waitlist-hero" element={<WaitlistLanding />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsOfServicePage />} />
        <Route path="/hero-v5" element={<HeroV5Preview />} />
        <Route path="/hero-v5-alt" element={<HeroV5AltPreview />} />
        <Route path="/hero-v5b" element={<HeroV5BPreview />} />
        <Route path="/hero-v6" element={<HeroV6Preview />} />
        <Route path="/hero-v7" element={<HeroV7Preview />} />
        <Route path="/hero-v8" element={<HeroV8Preview />} />
        <Route path="/hero-v9" element={<HeroV9Preview />} />
        <Route path="/hero-v10" element={<HeroV10Preview />} />
        <Route path="/hero-v11" element={<HeroV11Preview />} />
        {/* Campaign analytics dashboard */}
        {/* Campaign personalized demo links */}
        <Route path="/t/:code" element={<Suspense fallback={<div className="min-h-screen bg-[#070b18]" />}><CampaignLanding /></Suspense>} />
        <Route path="/demo" element={<Suspense fallback={<div className="min-h-screen bg-[#070b18]" />}><DemoPage /></Suspense>} />
        <Route path="/demo-v3" element={<DemoExperience />} />
        <Route path="/demo-v2" element={<DemoExperienceV2 />} />
        {/* Redirect auth routes to app domain */}
        <Route path="/auth/*" element={<RedirectToApp />} />
        <Route path="/login" element={<RedirectToApp />} />
        <Route path="/signup" element={<RedirectToApp />} />
        <Route path="/v4" element={<MeetingsLandingV4 />} />
        <Route path="/v5" element={<LandingPageV5 />} />
        <Route path="/v6" element={<LandingPageV6 />} />
        <Route path="/v7" element={<LandingPageV7 />} />
        <Route path="/v8" element={<Suspense fallback={<div className="min-h-screen bg-white" />}><LandingPageV8 /></Suspense>} />
        <Route path="/v9" element={<Suspense fallback={<div className="min-h-screen bg-white" />}><LandingPageV9 /></Suspense>} />
        <Route path="/v10" element={<Suspense fallback={<div className="min-h-screen bg-white" />}><LandingPageV10 /></Suspense>} />
        <Route path="/v11" element={<Suspense fallback={<div className="min-h-screen bg-white" />}><LandingPageV11 /></Suspense>} />
        <Route path="/v12" element={<Suspense fallback={<div className="min-h-screen bg-[#070b1a]" />}><LandingPageV12 /></Suspense>} />
        <Route path="/v13" element={<Suspense fallback={<div className="min-h-screen bg-white" />}><LandingPageV13 /></Suspense>} />
        <Route path="/v14" element={<Suspense fallback={<div className="min-h-screen bg-white" />}><LandingPageV14 /></Suspense>} />
        <Route path="/v15" element={<Suspense fallback={<div className="min-h-screen bg-white" />}><LandingPageV15 /></Suspense>} />
        <Route path="/v16" element={<Suspense fallback={<div className="min-h-screen bg-white" />}><LandingPageV16 /></Suspense>} />
        <Route path="/v17" element={<Suspense fallback={<div className="min-h-screen bg-white" />}><LandingPageV17 /></Suspense>} />
        <Route path="/v18" element={<Suspense fallback={<div className="min-h-screen bg-[#070b18]" />}><LandingPageV18 /></Suspense>} />
        <Route path="/v19" element={<Suspense fallback={<div className="min-h-screen bg-[#070b18]" />}><LandingPageV19 /></Suspense>} />
        <Route path="/v20" element={<Suspense fallback={<div className="min-h-screen bg-[#070b18]" />}><LandingPageV20 /></Suspense>} />
        <Route path="/v21" element={<Suspense fallback={<div className="min-h-screen bg-[#070b18]" />}><LandingPageV21 /></Suspense>} />
        <Route path="/v22" element={<Suspense fallback={<div className="min-h-screen bg-[#070b18]" />}><LandingPageV22 /></Suspense>} />
        <Route path="/v23" element={<Suspense fallback={<div className="min-h-screen bg-[#070b18]" />}><LandingPageV23 /></Suspense>} />
        <Route path="/d/:hash" element={<Suspense fallback={<div className="min-h-screen bg-[#070b18]" />}><DemoLanding /></Suspense>} />
        <Route path="/docs" element={<Suspense fallback={<div className="min-h-screen bg-[#070b18]" />}><PublicDocsPage /></Suspense>} />
        <Route path="/v1" element={<LandingPage />} />
        <Route path="/" element={<Suspense fallback={<div className="min-h-screen bg-[#070b18]" />}><LandingPageV23 /></Suspense>} />
      </Routes>
    </BrowserRouter>
  );
}

function RedirectToApp() {
  useEffect(() => {
    const appUrl = getAppUrl();
    window.location.href = appUrl + window.location.pathname;
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p>Redirecting to app...</p>
    </div>
  );
}

export default App;
