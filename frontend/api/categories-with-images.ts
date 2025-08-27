import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env['SUPABASE_URL'] as string;
const supabaseKey = (process.env['SUPABASE_SERVICE_KEY'] || process.env['SUPABASE_ANON_KEY']) as string;
// Optional envs (not exposed)
const n8nWebhookUrl = process.env['N8N_WEBHOOK_URL'] as string | undefined;
const googleApiKey = process.env['GOOGLE_API_KEY'] as string | undefined;

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

  if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase env vars missing', { hasUrl: !!supabaseUrl, hasKey: !!supabaseKey });
    return res.status(500).json({ error: 'Supabase env vars missing' });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    // Get categories from brands3 and their images from category_images
    const { data: categoriesData, error: categoriesError } = await supabase
      .from('brands3')
      .select('category');

    if (categoriesError) {
      console.error('Supabase categories error:', categoriesError);
      const message = (categoriesError as any)?.message ?? 'Unknown error';
      return res.status(500).json({ error: message });
    }

    // Get unique categories
    const uniqueCategories = Array.from(new Set((categoriesData || []).map((r: any) => r.category).filter(Boolean)));

    // Get images for these categories from category_images table
    const { data: imagesData, error: imagesError } = await supabase
      .from('category_images')
      .select('category_name, image_url')
      .in('category_name', uniqueCategories);

    if (imagesError) {
      console.error('Supabase category images error:', imagesError);
      const message = (imagesError as any)?.message ?? 'Unknown error';
      return res.status(500).json({ error: message });
    }

    // Create a map of category images
    const imageMap = new Map<string, string>();
    (imagesData || []).forEach((img: any) => {
      imageMap.set(img.category_name, img.image_url);
    });

    // Build final categories array with correct images
    const categories = uniqueCategories.map(category => ({
      category_name: category,
      image_url: imageMap.get(category) || null,
      has_image: !!imageMap.get(category)
    }));

    return res.status(200).json({ categories });
  } catch (e: any) {
    console.error('Categories-with-images function crash:', e);
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
