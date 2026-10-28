import { createContext, useContext } from 'react'
import type { AcademicReminder, ReminderSettings } from './academicReminders'
export interface ReminderState { rows: AcademicReminder[]; unread: number; settings: ReminderSettings | null; loading: boolean; error: string; batchRetry: boolean; busy: boolean; more: boolean; paging: boolean; refresh: () => Promise<void>; loadMore: () => Promise<void>; markRead: (id: string) => Promise<boolean>; clear: (id: string) => Promise<boolean>; clearAll: () => Promise<boolean>; saveSettings: (value: ReminderSettings) => Promise<boolean> }
export const ReminderContext = createContext<ReminderState | null>(null)
export const useAcademicReminders = () => useContext(ReminderContext)
