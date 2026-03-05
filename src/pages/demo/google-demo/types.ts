import type { LucideIcon } from 'lucide-react';

export interface ShotConfig {
  id: number;
  title: string;
  icon: LucideIcon;
  duration: string;
  steps: string[];
  /** Milliseconds each step stays on screen during auto-play */
  stepTimings: number[];
}

export interface ShotComponentProps {
  activeStep: number;
  onStepChange: (step: number) => void;
  isActive: boolean;
}

export interface MockContact {
  name: string;
  role: string;
  company: string;
  email: string;
  avatar: string;
}

export interface MockEmail {
  id: string;
  from: MockContact;
  to: string;
  subject: string;
  preview: string;
  timestamp: string;
  category: 'to_respond' | 'fyi' | 'marketing' | 'automated';
  isRead: boolean;
  isStarred: boolean;
}

export interface MockCalendarEvent {
  id: string;
  title: string;
  time: string;
  duration: string;
  attendees: MockContact[];
  meetLink: string;
  color: string;
  day: number; // 0=Mon, 4=Fri
  hour: number; // 9-17
  dealName?: string;
}
