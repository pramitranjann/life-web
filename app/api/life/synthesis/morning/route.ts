import { NextRequest, NextResponse } from "next/server";

import { isAuthenticatedLifeRequest, unauthorizedJson } from '@/lib/life/auth'
import { generateMorningBrief } from '@/lib/life/synthesis'

export async function POST(request: NextRequest) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson();
  }

  const body = (await request.json().catch(() => null)) as { localDate?: string; force?: boolean } | null;

  try {
    const result = await generateMorningBrief({
      localDate: body?.localDate,
      force: body?.force,
    });

    return NextResponse.json(result, { status: result.skipped ? 202 : 200 });
  } catch (error) {
    console.error("Morning synthesis failed", error);
    return NextResponse.json({ error: "Morning synthesis failed." }, { status: 500 });
  }
}
