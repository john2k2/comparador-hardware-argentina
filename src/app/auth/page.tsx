import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { buildNoIndexMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildNoIndexMetadata({
  path: '/auth',
  title: 'Auth',
  description: 'Iniciar sesion para guardar favoritos y alertas de precio.',
});

export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthScreen />
    </Suspense>
  );
}
