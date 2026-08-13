import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'

import { LifeHeader } from '@/components/life/LifeHeader'
import { LifeProjectsProvider } from '@/components/life/LifeProjectsProvider'
import { LifeToaster } from '@/components/life/ui/LifeToast'
import { isAdminSession } from '@/lib/admin-auth'
import { listProjectsClient } from '@/lib/life/projects-db'
import type { LifeProjectClient } from '@/lib/life/types'

import './globals.css'

const clashDisplay = localFont({
  src: './fonts/clash-display/ClashDisplay-Variable.woff2',
  weight: '200 700',
  variable: '--font-clash-display',
  display: 'swap',
})

const cabinetGrotesk = localFont({
  src: [
    { path: './fonts/cabinet-grotesk/CabinetGrotesk-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/cabinet-grotesk/CabinetGrotesk-Medium.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-cabinet-grotesk',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://life.pramitranjan.com'),
  applicationName: 'Life',
  title: {
    default: 'Life',
    template: '%s | Life',
  },
  description: 'Pramit Ranjan’s private personal operating system.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Life',
    statusBarStyle: 'black-translucent',
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let projects: LifeProjectClient[] = []
  if (await isAdminSession()) {
    try {
      projects = await listProjectsClient()
    } catch (error) {
      console.error('Failed to load projects for layout context', error)
    }
  }

  return (
    <html lang="en" className={`${clashDisplay.variable} ${cabinetGrotesk.variable}`} suppressHydrationWarning>
      <body>
        <div className="life-shell">
          <LifeProjectsProvider projects={projects}>
            <div className="life-app-shell">
              <LifeHeader />
              <main className="content-shell">{children}</main>
            </div>
            <LifeToaster />
          </LifeProjectsProvider>
        </div>
      </body>
    </html>
  )
}
