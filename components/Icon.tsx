'use client';
import type { ReactNode } from 'react';

// One line-icon set shared by the sidebar nav and the Studio stat cards, so the
// app speaks a single icon language instead of a drift of emoji and glyphs.
//
// Every icon is drawn on the same 24 grid with round caps/joins and NO fill, and
// strokes in `currentColor` — which is what makes them theme-proof: a nav item
// passes its own colour down (picking up --accent when active), and a stat tile
// passes its status colour, with no second copy per theme.

export type IconName =
  | 'grid'        // Dashboard — four panes
  | 'document'    // Content — a doc with lines
  | 'search'      // Research / In Review — magnifier
  | 'playSquare'  // Studio — play in a rounded square
  | 'archive'     // Assets — a drawer/box
  | 'film'        // Trial Reels — film strip
  | 'stack'       // Clip Library — stacked cards
  | 'scissors'    // Clippers
  | 'mail'        // Inbox
  | 'power'       // Sign out
  | 'clock'       // Overdue
  | 'revision'    // Awaiting revision — counter-clockwise arrow
  | 'check'       // Approved / ready to post
  | 'folder'      // A linked Drive folder
  | 'list'        // List view
  | 'filter'      // Filter menu — funnel
  | 'sort'        // Sort menu — up/down arrows
  | 'wallet'      // Finance — a card wallet
  | 'coins'       // Money owed / outstanding
  | 'trash';      // Destructive action

const PATHS: Record<IconName, ReactNode> = {
  grid: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.8" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.8" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.8" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.8" />
    </>
  ),
  document: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3.2" />
      <path d="M7.5 10h9M7.5 14h5.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.75" />
      <path d="m20.5 20.5-4.2-4.2" />
    </>
  ),
  playSquare: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="4.2" />
      <path d="M10.25 8.6 15.5 12l-5.25 3.4z" />
    </>
  ),
  archive: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3.2" />
      <path d="M3 9.25h18" />
    </>
  ),
  film: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3.2" />
      <path d="M8 4v16M16 4v16M3 12h18" />
    </>
  ),
  stack: (
    <>
      <rect x="8" y="8" width="13" height="13" rx="3.2" />
      <path d="M16 8V6.2A3.2 3.2 0 0 0 12.8 3H6.2A3.2 3.2 0 0 0 3 6.2v6.6A3.2 3.2 0 0 0 6.2 16H8" />
    </>
  ),
  scissors: (
    <>
      <circle cx="6" cy="6" r="2.75" />
      <circle cx="6" cy="18" r="2.75" />
      <path d="M20 4 8.12 15.88M14.47 14.47 20 20M8.12 8.12 12 12" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3.2" />
      <path d="m3.8 8 6.9 4.6a2.4 2.4 0 0 0 2.6 0L20.2 8" />
    </>
  ),
  power: (
    <>
      <path d="M12 3v8.5" />
      <path d="M18.36 6.64a9 9 0 1 1-12.72 0" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.75" />
      <path d="M12 6.75V12l3.4 2" />
    </>
  ),
  revision: (
    <>
      <path d="M3.5 6v5.5H9" />
      <path d="M3.9 11.5a8.5 8.5 0 1 1 1.7 6" />
    </>
  ),
  check: <path d="m5 12.6 4.8 4.7L19 6.9" />,
  folder: (
    <path d="M3 7.2A2.7 2.7 0 0 1 5.7 4.5h3.1a2 2 0 0 1 1.55.74l1.05 1.3a2 2 0 0 0 1.55.74h5.35A2.7 2.7 0 0 1 21 9.98v6.32a2.7 2.7 0 0 1-2.7 2.7H5.7A2.7 2.7 0 0 1 3 16.3z" />
  ),
  list: <path d="M4 6.5h16M4 12h16M4 17.5h16" />,
  filter: <path d="M3.6 5.4h16.8l-6.6 7.9v5.4l-3.6 2.1v-7.5z" />,
  sort: (
    <>
      <path d="M7 20V4.6M3.6 8 7 4.6 10.4 8" />
      <path d="M17 4v15.4M13.6 16 17 19.4 20.4 16" />
    </>
  ),
  wallet: (
    <>
      <path d="M3 7.6A2.6 2.6 0 0 1 5.6 5h11.2A2.6 2.6 0 0 1 19.4 7.6v1.1" />
      <path d="M3 7.6v8.8A2.6 2.6 0 0 0 5.6 19h12.8a2.6 2.6 0 0 0 2.6-2.6v-5.2a2.6 2.6 0 0 0-2.6-2.6H5.6A2.6 2.6 0 0 1 3 6" />
      <path d="M16.8 13.3h.01" />
    </>
  ),
  coins: (
    <>
      <ellipse cx="12" cy="6.4" rx="7.5" ry="3.1" />
      <path d="M4.5 6.4v5.2c0 1.71 3.36 3.1 7.5 3.1s7.5-1.39 7.5-3.1V6.4" />
      <path d="M4.5 11.6v5.2c0 1.71 3.36 3.1 7.5 3.1s7.5-1.39 7.5-3.1v-5.2" />
    </>
  ),
  trash: (
    <>
      <path d="M4 6.5h16" />
      <path d="M9.5 6.5V5.2A1.7 1.7 0 0 1 11.2 3.5h1.6a1.7 1.7 0 0 1 1.7 1.7v1.3" />
      <path d="M6.2 6.5 7 18.4a2.2 2.2 0 0 0 2.2 2.1h5.6a2.2 2.2 0 0 0 2.2-2.1l.8-11.9" />
      <path d="M10.5 10.5v6M13.5 10.5v6" />
    </>
  ),
};

export default function Icon({
  name,
  size = 16,
  strokeWidth = 1.75,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {PATHS[name]}
    </svg>
  );
}
