import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthCallbackScreen } from '@/components/auth/AuthCallbackScreen';

export const metadata: Metadata = {
  title: 'Auth Callback',
  description: 'Procesando inicio de sesion.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <AuthCallbackScreen />
    </Suspense>
  );
}
