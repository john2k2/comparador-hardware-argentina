import { handleObservedHomeRead } from '@/lib/home/edge-read';
export async function GET(request: Request) {
  return await handleObservedHomeRead(request, {
    SUPABASE_URL: process.env.SUPABASE_URL, NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  }, fetch) ?? new Response(null, { status: 404 });
}
