import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthScreen } from '@/components/auth/AuthScreen';

export const metadata: Metadata = {
  title: 'Auth',
  description: 'Iniciar sesion para guardar favoritos y alertas de precio.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthScreen />
    </Suspense>
  );
}
