import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { MeetingsLandingV4 } from './pages/MeetingsLandingV4';
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
import HeroV5Preview from './pages/HeroV5Preview';
import HeroV5AltPreview from './pages/HeroV5AltPreview';
import HeroV5BPreview from './pages/HeroV5BPreview';
import HeroV6Preview from './pages/HeroV6Preview';
import HeroV7Preview from './pages/HeroV7Preview';
import HeroV8Preview from './pages/HeroV8Preview';
import { getAppUrl } from './lib/utils/siteUrl';
import { trackPageView } from './lib/pageViewTracker';

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
        <Route path="/hero-v5" element={<HeroV5Preview />} />
        <Route path="/hero-v5-alt" element={<HeroV5AltPreview />} />
        <Route path="/hero-v5b" element={<HeroV5BPreview />} />
        <Route path="/hero-v6" element={<HeroV6Preview />} />
        <Route path="/hero-v7" element={<HeroV7Preview />} />
        <Route path="/hero-v8" element={<HeroV8Preview />} />
        {/* Redirect auth routes to app domain */}
        <Route path="/auth/*" element={<RedirectToApp />} />
        <Route path="/login" element={<RedirectToApp />} />
        <Route path="/signup" element={<RedirectToApp />} />
        <Route path="/" element={<MeetingsLandingV4 />} />
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
