const CONSENT_KEY = 'use60_cookie_consent';

export type ConsentState = 'accepted' | 'rejected' | null;

export function getConsent(): ConsentState {
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    if (value === 'accepted' || value === 'rejected') return value;
    return null;
  } catch {
    return null;
  }
}

export function setConsent(state: 'accepted' | 'rejected'): void {
  try {
    localStorage.setItem(CONSENT_KEY, state);
  } catch {
    // localStorage unavailable (private browsing edge cases)
  }
}
