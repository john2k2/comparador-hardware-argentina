import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container mx-auto px-4 py-16 text-center">
      <div className="bg-card border-4 border-primary p-8 max-w-lg mx-auto pixel-shadow-primary">
        <h1 className="text-xl font-bold text-primary mb-4 uppercase animate-pixel-blink">
          [ ERROR 404: PAGINA NO ENCONTRADA ]
        </h1>
        <p className="text-[10px] text-muted-foreground uppercase mb-8">
          La pagina que buscas no existe en nuestra base de datos.
        </p>
        <div className="space-y-4">
          <p className="text-[9px] text-muted-foreground uppercase">
            Puede que el producto haya sido removido o nunca existio.
          </p>
          <Link href="/">
            <button className="pixel-button">
              {`< VOLVER AL INICIO `}
            </button>
          </Link>
          <Link href="/search">
            <button className="pixel-button mt-4">
              {`< BUSCAR PRODUCTOS `}
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
