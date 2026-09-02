import type { Metadata, Viewport } from "next";
import "./globals.css";
import DialogProvider from "@/components/DialogProvider";

export const metadata: Metadata = {
  title: "Content OS",
  description: "Content operations — planning, production, review and delivery.",
  applicationName: "Content OS",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/favicon-16.png", type: "image/png", sizes: "16x16" },
      { url: "/icons/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Content OS",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0C12", // midnight
};

// Set the theme before first paint to avoid a flash. Defaults to light "aurora".
//
// The key was renamed 'nathan_theme' → 'contentos_theme', so this also migrates
// anyone still holding the old key. This script runs before hydration on every
// load, which makes it the right place for the migration: by the time any
// component reads the theme, the new key is already populated.
//
// The read order matters — new key first, legacy only as a fallback — so a
// migrated user is never dragged back to a stale value. If setItem throws
// (private mode, quota) the whole block falls to the catch with the OLD key
// still intact, and the migration simply retries on the next load rather than
// silently losing the preference. removeItem runs only after a successful set.
//
// Keep the key in sync with app/page.tsx, which reads and writes it too.
const themeScript = `(function(){try{var K='contentos_theme',OLD='nathan_theme';var t=localStorage.getItem(K);if(t===null){var legacy=localStorage.getItem(OLD);if(legacy==='midnight'||legacy==='aurora'){localStorage.setItem(K,legacy);t=legacy;}localStorage.removeItem(OLD);}if(t!=='midnight'&&t!=='aurora')t='aurora';document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','aurora');}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="aurora" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {/* App-wide toasts and confirmations, replacing window.alert /
            window.confirm — see components/DialogProvider.tsx. */}
        <DialogProvider>{children}</DialogProvider>
      </body>
    </html>
  );
}
