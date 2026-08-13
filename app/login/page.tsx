import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { LifeLoginForm } from '@/components/life/LifeLoginForm'
import { isAdminSession } from '@/lib/admin-auth'

export const metadata: Metadata = {
  title: 'Life Login',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
}

export default async function LifeLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const params = await searchParams
  const nextPath = params.next?.startsWith('/') && !params.next.startsWith('//') ? params.next : '/'

  if (await isAdminSession()) {
    redirect(nextPath as never)
  }

  return (
    <main className="life-login-shell">
      <section className="life-login-card">
        <div className="life-page-head">
          <p className="eyebrow">Life</p>
          <span className="count-pill">Private</span>
        </div>
        <h1 className="life-login-title">Enter</h1>
        <p className="muted-text">Use your Life password.</p>
        <LifeLoginForm nextPath={nextPath} />
      </section>
    </main>
  )
}
