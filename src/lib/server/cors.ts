import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_ORIGINS = [
  'https://www.comparador-hardware.com.ar',
  'https://comparador-hardware.com.ar',
];

if (process.env.NODE_ENV === 'development') {
  ALLOWED_ORIGINS.push('http://localhost:3000');
  ALLOWED_ORIGINS.push('http://127.0.0.1:3000');
}

export function withCors(request: NextRequest, response: NextResponse): NextResponse {
  const origin = request.headers.get('origin');
  
  // Si no hay origin o es el mismo dominio, permitir
  if (!origin || ALLOWED_ORIGINS.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin || '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.headers.set('Access-Control-Max-Age', '86400');
  }
  
  return response;
}

export function handleCorsPreflight(request: NextRequest): NextResponse | null {
  if (request.method === 'OPTIONS') {
    const origin = request.headers.get('origin');
    
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      return new NextResponse(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin || '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }
    
    return new NextResponse(null, { status: 403 });
  }
  
  return null;
}
