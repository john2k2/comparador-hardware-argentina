import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthCallbackScreen } from '@/components/auth/AuthCallbackScreen';
import { buildNoIndexMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildNoIndexMetadata({
  path: '/auth/callback',
  title: 'Auth Callback',
  description: 'Procesando inicio de sesion.',
});

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <AuthCallbackScreen />
    </Suspense>
  );
}
