import { DatabaseSync } from 'node:sqlite';
import { LocalProduct } from '../types';

export class ProductRepository {
  constructor(private db: DatabaseSync) {}

  upsertMany(products: LocalProduct[]): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO products (id, name, barcode, price, priceSingle, priceBulk, quantity, category, unitType, isActive, lastSyncedAt)
      VALUES (@id, @name, @barcode, @price, @priceSingle, @priceBulk, @quantity, @category, @unitType, @isActive, @lastSyncedAt)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        barcode = excluded.barcode,
        price = excluded.price,
        priceSingle = excluded.priceSingle,
        priceBulk = excluded.priceBulk,
        quantity = excluded.quantity,
        category = excluded.category,
        unitType = excluded.unitType,
        isActive = excluded.isActive,
        lastSyncedAt = excluded.lastSyncedAt
    `);

    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const product of products) {
        stmt.run({
          ...product,
          priceSingle: product.priceSingle ?? product.price,
          priceBulk: product.priceBulk ?? product.price,
          isActive: product.isActive ? 1 : 0,
          lastSyncedAt: product.lastSyncedAt ?? now,
        });
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  findAll(search = ''): LocalProduct[] {
    const term = `%${search.trim()}%`;
    const rows = search.trim()
      ? this.db.prepare(`
          SELECT * FROM products
          WHERE isActive = 1 AND (name LIKE @term OR barcode LIKE @term OR category LIKE @term)
          ORDER BY name ASC
          LIMIT 100
        `).all({ term })
      : this.db.prepare('SELECT * FROM products WHERE isActive = 1 ORDER BY name ASC LIMIT 100').all();

    return rows.map(this.mapRow);
  }

  findByBarcode(barcode: string): LocalProduct | null {
    const row = this.db.prepare('SELECT * FROM products WHERE barcode = ? AND isActive = 1').get(barcode);
    return row ? this.mapRow(row) : null;
  }

  reduceStock(productId: string, quantity: number): void {
    this.db.prepare('UPDATE products SET quantity = quantity - ? WHERE id = ?').run(quantity, productId);
  }

  private mapRow(row: any): LocalProduct {
    return {
      id: row.id,
      name: row.name,
      barcode: row.barcode,
      price: Number(row.price) || 0,
      priceSingle: Number(row.priceSingle) || 0,
      priceBulk: Number(row.priceBulk) || 0,
      quantity: Number(row.quantity) || 0,
      category: row.category ?? '',
      unitType: row.unitType ?? 'piece',
      isActive: Boolean(row.isActive),
      lastSyncedAt: row.lastSyncedAt ?? undefined,
    };
  }
}
