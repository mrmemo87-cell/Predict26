"use client";

import { useSyncExternalStore } from "react";

interface MatchCountdownProps {
  kickoffAt: string;
}

function subscribe(callback: () => void) {
  const id = setInterval(callback, 1000);
  return () => clearInterval(id);
}

function getSnapshot() {
  return Math.floor(Date.now() / 1000);
}

function getServerSnapshot() {
  return 0;
}

export default function MatchCountdown({ kickoffAt }: MatchCountdownProps) {
  const seconds = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isClient = seconds !== 0;

  if (!isClient) {
    return <span className="text-sm text-gray-400" aria-label="Loading countdown">Loading...</span>;
  }

  // Use `seconds` (epoch seconds) to derive current time without calling Date.now() during render
  const now = seconds * 1000;
  const target = new Date(kickoffAt).getTime();
  const diff = target - now;

  if (diff <= 0) {
    return <span className="text-sm font-semibold text-gold">LIVE</span>;
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const secs = Math.floor((diff / 1000) % 60);

  if (days > 0) {
    return (
      <span className="text-sm font-mono text-gold" suppressHydrationWarning>
        {days}d {hours}h {minutes}m
      </span>
    );
  }

  return (
    <span className="text-sm font-mono text-gold" suppressHydrationWarning>
      {hours}h {minutes}m {secs}s
    </span>
  );
}
