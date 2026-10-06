import { handleMeasurementGet, handleMeasurementPost } from '@/lib/measurement/route-handler';

export const dynamic = 'force-dynamic';
export const GET = handleMeasurementGet;
export const POST = handleMeasurementPost;
