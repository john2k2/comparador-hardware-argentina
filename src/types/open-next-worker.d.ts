// El módulo se genera al construir OpenNext. Su contrato HTTP no depende de
// inspeccionar los bundles generados durante el chequeo de tipos del proyecto.
declare module '*.open-next/worker.js' {
  const worker: {
    fetch(request: Request, env: unknown, context: unknown): Promise<Response>;
  };
  export default worker;
}
