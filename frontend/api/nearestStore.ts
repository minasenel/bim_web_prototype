import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env['SUPABASE_URL'] as string;
const supabaseKey = (process.env['SUPABASE_SERVICE_KEY'] || process.env['SUPABASE_ANON_KEY']) as string;

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

  if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase env vars missing', { hasUrl: !!supabaseUrl, hasKey: !!supabaseKey });
    return res.status(500).json({ error: 'Supabase env vars missing' });
  }

  const { lat, lng, productId } = req.query;
  if (!lat || !lng || !productId) {
    return res.status(400).json({ error: 'lat, lng, and productId parameters required' });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all stores
    const { data: stores, error: storesErr } = await supabase
      .from('stores')
      .select('id, name, latitude, longitude, address');
    if (storesErr) {
      const message = (storesErr as any)?.message ?? 'Unknown error';
      return res.status(500).json({ error: message });
    }

    // For each store, get stock for the given product (brands3_id)
    const results: any[] = [];
    for (const s of stores || []) {
      const { data: stk, error: stErr } = await supabase
        .from('stock')
        .select('quantity')
        .eq('brands3_id', Number(productId))
        .eq('store_id', s.id)
        .maybeSingle();
      if (stErr) {
        console.warn('Stock query error for store', s.id, stErr);
      }
      const quantity = stk?.quantity ?? 0;
      if (quantity > 0) {
        results.push({
          id: s.id,
          name: s.name,
          quantity,
          latitude: Number(s.latitude),
          longitude: Number(s.longitude),
          distanceKm: calculateDistance(
            parseFloat(lat as string),
            parseFloat(lng as string),
            Number(s.latitude),
            Number(s.longitude)
          )
        });
      }
    }

    results.sort((a, b) => a.distanceKm - b.distanceKm);
    return res.status(200).json({ items: results.slice(0, 10) });
  } catch (e: any) {
    console.error('Nearest store function crash:', e);
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}
