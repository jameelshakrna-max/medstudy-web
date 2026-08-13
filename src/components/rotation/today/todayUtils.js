import { isValidTimezone, getDateKeyInTimezone, getDateKeyForTimezone, addDays } from '../../../lib/dateUtils.js'

export { isValidTimezone, getDateKeyInTimezone, getDateKeyForTimezone }

export function getBrowserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function resolvePlannerTimezone({
  profileTimezone,
  applicationTimezone,
  browserTimezone,
}) {
  const candidates = [profileTimezone, applicationTimezone, browserTimezone];
  for (const tz of candidates) {
    if (isValidTimezone(tz)) return tz;
  }
  return "UTC";
}

export function getTodayKey(now, timezone) {
  return getDateKeyInTimezone(now, timezone);
}

export function getNextDateKey(dateKey) {
  return addDays(dateKey, 1);
}

export function isOverdue(taskDateKey, todayKey) {
  return taskDateKey < todayKey;
}

export function secondsToPlannerMinutes(seconds) {
  return Math.ceil(seconds / 60);
}

export default {
  getBrowserTimezone,
  isValidTimezone,
  resolvePlannerTimezone,
  getDateKeyInTimezone,
  getTodayKey,
  getNextDateKey,
  getDateKeyForTimezone,
  isOverdue,
  secondsToPlannerMinutes,
};
