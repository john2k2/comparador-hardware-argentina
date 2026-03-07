import type { Metadata } from 'next';
import { Mail, MessageSquare, Shield } from 'lucide-react';
import { RetroPageShell } from '@/components/layout/RetroPageShell';

export const metadata: Metadata = {
  title: 'Contacto',
  description: 'Canales de contacto y soporte de Comparador Hardware Argentina.',
};

export default function ContactoPage() {
  return (
    <RetroPageShell
      title="CONTACTO"
      subtitle="Canales iniciales de contacto. Luego se completa con formulario y flujo de tickets."
    >
      <div className="grid md:grid-cols-3 gap-4 text-[10px] uppercase text-foreground">
        <div className="border-2 border-border p-4 bg-muted/30">
          <Mail className="w-5 h-5 text-primary mb-3" />
          <p className="text-secondary font-bold mb-2">[ EMAIL ]</p>
          <p className="leading-relaxed">soporte@comparador-hardware.com.ar</p>
        </div>

        <div className="border-2 border-border p-4 bg-muted/30">
          <MessageSquare className="w-5 h-5 text-primary mb-3" />
          <p className="text-secondary font-bold mb-2">[ MENSAJES ]</p>
          <p className="leading-relaxed">Proximamente: formulario integrado de consultas.</p>
        </div>

        <div className="border-2 border-border p-4 bg-muted/30">
          <Shield className="w-5 h-5 text-primary mb-3" />
          <p className="text-secondary font-bold mb-2">[ REPORTES ]</p>
          <p className="leading-relaxed">Para errores de tienda o scraping, incluir URL y producto.</p>
        </div>
      </div>
    </RetroPageShell>
  );
}
