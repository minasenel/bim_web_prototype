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
    
    // Get categories from brands3 table
    const { data: categoriesData, error: categoriesError } = await supabase
      .from('brands3')
      .select('category')
      .order('category');
    
    if (categoriesError) {
      console.error('Supabase categories error:', categoriesError);
      const message = (categoriesError as any)?.message ?? 'Unknown error';
      return res.status(500).json({ error: message });
    }
    
    // Get unique categories
    const uniqueCategories = [...new Set(categoriesData?.map(item => item.category) || [])];
    
    // Get category images from category_images table
    const { data: imagesData, error: imagesError } = await supabase
      .from('category_images')
      .select('*');
    
    if (imagesError) {
      console.error('Supabase category images error:', imagesError);
      const message = (imagesError as any)?.message ?? 'Unknown error';
      return res.status(500).json({ error: message });
    }
    
    // Normalize category names for matching (same logic as backend)
    function normalizeCategoryName(name: string): string {
      return name
        .toLowerCase()
        .replace(/[&]/g, 've')
        .replace(/[ü]/g, 'u')
        .replace(/[ı]/g, 'i')
        .replace(/[ş]/g, 's')
        .replace(/[ç]/g, 'c')
        .replace(/[ğ]/g, 'g')
        .replace(/[ö]/g, 'o')
        .replace(/\s+/g, ' ')
        .trim();
    }
    
    // Match categories with images using normalization
    const categoriesWithImages = uniqueCategories.map(category => {
      const normalizedCategory = normalizeCategoryName(category);
      
      // Find matching image data
      const imageData = imagesData?.find(img => {
        const normalizedImgName = normalizeCategoryName(img.category_name);
        return normalizedImgName === normalizedCategory;
      });
      
      return {
        category_name: category,
        image_path: imageData?.image_path || null,
        image_url: imageData?.image_url || null,
        image_id: imageData?.id || null,
        has_image: !!imageData
      };
    });
    
    return res.status(200).json({ 
      categories: categoriesWithImages,
      count: categoriesWithImages.length
    });
  } catch (e: any) {
    console.error('Categories-with-images function crash:', e);
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
