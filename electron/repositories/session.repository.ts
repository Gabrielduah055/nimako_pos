import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { LocalSession } from '../types';

export class SessionRepository {
  constructor(private db: DatabaseSync) {}

  open(session: Partial<LocalSession> & Pick<LocalSession, 'cashierId' | 'cashierName'>): LocalSession {
    const current = this.getCurrent();
    if (current && current.cashierId === session.cashierId) return current;

    if (current) {
      throw new Error(`Cashier session for ${current.cashierName} is still open. End that shift before starting another one.`);
    }

    const opened: LocalSession = {
      id: session.id ?? `SESSION-${crypto.randomUUID()}`,
      cashierId: session.cashierId,
      cashierName: session.cashierName,
      openedAt: session.openedAt ?? new Date().toISOString(),
      openingCash: Number(session.openingCash) || 0,
      status: 'open',
      syncStatus: 'pending',
    };

    this.db.prepare(`
      INSERT INTO cashier_sessions (id, cashierId, cashierName, openedAt, openingCash, status, syncStatus)
      VALUES (@id, @cashierId, @cashierName, @openedAt, @openingCash, @status, @syncStatus)
    `).run(opened);

    return opened;
  }

  close(sessionId: string, closingCash: number): LocalSession | null {
    const closedAt = new Date().toISOString();
    this.db.prepare(`
      UPDATE cashier_sessions
      SET closedAt = ?, closingCash = ?, status = 'closed', syncStatus = CASE WHEN syncStatus = 'synced' THEN 'pending' ELSE syncStatus END
      WHERE id = ?
    `).run(closedAt, closingCash, sessionId);
    return this.findById(sessionId);
  }

  getCurrent(): LocalSession | null {
    const row = this.db.prepare("SELECT * FROM cashier_sessions WHERE status = 'open' ORDER BY openedAt DESC LIMIT 1").get();
    return row ? this.mapRow(row) : null;
  }

  getPending(): LocalSession[] {
    return this.db.prepare("SELECT * FROM cashier_sessions WHERE syncStatus IN ('pending', 'failed') ORDER BY openedAt ASC").all().map(this.mapRow);
  }

  markSynced(id: string): void {
    this.db.prepare("UPDATE cashier_sessions SET syncStatus = 'synced', syncedAt = ? WHERE id = ?").run(new Date().toISOString(), id);
  }

  markFailed(id: string): void {
    this.db.prepare("UPDATE cashier_sessions SET syncStatus = 'failed' WHERE id = ?").run(id);
  }

  findById(id: string): LocalSession | null {
    const row = this.db.prepare('SELECT * FROM cashier_sessions WHERE id = ?').get(id);
    return row ? this.mapRow(row) : null;
  }

  private mapRow(row: any): LocalSession {
    return {
      id: row.id,
      cashierId: row.cashierId,
      cashierName: row.cashierName,
      openedAt: row.openedAt,
      closedAt: row.closedAt ?? undefined,
      openingCash: Number(row.openingCash) || 0,
      closingCash: row.closingCash === null || row.closingCash === undefined ? undefined : Number(row.closingCash),
      status: row.status,
      syncStatus: row.syncStatus,
      syncedAt: row.syncedAt ?? undefined,
    };
  }
}
