import { OWNER_ID } from '@/lib/life/constants'
import { getSupabaseAdmin } from '@/lib/life/supabase'
import type { CalendarEventRecord, DayHistory, EntryRecord, ReportRecord } from '@/lib/life/types'

export async function getHistorySnapshot(search: string) {
  const supabase = getSupabaseAdmin();
  const [{ data: entries, error: entriesError }, { data: reports, error: reportsError }] = await Promise.all([
    supabase
      .from("entries")
      .select("*")
      .eq("user_id", OWNER_ID)
      .order("local_date", { ascending: false })
      .order("created_at", { ascending: false })
      .returns<EntryRecord[]>(),
    supabase
      .from("reports")
      .select("*")
      .eq("user_id", OWNER_ID)
      .order("local_date", { ascending: false })
      .returns<ReportRecord[]>(),
  ]);

  if (entriesError || reportsError) {
    throw entriesError || reportsError;
  }

  const normalizedSearch = search.trim().toLowerCase();
  const reportMap = new Map<string, ReportRecord[]>();
  const entryMap = new Map<string, EntryRecord[]>();
  const matchingDates = new Set<string>();

  for (const entry of entries || []) {
    const list = entryMap.get(entry.local_date) || [];
    list.push(entry);
    entryMap.set(entry.local_date, list);

    if (!normalizedSearch || entry.content.toLowerCase().includes(normalizedSearch)) {
      matchingDates.add(entry.local_date);
    }
  }

  for (const report of reports || []) {
    const list = reportMap.get(report.local_date) || [];
    list.push(report);
    reportMap.set(report.local_date, list);
    if (!normalizedSearch) {
      matchingDates.add(report.local_date);
    }
  }

  const dates = Array.from(new Set([...entryMap.keys(), ...reportMap.keys()]))
    .filter((localDate) => !normalizedSearch || matchingDates.has(localDate))
    .sort((left, right) => (left < right ? 1 : -1));

  const days: DayHistory[] = dates.map((localDate) => {
    const dayReports = reportMap.get(localDate) || [];
    return {
      localDate,
      entryCount: (entryMap.get(localDate) || []).length,
      hasEod: dayReports.some((report) => report.type === "eod"),
      hasMorning: dayReports.some((report) => report.type === "morning"),
    };
  });

  return {
    days,
    entriesByDate: entryMap,
    reportsByDate: reportMap,
  };
}

export async function getDayDetail(localDate: string) {
  const supabase = getSupabaseAdmin();
  const [{ data: entries, error: entriesError }, { data: reports, error: reportsError }, { data: events, error: eventsError }] = await Promise.all([
    supabase
      .from("entries")
      .select("*")
      .eq("user_id", OWNER_ID)
      .eq("local_date", localDate)
      .order("created_at", { ascending: false })
      .returns<EntryRecord[]>(),
    supabase
      .from("reports")
      .select("*")
      .eq("user_id", OWNER_ID)
      .eq("local_date", localDate)
      .order("created_at", { ascending: false })
      .returns<ReportRecord[]>(),
    supabase
      .from("calendar_events")
      .select("*")
      .eq("user_id", OWNER_ID)
      .eq("local_date", localDate)
      .order("start_time", { ascending: true })
      .returns<CalendarEventRecord[]>(),
  ]);

  if (entriesError || reportsError || eventsError) {
    throw entriesError || reportsError || eventsError;
  }

  return {
    entries: entries || [],
    reports: reports || [],
    events: events || [],
  };
}
