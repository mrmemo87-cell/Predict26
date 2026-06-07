"use client";

import { useSyncExternalStore } from "react";

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

// World Cup 2026 starts June 11, 2026
const TARGET_DATE = new Date("2026-06-11T00:00:00Z").getTime();

function calculateTimeLeft(): TimeLeft {
  const now = Date.now();
  const difference = TARGET_DATE - now;

  if (difference <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  return {
    days: Math.floor(difference / (1000 * 60 * 60 * 24)),
    hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((difference / (1000 * 60)) % 60),
    seconds: Math.floor((difference / 1000) % 60),
  };
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

function TimeBlock({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="bg-surface border border-surface-border rounded-xl px-4 py-3 md:px-6 md:py-4 min-w-[70px] md:min-w-[90px]">
        <span className="text-3xl md:text-5xl font-bold gold-text-gradient font-mono">
          {String(value).padStart(2, "0")}
        </span>
      </div>
      <span className="text-xs md:text-sm text-gray-400 mt-2 uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}

export default function CountdownTimer() {
  const seconds = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // Use seconds to trigger re-render every second
  const isClient = seconds !== 0;
  const timeLeft = isClient ? calculateTimeLeft() : { days: 0, hours: 0, minutes: 0, seconds: 0 };

  return (
    <div className="flex gap-3 md:gap-4 justify-center" suppressHydrationWarning>
      <TimeBlock value={timeLeft.days} label="Days" />
      <TimeBlock value={timeLeft.hours} label="Hours" />
      <TimeBlock value={timeLeft.minutes} label="Minutes" />
      <TimeBlock value={timeLeft.seconds} label="Seconds" />
    </div>
  );
}
