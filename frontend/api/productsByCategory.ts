import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env['SUPABASE_URL'] as string;
const supabaseKey = (process.env['SUPABASE_SERVICE_KEY'] || process.env['SUPABASE_ANON_KEY']) as string;

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

  if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase env vars missing', { hasUrl: !!supabaseUrl, hasKey: !!supabaseKey });
    return res.status(500).json({ error: 'Supabase env vars missing' });
  }

  const { category } = req.query;
  if (!category) {
    return res.status(400).json({ error: 'Category parameter required' });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Get products for the category with brand logos
    const { data, error } = await supabase
      .from('brands3')
      .select('id, product_name, brand_name, category, image_url')
      .eq('category', category);

    if (error) {
      console.error('Supabase products by category error:', error);
      const message = (error as any)?.message ?? 'Unknown error';
      return res.status(500).json({ error: message });
    }

    // Map to match your frontend expectations
    const items = (data || []).map(item => ({
      id: item.id,
      name: item.product_name,
      brand: item.brand_name,
      category: item.category,
      brandLogo: item.image_url // This is the brand logo from brands3
    }));

    return res.status(200).json({ 
      items,
      count: items.length,
      category 
    });
  } catch (e: any) {
    console.error('Products by category function crash:', e);
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
