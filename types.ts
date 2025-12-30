
export interface AppState {
  count: number;
  isActive: boolean;
  lastReminderHour: number | null;
  lastDate: string; // YYYY-MM-DD
}

export enum ReminderStatus {
  IN_PERIOD = 'IN_PERIOD',
  OFF_PERIOD = 'OFF_PERIOD',
  PAUSED = 'PAUSED'
}
