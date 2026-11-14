// Explicit local-only provisioning. Never modifies a remote database or deployment.
import './sites-env.mjs';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const email = (process.argv[2] || 'gueguense09@gmail.com').trim().toLowerCase();
if (!/^[a-z0-9.!#$%&*+\-/=?^_`{|}~]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) throw new Error('Correo inválido.');
if (!existsSync('dist/server/wrangler.json')) throw new Error('Compila la aplicación primero.');
const output = execFileSync(process.execPath, [
  './node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'DB', '--local', '--persist-to', '.wrangler/state', '--config', 'dist/server/wrangler.json',
  '--command', `select id from users where email = '${email.replaceAll("'", "''")}'`, '--json'
], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const result = JSON.parse(output);
const id = result[0]?.results?.[0]?.id;
if (!id || !/^[a-f0-9-]{36}$/.test(id)) throw new Error('Primero crea tu cuenta en la web LOCAL con ese correo. No uses tu contraseña de producción.');
const file = 'dist/server/.dev.vars';
const previous = existsSync(file) ? readFileSync(file, 'utf8') : '';
const rest = previous.split(/\r?\n/).filter(line => !/^\s*ADMIN_ACCOUNT_ID\s*=/.test(line)).join('\n').trim();
writeFileSync(file, `${rest ? rest + '\n' : ''}ADMIN_ACCOUNT_ID="${id}"\n`, { mode: 0o600 });
console.log('Administrador configurado solo para D1 local. Reinicia npm start. Después de recompilar, repite este comando.');
