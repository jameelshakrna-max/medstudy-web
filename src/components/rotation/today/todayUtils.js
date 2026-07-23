export function getBrowserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function isValidTimezone(tz) {
  if (!tz || typeof tz !== "string") return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
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

export function getDateKeyInTimezone(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function getTodayKey(now, timezone) {
  return getDateKeyInTimezone(now, timezone);
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
  isOverdue,
  secondsToPlannerMinutes,
};
