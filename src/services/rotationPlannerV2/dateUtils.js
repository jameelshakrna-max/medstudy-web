const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year, month) {
  if (month === 2 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH[month - 1];
}

export function parseDateParts(dateStr) {
  if (typeof dateStr !== 'string' || !DATE_REGEX.test(dateStr)) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }
  const year = parseInt(dateStr.slice(0, 4), 10);
  const month = parseInt(dateStr.slice(5, 7), 10);
  const day = parseInt(dateStr.slice(8, 10), 10);

  if (month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month}`);
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`Invalid day: ${day} for ${year}-${String(month).padStart(2, '0')}`);
  }

  return { year, month, day };
}

export function formatDateParts({ year, month, day }) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function addDays(dateStr, days) {
  const { year, month, day } = parseDateParts(dateStr);
  let y = year;
  let m = month;
  let d = day + days;

  while (d > daysInMonth(y, m)) {
    d -= daysInMonth(y, m);
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
    d += daysInMonth(y, m);
  }

  return formatDateParts({ year: y, month: m, day: d });
}

export function generateDateRange(startDate, endDate) {
  if (startDate > endDate) return [];
  const result = [];
  let current = startDate;
  while (current <= endDate) {
    result.push(current);
    current = addDays(current, 1);
  }
  return result;
}

export function getDayOfWeek(dateStr) {
  const { year, month, day } = parseDateParts(dateStr);
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  let y = year;
  if (month < 3) y--;
  return ((y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + t[month - 1] + day) % 7);
}

export function isValidDateString(dateStr) {
  if (typeof dateStr !== 'string' || !DATE_REGEX.test(dateStr)) return false;
  const year = parseInt(dateStr.slice(0, 4), 10);
  const month = parseInt(dateStr.slice(5, 7), 10);
  const day = parseInt(dateStr.slice(8, 10), 10);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  return true;
}
