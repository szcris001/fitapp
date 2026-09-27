import type { Metadata } from 'next'
import { Oxanium, Sora } from 'next/font/google'
import './globals.css'
import Providers from './providers'

// Display / headings — tech-sports feel
const oxanium = Oxanium({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-display',
})

// Body — clean, modern
const sora = Sora({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-body',
})

export const metadata: Metadata = {
  title: 'FitApp — Panel de administración',
  description: 'Sistema de gestión para centros deportivos',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL">
      <body className={`${oxanium.variable} ${sora.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
