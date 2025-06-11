import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Create or get tenant
  const tenant = await prisma.tenant.upsert({
    where: { subdomain: 'demo' },
    update: {},
    create: {
      name: 'Demo Dental Practice',
      subdomain: 'demo',
      email: 'demo@harmonydental.com',
      phone: '+1-555-123-4567',
      address: '123 Dental Street',
      timezone: 'America/New_York',
      planType: 'PREMIUM',
      isActive: true,
    },
  });

  const hashedPassword = await bcrypt.hash('admin123', 10);

  // Create SUPER ADMIN User with lowercase role
  const superAdmin = await prisma.user.upsert({
    where: { 
      tenantId_email: {
        tenantId: tenant.id,
        email: 'superadmin@harmonydental.com'
      }
    },
    update: {
      password: hashedPassword,
    },
    create: {
      email: 'superadmin@harmonydental.com',
      password: hashedPassword,
      firstName: 'Super',
      lastName: 'Admin',
      role: 'admin', // lowercase to match backend expectation
      tenantId: tenant.id,
      isActive: true,
    },
  });

  // Also create the demo users
  const adminUser = await prisma.user.upsert({
    where: { 
      tenantId_email: {
        tenantId: tenant.id,
        email: 'admin@harmonydental.com'
      }
    },
    update: {
      password: hashedPassword,
    },
    create: {
      email: 'admin@harmonydental.com',
      password: hashedPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
      tenantId: tenant.id,
    },
  });

  console.log('✅ Seed data created');
  console.log('🔑 SUPER ADMIN: superadmin@harmonydental.com / admin123');
  console.log('👤 Admin User:', adminUser.email, '/ admin123');
  console.log('🏢 Tenant:', tenant.name);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
