import { getDatabase, ensureDatabaseInitialized } from '../src/db/connection';

ensureDatabaseInitialized();

const db = getDatabase();

db.exec('DELETE FROM stock; DELETE FROM products; DELETE FROM stores;');

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

const prodStmt = db.prepare('INSERT INTO products (name, brand, category) VALUES (?, ?, ?)');
const storeStmt = db.prepare('INSERT INTO stores (name, latitude, longitude, address) VALUES (?, ?, ?, ?)');

const createdProductIds: number[] = [];
for (const p of products) {
  const info = prodStmt.run(p.name, p.brand, p.category);
  createdProductIds.push(Number(info.lastInsertRowid));
}

const createdStoreIds: number[] = [];
for (const s of stores) {
  const info = storeStmt.run(s.name, s.latitude, s.longitude, s.address);
  createdStoreIds.push(Number(info.lastInsertRowid));
}

const stockStmt = db.prepare('INSERT INTO stock (product_id, store_id, quantity) VALUES (?, ?, ?)');
for (const productId of createdProductIds) {
  for (const storeId of createdStoreIds) {
    const qty = Math.floor(Math.random() * 20);
    stockStmt.run(productId, storeId, qty);
  }
}

// eslint-disable-next-line no-console
console.log('Seed complete');


