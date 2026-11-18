import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
export const tableOrder = ['users', 'bank_accounts', 'auth_limits', 'sessions', 'carrier_profiles', 'carrier_drivers', 'carrier_vehicles', 'carrier_documents', 'loads', 'commissions', 'carrier_notice_reads', 'load_notice_reads', 'phone_deliveries', 'subscription_payments', 'load_publications', 'load_quotes'];
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const literal = value => {
  if (value === null) return 'NULL';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && !value.includes('\0')) return "'" + value.replaceAll("'", "''") + "'";
  throw new Error('Unsupported value in migration; no output written.');
};

export function sourceDatabase() {
  const db = new DatabaseSync(':memory:');
  for (const name of readdirSync(path.join(root, 'drizzle')).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
    db.exec(readFileSync(path.join(root, 'drizzle', name), 'utf8'));
  }
  return db;
}

export function schemaSql() {
  const db = sourceDatabase();
  try {
    const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map(row => row.name);
    if (names.length !== tableOrder.length || names.some(name => !tableOrder.includes(name))) throw new Error('Update the migration table order for the current D1 schema.');
    const statements = ['-- Prepared offline from the current D1 migrations. Fresh target only.', '-- Keep local authentication and private R2 documents for the first cutover.', 'BEGIN;', 'SET LOCAL standard_conforming_strings = on;'];
    for (const table of tableOrder) {
      const columns = db.prepare(`PRAGMA table_info(${quote(table)})`).all();
      const definitions = columns.map(column => {
        const type = column.type.toLowerCase() === 'integer' ? 'bigint' : column.type.toLowerCase() === 'real' ? 'double precision' : 'text';
        const defaultValue = type === 'bigint' && /^(true|false)$/i.test(column.dflt_value ?? '') ? String(Number(column.dflt_value.toLowerCase() === 'true')) : column.dflt_value;
        return `  ${quote(column.name)} ${type}${column.pk ? ' PRIMARY KEY' : ''}${column.notnull ? ' NOT NULL' : ''}${defaultValue !== null ? ' DEFAULT ' + defaultValue : ''}`;
      });
      statements.push(`CREATE TABLE public.${quote(table)} (\n${definitions.join(',\n')}\n);`);
      for (const index of db.prepare(`PRAGMA index_list(${quote(table)})`).all()) {
        if (index.origin === 'pk') continue;
        const fields = db.prepare(`PRAGMA index_info(${quote(index.name)})`).all().map(column => quote(column.name));
        const predicate = index.partial
          ? db.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?").get(index.name).sql.match(/\sWHERE\s.+$/i)?.[0].replaceAll('`', '"')
          : '';
        if (index.partial && !predicate) throw new Error(`Missing predicate for ${index.name}`);
        statements.push(`CREATE ${index.unique ? 'UNIQUE ' : ''}INDEX ${quote(index.name)} ON public.${quote(table)} (${fields.join(', ')})${predicate};`);
      }
      statements.push(`ALTER TABLE public.${quote(table)} ENABLE ROW LEVEL SECURITY;`, `REVOKE ALL ON public.${quote(table)} FROM PUBLIC, anon, authenticated;`, `GRANT SELECT, INSERT, UPDATE, DELETE ON public.${quote(table)} TO service_role;`);
    }
    // Add references after all tables exist; loads and commissions depend on the fleet.
    for (const table of tableOrder) {
      for (const fk of db.prepare(`PRAGMA foreign_key_list(${quote(table)})`).all()) {
        statements.push(`ALTER TABLE public.${quote(table)} ADD FOREIGN KEY (${quote(fk.from)}) REFERENCES public.${quote(fk.table)} (${quote(fk.to)}) ON DELETE ${fk.on_delete};`);
      }
    }
    statements.push('COMMIT;', '');
    return statements.join('\n');
  } finally { db.close(); }
}

export function convertDump(dump) {
  const expected = sourceDatabase();
  const source = new DatabaseSync(':memory:', { allowExtension: false, enableForeignKeyConstraints: false });
  try {
    // Only process a trusted D1 export. Never run dumps supplied by other users.
    source.exec(dump);
    const actualTables = source.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name);
    for (const table of actualTables) {
      if (!tableOrder.includes(table) && !/^(sqlite_|_cf_|__drizzle)/.test(table) && table !== 'd1_migrations') throw new Error(`Unmapped table: ${table}`);
    }
    for (const table of tableOrder) {
      const columns = expected.prepare(`PRAGMA table_info(${quote(table)})`).all().map(column => column.name);
      const actual = source.prepare(`PRAGMA table_info(${quote(table)})`).all().map(column => column.name);
      if (columns.length !== actual.length || columns.some(column => !actual.includes(column))) throw new Error(`Schema mismatch: ${table}. Export the current complete D1 schema.`);
    }
    if (source.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Source contains broken foreign keys.');
    const statements = ['-- Private data: never commit this file. Apply only to an empty prepared target.', 'BEGIN;', 'SET LOCAL standard_conforming_strings = on;'];
    const counts = {};
    for (const table of tableOrder) {
      // Sessions intentionally expire at cutover; password hashes remain unchanged.
      const rows = table === 'sessions' ? [] : source.prepare(`SELECT * FROM ${quote(table)}`).all();
      counts[table] = rows.length;
      for (const row of rows) {
        statements.push(`INSERT INTO public.${quote(table)} (${Object.keys(row).map(quote).join(', ')}) VALUES (${Object.values(row).map(literal).join(', ')});`);
      }
    }
    statements.push('COMMIT;', '');
    return { sql: statements.join('\n'), counts };
  } finally { expected.close(); source.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, input, output] = process.argv.slice(2);
  if (command === 'schema' && !input) {
    writeFileSync(new URL('./schema.sql', import.meta.url), schemaSql());
    console.log('Prepared schema.sql; no database connected or modified.');
  } else if (command === 'convert' && input && output) {
    const result = convertDump(readFileSync(input, 'utf8'));
    writeFileSync(output, result.sql, { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ rows: result.counts, sessionsInvalidated: true }));
  } else {
    throw new Error('Usage: node supabase/prepare.mjs schema | convert <trusted-d1-export.sql> <new-private-output.sql>');
  }
}
