'use client';

import { useMemo } from 'react';

type SyncTimestampProps = {
  timestamp: number;
};

function formatTimestamp(timestamp: number): string {
  if (timestamp <= 0) {
    return 'N/D';
  }

  const date = new Date(timestamp);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month} ${hours}:${minutes}`;
}

export function SyncTimestamp({ timestamp }: SyncTimestampProps) {
  const label = useMemo(() => formatTimestamp(timestamp), [timestamp]);

  return <span suppressHydrationWarning>{`ACT: ${label}`}</span>;
}
