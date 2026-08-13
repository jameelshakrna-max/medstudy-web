export function isValidTimezone(tz) {
  if (!tz || typeof tz !== "string") return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
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

export function getDateKeyForTimezone(isoString, timezone) {
  return getDateKeyInTimezone(new Date(isoString), timezone);
}

function parseTimezoneComponents(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type) => {
    const part = parts.find((p) => p.type === type);
    if (!part) throw new Error(`Missing ${type} in timezone parts`);
    return parseInt(part.value, 10);
  };

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") === 24 ? 0 : get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function componentsMatch(c, y, mo, d, h, mi, s) {
  return (
    c.year === y &&
    c.month === mo &&
    c.day === d &&
    c.hour === h &&
    c.minute === mi &&
    c.second === s
  );
}

export function wallClockToUTC(year, month, day, hour, minute, second, timezone) {
  if (!isValidTimezone(timezone)) {
    throw new Error(`wallClockToUTC: invalid timezone "${timezone}"`)
  }

  const msPerDay = 86400000;
  const baseUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0);
  let guess = baseUtcMs + msPerDay;

  const MAX_ITERATIONS = 6;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const formatted = parseTimezoneComponents(new Date(guess), timezone);

    if (componentsMatch(formatted, year, month, day, hour, minute, second)) {
      return new Date(guess);
    }

    const guessWallMs = Date.UTC(
      formatted.year,
      formatted.month - 1,
      formatted.day,
      formatted.hour,
      formatted.minute,
      formatted.second,
    );
    const offsetMs = guess - guessWallMs;
    const targetUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
    guess = targetUtcMs + offsetMs;
  }

  throw new Error(
    `wallClockToUTC: failed to resolve ${timezone} for ${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")} after ${MAX_ITERATIONS} iterations`,
  );
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonthCalc(year, month) {
  const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 2 && isLeapYear(year)) return 29;
  return DAYS[month - 1];
}

function addDays(dateStr, days) {
  if (typeof dateStr !== "string" || !DATE_REGEX.test(dateStr)) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }
  let y = parseInt(dateStr.slice(0, 4), 10);
  let m = parseInt(dateStr.slice(5, 7), 10);
  let d = parseInt(dateStr.slice(8, 10), 10) + days;

  while (d > daysInMonthCalc(y, m)) {
    d -= daysInMonthCalc(y, m);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  while (d < 1) {
    m--;
    if (m < 1) {
      m = 12;
      y--;
    }
    d += daysInMonthCalc(y, m);
  }

  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function toStartOfDayUTC(dateStr, timezone) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return wallClockToUTC(y, m, d, 0, 0, 0, timezone);
}

export function toEndOfDayUTC(dateStr, timezone) {
  const nextDateStr = addDays(dateStr, 1);
  return new Date(toStartOfDayUTC(nextDateStr, timezone).getTime() - 1);
}

export { addDays };

export default {
  isValidTimezone,
  getDateKeyInTimezone,
  getDateKeyForTimezone,
  wallClockToUTC,
  toStartOfDayUTC,
  toEndOfDayUTC,
  addDays,
};
