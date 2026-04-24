import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { buildNoIndexMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildNoIndexMetadata({
  path: '/auth',
  title: 'Cuenta de usuario',
  description: 'Iniciá sesión o creá tu cuenta para guardar favoritos, preparar alertas de precio y volver rápido a tus productos de hardware comparados.',
});

export default function AuthPage() {
  return (
    <>
      <h1 className="sr-only">Entrar o crear cuenta</h1>
      <Suspense fallback={null}>
        <AuthScreen />
      </Suspense>
    </>
  );
}
