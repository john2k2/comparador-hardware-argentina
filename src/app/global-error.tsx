'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Global Error]', error);
  }, [error]);

  return (
    <html lang="es">
      <body>
        <div className="min-h-screen flex items-center justify-center bg-[#5c94fc]">
          <div className="bg-white border-4 border-black p-8 max-w-lg mx-auto" style={{ boxShadow: '8px 8px 0px 0px rgba(0,0,0,0.8)' }}>
            <h1 className="text-xl font-bold text-[#d90048] mb-4 uppercase">
              [ ERROR: algo salio mal ]
            </h1>
            <p className="text-[10px] text-gray-600 uppercase mb-4">
              Ha ocurrido un error critico.
            </p>
            <button
              onClick={reset}
              className="px-4 py-2 bg-[#d90048] text-white font-bold"
              style={{ boxShadow: '4px 4px 0px 0px #000' }}
            >
              [ REINTENTAR ]
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
