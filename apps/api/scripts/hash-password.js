// Prints a bcrypt hash for APP_USERS: node apps/api/scripts/hash-password.js 'your password'
// The password stays on this machine; only the printed hash goes into APP_USERS.
const bcrypt = require('bcryptjs');

const password = process.argv[2];
if (!password) {
  console.error("Usage: node apps/api/scripts/hash-password.js 'your password'");
  process.exit(1);
}
console.log(bcrypt.hashSync(password, 10));
