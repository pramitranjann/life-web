import { UiLab } from '@/components/life/UiLab'
import { isAdminSession } from '@/lib/admin-auth'
import { redirect } from 'next/navigation'

// Static component playground: no private data and no mutation endpoints.
export default async function LifeUiLabPage() {
  if (!(await isAdminSession())) {
    redirect('/login?next=/ui-lab')
  }

  return <UiLab />
}
