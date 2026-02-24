import React, { useState } from 'react';
import { 
  Bell, X, Check, CheckCheck, Trash2, Settings, Filter,
  Sparkles, Zap, Target, FileText, Users, Calendar, Clock,
  AlertCircle, TrendingUp, MessageSquare, Link2, Play,
  ChevronRight, MoreHorizontal, Archive, Star, RefreshCw
} from 'lucide-react';

const NotificationCenter = ({ isOpen = true, onClose = () => {}, isDark = true }) => {
  const [activeTab, setActiveTab] = useState('all');
  const [expandedGroup, setExpandedGroup] = useState('ai');

  const notifications = {
    ai: [
      {
        id: 1,
        type: 'ai-complete',
        icon: Sparkles,
        title: 'Ad copy variants ready',
        desc: 'AI generated 5 variants for your waitlist campaign',
        time: '2 min ago',
        read: false,
        actionable: true,
        actions: [
          { label: 'Review', primary: true },
          { label: 'Dismiss' },
        ],
      },
      {
        id: 2,
        type: 'ai-suggestion',
        icon: Zap,
        title: 'Content opportunity detected',
        desc: 'Your competitor just posted about AI productivity. Consider responding.',
        time: '15 min ago',
        read: false,
        actionable: true,
        actions: [
          { label: 'Create Response', primary: true },
          { label: 'Ignore' },
        ],
      },
      {
        id: 3,
        type: 'ai-insight',
        icon: TrendingUp,
        title: 'Goal insight',
        desc: 'Waitlist growth accelerating. You could hit 500 by Monday.',
        time: '1 hour ago',
        read: true,
      },
    ],
    tasks: [
      {
        id: 4,
        type: 'task-due',
        icon: AlertCircle,
        title: 'Task due soon',
        desc: 'Client call prep - Acme Corp is due in 2 hours',
        time: '30 min ago',
        read: false,
        priority: 'high',
      },
      {
        id: 5,
        type: 'task-overdue',
        icon: Clock,
        title: '2 tasks overdue',
        desc: 'Review PR #142, Update landing page copy',
        time: '2 hours ago',
        read: false,
        priority: 'critical',
      },
    ],
    content: [
      {
        id: 6,
        type: 'content-scheduled',
        icon: Calendar,
        title: 'Post going live',
        desc: 'LinkedIn post "5 AI tools..." scheduled for 10:00 AM',
        time: '5 min ago',
        read: false,
      },
      {
        id: 7,
        type: 'content-engagement',
        icon: MessageSquare,
        title: 'High engagement',
        desc: 'Your TikTok got 50 comments in the last hour',
        time: '45 min ago',
        read: true,
      },
    ],
    team: [
      {
        id: 8,
        type: 'team-mention',
        icon: Users,
        title: 'Sarah mentioned you',
        desc: 'In the marketing channel: "@you what do you think about..."',
        time: '20 min ago',
        read: false,
      },
    ],
  };

  const tabs = [
    { id: 'all', label: 'All', count: 8 },
    { id: 'ai', label: 'AI', count: 3, icon: Sparkles },
    { id: 'tasks', label: 'Tasks', count: 2, icon: Target },
    { id: 'content', label: 'Content', count: 2, icon: FileText },
    { id: 'team', label: 'Team', count: 1, icon: Users },
  ];

  const getNotificationsForTab = () => {
    if (activeTab === 'all') {
      return Object.entries(notifications);
    }
    return [[activeTab, notifications[activeTab] || []]];
  };

  const getTypeColor = (type) => {
    if (type.includes('ai')) return 'purple';
    if (type.includes('task')) return 'amber';
    if (type.includes('content')) return 'blue';
    if (type.includes('team')) return 'emerald';
    return 'gray';
  };

  const getColorClasses = (color) => ({
    purple: { bg: isDark ? 'bg-purple-500/20' : 'bg-purple-100', text: 'text-purple-500' },
    amber: { bg: isDark ? 'bg-amber-500/20' : 'bg-amber-100', text: 'text-amber-500' },
    blue: { bg: isDark ? 'bg-blue-500/20' : 'bg-blue-100', text: 'text-blue-500' },
    emerald: { bg: isDark ? 'bg-emerald-500/20' : 'bg-emerald-100', text: 'text-emerald-500' },
    rose: { bg: isDark ? 'bg-rose-500/20' : 'bg-rose-100', text: 'text-rose-500' },
    gray: { bg: isDark ? 'bg-gray-800' : 'bg-gray-100', text: 'text-gray-500' },
  });

  const groupLabels = {
    ai: 'AI & Automation',
    tasks: 'Tasks & Goals',
    content: 'Content & Publishing',
    team: 'Team & Collaboration',
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end pt-16 pr-4">
      <div className="absolute inset-0" onClick={onClose} />
      
      <div className={`relative w-full max-w-md max-h-[80vh] overflow-hidden rounded-2xl border shadow-2xl flex flex-col
        ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}`}>
        
        {/* Header */}
        <div className={`p-4 border-b ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${isDark ? 'bg-blue-500/20' : 'bg-blue-100'}`}>
                <Bell className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h2 className={`font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Notifications</h2>
                <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>8 unread</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button className={`p-2 rounded-xl transition-colors ${isDark ? 'hover:bg-gray-800 text-gray-500' : 'hover:bg-gray-100 text-gray-400'}`}>
                <CheckCheck className="w-4 h-4" />
              </button>
              <button className={`p-2 rounded-xl transition-colors ${isDark ? 'hover:bg-gray-800 text-gray-500' : 'hover:bg-gray-100 text-gray-400'}`}>
                <Settings className="w-4 h-4" />
              </button>
              <button onClick={onClose} className={`p-2 rounded-xl transition-colors ${isDark ? 'hover:bg-gray-800 text-gray-500' : 'hover:bg-gray-100 text-gray-400'}`}>
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 overflow-x-auto pb-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors
                  ${activeTab === tab.id 
                    ? isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-600'
                    : isDark ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                  }`}
              >
                {tab.icon && <tab.icon className="w-3.5 h-3.5" />}
                {tab.label}
                {tab.count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-xs
                    ${activeTab === tab.id 
                      ? isDark ? 'bg-blue-500/30' : 'bg-blue-200'
                      : isDark ? 'bg-gray-800' : 'bg-gray-200'
                    }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto">
          {getNotificationsForTab().map(([groupId, groupNotifications]) => (
            <div key={groupId}>
              {activeTab === 'all' && (
                <button
                  onClick={() => setExpandedGroup(expandedGroup === groupId ? null : groupId)}
                  className={`w-full flex items-center justify-between px-4 py-2 transition-colors
                    ${isDark ? 'bg-gray-800/50 hover:bg-gray-800' : 'bg-gray-50 hover:bg-gray-100'}`}
                >
                  <span className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {groupLabels[groupId]}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                      {groupNotifications.length}
                    </span>
                    <ChevronRight className={`w-4 h-4 transition-transform ${expandedGroup === groupId ? 'rotate-90' : ''} ${isDark ? 'text-gray-600' : 'text-gray-400'}`} />
                  </div>
                </button>
              )}
              
              {(activeTab !== 'all' || expandedGroup === groupId) && (
                <div className="divide-y divide-gray-800">
                  {groupNotifications.map((notification) => {
                    const color = getTypeColor(notification.type);
                    const colors = getColorClasses(color);
                    
                    return (
                      <div 
                        key={notification.id}
                        className={`p-4 transition-colors cursor-pointer group
                          ${!notification.read ? isDark ? 'bg-gray-800/30' : 'bg-blue-50/50' : ''}
                          ${isDark ? 'hover:bg-gray-800/50' : 'hover:bg-gray-50'}`}
                      >
                        <div className="flex gap-3">
                          <div className={`p-2 rounded-lg flex-shrink-0 ${colors.bg}`}>
                            <notification.icon className={`w-4 h-4 ${colors.text}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className={`text-sm font-medium ${!notification.read ? (isDark ? 'text-white' : 'text-gray-900') : (isDark ? 'text-gray-300' : 'text-gray-700')}`}>
                                  {notification.title}
                                </p>
                                <p className={`text-sm mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                  {notification.desc}
                                </p>
                              </div>
                              {!notification.read && (
                                <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-2" />
                              )}
                            </div>
                            
                            <div className="flex items-center justify-between mt-2">
                              <span className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                                {notification.time}
                              </span>
                              
                              {notification.actions ? (
                                <div className="flex gap-2">
                                  {notification.actions.map((action, i) => (
                                    <button
                                      key={i}
                                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors
                                        ${action.primary 
                                          ? 'bg-blue-500 text-white hover:bg-blue-600'
                                          : isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                                        }`}
                                    >
                                      {action.label}
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button className={`p-1 rounded-lg transition-colors ${isDark ? 'hover:bg-gray-700 text-gray-500' : 'hover:bg-gray-200 text-gray-400'}`}>
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button className={`p-1 rounded-lg transition-colors ${isDark ? 'hover:bg-gray-700 text-gray-500' : 'hover:bg-gray-200 text-gray-400'}`}>
                                    <Archive className="w-3.5 h-3.5" />
                                  </button>
                                  <button className={`p-1 rounded-lg transition-colors ${isDark ? 'hover:bg-gray-700 text-gray-500' : 'hover:bg-gray-200 text-gray-400'}`}>
                                    <MoreHorizontal className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                            
                            {notification.priority && (
                              <div className={`mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs
                                ${notification.priority === 'critical' 
                                  ? isDark ? 'bg-rose-500/20 text-rose-400' : 'bg-rose-100 text-rose-600'
                                  : isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-600'
                                }`}>
                                <AlertCircle className="w-3 h-3" />
                                {notification.priority}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className={`p-3 border-t ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
          <button className={`w-full py-2 rounded-xl text-sm font-medium transition-colors
            ${isDark ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-500 hover:bg-gray-100'}`}>
            View All Notifications
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotificationCenter;