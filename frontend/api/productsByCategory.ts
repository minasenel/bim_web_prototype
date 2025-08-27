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
    
    // Get products for the category with stock info (same as backend)
    const { data, error } = await supabase
      .from('brands3')
      .select('id, product_name, brand_name, category, image_url, stock(quantity)')
      .eq('category', category)
      .order('product_name')
      .limit(500);

    if (error) {
      console.error('Supabase products by category error:', error);
      const message = (error as any)?.message ?? 'Unknown error';
      return res.status(500).json({ error: message });
    }

    // Deduplicate by numeric id and also by composite key (name+brand) - same as backend
    const byId = new Map<number, { id: number; name: string; brand: string; category: string; totalQuantity: number | null; brandLogo: string | null }>();
    const byComposite = new Set<string>();

    (data || []).forEach((p: any) => {
      const idNum = Number(p.id);
      const name: string = p.product_name;
      const brand: string = p.brand_name;
      const categoryName: string = p.category;
      const imageUrl: string | null = p.image_url;
      const compositeKey = `${(name || '').trim().toLowerCase()}__${(brand || '').trim().toLowerCase()}`;

      const currentQuantity = Array.isArray(p.stock)
        ? p.stock.reduce((a: number, s: any) => a + (s?.quantity ? Number(s.quantity) : 0), 0)
        : 0;

      if (Number.isFinite(idNum)) {
        const existing = byId.get(idNum);
        if (existing) {
          const prev = existing.totalQuantity ?? 0;
          existing.totalQuantity = prev + currentQuantity;
        } else if (!byComposite.has(compositeKey)) {
          byId.set(idNum, {
            id: idNum,
            name,
            brand,
            category: categoryName,
            totalQuantity: currentQuantity,
            brandLogo: imageUrl
          });
          byComposite.add(compositeKey);
        }
      } else {
        if (!byComposite.has(compositeKey)) {
          byId.set(byId.size + 1, {
            id: byId.size + 1,
            name,
            brand,
            category: categoryName,
            totalQuantity: currentQuantity,
            brandLogo: imageUrl
          });
          byComposite.add(compositeKey);
        } else {
          for (const [k, v] of byId.entries()) {
            if (`${v.name.trim().toLowerCase()}__${v.brand.trim().toLowerCase()}` === compositeKey) {
              const prev = v.totalQuantity ?? 0;
              v.totalQuantity = prev + currentQuantity;
              byId.set(k, v);
              break;
            }
          }
        }
      }
    });
    
    const items = Array.from(byId.values());

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
