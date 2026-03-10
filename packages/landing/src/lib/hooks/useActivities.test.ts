import { vi, describe, it, expect } from 'vitest';
import * as useActivitiesModule from './useActivities';

// Mock supabase client and toast
vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn().mockResolvedValue({ error: undefined })
    }
  }
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const mockActivity = {
  type: 'sale',
  client_name: 'Test Client',
  contactIdentifier: 'test@example.com',
};

describe('useActivities', () => {
  it('should auto-process activity if contactIdentifier is present', async () => {
    const { supabase } = await import('@/lib/supabase/client');
    const { createActivity } = useActivitiesModule;
    // Mock supabase.auth.getUser and profile fetch
    vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({ data: { user: { id: 'user1' } } });
    vi.spyOn(supabase, 'from').mockReturnValue({
      select: () => ({ eq: () => ({ single: () => ({ data: { first_name: 'Test', last_name: 'User' } }) }) }),
      insert: () => ({ select: () => ({ single: () => ({ data: { id: 'activity1', contact_identifier: 'test@example.com' } }) }) })
    });
    await createActivity(mockActivity);
    expect(supabase.functions.invoke).toHaveBeenCalledWith('process-jobs-router', expect.objectContaining({ body: { action: 'single_activity', activityId: 'activity1' } }));
  });

  it('should NOT auto-process activity if contactIdentifier is missing', async () => {
    const { supabase } = await import('@/lib/supabase/client');
    const { createActivity } = useActivitiesModule;
    vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({ data: { user: { id: 'user1' } } });
    vi.spyOn(supabase, 'from').mockReturnValue({
      select: () => ({ eq: () => ({ single: () => ({ data: { first_name: 'Test', last_name: 'User' } }) }) }),
      insert: () => ({ select: () => ({ single: () => ({ data: { id: 'activity2', contact_identifier: null } }) }) })
    });
    await createActivity({ ...mockActivity, contactIdentifier: undefined });
    expect(supabase.functions.invoke).not.toHaveBeenCalledWith('process-jobs-router', expect.objectContaining({ body: { action: 'single_activity', activityId: 'activity2' } }));
  });
}); 