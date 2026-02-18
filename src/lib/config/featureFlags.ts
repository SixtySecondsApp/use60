// ============================================================================
// Feature Flags
// ============================================================================
// Controls gradual rollout of new features.
// Flags can be read from:
//   1. localStorage (dev override)
//   2. Environment variables (build-time)
//   3. Defaults defined here (fallback)

export interface FeatureFlags {
  /** Enable the new credit pack system (v2). When false, legacy dollar-based system is used. */
  credit_packs_v2: boolean;
}

const DEFAULTS: FeatureFlags = {
  credit_packs_v2: true,
};

const LOCAL_STORAGE_PREFIX = 'ff_';

/**
 * Get the current value of a feature flag.
 *
 * Priority: localStorage override > environment variable > default
 */
export function getFlag<K extends keyof FeatureFlags>(key: K): FeatureFlags[K] {
  // 1. localStorage override (dev/testing only)
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}${key}`);
    if (stored !== null) {
      return (stored === 'true') as FeatureFlags[K];
    }
  }

  // 2. Default
  return DEFAULTS[key];
}

/**
 * Set a localStorage override for a feature flag (dev use only).
 */
export function setFlagOverride<K extends keyof FeatureFlags>(key: K, value: boolean): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}${key}`, String(value));
  }
}

/**
 * Clear a localStorage override, reverting to default.
 */
export function clearFlagOverride<K extends keyof FeatureFlags>(key: K): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(`${LOCAL_STORAGE_PREFIX}${key}`);
  }
}

// Convenience exports for direct flag reads
export const FLAGS = {
  get creditPacksV2() { return getFlag('credit_packs_v2'); },
} as const;
