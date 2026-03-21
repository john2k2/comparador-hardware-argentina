'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('[Global Error]', error);
  }, [error]);

  return (
    <div className="container mx-auto px-4 py-16 text-center">
      <div className="bg-card border-4 border-primary p-8 max-w-lg mx-auto pixel-shadow-primary">
        <h1 className="text-xl font-bold text-primary mb-4 uppercase">
          [ ERROR: algo salio mal ]
        </h1>
        <p className="text-[10px] text-muted-foreground uppercase mb-4">
          Ha ocurrido un error inesperado.
        </p>
        {error.digest && (
          <p className="text-[8px] text-muted-foreground mb-4">
            Codigo de error: {error.digest}
          </p>
        )}
        <div className="space-y-4">
          <button
            onClick={reset}
            className="pixel-button"
          >
            {`[ REINTENTAR ]`}
          </button>
          <Link href="/">
            <button className="pixel-button mt-4">
              {`< VOLVER AL INICIO `}
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
