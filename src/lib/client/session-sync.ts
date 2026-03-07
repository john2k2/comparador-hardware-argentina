import type { Session } from '@supabase/supabase-js';

type SessionPayload = {
  accessToken: string;
  expiresAt: number | null;
};

export async function syncServerSession(session: Session | null): Promise<void> {
  if (typeof window === 'undefined') return;

  if (!session?.access_token) {
    await fetch('/api/auth/session', {
      method: 'DELETE',
      credentials: 'same-origin',
      cache: 'no-store',
    }).catch(() => undefined);
    return;
  }

  const payload: SessionPayload = {
    accessToken: session.access_token,
    expiresAt: typeof session.expires_at === 'number' ? session.expires_at : null,
  };

  await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}
