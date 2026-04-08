'use client';
import { useId } from 'react';

interface Props {
  platform: string;
  size?: number;
}

function InstagramIcon({ size }: { size: number }) {
  const id = useId();
  const gradId = `ig-grad-${id}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <defs>
        <radialGradient id={gradId} cx="30%" cy="107%" r="150%">
          <stop offset="0%" stopColor="#fdf497" />
          <stop offset="5%" stopColor="#fdf497" />
          <stop offset="45%" stopColor="#fd5949" />
          <stop offset="60%" stopColor="#d6249f" />
          <stop offset="90%" stopColor="#285AEB" />
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="6" stroke={`url(#${gradId})`} strokeWidth="2" fill="none" />
      <circle cx="12" cy="12" r="5" stroke={`url(#${gradId})`} strokeWidth="2" fill="none" />
      <circle cx="17.5" cy="6.5" r="1.5" fill={`url(#${gradId})`} />
    </svg>
  );
}

function TikTokIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M16.6 5.82A4.5 4.5 0 0 1 13.5 2h-3v15a3 3 0 1 1-2.1-2.86V10.5a6.5 6.5 0 1 0 5.6 6.5V10a7.5 7.5 0 0 0 4.5 1.5V8a4.5 4.5 0 0 1-1.4-.18Z" fill="#69C9D0" />
      <path d="M15.6 4.82A4.5 4.5 0 0 1 12.5 1h-3v15a3 3 0 1 1-2.1-2.86V9.5a6.5 6.5 0 1 0 5.6 6.5V9a7.5 7.5 0 0 0 4.5 1.5V7a4.5 4.5 0 0 1-1.4-.18Z" fill="#EE1D52" opacity="0.6" />
      <path d="M16.1 5.32A4.5 4.5 0 0 1 13 1.5h-3v15a3 3 0 1 1-2.1-2.86V10a6.5 6.5 0 1 0 5.6 6.5V9.5a7.5 7.5 0 0 0 4.5 1.5V7.5a4.5 4.5 0 0 1-1.4-.18Z" fill="#fff" />
    </svg>
  );
}

function YouTubeIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.94 2C5.12 20 12 20 12 20s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58Z" fill="#FF0000" />
      <path d="m9.75 15.02 5.75-3.27-5.75-3.27v6.54Z" fill="#fff" />
    </svg>
  );
}

export default function PlatformIcon({ platform, size = 16 }: Props) {
  const p = platform.toLowerCase();
  if (p === 'instagram') return <InstagramIcon size={size} />;
  if (p === 'tiktok') return <TikTokIcon size={size} />;
  if (p === 'youtube') return <YouTubeIcon size={size} />;
  return <span style={{ fontSize: size * 0.7, color: '#555' }}>{platform.charAt(0)}</span>;
}
