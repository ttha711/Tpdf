import type { ReactNode } from "react";

export type ShellIconName = "file" | "save" | "search" | "comments" | "eye" | "undo" |
  "redo" | "tools" | "chevron" | "pages" | "close" | "pen" | "more" | "check";
export function AppShellIcon({ name, size = 22 }: { name: ShellIconName; size?: number }) {
  const content: Record<ShellIconName, ReactNode> = {
    file: <><path d="M6 3h9l5 5v13H6z"/><path d="M15 3v6h5M9 13h8M9 17h6"/></>,
    save: <><path d="M4 3h14l3 3v15H3V3z"/><path d="M7 3v7h10V3M7 21v-8h10v8"/></>,
    search: <><circle cx="10.8" cy="10.8" r="7.2"/><path d="m16 16 5.5 5.5"/></>,
    comments: <path d="M4 4h16v12h-9l-5 4v-4H4zM7 9h1m3 0h1m3 0h1"/>,
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></>,
    undo: <><path d="M9 7 4 12l5 5M4 12h10a6 6 0 0 1 0 12"/></>,
    redo: <><path d="m15 7 5 5-5 5m5-5H10a6 6 0 0 0 0 12"/></>,
    tools: <><path d="m4 20 3-1 12-12-3-3L4 16zM14 6l3 3"/></>,
    chevron: <path d="m6 9 6 6 6-6"/>,
    pages: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 3v18M11 7h6M11 11h6"/></>,
    close: <path d="M5 5 19 19M19 5 5 19"/>,
    pen: <><path d="m4 20 4-1 12-12-3-3L5 16zM14 6l4 4"/></>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    check: <path d="m4 12 5 5L20 6"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true">{content[name]}</svg>;
}
