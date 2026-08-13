import { marked } from 'marked'
import { Resend } from 'resend'

import { getLifeServerEnv } from '@/lib/life/env'

export async function sendReportEmail(subject: string, markdown: string) {
  const { resendApiKey, ownerEmail } = getLifeServerEnv()
  const resend = new Resend(resendApiKey)

  try {
    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: ownerEmail,
      subject,
      html: `
        <main style="font-family: Georgia, serif; max-width: 680px; margin: 0 auto; padding: 24px; color: #1d2838;">
          ${marked.parse(markdown, { breaks: true, gfm: true })}
        </main>
      `,
    })
  } catch (error) {
    console.error('Failed to send report email', error)
  }
}

export async function sendLifeNotificationEmail(input: {
  title: string
  body: string
  url?: string | null
}) {
  const markdown = [
    `# ${input.title}`,
    input.body,
    input.url ? `[Open the program page](${input.url})` : null,
  ].filter(Boolean).join('\n\n')

  await sendReportEmail(`PR Life alert — ${input.title}`, markdown)
}
