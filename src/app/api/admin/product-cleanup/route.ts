import { NextRequest, NextResponse } from 'next/server';
import { cleanupZeroPriceProducts, checkProductsHealth } from '@/lib/admin/product-cleanup';
import { ensureAccess } from '@/lib/admin/catalog-refresh/access';

export async function GET(request: NextRequest) {
  try {
    // Verificar autenticación
    const access = await ensureAccess(request);
    if (!access) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verificar salud de productos
    const health = await checkProductsHealth();

    return NextResponse.json({
      status: 'ok',
      health,
      message: `De ${health.totalProducts} productos, ${health.healthy} están saludables, ${health.withZeroPrice} tienen precio $0, ${health.withoutStores} no tienen tiendas`,
    });
  } catch (error) {
    console.error('Error en health check:', error);
    return NextResponse.json(
      { error: 'Error al verificar salud de productos' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verificar autenticación
    const access = await ensureAccess(request);
    if (!access) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Ejecutar limpieza
    const result = await cleanupZeroPriceProducts();

    return NextResponse.json({
      status: 'ok',
      cleaned: result.cleaned,
      details: result.details,
      message: `Se limpiaron ${result.cleaned} productos con precios en $0 o sin tiendas`,
    });
  } catch (error) {
    console.error('Error en cleanup:', error);
    return NextResponse.json(
      { error: 'Error al limpiar productos' },
      { status: 500 }
    );
  }
}
