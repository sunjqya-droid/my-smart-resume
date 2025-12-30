
export const START_HOUR = 9;
export const END_HOUR = 18;

export const getTodayStr = (): string => {
  return new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
};

export const isWithinReminderPeriod = (): boolean => {
  const now = new Date();
  const hour = now.getHours();
  return hour >= START_HOUR && hour <= END_HOUR;
};

export const getNextReminderTime = (): Date | null => {
  const now = new Date();
  const currentHour = now.getHours();

  if (currentHour < START_HOUR) {
    const next = new Date();
    next.setHours(START_HOUR, 0, 0, 0);
    return next;
  }

  if (currentHour >= END_HOUR) {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(START_HOUR, 0, 0, 0);
    return next;
  }

  const next = new Date();
  next.setHours(currentHour + 1, 0, 0, 0);
  return next;
};

export const formatTime = (date: Date): string => {
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
};

export const formatCountdown = (ms: number): string => {
  if (ms < 0) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};
