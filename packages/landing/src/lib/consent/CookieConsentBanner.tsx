import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getConsent, setConsent } from './consentStore';
import { loadThirdPartyScripts } from './thirdPartyScripts';

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const consent = getConsent();
    if (consent === 'accepted') {
      loadThirdPartyScripts();
      return;
    }
    if (consent === 'rejected') return;

    // First visit — show banner after delay
    const timer = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  function accept() {
    setConsent('accepted');
    loadThirdPartyScripts();
    setVisible(false);
  }

  function reject() {
    setConsent('rejected');
    setVisible(false);
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed bottom-0 inset-x-0 z-[9999] p-4 sm:p-6"
        >
          <div className="mx-auto max-w-3xl rounded-xl border border-white/10 bg-gray-900 p-4 sm:p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="flex-1 text-sm text-gray-300 leading-relaxed">
                <p>
                  We use cookies for analytics and marketing (Google Analytics, Meta Pixel, Encharge).
                  Your first-party experience works without them.{' '}
                  <button
                    onClick={() => navigate('/privacy-policy')}
                    className="underline text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    Privacy Policy
                  </button>
                </p>
              </div>

              <button
                onClick={reject}
                aria-label="Close cookie banner"
                className="shrink-0 text-gray-500 hover:text-gray-300 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 flex items-center gap-3 justify-end">
              <button
                onClick={reject}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
              >
                Reject
              </button>
              <button
                onClick={accept}
                className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-colors"
              >
                Accept
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
