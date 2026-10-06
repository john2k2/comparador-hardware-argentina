import handler from './custom-worker.mjs';
export * from './custom-worker.mjs';
export default {
 ...handler,
 async scheduled(){},
 async fetch(request,env,context) {
  const url=new URL(request.url);
  if (!['GET','HEAD'].includes(request.method)||url.searchParams.has('refresh')) return new Response('Read-only QA',{status:405});
  if(url.pathname==='/robots.txt') return new Response('User-agent: *\nDisallow: /\n',{headers:{'Content-Type':'text/plain','X-Robots-Tag':'noindex, nofollow','X-QA-Environment':'real-catalog-read-only'}});
  const r=await handler.fetch(request,env,context);const h=new Headers(r.headers);
  h.set('X-Robots-Tag','noindex, nofollow');h.set('X-QA-Environment','real-catalog-read-only');
  return new Response(r.body,{status:r.status,statusText:r.statusText,headers:h});
 }
};
