import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env['SUPABASE_URL'] as string;
const supabaseKey = process.env['SUPABASE_ANON_KEY'] as string;

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase env vars missing' });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from('brands3')
      .select('category, image_url');

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Reduce to unique categories, keep first non-empty image_url as representative
    const map = new Map<string, { category_name: string; image_url: string | null; has_image: boolean }>();
    (data || []).forEach((row: any) => {
      const category = row.category as string;
      const imageUrl = (row.image_url as string) || null;
      if (!category) return;
      if (!map.has(category)) {
        map.set(category, { category_name: category, image_url: imageUrl, has_image: !!imageUrl });
      } else if (!map.get(category)!.image_url && imageUrl) {
        map.get(category)!.image_url = imageUrl;
        map.get(category)!.has_image = true;
      }
    });

    const categories = Array.from(map.values());
    return res.status(200).json({ categories });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
