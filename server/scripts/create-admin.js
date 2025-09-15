const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
require('dotenv').config();
const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USERNAME || 'owner';
  const email = process.env.ADMIN_EMAIL || 'owner@example.com';
  const pass = process.env.ADMIN_PASS || 'ChangeMe123!';
  const hashed = await bcrypt.hash(pass, 10);
  await prisma.user.upsert({
    where: { email },
    update: { username, password: hashed, role: 'OWNER' },
    create: { username, email, password: hashed, role: 'OWNER' }
  });
  console.log('Admin created/updated');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
