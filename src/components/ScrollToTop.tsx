import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * ScrollToTop Component
 *
 * Scrolls to the top of the page when navigating to a new route.
 * This component should be placed inside Routes to work properly.
 *
 * Benefits:
 * - Ensures users always start at the top when entering a new page
 * - Prevents the "stuck in the middle" scroll position issue
 * - Preserves natural browser scroll behavior on page refresh
 * - Works seamlessly with lazy-loaded pages and dynamic content
 */
export function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Scroll to top of the document
    window.scrollTo(0, 0);

    // Also ensure main content area scrolls to top if it exists
    const mainContent = document.querySelector('[role="main"]');
    if (mainContent) {
      mainContent.scrollTop = 0;
    }

    // Handle any custom scrollable containers with data-scroll-to-top attribute
    const scrollContainers = document.querySelectorAll('[data-scroll-to-top="true"]');
    scrollContainers.forEach((container) => {
      if (container instanceof HTMLElement) {
        container.scrollTop = 0;
      }
    });
  }, [pathname]);

  return null; // This component doesn't render anything
}

export default ScrollToTop;
