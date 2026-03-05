/**
 * ProductTour - First-time user onboarding tour
 *
 * Shows a guided tour to users who just completed onboarding.
 * Tour is shown once and dismissed state is persisted in localStorage.
 * Only shows when: user completed onboarding within the last hour AND
 * localStorage key `sixty_tour_completed_${userId}` is not set.
 *
 * Uses driver.js v1.4.0. The CSS theme lives in src/styles/tour.css and is
 * imported globally from src/index.css — do NOT import driver.js CSS here.
 */

import { useEffect, useRef } from 'react';
import { driver, type DriveStep, type Config } from 'driver.js';
import { useNavigate } from 'react-router-dom';
import { useSetupWizardStore } from '@/lib/stores/setupWizardStore';
import { useTourStore } from '@/lib/stores/tourStore';
import { TOUR_DEMO_PATH } from '@/components/tour/tourDemoData';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProductTourProps {
  userId: string;
  onTourEnd?: () => void;
}

/**
 * Extends driver.js DriveStep with an optional route so the tour knows
 * which page to navigate to before highlighting a step's element.
 */
interface TourStep extends DriveStep {
  /** React Router path this step lives on. Undefined = no navigation needed. */
  route?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ONE_HOUR_MS = 60 * 60 * 1000;

// ─── Tour step definitions ────────────────────────────────────────────────────
//
// Steps are 0-indexed internally. The route field tells the nav handler
// which page to navigate to when entering this step.
//
// Sidebar steps have no route (sidebar is always visible).
// Page-content steps have their route so we navigate before highlighting.

const TOUR_STEPS: TourStep[] = [
  // ── Step 0 — Sidebar: Dashboard ───────────────────────────────────────────
  {
    element: '[data-tour="dashboard"]',
    route: '/dashboard',
    popover: {
      title: 'Your Command Centre',
      description:
        'Track your sales targets, team performance, and AI agent activity — all in one place.',
      side: 'right',
      align: 'center',
      showButtons: ['next', 'close'], // First step: hide Prev
    },
  },

  // ── Step 1 — Page: Dashboard overview ─────────────────────────────────────
  {
    element: '[data-tour="dashboard-overview"]',
    route: '/dashboard',
    popover: {
      title: 'Real-Time Metrics',
      description:
        'Revenue, outbound activity, meetings, and proposals — all update live. Set targets and watch your progress.',
      side: 'bottom',
      align: 'center',
    },
  },

  // ── Step 2 — Sidebar: Meetings ────────────────────────────────────────────
  {
    element: '[data-tour="meetings"]',
    popover: {
      title: 'Meeting Intelligence',
      description:
        'Every meeting gets an AI summary, action items, and a follow-up draft — automatically.',
      side: 'right',
      align: 'center',
    },
  },

  // ── Step 3 — Page: Meetings list ──────────────────────────────────────────
  {
    element: '[data-tour="meetings-list"]',
    route: '/meetings',
    popover: {
      title: 'All Your Meetings',
      description:
        'Recordings from every source appear here. Search, filter, and dive into any call.',
      side: 'bottom',
      align: 'center',
    },
  },

  // ── Step 4 — Page: Meeting detail (demo) ──────────────────────────────────
  {
    element: '[data-tour="meeting-detail"]',
    route: TOUR_DEMO_PATH,
    popover: {
      title: 'Deep Dive Into Any Meeting',
      description:
        'Click into any meeting for the full story — recording, transcript, AI analysis, and next steps. Here\'s what that looks like.',
      side: 'bottom',
      align: 'center',
    },
  },

  // ── Step 5 — Page: Meeting analysis (sentiment + talk time) ───────────────
  {
    element: '[data-tour="meeting-analysis"]',
    route: TOUR_DEMO_PATH,
    popover: {
      title: 'AI-Powered Analysis',
      description:
        'Every call gets sentiment scoring, talk-time ratios, and coaching insights — automatically. No manual work required.',
      side: 'left',
      align: 'start',
    },
  },

  // ── Step 6 — Page: Meeting transcript ─────────────────────────────────────
  {
    element: '[data-tour="meeting-transcript"]',
    route: TOUR_DEMO_PATH,
    popover: {
      title: 'Smart Transcripts',
      description:
        'Color-coded speakers, key moments flagged, and fully searchable across all your calls.',
      side: 'top',
      align: 'center',
    },
  },

  // ── Step 7 — Sidebar: Insights ────────────────────────────────────────────
  {
    element: '[data-tour="insights"]',
    popover: {
      title: 'Analytics & Insights',
      description:
        'Trends across all your meetings — talk ratios, sentiment patterns, and AI coaching recommendations.',
      side: 'right',
      align: 'center',
    },
  },

  // ── Step 8 — Page: Ask Anything chat (first thing on the page) ───────────
  {
    element: '[data-tour="meeting-ask-anything"]',
    route: '/meeting-analytics',
    popover: {
      title: 'Ask Anything About Your Meetings',
      description:
        'Type any question and get instant AI answers sourced from your meeting transcripts — objections, decisions, action items, and more.',
      side: 'bottom',
      align: 'center',
    },
  },

  // ── Step 9 — Page: Insights dashboard ─────────────────────────────────
  {
    element: '[data-tour="insights-dashboard"]',
    route: '/meeting-analytics',
    popover: {
      title: 'Team Analytics',
      description:
        'Track team trends, pipeline health, and active alerts — all powered by your meeting data.',
      side: 'bottom',
      align: 'center',
    },
  },

  // ── Step 10 — Page: Analytics tabs ───────────────────────────────────────
  {
    element: '[data-tour="analytics-tabs"]',
    route: '/meeting-analytics',
    popover: {
      title: 'Transcripts, Insights & Reports',
      description:
        'Dive deeper — browse full transcripts, view AI-generated insights and performance grades, or schedule automated reports to your inbox.',
      side: 'bottom',
      align: 'start',
    },
  },

  // ── Step 11 — Sidebar: Integrations ───────────────────────────────────────
  {
    element: '[data-tour="integrations"]',
    popover: {
      title: 'Connect Your Tools',
      description:
        'Link your CRM, calendar, and email so 60 works across your entire workflow.',
      side: 'right',
      align: 'center',
    },
  },

  // ── Step 12 — Page: Integrations grid ─────────────────────────────────────
  {
    element: '[data-tour="integrations-grid"]',
    route: '/integrations',
    popover: {
      title: 'Your Integrations',
      description:
        'Google Workspace, HubSpot, Slack, and more. Each integration unlocks new AI capabilities.',
      side: 'bottom',
      align: 'center',
    },
  },

  // ── Step 13 — Credits widget ──────────────────────────────────────────────
  {
    element: '[data-tour="credits"]',
    popover: {
      title: 'AI Credits',
      description:
        'Each AI action uses credits. You start with free credits — earn more by completing setup.',
      side: 'right',
      align: 'center',
    },
  },

  // ── Step 14 — Final step (Let's Go) ───────────────────────────────────────
  {
    element: '[data-tour="dashboard"]',
    route: '/dashboard',
    popover: {
      title: "You're All Set",
      description:
        "That's the tour! Connect your tools, invite your team, and let 60 handle the rest. Ready to get started?",
      side: 'right',
      align: 'center',
      nextBtnText: "Let's Go",
    },
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Shows a styled confirmation dialog asking the user if they really want to
 * skip the tour. Returns a Promise that resolves to `true` (skip) or `false`
 * (continue). The dialog is pure DOM so it works outside of React rendering.
 * Styles live in src/styles/tour.css (.tour-skip-*).
 */
function showSkipConfirmation(): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'tour-skip-overlay';

    overlay.innerHTML = `
      <div class="tour-skip-dialog">
        <h3>Skip the tour?</h3>
        <p>You can always restart it from Settings. We recommend finishing — it only takes a minute.</p>
        <div class="tour-skip-actions">
          <button class="tour-skip-continue" data-action="continue">Continue Tour</button>
          <button class="tour-skip-confirm" data-action="skip">Skip</button>
        </div>
      </div>
    `;

    function cleanup(result: boolean) {
      overlay.remove();
      resolve(result);
    }

    // driver.js registers capture-phase listeners on document that call
    // stopPropagation/stopImmediatePropagation for clicks inside its overlay.
    // We must intercept clicks on our dialog in the capture phase first,
    // stopping them before driver.js can swallow them.
    overlay.addEventListener('click', (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();

      const target = e.target as HTMLElement;
      if (target.closest('[data-action="continue"]')) {
        cleanup(false);
      } else if (target.closest('[data-action="skip"]')) {
        cleanup(true);
      } else if (target === overlay) {
        // Clicking the backdrop means "continue"
        cleanup(false);
      }
    }, true); // capture phase — fires before driver.js handlers

    document.body.appendChild(overlay);
  });
}

/**
 * Reads the timestamp stored when the user finished onboarding.
 */
function getOnboardingCompletedAt(): number | null {
  try {
    const raw = localStorage.getItem('sixty_onboarding_completed_at');
    if (!raw) return null;
    const ts = parseInt(raw, 10);
    return isNaN(ts) ? null : ts;
  } catch {
    return null;
  }
}

/**
 * Returns true when the tour should run for this user:
 * - Tour has not been marked complete yet
 * - Onboarding was completed within the last hour
 */
function shouldShowTour(userId: string): boolean {
  if (!userId) return false;

  try {
    const completed = localStorage.getItem(`sixty_tour_completed_${userId}`);
    if (completed) return false;
  } catch {
    return false;
  }

  const completedAt = getOnboardingCompletedAt();
  if (!completedAt) return false;

  const elapsed = Date.now() - completedAt;
  return elapsed <= ONE_HOUR_MS;
}

/**
 * Polls the DOM for a CSS selector to appear, resolving once it does.
 * Resolves with null if the element never appears within `timeout` ms.
 */
function waitForElement(selector: string, timeout = 3000): Promise<Element | null> {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    const interval = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) {
        clearInterval(interval);
        resolve(el);
      }
    }, 50);

    setTimeout(() => {
      clearInterval(interval);
      resolve(null);
    }, timeout);
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProductTour({ userId, onTourEnd }: ProductTourProps) {
  // driver.js instance lives outside React state so it doesn't trigger re-renders
  const driverRef = useRef<ReturnType<typeof driver> | null>(null);
  const startTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track whether the tour was closed before reaching the last step
  const skippedRef = useRef(false);

  // Guard to ensure onDestroyStarted / handleTourEnd only fires once
  const destroyedRef = useRef(false);

  // Guard to prevent multiple skip confirmation dialogs from stacking
  const skipDialogOpenRef = useRef(false);

  const navigate = useNavigate();

  useEffect(() => {
    if (!userId) return;
    if (!shouldShowTour(userId)) return;

    // ── Tour finish / close handler ──────────────────────────────────────────
    //
    // Called by driver.js when the driver is destroyed (user closed, ESC, or
    // clicked through all steps). We use `onDestroyStarted` so we can inspect
    // whether the last step was active before destruction.

    function handleTourEnd(completedAll: boolean) {
      // Guard: only run cleanup once even if called from multiple code paths
      if (destroyedRef.current) return;
      destroyedRef.current = true;

      // Reset step tracking
      useTourStore.getState().setCurrentTourStep(-1);

      // Mark tour as inactive in the store
      useTourStore.getState().setTourActive(false);

      // Persist completion so the tour never shows again for this user
      try {
        localStorage.setItem(`sixty_tour_completed_${userId}`, String(Date.now()));
      } catch {
        // localStorage unavailable — silently fail
      }

      onTourEnd?.();

      // Return user to dashboard after tour ends
      navigate('/dashboard');

      // Open the setup wizard after navigating so the dashboard is mounted.
      // Always open it — whether the user completed all steps or skipped early,
      // prompt them to complete setup for 100 credits.
      setTimeout(() => {
        useSetupWizardStore.getState().openWizard();
      }, 300);
    }

    // ── Build driver config ──────────────────────────────────────────────────

    const config: Config = {
      showProgress: true,
      animate: true,
      smoothScroll: true, // Let driver.js scroll to off-screen elements
      allowClose: true,
      overlayClickNext: false,
      overlayOpacity: 0.5,
      stagePadding: 8,
      stageRadius: 8,
      popoverClass: 'sixty-tour-popover',

      steps: TOUR_STEPS.map((s) => ({
        element: s.element,
        popover: s.popover,
      })) as DriveStep[],

      // ── Custom Next handler ────────────────────────────────────────────────
      //
      // NOTE: We use window.location.pathname here — NOT the `location` object
      // from useLocation(). The callbacks close over the initial render's
      // `location` value and never see updates from subsequent navigations.
      // window.location always reflects the live URL so stale-closure bugs
      // are avoided entirely.
      onNextClick: (_element, _step, _opts) => {
        const driverObj = driverRef.current;
        if (!driverObj) return;

        const currentIdx = driverObj.getActiveIndex() ?? 0;
        const isLastStep = currentIdx >= TOUR_STEPS.length - 1;

        if (isLastStep) {
          // User clicked "Let's Go" on the final step — mark as completed.
          // Call destroy() first to tear down driver.js DOM (destroy skips
          // onDestroyStarted since it calls g(false) internally), then run
          // our cleanup via handleTourEnd.
          skippedRef.current = false;
          driverObj.destroy();
          handleTourEnd(true);
          return;
        }

        const nextStep = TOUR_STEPS[currentIdx + 1];
        const nextIdx = currentIdx + 1;

        // Update the step tracker before navigating so page components can
        // react (e.g. TourMeetingDetail switching to the transcript tab)
        useTourStore.getState().setCurrentTourStep(nextIdx);

        const selector = nextStep.element as string;

        if (nextStep.route && window.location.pathname !== nextStep.route) {
          // Navigate to the page this step lives on, then wait for the element
          navigate(nextStep.route);
          // Scroll to top so new pages start at the top, not mid-scroll
          window.scrollTo(0, 0);
        }

        // Always wait for the element — even on same-route transitions.
        // React may need render cycles to mount the element (e.g. tab switch
        // causes content to unmount/remount via Radix Tabs).
        waitForElement(selector).then((el) => {
          if (el) {
            driverObj.moveNext();
          } else {
            console.warn(`[ProductTour] Element not found: ${selector} — skipping step`);
            driverObj.moveNext();
          }
        });
      },

      // ── Custom Prev handler ────────────────────────────────────────────────
      //
      // Same stale-closure fix: window.location.pathname instead of
      // location.pathname from the closed-over useLocation() value.
      onPrevClick: (_element, _step, _opts) => {
        const driverObj = driverRef.current;
        if (!driverObj) return;

        const currentIdx = driverObj.getActiveIndex() ?? 0;
        if (currentIdx === 0) return; // Nothing behind the first step

        const prevStep = TOUR_STEPS[currentIdx - 1];
        const prevIdx = currentIdx - 1;

        // Update step tracker before navigating
        useTourStore.getState().setCurrentTourStep(prevIdx);

        const selector = prevStep.element as string;

        if (prevStep.route && window.location.pathname !== prevStep.route) {
          navigate(prevStep.route);
          window.scrollTo(0, 0);
        }

        // Always wait for element — same reason as onNextClick
        waitForElement(selector).then((el) => {
          if (el) {
            driverObj.movePrevious();
          } else {
            console.warn(`[ProductTour] Element not found: ${selector} — skipping step`);
            driverObj.movePrevious();
          }
        });
      },

      // ── Destruction callback ───────────────────────────────────────────────
      //
      // Fired when the driver tears itself down (close button, ESC, or our
      // manual driverObj.destroy() call). We intercept ESC/close to show a
      // confirmation dialog before actually ending the tour.
      onDestroyStarted: () => {
        const driverObj = driverRef.current;
        if (!driverObj) return;

        // If handleTourEnd already ran (e.g. from onNextClick on the last step),
        // let the destruction proceed without a prompt.
        if (destroyedRef.current) return;

        const currentIdx = driverObj.getActiveIndex() ?? 0;
        const isLastStep = currentIdx >= TOUR_STEPS.length - 1;

        if (isLastStep) {
          // onNextClick already handled cleanup for the last step
          return;
        }

        // Prevent driver.js from destroying — we need to ask the user first.
        // driver.js v1.4.0: onDestroyStarted fires and returns early without
        // cleaning up. We only call driverObj.destroy() (which calls the
        // internal destroy with skip-hook=true) if the user confirms.

        // Guard: don't open a second dialog if one is already showing.
        // Without this, every overlay click re-triggers onDestroyStarted
        // and stacks another confirmation dialog.
        if (skipDialogOpenRef.current) return;
        skipDialogOpenRef.current = true;

        showSkipConfirmation().then((confirmed) => {
          skipDialogOpenRef.current = false;
          if (confirmed) {
            skippedRef.current = true;
            // Destroy driver.js DOM first, then run our cleanup/navigation.
            // driverObj.destroy() calls g(false) internally which skips
            // onDestroyStarted, so no infinite loop.
            driverObj.destroy();
            // handleTourEnd guards with destroyedRef — since destroy() above
            // didn't set it (it skips the hook), we're safe to call it now.
            handleTourEnd(false);
          }
          // If not confirmed, tour continues — nothing to do.
        });
      },
    };

    // Reset guards for this effect run
    destroyedRef.current = false;
    skipDialogOpenRef.current = false;

    // ── Start tour after WelcomeSplash ──────────────────────────────────────
    //
    // Same 4 000 ms delay as the original WelcomeSplash wait, giving the
    // splash screen time to finish before we draw the overlay.

    startTimerRef.current = setTimeout(() => {
      const driverObj = driver(config);
      driverRef.current = driverObj;

      // Navigate to the starting route before kicking off.
      // Use window.location.pathname — same stale-closure reason as the
      // onNextClick/onPrevClick handlers above.
      if (window.location.pathname !== '/dashboard') {
        navigate('/dashboard');
        // Give the page a tick to mount before starting
        waitForElement('[data-tour="dashboard"]').then(() => {
          useTourStore.getState().setCurrentTourStep(0);
          useTourStore.getState().setTourActive(true);
          driverObj.drive();
        });
      } else {
        useTourStore.getState().setCurrentTourStep(0);
        useTourStore.getState().setTourActive(true);
        driverObj.drive();
      }
    }, 4000);

    // ── Cleanup on unmount ───────────────────────────────────────────────────
    return () => {
      if (startTimerRef.current) {
        clearTimeout(startTimerRef.current);
      }
      if (driverRef.current) {
        driverRef.current.destroy();
        driverRef.current = null;
      }
      useTourStore.getState().setTourActive(false);
      useTourStore.getState().setCurrentTourStep(-1);
    };

    // `navigate` is stable across renders (react-router guarantee) so it is
    // safe to omit. Re-running on userId change is intentional — a different
    // user could sign in without a full page reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // driver.js manages its own DOM — this component is purely an orchestrator
  return null;
}

export default ProductTour;
