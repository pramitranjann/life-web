import { redirect } from 'next/navigation'

import { ReportClient } from '@/components/life/ReportClient'
import { isAdminSession } from '@/lib/admin-auth'
import { OWNER_ID } from '@/lib/life/constants'
import { loadDailyContext } from '@/lib/life/report-context'
import { getOwnerSettings } from '@/lib/life/settings'
import { getSupabaseAdmin } from '@/lib/life/supabase'
import { getCurrentLocalDate } from '@/lib/life/time'
import type { ReportRecord } from '@/lib/life/types'

export default async function LifeReportPage() {
  if (!(await isAdminSession())) {
    redirect('/login?next=/report')
  }

  const settings = await getOwnerSettings()
  const timezone = settings.timezone
  const localDate = getCurrentLocalDate(timezone)
  const supabase = getSupabaseAdmin()

  const { data } = await supabase
    .from('reports')
    .select('*')
    .eq('user_id', OWNER_ID)
    .order('local_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(14)
    .returns<ReportRecord[]>()

  const reports = data || []
  const todayEod = reports.find((report) => report.local_date === localDate && report.type === 'eod')
  const selectedId =
    todayEod?.id || reports.find((report) => report.type === 'eod')?.id || reports[0]?.id || null
  const selectedReport = reports.find((report) => report.id === selectedId) || null
  const initialDetail = selectedReport
    ? await loadDailyContext(selectedReport.local_date, timezone).then((context) => ({
        report: selectedReport,
        entries: context.entries,
        events: context.events,
        openTasks: context.openTasks,
        completedTasks: context.completedTasks,
      }))
    : null

  return (
    <ReportClient
      initialList={{ localDate, timezone, reports }}
      initialSelectedId={selectedId}
      initialDetail={initialDetail}
    />
  )
}
