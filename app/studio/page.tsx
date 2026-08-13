import { redirect } from 'next/navigation'

import { StudioClient } from '@/components/life/studio/StudioClient'
import { isAdminSession } from '@/lib/admin-auth'
import { listProjectsClient } from '@/lib/life/projects-db'
import { listStudioItems } from '@/lib/life/studio'

export default async function LifeStudioPage() {
  if (!(await isAdminSession())) {
    redirect('/login?next=/studio')
  }

  const [items, projects] = await Promise.all([
    listStudioItems().catch(() => []),
    listProjectsClient(),
  ])

  return <StudioClient initialItems={items} projects={projects} />
}
