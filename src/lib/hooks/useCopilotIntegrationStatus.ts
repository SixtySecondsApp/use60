export function useCopilotIntegrationStatus() {
  return {
    integrations: {
      hasCalendar: false,
      hasEmail: false,
      hasCrm: false,
      hasNotetaker: false,
    },
    isLoading: false,
  };
}
