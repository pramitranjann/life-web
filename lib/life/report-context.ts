import { OWNER_ID, OWNER_PROFILE } from '@/lib/life/constants'
import { getSupabaseAdmin } from '@/lib/life/supabase'
import { getLocalDayRange, getLocalTimeLabel } from '@/lib/life/time'
import type { CalendarEventRecord, EntryRecord, ReportRecord, SummaryRecord, TaskRecord } from '@/lib/life/types'

export interface ReportContext {
  summaries: SummaryRecord[];
  priorEods: ReportRecord[];
  events: CalendarEventRecord[];
  entries: EntryRecord[];
  openTasks: TaskRecord[];
  completedTasks: TaskRecord[]; // tasks marked done during localDate (by local clock)
}

export async function loadDailyContext(localDate: string, timezone: string) {
  const supabase = getSupabaseAdmin();
  const { start: dayStart, end: dayEnd } = getLocalDayRange(localDate, timezone);

  const [
    { data: summaries, error: summariesError },
    { data: priorEods, error: reportsError },
    { data: events, error: eventsError },
    { data: entries, error: entriesError },
    { data: openTasks, error: openTasksError },
    { data: completedTasks, error: completedTasksError },
  ] = await Promise.all([
    supabase
      .from("summaries")
      .select("*")
      .eq("user_id", OWNER_ID)
      .order("week_start", { ascending: false })
      .limit(3)
      .returns<SummaryRecord[]>(),
    supabase
      .from("reports")
      .select("*")
      .eq("user_id", OWNER_ID)
      .eq("type", "eod")
      .lt("local_date", localDate)
      .order("local_date", { ascending: false })
      .limit(2)
      .returns<ReportRecord[]>(),
    supabase
      .from("calendar_events")
      .select("*")
      .eq("user_id", OWNER_ID)
      .eq("local_date", localDate)
      .order("start_time", { ascending: true })
      .returns<CalendarEventRecord[]>(),
    supabase
      .from("entries")
      .select("*")
      .eq("user_id", OWNER_ID)
      .eq("local_date", localDate)
      .order("created_at", { ascending: true })
      .returns<EntryRecord[]>(),
    supabase
      .from("tasks")
      .select("*")
      .eq("user_id", OWNER_ID)
      .in("status", ["open", "in_progress"])
      .order("priority", { ascending: true })
      .order("due_local_date", { ascending: true, nullsFirst: false })
      .limit(12)
      .returns<TaskRecord[]>(),
    supabase
      .from("tasks")
      .select("*")
      .eq("user_id", OWNER_ID)
      .eq("status", "done")
      .gte("completed_at", dayStart.toISOString())
      .lt("completed_at", dayEnd.toISOString())
      .order("completed_at", { ascending: true })
      .returns<TaskRecord[]>(),
  ]);

  if (summariesError || reportsError || eventsError || entriesError || openTasksError || completedTasksError) {
    throw summariesError || reportsError || eventsError || entriesError || openTasksError || completedTasksError;
  }

  return {
    summaries: summaries || [],
    priorEods: priorEods || [],
    events: events || [],
    entries: entries || [],
    openTasks: openTasks || [],
    completedTasks: completedTasks || [],
  } satisfies ReportContext;
}

function formatEvents(events: CalendarEventRecord[], timeZone: string) {
  if (events.length === 0) {
    return "No calendar events for this day.";
  }

  return events
    .map((event) => {
      const range = event.all_day
        ? "All day"
        : `${event.start_time ? getLocalTimeLabel(event.start_time, timeZone) : "unknown start"} → ${event.end_time ? getLocalTimeLabel(event.end_time, timeZone) : "unknown end"}`;
      return `- ${event.title || "(Untitled event)"} — ${range}`;
    })
    .join("\n");
}

function formatEntries(entries: EntryRecord[], timeZone: string) {
  if (entries.length === 0) {
    return "No entries captured for this day.";
  }

  return entries
    .map((entry) => `- [${getLocalTimeLabel(entry.created_at, timeZone)}] ${entry.content}`)
    .join("\n");
}

function formatOpenTasks(tasks: TaskRecord[]) {
  if (tasks.length === 0) return "None."
  return tasks
    .map((task) => {
      const due = task.due_local_date ? ` due ${task.due_local_date}` : ''
      const project = task.project_slug ? ` [${task.project_slug}]` : ''
      return `- ${task.title}${project}${due} (${task.status})`
    })
    .join('\n')
}

function formatCompletedTasks(tasks: TaskRecord[], timeZone: string) {
  if (tasks.length === 0) return "None."
  return tasks
    .map((task) => {
      const project = task.project_slug ? ` [${task.project_slug}]` : ''
      const when = task.completed_at ? ` — done at ${getLocalTimeLabel(task.completed_at, timeZone)}` : ''
      return `- ${task.title}${project}${when}`
    })
    .join('\n')
}

export function buildEodPrompt(localDate: string, timeZone: string, context: ReportContext) {
  const recentSummaries = context.summaries.length
    ? context.summaries.map((s) => `Week of ${s.week_start}\n${s.content}`).join("\n\n")
    : "No weekly summaries yet.";
  const priorReports = context.priorEods.length
    ? context.priorEods.map((r) => `${r.local_date}\n${r.content}`).join("\n\n")
    : "No prior EOD reports yet.";

  return [
    OWNER_PROFILE,
    `Target local date: ${localDate}`,
    `Recent weekly summaries:\n${recentSummaries}`,
    `Last end-of-day reports:\n${priorReports}`,
    `Tasks completed today:\n${formatCompletedTasks(context.completedTasks, timeZone)}`,
    `Remaining open tasks (backlog):\n${formatOpenTasks(context.openTasks)}`,
    `Today's calendar events:\n${formatEvents(context.events, timeZone)}`,
    `Today's entries (voice logs, chronological):\n${formatEntries(context.entries, timeZone)}`,
  ].join("\n\n");
}

export function buildMorningPrompt(localDate: string, timeZone: string, yesterdayReport: ReportRecord | null, context: ReportContext) {
  const todayTasks = context.openTasks.filter((t) => t.due_local_date === localDate)
  const backlogTasks = context.openTasks.filter((t) => t.due_local_date !== localDate)

  return [
    OWNER_PROFILE,
    `Target local date: ${localDate}`,
    `Yesterday's end-of-day report:\n${yesterdayReport?.content || "No EOD report for yesterday."}`,
    `Tasks due today:\n${formatOpenTasks(todayTasks)}`,
    `Backlog (not due today):\n${formatOpenTasks(backlogTasks.slice(0, 8))}`,
    `Today's calendar events:\n${formatEvents(context.events, timeZone)}`,
  ].join("\n\n");
}
