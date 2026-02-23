import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, CheckCircle2, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { useCalendarEventsFromDB } from '@/lib/hooks/useCalendarEvents';
import { useGoogleServiceEnabled } from '@/lib/hooks/useGoogleIntegration';
import { useSlackIntegration } from '@/lib/hooks/useSlackIntegration';
import { useFathomIntegration } from '@/lib/hooks/useFathomIntegration';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { format, isToday, isTomorrow } from 'date-fns';

export function CalendarIcon() {
  const [isOpen, setIsOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState({ top: 0, left: 0 });
  const calendarRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isCalendarEnabled = useGoogleServiceEnabled('calendar');
  const { isConnected: isSlackConnected } = useSlackIntegration();
  const { isConnected: isFathomConnected } = useFathomIntegration();

  // Calculate date range for upcoming events (today + next 7 days)
  const dateRange = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setDate(end.getDate() + 7);
    end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }, []);

  // Fetch upcoming calendar events
  const { data: events = [], isLoading } = useCalendarEventsFromDB(
    dateRange.startDate,
    dateRange.endDate,
    isCalendarEnabled && isOpen
  );

  // Filter and sort upcoming events - only show events linked to CRM records
  const upcomingEvents = useMemo(() => {
    const now = new Date();
    return events
      .filter((event: any) => {
        const eventStart = new Date(event.start);
        // Only show events that are linked to CRM (contact, company, or deal)
        const isLinkedToCRM = event.contactId || event.companyId || event.dealId;
        return eventStart >= now && isLinkedToCRM;
      })
      .sort((a: any, b: any) => {
        return new Date(a.start).getTime() - new Date(b.start).getTime();
      })
      .slice(0, 5); // Show top 5
  }, [events]);

  const todayEvents = useMemo(() => {
    return events.filter((event: any) => {
      const eventStart = new Date(event.start);
      const isLinkedToCRM = event.contactId || event.companyId || event.dealId;
      return isToday(eventStart) && isLinkedToCRM;
    });
  }, [events]);

  const todayCount = todayEvents.length;
  const upcomingCount = upcomingEvents.length;

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        calendarRef.current &&
        panelRef.current &&
        !calendarRef.current.contains(event.target as Node) &&
        !panelRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [isOpen]);

  // Calculate panel position when opening
  const handleToggle = () => {
    if (!isOpen) {
      // Force-refresh calendar connection status so stale "not connected" data is cleared immediately
      queryClient.invalidateQueries({ queryKey: ['google', 'services'] });

      if (calendarRef.current) {
        const rect = calendarRef.current.getBoundingClientRect();
        const isMobile = window.innerWidth < 640;

        if (isMobile) {
          setPanelPosition({ top: 0, left: 0 });
        } else {
          setPanelPosition({
            top: rect.bottom + 8,
            left: Math.max(8, rect.left + rect.width - 384)
          });
        }
      }
    }
    setIsOpen(!isOpen);
  };

  const handleViewFullPage = () => {
    navigate('/calendar');
    setIsOpen(false);
  };

  const formatEventTime = (start: Date, end?: Date) => {
    if (!end) {
      return format(start, 'h:mm a');
    }
    return `${format(start, 'h:mm a')} – ${format(end, 'h:mm a')}`;
  };

  const formatEventDate = (date: Date) => {
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEE, MMM d');
  };

  return (
    <>
      {/* Calendar Icon */}
      <div ref={calendarRef} className="relative">
        <button
          onClick={handleToggle}
          className={cn(
            "relative p-2 rounded-lg transition-all duration-200",
            "hover:bg-gray-50 dark:hover:bg-gray-800/30 hover:scale-110",
            isOpen && "bg-gray-100 dark:bg-gray-800/50 scale-110"
          )}
          aria-label="Calendar"
          aria-expanded={isOpen}
        >
          <Calendar className="w-5 h-5 text-gray-700 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors" />
          
          {/* Today's Events Count Badge */}
          <AnimatePresence>
            {todayCount > 0 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute -top-1 -right-1"
              >
                <span className="flex items-center justify-center min-w-[20px] h-5 px-1 bg-blue-500 text-white text-[10px] font-bold rounded-full">
                  {todayCount > 99 ? '99+' : todayCount}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* Calendar Summary Panel - Rendered as Portal */}
      {isOpen && createPortal(
        <AnimatePresence>
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed z-[200] inset-0 sm:inset-auto"
            style={window.innerWidth >= 640 ? {
              top: `${panelPosition.top}px`,
              left: `${panelPosition.left}px`,
            } : {}}
          >
            <div className="
              w-full h-full sm:w-96 sm:h-auto sm:max-h-[600px]
              bg-white dark:bg-gray-900/95 backdrop-blur-sm
              border-0 sm:border border-gray-200 dark:border-gray-700/50
              rounded-none sm:rounded-lg shadow-2xl
              overflow-hidden flex flex-col
            ">
              {/* Header */}
              <div className="p-4 border-b border-gray-200 dark:border-gray-800">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Calendar</h3>
                    {todayCount > 0 && (
                      <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs font-medium rounded-full">
                        {todayCount} today
                      </span>
                    )}
                  </div>
                </div>
                {/* Integration connection status indicators */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    {isCalendarEnabled ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-gray-400" />
                    )}
                    <span className={cn(
                      "text-xs",
                      isCalendarEnabled ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400 dark:text-gray-500"
                    )}>
                      Google Calendar
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isSlackConnected ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-gray-400" />
                    )}
                    <span className={cn(
                      "text-xs",
                      isSlackConnected ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400 dark:text-gray-500"
                    )}>
                      Slack
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isFathomConnected ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-gray-400" />
                    )}
                    <span className={cn(
                      "text-xs",
                      isFathomConnected ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400 dark:text-gray-500"
                    )}>
                      Fathom
                    </span>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4">
                {!isCalendarEnabled ? (
                  <div className="text-center py-8">
                    <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                      Connect Google Calendar to view your events
                    </p>
                    <button
                      onClick={() => {
                        navigate('/settings/integrations/google-workspace');
                        setIsOpen(false);
                      }}
                      className="px-4 py-2 bg-[#37bd7e] text-white rounded-lg hover:bg-[#2da76c] transition-colors text-sm"
                    >
                      Connect Calendar
                    </button>
                  </div>
                ) : isLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#37bd7e] mx-auto"></div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">Loading events...</p>
                  </div>
                ) : upcomingEvents.length === 0 ? (
                  <div className="text-center py-8">
                    <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">No upcoming events linked to CRM</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">Only events linked to contacts, companies, or deals are shown</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {upcomingEvents.map((event: any) => {
                      const eventStart = new Date(event.start);
                      const eventEnd = event.end ? new Date(event.end) : null;
                      const isEventToday = isToday(eventStart);
                      
                      return (
                        <div
                          key={event.id}
                          className={cn(
                            "p-3 rounded-lg border transition-colors cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/30",
                            isEventToday 
                              ? "border-blue-200 dark:border-blue-800/50 bg-blue-50/50 dark:bg-blue-900/10" 
                              : "border-gray-200 dark:border-gray-700"
                          )}
                          onClick={() => {
                            navigate('/calendar');
                            setIsOpen(false);
                          }}
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                              {formatEventDate(eventStart)}
                            </p>
                            {isEventToday && (
                              <span className="px-1.5 py-0.5 bg-blue-500 text-white text-[10px] font-medium rounded">
                                Today
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
                            {event.title}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            <span>{formatEventTime(eventStart, eventEnd || undefined)}</span>
                            {event.location && (
                              <>
                                <span>•</span>
                                <span className="truncate">{event.location}</span>
                              </>
                            )}
                          </div>
                          {event.description && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                              {event.description}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-gray-200 dark:border-gray-800">
                <button
                  onClick={handleViewFullPage}
                  className="w-full px-4 py-2 bg-[#37bd7e] text-white rounded-lg hover:bg-[#2da76c] transition-colors text-sm font-medium"
                >
                  View Full Calendar Page
                </button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

