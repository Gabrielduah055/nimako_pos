import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import { LocalCashier } from '../types';

export class CashierRepository {
  constructor(private db: DatabaseSync) {}

  upsertMany(cashiers: LocalCashier[]): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO cashiers (id, name, email, role, pinHash, offlinePinSetAt, isActive, lastSyncedAt)
      VALUES (@id, @name, @email, @role, @pinHash, @offlinePinSetAt, @isActive, @lastSyncedAt)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        email = excluded.email,
        role = excluded.role,
        pinHash = COALESCE(excluded.pinHash, cashiers.pinHash),
        offlinePinSetAt = COALESCE(excluded.offlinePinSetAt, cashiers.offlinePinSetAt),
        isActive = excluded.isActive,
        lastSyncedAt = excluded.lastSyncedAt
    `);

    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const cashier of cashiers) {
        stmt.run({
          ...cashier,
          pinHash: cashier.pinHash ?? null,
          offlinePinSetAt: cashier.offlinePinSetAt ?? null,
          isActive: cashier.isActive ? 1 : 0,
          lastSyncedAt: cashier.lastSyncedAt ?? now,
        });
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  findAll(): LocalCashier[] {
    return this.db.prepare('SELECT * FROM cashiers WHERE isActive = 1 ORDER BY name ASC').all().map(this.mapRow);
  }

  findAllSafe(): Array<Omit<LocalCashier, 'pinHash'> & { hasPin: boolean }> {
    return this.findAll().map(cashier => this.toSafeCashier(cashier));
  }

  findByEmail(email: string): LocalCashier | null {
    const row = this.db.prepare('SELECT * FROM cashiers WHERE lower(email) = lower(?) AND isActive = 1').get(email);
    return row ? this.mapRow(row) : null;
  }

  findSafeByEmail(email: string): (Omit<LocalCashier, 'pinHash'> & { hasPin: boolean }) | null {
    const cashier = this.findByEmail(email);
    return cashier ? this.toSafeCashier(cashier) : null;
  }

  saveProfile(cashier: Pick<LocalCashier, 'id' | 'name' | 'email' | 'role'>): Omit<LocalCashier, 'pinHash'> & { hasPin: boolean } {
    if (!cashier.id || !cashier.email) {
      throw new Error('Cashier profile must include an ID and email before it can be saved locally.');
    }

    const existing = this.findByEmail(cashier.email);
    const profile: LocalCashier = {
      ...cashier,
      id: String(cashier.id),
      pinHash: existing?.pinHash,
      offlinePinSetAt: existing?.offlinePinSetAt,
      isActive: true,
      lastSyncedAt: new Date().toISOString(),
    };
    this.upsertMany([profile]);
    return this.toSafeCashier(this.findByEmail(cashier.email)!);
  }

  setPin(cashierId: string, pin: string): Omit<LocalCashier, 'pinHash'> & { hasPin: boolean } {
    if (!cashierId) {
      throw new Error('Cashier profile was not found locally.');
    }
    if (!/^\d{4,8}$/.test(pin)) {
      throw new Error('PIN must be 4 to 8 digits.');
    }

    const pinHash = bcrypt.hashSync(pin, 10);
    const now = new Date().toISOString();
    this.db.prepare('UPDATE cashiers SET pinHash = ?, offlinePinSetAt = ?, lastSyncedAt = ? WHERE id = ?')
      .run(pinHash, now, now, String(cashierId));

    const row = this.db.prepare('SELECT * FROM cashiers WHERE id = ? AND isActive = 1').get(String(cashierId));
    if (!row) throw new Error('Cashier profile was not found locally.');
    return this.toSafeCashier(this.mapRow(row));
  }

  verifyPin(email: string, pin: string): LocalCashier | null {
    const cashier = this.findByEmail(email);
    if (!cashier?.pinHash || !cashier.offlinePinSetAt) return null;
    return bcrypt.compareSync(pin, cashier.pinHash) ? cashier : null;
  }

  verifyPinSafe(email: string, pin: string): (Omit<LocalCashier, 'pinHash'> & { hasPin: boolean }) | null {
    const cashier = this.verifyPin(email, pin);
    return cashier ? this.toSafeCashier(cashier) : null;
  }

  private mapRow(row: any): LocalCashier {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      pinHash: row.pinHash ?? undefined,
      offlinePinSetAt: row.offlinePinSetAt ?? undefined,
      isActive: Boolean(row.isActive),
      lastSyncedAt: row.lastSyncedAt ?? undefined,
    };
  }

  private toSafeCashier(cashier: LocalCashier): Omit<LocalCashier, 'pinHash'> & { hasPin: boolean } {
    const { pinHash, ...safe } = cashier;
    return { ...safe, hasPin: Boolean(pinHash && cashier.offlinePinSetAt) };
  }
}
