import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Content OS",
  description: "Nathan Nazareth — Content Operating System",
};

// Set the theme before first paint to avoid a flash. Defaults to light "aurora".
const themeScript = `(function(){try{var t=localStorage.getItem('nathan_theme');if(t!=='midnight'&&t!=='aurora')t='aurora';document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','aurora');}})();`;

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
      <body>{children}</body>
    </html>
  );
}
