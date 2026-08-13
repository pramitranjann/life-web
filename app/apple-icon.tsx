import { ImageResponse } from 'next/og'

// 180x180 is the canonical size iOS uses for the home-screen icon. iOS will
// automatically apply the rounded-square mask, so the artwork is a solid
// edge-to-edge fill (no transparent background — iOS shows black behind any
// transparent pixels, which looks broken).
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#FF3120',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#0a0a0a',
          fontFamily: 'monospace',
          fontSize: 64,
          fontWeight: 700,
          letterSpacing: 4,
        }}
      >
        PR
      </div>
    ),
    { ...size }
  )
}
