const fullFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string) {
  const key = `full:${timeZone}`;
  let formatter = fullFormatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    fullFormatterCache.set(key, formatter);
  }
  return formatter;
}

export function getTimeParts(date: Date, timeZone: string) {
  const parts = getFormatter(timeZone).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second),
  };
}

export function getLocalDateString(date: Date, timeZone: string) {
  const parts = getTimeParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function getLocalTimeLabel(dateLike: string | Date, timeZone: string) {
  const date = typeof dateLike === "string" ? new Date(dateLike) : dateLike;
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function getDisplayDate(localDate: string, timeZone: string) {
  const date = localDateTimeToUtc(localDate, timeZone, 12, 0);
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function addDays(localDate: string, amount: number) {
  const [year, month, day] = localDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount, 12, 0, 0));
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getOffsetMilliseconds(date: Date, timeZone: string) {
  const parts = getTimeParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return asUtc - date.getTime();
}

export function localDateTimeToUtc(localDate: string, timeZone: string, hour = 0, minute = 0, second = 0) {
  const [year, month, day] = localDate.split("-").map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offset = getOffsetMilliseconds(guess, timeZone);
  return new Date(guess.getTime() - offset);
}

export function getLocalDayRange(localDate: string, timeZone: string) {
  const start = localDateTimeToUtc(localDate, timeZone, 0, 0, 0);
  const end = localDateTimeToUtc(addDays(localDate, 1), timeZone, 0, 0, 0);
  return { start, end };
}

export function getCurrentLocalDate(timeZone: string, now = new Date()) {
  return getLocalDateString(now, timeZone);
}

export function getCurrentLocalClock(timeZone: string, now = new Date()) {
  const parts = getTimeParts(now, timeZone);
  return { hour: parts.hour, minute: parts.minute };
}

export function isBeforeNoon(timeZone: string, now = new Date()) {
  return getCurrentLocalClock(timeZone, now).hour < 12;
}

export function isMorningBriefWindow(timeZone: string, now = new Date()) {
  const { hour } = getCurrentLocalClock(timeZone, now)
  return hour >= 5 && hour < 12
}

export function getWeekStart(localDate: string) {
  const [year, month, day] = localDate.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const dayOfWeek = utc.getUTCDay();
  const distanceToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  return addDays(localDate, -distanceToMonday);
}
