import { BUILDER_DETAIL_EVENTS, JOURNEY_EVENTS } from '@/lib/analytics/journey';
import type { MeasurementReading } from '@/lib/measurement/types';
import styles from './measurement.module.css';

const quantity = (value: number | null | undefined) => typeof value === 'number' ? value.toLocaleString('es-AR') : 'Sin dato';

export function JourneyActivity({ reading }: { reading?: MeasurementReading }) {
  const groups = [
    { title: 'Actividad por etapa', entries: JOURNEY_EVENTS },
    { title: 'Detalle del armador', entries: BUILDER_DETAIL_EVENTS },
  ];
  return <div className={styles.journey}>
    {groups.map(({ title, entries }) => <table key={title}>
      <caption>{title}</caption>
      <thead><tr><th scope="col">Acción</th><th scope="col">Eventos</th><th scope="col">Usuarios</th></tr></thead>
      <tbody>{entries.map(({ key, label }) => <tr key={key}>
        <th scope="row">{label}</th><td>{quantity(reading?.metrics[`${key}Events`])}</td><td>{quantity(reading?.metrics[`${key}Users`])}</td>
      </tr>)}</tbody>
    </table>)}
    <p className={styles.small}>Cada fila cuenta actividad del período indicado. No demuestra que las mismas personas hayan pasado por todos los pasos. No sumes usuarios entre filas ni interpretes diferencias como abandono.</p>
    <p className={styles.small}>El detalle del armador se mide desde esta actualización; las lecturas anteriores muestran “Sin dato”. Las ventanas que cruzan la publicación tienen cobertura parcial. El detalle está incluido en el total de acciones: no se suma otra vez.</p>
    <p className={styles.small}>“Completo” cuenta acciones con todas las piezas cotizadas y envío informado; puede repetirse para un mismo armado. Guardar o compartir puede incluir armados parciales. Descargar registra la solicitud, no confirma que se guardó el archivo.</p>
  </div>;
}
