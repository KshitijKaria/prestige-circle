/*
 * Complete this script so that it is able to add a superuser to the database
 * Usage example: 
 *   node prisma/createsu.js clive123 clive.su@mail.utoronto.ca SuperUser123!
 */
'use strict';
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const [utorid, email, password] = process.argv.slice(2);
  if (!utorid || !email || !password) {
    console.log('Usage: node prisma/createsu.js <utorid> <email> <password>');
    process.exit(1);
  }

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      utorid,
      email,
      password: hashed,
      name: utorid,
      role: 'superuser',
      verified: true,
    },
  });

  console.log('Superuser created:', user);
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
