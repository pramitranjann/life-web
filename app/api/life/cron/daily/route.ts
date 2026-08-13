import { NextRequest, NextResponse } from "next/server";

import { isAuthenticatedLifeRequest, unauthorizedJson } from '@/lib/life/auth'
import { syncCalendarEvents } from '@/lib/life/calendar'
import { runProgramApplicationChecks } from '@/lib/life/program-application-monitor'
import { generateEodReport, generateWeekAheadBrief, generateWeeklySummary } from '@/lib/life/synthesis'
import { getOwnerSettings } from '@/lib/life/settings'
import { getCurrentLocalDate } from '@/lib/life/time'

function getLocalDayOfWeek(localDate: string): number {
  const [y, m, d] = localDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay()
}

export async function GET(request: NextRequest) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson();
  }

  try {
    const settings = await getOwnerSettings()
    const localDate = getCurrentLocalDate(settings.timezone)
    const applicationsPromise = runProgramApplicationChecks()
    const calendar = await syncCalendarEvents(localDate, undefined, { force: true })
    const eod = await generateEodReport({ localDate })
    const weekly = await generateWeeklySummary({ localDate })

    // Sunday (local time): generate and email the forward-looking week-ahead brief.
    const dow = getLocalDayOfWeek(localDate)
    const brief = dow === 0
      ? await generateWeekAheadBrief({ localDate })
      : { skipped: true as const, reason: 'Not Sunday.' }
    const applications = await applicationsPromise

    return NextResponse.json({
      localDate,
      timezone: settings.timezone,
      calendar,
      eod,
      weekly,
      brief,
      applications,
    })
  } catch (error) {
    console.error("Daily life cron failed", error);
    return NextResponse.json({ error: "Daily life cron failed." }, { status: 500 });
  }
}
