type FetchHandler<Env, Context> = (
  request: Request,
  env: Env,
  context: Context,
) => Response | Promise<Response>;

const ENV_FILE = /^\.env(?:\.(?:local|development|production|test|staging|dev|bak|backup))*$/i;

/** Sólo reconoce destinos de escaneo que no son rutas de esta aplicación. */
export function isUnambiguousScanPath(pathname: string): boolean {
  let decoded: string;
  try {
    // Una sola decodificación: no reinterpretamos consultas ni doble encoding.
    decoded = decodeURIComponent(pathname);
  } catch {
    // Next.js conserva el tratamiento de URLs malformadas.
    return false;
  }

  const segments = decoded.split('/').filter(Boolean);
  const filename = segments.at(-1) ?? '';
  if (ENV_FILE.test(filename) || filename.toLowerCase() === 'phpinfo.php') return true;
  if (segments.length === 1 && filename.toLowerCase() === 'info.php') return true;

  return segments[0]?.toLowerCase() === '@fs'
    && segments.at(-2)?.toLowerCase() === '.aws'
    && filename.toLowerCase() === 'credentials';
}

function scanNotFoundResponse(method: string): Response {
  return new Response(method === 'HEAD' ? null : 'Not Found', {
    status: 404,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

/** Delega las demás peticiones intactas, incluido contexto, cookies y caché. */
export function createScanGuard<Env, Context>(fetchHandler: FetchHandler<Env, Context>): FetchHandler<Env, Context> {
  return (request, env, context) => {
    if (isUnambiguousScanPath(new URL(request.url).pathname)) {
      return scanNotFoundResponse(request.method);
    }
    return fetchHandler(request, env, context);
  };
}
