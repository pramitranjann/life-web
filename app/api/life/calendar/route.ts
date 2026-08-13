import { NextRequest, NextResponse } from "next/server";

import { OWNER_ID } from '@/lib/life/constants'
import { isAuthenticatedLifeRequest, unauthorizedJson } from '@/lib/life/auth'
import { syncCalendarEvents } from '@/lib/life/calendar'
import { getOwnerSettings } from '@/lib/life/settings'
import { getSupabaseAdmin } from '@/lib/life/supabase'
import { getCurrentLocalDate } from '@/lib/life/time'

export async function GET(request: NextRequest) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson();
  }

  const settings = await getOwnerSettings();
  const localDate = request.nextUrl.searchParams.get("date") || getCurrentLocalDate(settings.timezone);

  try {
    await syncCalendarEvents(localDate);
  } catch (error) {
    console.error("Calendar sync failed during read", error);
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("calendar_events")
    .select("*")
    .eq("user_id", OWNER_ID)
    .eq("local_date", localDate)
    .order("start_time", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    localDate,
    timezone: settings.timezone,
    events: data || [],
  });
}
