import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import { getSupabase, ensureDatabaseInitialized } from '../src/db/connection';

(async () => {
  await ensureDatabaseInitialized();

  const supabase = getSupabase();
  const products = [
  { name: 'Çelik Tencere 24cm', brand: 'BİM', category: 'Mutfak' },
  { name: 'Döküm Tava 28cm', brand: 'BİM', category: 'Mutfak' },
  { name: 'Cam Saklama Kabı', brand: 'BİM', category: 'Mutfak' },
  { name: 'Tencere Seti 6 Parça', brand: 'BİM', category: 'Mutfak' },
  ];

  const stores = [
  { name: 'BİM Beşiktaş', latitude: 41.0430, longitude: 29.0054, address: 'Beşiktaş, İstanbul' },
  { name: 'BİM Kadıköy', latitude: 40.9917, longitude: 29.0270, address: 'Kadıköy, İstanbul' },
  { name: 'BİM Şişli', latitude: 41.0600, longitude: 28.9872, address: 'Şişli, İstanbul' },
  ];

  // clear tables (requires service role or permissive RLS)
  await supabase.from('stock').delete().gt('quantity', -1);
  await supabase.from('products').delete().gt('id', 0);
  await supabase.from('stores').delete().gt('id', 0);

  const { data: prodRows, error: pErr } = await supabase
    .from('products')
    .insert(products)
    .select('id');
  if (pErr) throw pErr;
  const createdProductIds = (prodRows || []).map((r: any) => r.id);

  const { data: storeRows, error: sErr } = await supabase
    .from('stores')
    .insert(stores)
    .select('id');
  if (sErr) throw sErr;
  const createdStoreIds = (storeRows || []).map((r: any) => r.id);

  for (const productId of createdProductIds) {
    for (const storeId of createdStoreIds) {
      const qty = Math.floor(Math.random() * 20);
      const { error } = await supabase
        .from('stock')
        .insert({ product_id: productId, store_id: storeId, quantity: qty });
      if (error) throw error;
    }
  }

  // eslint-disable-next-line no-console
  console.log('Seed complete');
})();


