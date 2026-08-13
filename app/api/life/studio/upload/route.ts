import { NextRequest, NextResponse } from 'next/server'

import { isAuthenticatedLifeRequest, unauthorizedJson } from '@/lib/life/auth'
import { uploadStudioImage } from '@/lib/life/studio'

function splitTags(value: FormDataEntryValue | null) {
  return typeof value === 'string'
    ? value.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean)
    : []
}

export async function POST(request: NextRequest) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No image file provided.' }, { status: 400 })
    }

    const title = typeof formData.get('title') === 'string' ? String(formData.get('title')) : null
    const projectSlug = typeof formData.get('projectSlug') === 'string' ? String(formData.get('projectSlug')) : null
    const item = await uploadStudioImage({
      file,
      title,
      projectSlug,
      tags: splitTags(formData.get('tags')),
    })

    return NextResponse.json({ item })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to upload image.' }, { status: 500 })
  }
}
