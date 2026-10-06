import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only',()=>({}));
const runtime = vi.hoisted(()=>({stable:false,readClient:vi.fn()}));
vi.mock('@/lib/server/runtime-flags',()=>({isStableRuntimeMode:()=>runtime.stable}));
vi.mock('@/lib/server/supabase-server',()=>({getServerSupabaseReadClient:runtime.readClient}));
import { readBuilderCatalog } from './catalog';

describe('catálogo del armador en pruebas aisladas',()=>{
  beforeEach(()=>{runtime.stable=true;runtime.readClient.mockReset();});
  it('filtra por slot y modelo sin consultar datos públicos',async ()=>{
    const products=await readBuilderCatalog({slot:'cpu',query:'5700x'});
    expect(products.map(product=>product.id)).toEqual(['fixture-ryzen-5700x']);
    expect(runtime.readClient).not.toHaveBeenCalled();
  });
  it('restaura sólo IDs sintéticos existentes y conserva las fechas de las ofertas',async ()=>{
    const products=await readBuilderCatalog({ids:['fixture-ryzen-5600','id-no-existente']});
    expect(products.map(product=>product.id)).toEqual(['fixture-ryzen-5600']);
    const originalDates=products[0].prices.map(price=>price.lastUpdated);
    const restored=await readBuilderCatalog({ids:['fixture-ryzen-5600']});
    expect(restored[0].prices.map(price=>price.lastUpdated)).toEqual(originalDates);
    expect(runtime.readClient).not.toHaveBeenCalled();
  });
  it('fuera del modo de prueba conserva la lectura normal y su error de acceso',async ()=>{
    runtime.stable=false;runtime.readClient.mockReturnValue(null);
    await expect(readBuilderCatalog({slot:'cpu'})).rejects.toThrow('CATALOG_UNAVAILABLE');
    expect(runtime.readClient).toHaveBeenCalledOnce();
  });
});
