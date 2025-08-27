import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env['SUPABASE_URL'] as string;
const supabaseKey = (process.env['SUPABASE_SERVICE_KEY'] || process.env['SUPABASE_ANON_KEY']) as string;
// Read optional envs (do not expose in responses)
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
    const { data, error } = await supabase
      .from('brands3')
      .select('category');

    if (error != null) {
      console.error('Supabase categories error:', error);
      const message = (error as any)?.message ?? 'Unknown error';
      return res.status(500).json({ error: message });
    }

    const categories = Array.from(new Set((data || []).map((r: any) => r.category).filter(Boolean)));
    return res.status(200).json({ categories });
  } catch (e: any) {
    console.error('Categories function crash:', e);
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
