'use client';

import { formatSyncTimestamp } from '@/lib/ui/sync-timestamp';

type SyncTimestampProps = {
  timestamp: number;
};

export function SyncTimestamp({ timestamp }: SyncTimestampProps) {
  return <span>{`ACT: ${formatSyncTimestamp(timestamp)}`}</span>;
}
