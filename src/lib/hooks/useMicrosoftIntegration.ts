import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { microsoftApi } from '@/lib/api/microsoftIntegration';

// Query Keys
export const MICROSOFT_QUERY_KEYS = {
  integration: ['microsoft', 'integration'] as const,
  health: ['microsoft', 'health'] as const,
  services: ['microsoft', 'services'] as const,
} as const;

// Main integration hook
export function useMicrosoftIntegration() {
  return useQuery({
    queryKey: MICROSOFT_QUERY_KEYS.integration,
    queryFn: microsoftApi.getStatus,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

// Health check hook
export function useMicrosoftIntegrationHealth() {
  return useQuery({
    queryKey: MICROSOFT_QUERY_KEYS.health,
    queryFn: microsoftApi.getHealth,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
}

// Service status hook
export function useMicrosoftServiceStatus() {
  return useQuery({
    queryKey: MICROSOFT_QUERY_KEYS.services,
    queryFn: microsoftApi.getServiceStatus,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

// OAuth mutation
export function useMicrosoftOAuthInitiate() {
  return useMutation({
    mutationFn: microsoftApi.initiateOAuth,
    onSuccess: (data) => {
      window.location.href = data.authUrl;
    },
  });
}

// Disconnect mutation
export function useMicrosoftDisconnect() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: microsoftApi.disconnect,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['microsoft'] });
      queryClient.removeQueries({ queryKey: ['microsoft'] });
    },
  });
}

// Service toggle mutation
export function useMicrosoftServiceToggle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ service, enabled }: { service: string; enabled: boolean }) =>
      microsoftApi.toggleService(service as any, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MICROSOFT_QUERY_KEYS.services });
    },
  });
}
