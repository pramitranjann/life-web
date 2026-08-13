import { redirect } from 'next/navigation'

import { HistoryClient } from '@/components/life/HistoryClient'
import { isAdminSession } from '@/lib/admin-auth'
import { getDayDetail, getHistorySnapshot } from '@/lib/life/history'
import { getOwnerSettings } from '@/lib/life/settings'
import { getCurrentLocalDate } from '@/lib/life/time'

export default async function LifeHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; date?: string }>
}) {
  if (!(await isAdminSession())) {
    redirect('/login?next=/history')
  }

  const params = await searchParams
  const settings = await getOwnerSettings()
  const query = (params.q || '').trim()
  const snapshot = await getHistorySnapshot(query)
  const selectedDate =
    params.date || snapshot.days[0]?.localDate || getCurrentLocalDate(settings.timezone)
  const detail = await getDayDetail(selectedDate)

  return (
    <HistoryClient
      initialQuery={query}
      initialPayload={{
        timezone: settings.timezone,
        selectedDate,
        days: snapshot.days,
        detail,
      }}
    />
  )
}
