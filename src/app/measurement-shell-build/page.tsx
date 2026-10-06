import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { MeasurementDashboardLoader } from '@/components/measurement/MeasurementDashboardLoader';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Seguimiento del proyecto', robots: { index: false, follow: false } };

// Sólo genera la interfaz vacía durante el build en Node. La entrada del Worker
// bloquea esta ruta y el archivo; /admin/seguimiento valida administrador antes
// de servirlo. Ninguna cifra ni credencial entra al documento generado.
export default function MeasurementShellPage() {
  if (process.env.MEASUREMENT_SHELL_BUILD !== '1') notFound();
  return <MeasurementDashboardLoader />;
}
