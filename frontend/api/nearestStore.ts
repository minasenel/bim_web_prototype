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
    
    // Get stores with stock for this product
    const { data, error } = await supabase
      .from('stock')
      .select(`
        quantity,
        store_id,
        stores!inner(
          id,
          name,
          latitude,
          longitude
        )
      `)
      .eq('product_id', productId)
      .gt('quantity', 0);

    if (error) {
      console.error('Supabase nearest store error:', error);
      const message = (error as any)?.message ?? 'Unknown error';
      return res.status(500).json({ error: message });
    }

    // Calculate distances and sort by nearest
    const storesWithDistance = (data || []).map(item => {
      const store = item.stores;
      const distance = calculateDistance(
        parseFloat(lat), 
        parseFloat(lng), 
        store.latitude, 
        store.longitude
      );
      
      return {
        id: store.id,
        name: store.name,
        quantity: item.quantity,
        distanceKm: distance,
        latitude: store.latitude,
        longitude: store.longitude
      };
    }).sort((a, b) => a.distanceKm - b.distanceKm);

    return res.status(200).json({ items: storesWithDistance });
  } catch (e: any) {
    console.error('Nearest store function crash:', e);
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}

// Haversine formula to calculate distance between two points
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}
