import { NextRequest, NextResponse } from 'next/server'

import { isAuthenticatedLifeRequest, unauthorizedJson } from '@/lib/life/auth'
import { searchLife } from '@/lib/life/search'

export async function GET(request: NextRequest) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  try {
    const query = request.nextUrl.searchParams.get('q') || ''
    const results = await searchLife(query)
    return NextResponse.json(results)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Search failed.' },
      { status: 500 },
    )
  }
}
