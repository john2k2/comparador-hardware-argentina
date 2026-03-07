import type { Metadata } from 'next';
import { requireAdminPageAccess } from '@/lib/server/admin-auth';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAdminPageAccess('/admin');
  return children;
}
