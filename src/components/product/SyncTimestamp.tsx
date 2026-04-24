'use client';

import { useEffect, useState } from 'react';

type SyncTimestampProps = {
  timestamp: number;
};

export function SyncTimestamp({ timestamp }: SyncTimestampProps) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (timestamp <= 0) {
      setLabel('N/D');
      return;
    }

    const date = new Date(timestamp);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    setLabel(`${day}/${month} ${hours}:${minutes}`);
  }, [timestamp]);

  if (!label) {
    return <span suppressHydrationWarning>ACT: ...</span>;
  }

  return <span suppressHydrationWarning>{`ACT: ${label}`}</span>;
}
