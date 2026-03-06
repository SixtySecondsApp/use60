/**
 * Sandbox — Public API
 *
 * Central exports for the interactive sandbox demo system.
 */

// Main components
export { SandboxApp } from './SandboxApp';
export { SandboxExperience } from './SandboxExperience';
export { SandboxEntrance } from './SandboxEntrance';
export { SandboxTour } from './SandboxTour';
export { CampaignManager } from './CampaignManager';

// Data
export { SandboxDataProvider, useSandboxData } from './data/SandboxDataProvider';
export { getDefaultSandboxData } from './data/defaultMockData';
export { generatePersonalizedData } from './data/generatePersonalizedData';
export type { SandboxData, SandboxView } from './data/sandboxTypes';
export type { ResearchInput, VisitorInfo, PersonalizedContent } from './data/generatePersonalizedData';

// Hooks
export { useSandboxTracking } from './hooks/useSandboxTracking';
export { useSandboxSignup } from './hooks/useSandboxSignup';
export { useReducedMotion } from './hooks/useReducedMotion';
