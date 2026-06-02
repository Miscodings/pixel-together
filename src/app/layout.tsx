import type { Metadata } from 'next'
import { Nunito, JetBrains_Mono } from 'next/font/google'
import { TooltipProvider } from '@/components/ui/tooltip'
import './globals.css'

const hasRealClerkKey =
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_') &&
  !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.includes('placeholder')

// Skip ClerkProvider only in local dev without a real key — never in production
const ClerkProvider = (process.env.NODE_ENV !== 'production' && !hasRealClerkKey)
  ? ({ children }: { children: React.ReactNode }) => <>{children}</>
  : (await import('@clerk/nextjs')).ClerkProvider

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-nunito',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'PixelTogether',
  description: 'Real-time collaborative pixel art',
  keywords: ['pixel art', 'collaborative', 'drawing', 'real-time', 'canvas'],
  openGraph: {
    title: 'PixelTogether',
    description: 'Real-time collaborative pixel art',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${nunito.variable} ${jetbrainsMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col" style={{ fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>
          <TooltipProvider>
            {children}
          </TooltipProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
