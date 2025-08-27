import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env['SUPABASE_URL'] as string;
const supabaseKey = (process.env['SUPABASE_SERVICE_KEY'] || process.env['SUPABASE_ANON_KEY']) as string;
// Optional envs (not exposed)
const n8nWebhookUrl = process.env['N8N_WEBHOOK_URL'] as string | undefined;
const googleApiKey = process.env['GOOGLE_API_KEY'] as string | undefined;

export default async function handler(req: any, res: any) {
  // TEMP: debug env visibility on Vercel
  return res.status(200).json({
    ok: true,
    hasUrl: !!process.env['SUPABASE_URL'],
    hasKey: !!(process.env['SUPABASE_SERVICE_KEY'] || process.env['SUPABASE_ANON_KEY'])
  });

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

  if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase env vars missing', { hasUrl: !!supabaseUrl, hasKey: !!supabaseKey });
    return res.status(500).json({ error: 'Supabase env vars missing' });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from('brands3')
      .select('category, image_url');

    if (error) {
      console.error('Supabase categories-with-images error:', error);
      return res.status(500).json({ error: error.message });
    }

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
    console.error('Categories-with-images function crash:', e);
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
