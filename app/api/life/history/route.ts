import { NextRequest, NextResponse } from "next/server";

import { isAuthenticatedLifeRequest, unauthorizedJson } from '@/lib/life/auth'
import { getHistorySnapshot, getDayDetail } from '@/lib/life/history'
import { getOwnerSettings } from '@/lib/life/settings'
import { getCurrentLocalDate } from '@/lib/life/time'

export async function GET(request: NextRequest) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson();
  }

  const search = request.nextUrl.searchParams.get("q") || "";
  const settings = await getOwnerSettings();
  const localDate = request.nextUrl.searchParams.get("date") || getCurrentLocalDate(settings.timezone);

  try {
    const snapshot = await getHistorySnapshot(search);
    const detail = await getDayDetail(localDate);

    return NextResponse.json({
      timezone: settings.timezone,
      search,
      selectedDate: localDate,
      days: snapshot.days,
      detail,
    });
  } catch (error) {
    console.error("History fetch failed", error);
    return NextResponse.json({ error: "History fetch failed." }, { status: 500 });
  }
}
