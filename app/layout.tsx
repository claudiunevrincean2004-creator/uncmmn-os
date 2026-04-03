import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UNCMMN OS",
  description: "Agency Operating System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', fontSize: '13px', background: '#080808', color: '#fff', height: '100vh', overflow: 'hidden' }}>
        {children}
      </body>
    </html>
  );
}
