import { NextRequest, NextResponse } from "next/server";

import { isAuthenticatedLifeRequest, unauthorizedJson } from '@/lib/life/auth'
import { generateWeekAheadBrief, generateWeeklySummary } from '@/lib/life/synthesis'

export async function POST(request: NextRequest) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson();
  }

  const contentType = request.headers.get('content-type') || ''
  const isJsonRequest = contentType.includes('application/json')
  let localDate: string | undefined
  let weekStart: string | undefined
  let force: boolean | undefined
  let redirectTo = '/month'

  if (isJsonRequest) {
    const body = (await request.json().catch(() => null)) as { localDate?: string; weekStart?: string; force?: boolean } | null
    localDate = body?.localDate
    weekStart = body?.weekStart
    force = body?.force
  } else {
    const formData = await request.formData().catch(() => null)
    localDate = typeof formData?.get('localDate') === 'string' ? String(formData.get('localDate')) : undefined
    weekStart = typeof formData?.get('weekStart') === 'string' ? String(formData.get('weekStart')) : undefined
    force = formData?.get('force') === 'true'
    redirectTo = typeof formData?.get('redirectTo') === 'string' ? String(formData.get('redirectTo')) : redirectTo
  }

  try {
    const summary = await generateWeeklySummary({
      localDate,
      weekStart,
      force,
    });
    const brief = await generateWeekAheadBrief({
      localDate,
      force,
    });

    if (!isJsonRequest) {
      return NextResponse.redirect(new URL(redirectTo.startsWith('/') ? redirectTo : '/month', request.url), {
        status: 303,
      })
    }

    return NextResponse.json({ summary, brief }, { status: summary.skipped && brief.skipped ? 202 : 200 });
  } catch (error) {
    console.error("Weekly synthesis failed", error);
    if (!isJsonRequest) {
      const url = new URL(redirectTo.startsWith('/') ? redirectTo : '/month', request.url)
      url.searchParams.set('error', 'Weekly synthesis failed.')
      return NextResponse.redirect(url, { status: 303 })
    }
    return NextResponse.json({ error: "Weekly synthesis failed." }, { status: 500 });
  }
}
