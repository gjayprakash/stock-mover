// Creates a super admin (the first one; more can be added on the People screen). Usage: npm run seed:admin -- <email> "<name>"
// The password is read from a hidden prompt (or stdin when piped), never from argv.
import { createInterface } from 'node:readline';
import pg from 'pg';
import { AUTH_SCHEMA } from '../apps/api/src/auth/schema.ts';
import { hashPassword, passwordProblem } from '../apps/api/src/auth/password.ts';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function ask(question: string): Promise<string> {
  const tty = Boolean(process.stdin.isTTY);
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: tty });
  // Hide what is typed: print the question only, never the keystrokes.
  (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
    if (s.includes(question)) process.stdout.write(question);
  };
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

try {
  process.loadEnvFile();
} catch {
  // no .env: DATABASE_URL must be in the shell
}

const [emailArg, ...nameParts] = process.argv.slice(2);
const email = (emailArg ?? '').trim().toLowerCase();
const name = nameParts.join(' ').trim();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name) fail('Usage: npm run seed:admin -- <email> "<name>"');
if (!process.env.DATABASE_URL) fail('DATABASE_URL is not set');

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  await db.query(AUTH_SCHEMA);
  // Idempotent by email: one email, one role. More super admins can also be added on the People screen.
  const { rows } = await db.query<{ role: string }>(`select role from users where email = $1`, [email]);
  if (rows[0]) fail(`That email is already a ${rows[0].role === 'super_admin' ? 'super admin' : 'store manager'}. Nothing changed.`);

  const password = await ask('Password: ');
  const problem = passwordProblem(password);
  if (problem) fail(problem);
  if (process.stdin.isTTY && (await ask('Same password again: ')) !== password) fail('The two passwords differ. Nothing changed.');

  await db.query(`insert into users (email, name, role, password_hash) values ($1, $2, 'super_admin', $3)`, [
    email, name, await hashPassword(password),
  ]);
  console.log(`Super admin created: ${email}`);
} catch (e) {
  const err = e as { code?: string; message?: string };
  fail(err.code === '23505' ? 'That email already has a user. Nothing changed.' : `Failed: ${err.message}`);
} finally {
  await db.end();
}
