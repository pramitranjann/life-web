import { notFound, redirect } from 'next/navigation'

import { PersonDetail } from '@/components/life/people/PersonDetail'
import { isAdminSession } from '@/lib/admin-auth'
import { getPersonById, listInteractions, listOpenTasksForPerson } from '@/lib/life/people'
import { getOwnerSettings } from '@/lib/life/settings'
import { getCurrentLocalDate } from '@/lib/life/time'

export default async function PersonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminSession())) {
    redirect('/login?next=/people')
  }

  const { id } = await params
  const person = await getPersonById(id).catch(() => null)
  if (!person) {
    notFound()
  }

  const settings = await getOwnerSettings()
  const today = getCurrentLocalDate(settings.timezone)

  const [interactions, openTasks] = await Promise.all([
    listInteractions(person.id),
    listOpenTasksForPerson(person.id).catch(() => []),
  ])

  return <PersonDetail person={person} interactions={interactions} openTasks={openTasks} today={today} />
}
