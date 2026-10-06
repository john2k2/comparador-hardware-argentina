import type { Metadata } from 'next';
import { requireAdminPageAccess } from '@/lib/server/admin-auth';
import { MeasurementDashboardLoader } from '@/components/measurement/MeasurementDashboardLoader';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Seguimiento del proyecto',
  description: 'Panel privado de métricas, conexiones y decisiones del comparador.',
  robots: { index: false, follow: false },
};

export default async function MeasurementPage() {
  // La página protege los datos antes de leerlos; el layout no es la frontera de autorización.
  await requireAdminPageAccess('/admin/seguimiento');
  return <MeasurementDashboardLoader />;
}
