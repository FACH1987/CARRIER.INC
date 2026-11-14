import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sourceDatabase, schemaSql, convertDump, tableOrder } from '../supabase/prepare.mjs';

function dumpSchema() {
  const db = sourceDatabase();
  try {
    return db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map(row => row.sql + ';').join('\n');
  } finally { db.close(); }
}

test('prepared PostgreSQL schema covers current D1 tables, references and privacy', () => {
  const sql = schemaSql();
  assert.equal(sql, readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8').replaceAll('\r\n', '\n'));
  for (const table of tableOrder) {
    assert(sql.includes(`CREATE TABLE public."${table}"`));
    assert(sql.includes(`ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY;`));
    assert(sql.includes(`REVOKE ALL ON public."${table}" FROM PUBLIC, anon, authenticated;`));
  }
  assert(sql.includes('"expires_at" bigint NOT NULL'));
  assert(sql.includes('"notify_loads" bigint NOT NULL DEFAULT 0'));
  assert(sql.includes('"no_expiry" bigint NOT NULL DEFAULT 0'));
  assert(!/bigint[^\n]*DEFAULT (true|false)/i.test(sql));
  assert(sql.includes('REFERENCES public."loads" ("id") ON DELETE RESTRICT'));
});

test('conversion preserves hashes, consent, deduplication, money and escaping; expires sessions', () => {
  const dump = dumpSchema() + `
INSERT INTO users (id,email,name,password_hash,created_at,phone,phone_verified_at,phone_channel,notify_loads,notify_documents,phone_consent_at)
VALUES ('u1','synthetic@example.com','O''Brien','scrypt-v1$synthetic','2026-11-14T00:00:00Z','+50588880000','2026-11-14T01:00:00Z','sms',1,0,'2026-11-14T00:30:00Z');
INSERT INTO sessions VALUES ('old-token','u1',1794700800000);
INSERT INTO loads (id,owner_id,origin,destination,pickup_date,equipment,weight,pay,company,email,created_at,fee_cents)
VALUES ('load-1','u1','A','B','2026-11-15','Plataforma',100,100.05,'Synthetic','synthetic@example.com','2026-11-14T00:00:00Z',1001);
INSERT INTO phone_deliveries VALUES ('stable-event-id','u1','load','load-1','sms','+50588880000','needs_review',NULL,'2026-11-14T00:00:00Z','2026-11-14T00:00:00Z');`;
  const result = convertDump(dump);
  assert.equal(result.counts.users, 1);
  assert.equal(result.counts.loads, 1);
  assert.equal(result.counts.phone_deliveries, 1);
  assert.equal(result.counts.sessions, 0);
  for (const value of ["O''Brien", 'scrypt-v1$synthetic', '+50588880000', 'stable-event-id', 'needs_review', '1001', '100.05']) assert(result.sql.includes(value));
  assert(!result.sql.includes('old-token'));
  assert(result.sql.endsWith('COMMIT;\n'));
  assert(!result.sql.includes('ON CONFLICT'));
});

test('conversion rejects missing columns, unknown business tables and broken references', () => {
  const schema = dumpSchema();
  assert.throws(() => convertDump(schema + 'ALTER TABLE users DROP COLUMN phone;'), /Schema mismatch: users/);
  assert.throws(() => convertDump(schema + 'CREATE TABLE new_business_data (id TEXT);'), /Unmapped table/);
  assert.throws(() => convertDump(schema + "INSERT INTO sessions VALUES ('bad','missing-user',1794700800000);"), /foreign keys/);
});
