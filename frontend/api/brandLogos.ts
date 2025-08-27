import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env['SUPABASE_URL'] as string;
const supabaseKey = (process.env['SUPABASE_SERVICE_KEY'] || process.env['SUPABASE_ANON_KEY']) as string;

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

  if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase env vars missing', { hasUrl: !!supabaseUrl, hasKey: !!supabaseKey });
    return res.status(500).json({ error: 'Supabase env vars missing' });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Get brand logos from brands3 table (same as backend)
    const { data, error } = await supabase
      .from('brands3')
      .select('brand_name, image_url')
      .not('image_url', 'is', null)
      .order('brand_name');
    
    if (error) {
      console.error('Supabase brand logos error:', error);
      const message = (error as any)?.message ?? 'Unknown error';
      return res.status(500).json({ error: message });
    }
    
    // Create brandLogos object mapping brand_name to image_url
    const brandLogos: Record<string, string> = {};
    data?.forEach(item => {
      if (item.brand_name && item.image_url) {
        brandLogos[item.brand_name] = item.image_url;
      }
    });
    
    console.log(`✅ Brand logos loaded:`, Object.keys(brandLogos).length, 'brands');
    
    return res.status(200).json({ brandLogos });
  } catch (e: any) {
    console.error('Brand logos function crash:', e);
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
