import { redirect } from 'next/navigation'

import { LifeCalendarClient } from '@/components/life/LifeCalendarClient'
import { isAdminSession } from '@/lib/admin-auth'
import { getOwnerSettings } from '@/lib/life/settings'
import { getCurrentLocalDate } from '@/lib/life/time'

export default async function LifeMonthPage() {
  if (!(await isAdminSession())) {
    redirect('/login?next=/month')
  }

  const settings = await getOwnerSettings()
  const today = getCurrentLocalDate(settings.timezone)

  return <LifeCalendarClient today={today} timezone={settings.timezone} initialView="month" />
}
