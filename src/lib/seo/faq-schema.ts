const SITE_NAME = 'Comparador Hardware Argentina';

type FaqItem = {
  question: string;
  answer: string;
};

export function buildFaqSchema(faqItems: FaqItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

export const TERMINOS_FAQ = buildFaqSchema([
  {
    question: `Cual es el proposito de ${SITE_NAME}?`,
    answer: `${SITE_NAME} es un comparador de precios de hardware en Argentina. Mostramos comparacion de precios, informacion de stock y enlaces hacia tiendas externas. No actua como vendedor, distribuidor ni procesador de pagos.`,
  },
  {
    question: 'Los precios son finales?',
    answer: 'Los precios pueden cambiar sin aviso y pueden diferir respecto de la ultima actualizacion capturada. El importe final, stock, medios de pago y cuotas validos son los publicados por la tienda de destino.',
  },
  {
    question: 'Quien es responsable de las compras?',
    answer: 'Cada compra se realiza fuera del comparador. La relacion comercial, el despacho, la garantia, los tiempos de entrega y las devoluciones dependen exclusivamente del comercio elegido.',
  },
  {
    question: 'Puedo usar el sitio automaticamente para extraer datos?',
    answer: 'No debes usar el sitio para interferir con su funcionamiento, automatizar abuso, intentar extraer datos de forma perjudicial o afectar la experiencia del resto de usuarios.',
  },
  {
    question: 'Estos terminos pueden cambiar?',
    answer: 'Si, estos terminos pueden actualizarse cuando cambie el producto, la monetizacion o la infraestructura. La version publicada en el sitio es la vigente en cada momento.',
  },
]);

export const PRIVACIDAD_FAQ = buildFaqSchema([
  {
    question: `Que datos procesa ${SITE_NAME}?`,
    answer: `${SITE_NAME} puede procesar datos tecnicos basicos de navegacion, consultas de busqueda, URLs visitadas y registros operativos para mantener el servicio, detectar errores y mejorar resultados.`,
  },
  {
    question: 'Para que se usan los datos?',
    answer: 'Operamos el comparador con datos técnicos. Google Analytics mide visitas y clics solo después de aceptar analítica; podés rechazarla sin perder las funciones del sitio.',
  },
  {
    question: 'Se comparten datos con terceros?',
    answer: 'Cloudflare y Supabase prestan infraestructura y funciones de cuenta. Google recibe analítica si aceptás. Imágenes y ofertas pueden llevar a servidores y tiendas externas con políticas propias.',
  },
  {
    question: 'Cuanto tiempo se conservan los datos?',
    answer: 'La elección de analítica caduca a los 180 días. Otros datos se conservan según su finalidad y la configuración de cada proveedor; no hay un plazo único verificado para todos.',
  },
  {
    question: 'Como contacto para temas de privacidad?',
    answer: 'Puedes escribir a nuestro correo de soporte para consultas relacionadas con privacidad o datos personales.',
  },
]);
