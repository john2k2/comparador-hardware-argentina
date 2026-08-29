export function formatSyncTimestamp(timestamp: number): string {
  if (timestamp <= 0) {
    return 'N/D';
  }

  const parts = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(timestamp));

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    (parts.find((part) => part.type === type)?.value ?? '').padStart(2, '0');

  return `${get('day')}/${get('month')} ${get('hour')}:${get('minute')}`;
}
