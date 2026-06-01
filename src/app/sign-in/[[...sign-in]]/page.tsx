import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--background)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        flexDirection: 'column',
        gap: '32px',
      }}
    >
      {/* Wordmark */}
      <div style={{ textAlign: 'center' }}>
        <span
          className="wordmark"
          style={{ fontSize: '28px', color: 'var(--primary)' }}
        >
          PixelTogether
        </span>
        <p
          style={{
            fontFamily: 'Nunito, sans-serif',
            fontSize: '14px',
            color: 'var(--muted-foreground)',
            marginTop: '6px',
          }}
        >
          Welcome back — your canvas is waiting
        </p>
      </div>

      {/* Clerk sign-in card with pixel art border wrapper */}
      <div
        className="card-pixel"
        style={{
          backgroundColor: 'var(--card)',
          padding: '4px',
          overflow: 'hidden',
        }}
      >
        <SignIn
          appearance={{
            elements: {
              rootBox: {
                boxShadow: 'none',
                border: 'none',
              },
              card: {
                boxShadow: 'none',
                border: 'none',
                borderRadius: '10px',
                backgroundColor: 'var(--card)',
              },
              headerTitle: {
                fontFamily: 'Nunito, sans-serif',
                fontWeight: 800,
                color: 'var(--foreground)',
              },
              headerSubtitle: {
                fontFamily: 'Nunito, sans-serif',
                color: 'var(--muted-foreground)',
              },
              formButtonPrimary: {
                backgroundColor: 'var(--primary)',
                fontFamily: 'Nunito, sans-serif',
                fontWeight: 700,
                border: '2px solid var(--border)',
                boxShadow: '2px 2px 0px var(--border)',
              },
              footerActionLink: {
                color: 'var(--primary)',
                fontWeight: 700,
              },
            },
          }}
        />
      </div>
    </div>
  )
}
