import {
  EOD_SYSTEM_PROMPT,
  MORNING_SYSTEM_PROMPT,
  OWNER_ID,
  WEEKLY_SYSTEM_PROMPT,
  WEEK_AHEAD_SYSTEM_PROMPT,
} from '@/lib/life/constants'
import { callClaude } from '@/lib/life/claude'
import { buildEodPrompt, buildMorningPrompt, loadDailyContext } from '@/lib/life/report-context'
import { syncCalendarEvents } from '@/lib/life/calendar'
import { sendReportEmail } from '@/lib/life/email'
import { getOwnerSettings } from '@/lib/life/settings'
import { getSupabaseAdmin } from '@/lib/life/supabase'
import { getWeeklyTaskSnapshot, syncTasksFromReport } from '@/lib/life/tasks'
import { addDays, getCurrentLocalClock, getCurrentLocalDate, getWeekStart, isMorningBriefWindow } from '@/lib/life/time'

export async function getExistingReport(localDate: string, type: "eod" | "morning") {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("user_id", OWNER_ID)
    .eq("local_date", localDate)
    .eq("type", type)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function generateEodReport(options?: { localDate?: string; force?: boolean }) {
  const settings = await getOwnerSettings();
  const timeZone = settings.timezone;
  const localDate = options?.localDate || getCurrentLocalDate(timeZone);
  const force = Boolean(options?.force);
  const clock = getCurrentLocalClock(timeZone);

  if (!force && (clock.hour !== settings.eod_hour || clock.minute !== settings.eod_minute)) {
    return {
      skipped: true,
      reason: "Not in scheduled EOD window.",
      localDate,
      timeZone,
    };
  }

  const existing = await getExistingReport(localDate, "eod");
  if (existing) {
    return {
      skipped: true,
      reason: "EOD already exists for this date.",
      localDate,
      timeZone,
      report: existing,
    };
  }

  await syncCalendarEvents(localDate, undefined, { force: true });
  const context = await loadDailyContext(localDate, timeZone);

  if (context.completedTasks.length === 0 && !force) {
    return {
      skipped: true,
      reason: "No tasks completed today — nothing to report.",
      localDate,
      timeZone,
    };
  }

  const markdown = await callClaude({
    system: EOD_SYSTEM_PROMPT,
    user: buildEodPrompt(localDate, timeZone, context),
    maxTokens: 1400,
  });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("reports")
    .upsert(
      {
        user_id: OWNER_ID,
        type: "eod",
        content: markdown,
        local_date: localDate,
      },
      { onConflict: "user_id,type,local_date" },
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  await syncTasksFromReport({
    localDate,
    sourceType: 'eod',
    reportId: data.id,
    reportContent: markdown,
  })

  void sendReportEmail(`EOD — ${localDate}`, markdown);

  return {
    skipped: false,
    localDate,
    timeZone,
    report: data,
  };
}

export async function generateMorningBrief(options?: { localDate?: string; force?: boolean }) {
  const settings = await getOwnerSettings();
  const timeZone = settings.timezone;
  const localDate = options?.localDate || getCurrentLocalDate(timeZone);
  const force = Boolean(options?.force);

  if (!force && !isMorningBriefWindow(timeZone)) {
    return {
      skipped: true,
      reason: "Morning brief window has passed.",
      localDate,
      timeZone,
    };
  }

  const existing = await getExistingReport(localDate, "morning");
  if (existing) {
    return {
      skipped: true,
      reason: "Morning brief already exists for this date.",
      localDate,
      timeZone,
      report: existing,
    };
  }

  await syncCalendarEvents(localDate, undefined, { force: true });
  const yesterday = addDays(localDate, -1);
  const supabase = getSupabaseAdmin();
  const { data: yesterdayReport, error: yesterdayError } = await supabase
    .from("reports")
    .select("*")
    .eq("user_id", OWNER_ID)
    .eq("local_date", yesterday)
    .eq("type", "eod")
    .maybeSingle();

  if (yesterdayError) {
    throw yesterdayError;
  }

  const context = await loadDailyContext(localDate, timeZone);
  const tasksDueToday = context.openTasks.filter((t) => t.due_local_date === localDate);

  if (tasksDueToday.length < 3 && !force) {
    return {
      skipped: true,
      reason: `Only ${tasksDueToday.length} task(s) due today — morning brief threshold not met (need ≥ 3).`,
      localDate,
      timeZone,
    };
  }

  const markdown = await callClaude({
    system: MORNING_SYSTEM_PROMPT,
    user: buildMorningPrompt(localDate, timeZone, yesterdayReport, context),
    maxTokens: 800,
  });

  const { data, error } = await supabase
    .from("reports")
    .upsert(
      {
        user_id: OWNER_ID,
        type: "morning",
        content: markdown,
        local_date: localDate,
      },
      { onConflict: "user_id,type,local_date" },
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  await syncTasksFromReport({
    localDate,
    sourceType: 'morning',
    reportId: data.id,
    reportContent: markdown,
  })

  void sendReportEmail(`Morning — ${localDate}`, markdown);

  return {
    skipped: false,
    localDate,
    timeZone,
    report: data,
  };
}

/**
 * Compresses the past week's entries + reports into a `summaries` row.
 * This is durable context that future EOD prompts can reference.
 */
export async function generateWeeklySummary(options?: { localDate?: string; weekStart?: string; force?: boolean }) {
  const settings = await getOwnerSettings();
  const timeZone = settings.timezone;
  const today = options?.localDate || getCurrentLocalDate(timeZone);
  const currentWeekStart = getWeekStart(today);
  const targetWeekStart = options?.weekStart || addDays(currentWeekStart, -7);
  const targetWeekEnd = addDays(targetWeekStart, 6);
  const supabase = getSupabaseAdmin();

  const { data: existing, error: existingError } = await supabase
    .from("summaries")
    .select("*")
    .eq("user_id", OWNER_ID)
    .eq("week_start", targetWeekStart)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existing && !options?.force) {
    return {
      skipped: true,
      reason: "Weekly summary already exists.",
      weekStart: targetWeekStart,
      summary: existing,
    };
  }

  const [{ data: entries, error: entriesError }, { data: reports, error: reportsError }] = await Promise.all([
    supabase
      .from("entries")
      .select("local_date, created_at, content, project_slug")
      .eq("user_id", OWNER_ID)
      .gte("local_date", targetWeekStart)
      .lte("local_date", targetWeekEnd)
      .order("local_date", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("reports")
      .select("local_date, type, content")
      .eq("user_id", OWNER_ID)
      .gte("local_date", targetWeekStart)
      .lte("local_date", targetWeekEnd)
      .order("local_date", { ascending: true }),
  ]);

  if (entriesError || reportsError) {
    throw entriesError || reportsError;
  }

  const input = [
    `Week start: ${targetWeekStart}`,
    `Week end: ${targetWeekEnd}`,
    `Entries:\n${(entries || []).map((entry) => `- ${entry.local_date} ${entry.created_at}${entry.project_slug ? ` [${entry.project_slug}]` : ''}: ${entry.content}`).join("\n") || "No entries."}`,
    `Reports:\n${(reports || []).map((report) => `- ${report.local_date} ${report.type}: ${report.content}`).join("\n\n") || "No reports."}`,
  ].join("\n\n");

  const content = await callClaude({
    system: WEEKLY_SYSTEM_PROMPT,
    user: input,
    maxTokens: 900,
  });

  const { data, error } = await supabase
    .from("summaries")
    .upsert(
      {
        user_id: OWNER_ID,
        week_start: targetWeekStart,
        content,
      },
      { onConflict: "user_id,week_start" },
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return {
    skipped: false,
    weekStart: targetWeekStart,
    summary: data,
  };
}

/**
 * Forward-looking week-ahead briefing for the upcoming Mon–Sun.
 * Written to the `reports` table with type='weekly' and local_date=<upcoming Monday>,
 * then emailed.
 */
export async function generateWeekAheadBrief(options?: {
  localDate?: string
  weekStart?: string
  force?: boolean
}) {
  const settings = await getOwnerSettings()
  const timeZone = settings.timezone
  const today = options?.localDate || getCurrentLocalDate(timeZone)
  const currentWeekStart = getWeekStart(today)
  const targetWeekStart = options?.weekStart || addDays(currentWeekStart, 7)
  const targetWeekEnd = addDays(targetWeekStart, 6)
  const supabase = getSupabaseAdmin()

  if (!options?.force) {
    const { data: existing, error: existingError } = await supabase
      .from('reports')
      .select('*')
      .eq('user_id', OWNER_ID)
      .eq('type', 'weekly')
      .eq('local_date', targetWeekStart)
      .maybeSingle()

    if (existingError) {
      throw existingError
    }

    if (existing) {
      return {
        skipped: true,
        reason: 'Week-ahead brief already exists.',
        weekStart: targetWeekStart,
        report: existing,
      }
    }
  }

  const lastWeekStart = addDays(targetWeekStart, -7)
  const { data: lastWeekSummary } = await supabase
    .from('summaries')
    .select('*')
    .eq('user_id', OWNER_ID)
    .eq('week_start', lastWeekStart)
    .maybeSingle()

  try {
    await syncCalendarEvents(targetWeekStart, targetWeekEnd, { force: true })
  } catch (error) {
    console.error('Week-ahead calendar sync failed', error)
  }

  const { data: upcomingEvents } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('user_id', OWNER_ID)
    .gte('local_date', targetWeekStart)
    .lte('local_date', targetWeekEnd)
    .order('start_time', { ascending: true })

  const weeklyTasks = await getWeeklyTaskSnapshot(targetWeekStart)

  const userInput = [
    `Today: ${today}`,
    `Target week: ${targetWeekStart} → ${targetWeekEnd}`,
    `Last week summary:\n${lastWeekSummary?.content || 'None.'}`,
    `Upcoming events:\n${(upcomingEvents || []).map((ev) => `- ${ev.local_date} ${ev.all_day ? 'all day' : ev.start_time || ''}: ${ev.title || '(untitled)'}`).join('\n') || 'None.'}`,
    `Open tasks:\n${weeklyTasks.openTasks.map((task) => `- ${task.title}${task.project_slug ? ` [${task.project_slug}]` : ''}${task.due_local_date ? ` (due ${task.due_local_date})` : ''}`).join('\n') || 'None.'}`,
  ].join('\n\n')

  const content = await callClaude({
    system: WEEK_AHEAD_SYSTEM_PROMPT,
    user: userInput,
    maxTokens: 1100,
  })

  const { data: weeklyReport, error } = await supabase
    .from('reports')
    .upsert(
      {
        user_id: OWNER_ID,
        type: 'weekly',
        content,
        local_date: targetWeekStart,
      },
      { onConflict: 'user_id,type,local_date' },
    )
    .select('*')
    .single()

  if (error) {
    throw error
  }

  void sendReportEmail(`Week ahead — ${targetWeekStart}`, content)

  return {
    skipped: false,
    weekStart: targetWeekStart,
    report: weeklyReport,
  }
}
