import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env['SUPABASE_URL'] as string;
const supabaseKey = (process.env['SUPABASE_SERVICE_KEY'] || process.env['SUPABASE_ANON_KEY']) as string;

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=300');

  if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase env vars missing', { hasUrl: !!supabaseUrl, hasKey: !!supabaseKey });
    return res.status(500).json({ error: 'Supabase env vars missing' });
  }

  const qRaw = (req.query?.q ?? '').toString().trim();
  if (!qRaw) {
    return res.status(200).json({ items: [] });
  }

  // Basic sanitization for ILIKE pattern
  const q = qRaw.replace(/%/g, '').replace(/_/g, '');

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Search by product_name OR brand_name (case-insensitive)
    const { data, error } = await supabase
      .from('brands3')
      .select('id, product_name, brand_name, category, image_url')
      .or(`product_name.ilike.%${q}%,brand_name.ilike.%${q}%`)
      .limit(50);

    if (error != null) {
      console.error('Supabase search error:', error);
      const message = (error as any)?.message ?? 'Unknown error';
      return res.status(500).json({ error: message });
    }

    const items = (data || []).map((row) => ({
      id: row.id,
      name: row.product_name,
      brand: row.brand_name,
      category: row.category,
      brandLogo: row.image_url || null
    }));

    return res.status(200).json({ items });
  } catch (e: any) {
    console.error('Search function crash:', e);
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
