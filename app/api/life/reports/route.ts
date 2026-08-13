import { NextRequest, NextResponse } from "next/server";

import { OWNER_ID } from '@/lib/life/constants'
import { isAuthenticatedLifeRequest, unauthorizedJson } from '@/lib/life/auth'
import { loadDailyContext } from '@/lib/life/report-context'
import { getOwnerSettings } from '@/lib/life/settings'
import { getSupabaseAdmin } from '@/lib/life/supabase'
import { getCurrentLocalDate } from '@/lib/life/time'
import type { ReportRecord } from '@/lib/life/types'

export async function GET(request: NextRequest) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson();
  }

  const settings = await getOwnerSettings();
  const supabase = getSupabaseAdmin();
  const reportId = request.nextUrl.searchParams.get("id");
  const date = request.nextUrl.searchParams.get("date");
  const type = request.nextUrl.searchParams.get("type");
  const all = request.nextUrl.searchParams.get("all") === 'true';
  const localDate = date || getCurrentLocalDate(settings.timezone);

  if (reportId) {
    const { data: report, error } = await supabase
      .from("reports")
      .select("*")
      .eq("user_id", OWNER_ID)
      .eq("id", reportId)
      .maybeSingle<ReportRecord>();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!report) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }

    try {
      const context = await loadDailyContext(report.local_date, settings.timezone)

      return NextResponse.json({
        timezone: settings.timezone,
        report,
        context: {
          entries: context.entries,
          events: context.events,
          openTasks: context.openTasks,
          completedTasks: context.completedTasks,
        },
      });
    } catch (contextError) {
      console.error("Report detail fetch failed", contextError)
      return NextResponse.json({ error: "Report detail fetch failed." }, { status: 500 })
    }
  }

  let query = supabase
    .from("reports")
    .select("*")
    .eq("user_id", OWNER_ID);

  if (all) {
    query = query
      .order('local_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(14);
  } else {
    if (type) {
      query = query.eq("type", type);
    }
    if (date) {
      query = query.eq("local_date", localDate);
    } else if (type) {
      query = query.order("local_date", { ascending: false }).limit(1);
    } else {
      query = query.eq("local_date", localDate);
    }
    query = query.order("created_at", { ascending: false });
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    localDate,
    timezone: settings.timezone,
    reports: data || [],
  });
}
