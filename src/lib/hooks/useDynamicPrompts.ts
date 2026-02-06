/**
 * Dynamic Prompts Hook
 * Generates contextually relevant CoPilot prompts based on user's actual data
 * US-009: Updated to match capability-matched prompts from brief
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuthUser } from '@/lib/hooks/useAuthUser';

interface DynamicPrompt {
  text: string;
  category: 'priority' | 'deal' | 'contact' | 'task' | 'meeting' | 'fathom';
}

// US-009: Capability-matched default prompts from brief
const DEFAULT_PROMPTS: DynamicPrompt[] = [
  { text: 'What action items am I behind on?', category: 'task' },
  { text: 'Which deals haven\'t moved in 2 weeks?', category: 'deal' },
  { text: 'Draft follow-ups for today\'s meetings', category: 'meeting' },
  { text: 'What should I prioritize today?', category: 'priority' }
];

// Format time for meeting prep prompt
function formatMeetingTime(startTime: string): string {
  const date = new Date(startTime);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'pm' : 'am';
  const hour12 = hours % 12 || 12;
  const minuteStr = minutes > 0 ? `:${minutes.toString().padStart(2, '0')}` : '';
  return `${hour12}${minuteStr}${ampm}`;
}

export function useDynamicPrompts(maxPrompts: number = 4): {
  prompts: string[];
  isLoading: boolean;
} {
  const [prompts, setPrompts] = useState<string[]>(DEFAULT_PROMPTS.slice(0, maxPrompts).map(p => p.text));
  const [isLoading, setIsLoading] = useState(true);
  const { data: user } = useAuthUser();

  useEffect(() => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    const fetchDynamicPrompts = async () => {
      try {
        const dynamicPrompts: DynamicPrompt[] = [];

        // Fetch data in parallel for performance
        const [contactsResult, dealsResult, tasksResult, meetingsResult, companiesResult] = await Promise.all([
          // Get recent contacts with activity
          supabase
            .from('contacts')
            .select('id, full_name, first_name, last_name, updated_at')
            .eq('owner_id', user.id)
            .order('updated_at', { ascending: false })
            .limit(5),

          // Get stale deals (not updated in 2 weeks)
          supabase
            .from('deals')
            .select('id, name, health_score, updated_at, expected_close_date')
            .eq('owner_id', user.id)
            .lt('updated_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
            .order('value', { ascending: false })
            .limit(5),

          // Get overdue or incomplete tasks
          supabase
            .from('tasks')
            .select('id, title, due_date, priority, status')
            .eq('assigned_to', user.id)
            .neq('status', 'completed')
            .order('due_date', { ascending: true })
            .limit(10),

          // Get upcoming meetings (today or next)
          supabase
            .from('calendar_events')
            .select('id, title, start_time, attendees')
            .eq('user_id', user.id)
            .gte('start_time', new Date().toISOString())
            .lte('start_time', new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString())
            .order('start_time', { ascending: true })
            .limit(3),

          // Get recent companies for Fathom-style prompts
          supabase
            .from('companies')
            .select('id, name')
            .eq('owner_id', user.id)
            .order('updated_at', { ascending: false })
            .limit(3)
        ]);

        // 1. Meeting prep prompt with actual time (e.g., "Prep me for my 3pm call")
        if (meetingsResult.data && meetingsResult.data.length > 0) {
          const nextMeeting = meetingsResult.data[0];
          const meetingTime = formatMeetingTime(nextMeeting.start_time);
          dynamicPrompts.push({
            text: `Prep me for my ${meetingTime} call`,
            category: 'meeting'
          });
        }

        // 2. Contact-based prompt with name (e.g., "What did Sarah say about budget?")
        if (contactsResult.data && contactsResult.data.length > 0) {
          const recentContact = contactsResult.data[0];
          const firstName = recentContact.first_name ||
            recentContact.full_name?.split(' ')[0] ||
            'them';

          dynamicPrompts.push({
            text: `What did ${firstName} say about next steps?`,
            category: 'fathom'
          });
        }

        // 3. Company-based Fathom prompt (e.g., "Summarise my calls with Acme")
        if (companiesResult.data && companiesResult.data.length > 0) {
          const recentCompany = companiesResult.data[0];
          dynamicPrompts.push({
            text: `Summarise my calls with ${recentCompany.name}`,
            category: 'fathom'
          });
        }

        // 4. Stale deals prompt
        if (dealsResult.data && dealsResult.data.length > 0) {
          dynamicPrompts.push({
            text: `Which deals haven't moved in 2 weeks?`,
            category: 'deal'
          });
        }

        // 5. Task/action items prompt
        if (tasksResult.data) {
          const overdueTasks = tasksResult.data.filter(t =>
            t.due_date && new Date(t.due_date) < new Date()
          );

          if (overdueTasks.length > 0) {
            dynamicPrompts.push({
              text: 'What action items am I behind on?',
              category: 'task'
            });
          }
        }

        // 6. Follow-up prompt
        dynamicPrompts.push({
          text: 'Draft follow-ups for today\'s meetings',
          category: 'contact'
        });

        // Deduplicate by category and limit
        const uniquePrompts = dynamicPrompts
          .filter((prompt, index, self) =>
            index === self.findIndex(p => p.category === prompt.category)
          )
          .slice(0, maxPrompts);

        // If we don't have enough prompts, fill with defaults
        while (uniquePrompts.length < maxPrompts) {
          const defaultPrompt = DEFAULT_PROMPTS.find(dp =>
            !uniquePrompts.some(up => up.category === dp.category)
          );
          if (defaultPrompt) {
            uniquePrompts.push(defaultPrompt);
          } else {
            break;
          }
        }

        setPrompts(uniquePrompts.slice(0, maxPrompts).map(p => p.text));
      } catch (error) {
        console.error('Error fetching dynamic prompts:', error);
        // Fall back to defaults on error
        setPrompts(DEFAULT_PROMPTS.slice(0, maxPrompts).map(p => p.text));
      } finally {
        setIsLoading(false);
      }
    };

    fetchDynamicPrompts();
  }, [user?.id, maxPrompts]);

  return { prompts, isLoading };
}

export default useDynamicPrompts;
