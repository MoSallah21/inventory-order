import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";

import { PrismaClient } from "../src/generated/prisma/client";
import { Role } from "../src/generated/prisma/enums";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl)
  throw new Error("DATABASE_URL is required to seed the database.");
if (process.env.SEED_DEMO_DATA !== "true") {
  throw new Error(
    "Refusing to create demo accounts unless SEED_DEMO_DATA=true.",
  );
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});
const demoPassword = "DemoPass!2026";

const demoUsers = [
  {
    id: "demo-admin",
    name: "Demo Admin",
    email: "admin@example.test",
    role: Role.ADMIN,
  },
  {
    id: "demo-supplier-1",
    name: "Atlas Supplies",
    email: "supplier1@example.test",
    role: Role.SUPPLIER,
  },
  {
    id: "demo-supplier-2",
    name: "Gulf Wholesale",
    email: "supplier2@example.test",
    role: Role.SUPPLIER,
  },
  {
    id: "demo-customer-1",
    name: "Demo Customer",
    email: "customer@example.test",
    role: Role.CUSTOMER,
  },
  {
    id: "demo-customer-2",
    name: "Second Customer",
    email: "customer2@example.test",
    role: Role.CUSTOMER,
  },
] as const;

async function seedUser(
  user: (typeof demoUsers)[number],
  passwordHash: string,
) {
  await prisma.user.upsert({
    where: { email: user.email },
    update: { name: user.name, role: user.role, disabledAt: null },
    create: { ...user, emailVerified: false },
  });

  const persistedUser = await prisma.user.findUniqueOrThrow({
    where: { email: user.email },
  });
  await prisma.account.upsert({
    where: {
      providerId_accountId: {
        providerId: "credential",
        accountId: persistedUser.id,
      },
    },
    update: { password: passwordHash },
    create: {
      id: `credential-${persistedUser.id}`,
      providerId: "credential",
      accountId: persistedUser.id,
      userId: persistedUser.id,
      password: passwordHash,
    },
  });
}

async function main() {
  const passwordHash = await hashPassword(demoPassword);
  for (const user of demoUsers) await seedUser(user, passwordHash);

  const [electronics, office, safety] = await Promise.all([
    prisma.category.upsert({
      where: { slug: "electronics" },
      update: { name: "Electronics", archivedAt: null },
      create: {
        id: "category-electronics",
        name: "Electronics",
        slug: "electronics",
      },
    }),
    prisma.category.upsert({
      where: { slug: "office-supplies" },
      update: { name: "Office Supplies", archivedAt: null },
      create: {
        id: "category-office",
        name: "Office Supplies",
        slug: "office-supplies",
      },
    }),
    prisma.category.upsert({
      where: { slug: "safety-equipment" },
      update: { name: "Safety Equipment", archivedAt: null },
      create: {
        id: "category-safety",
        name: "Safety Equipment",
        slug: "safety-equipment",
      },
    }),
  ]);

  const products = [
    {
      id: "product-zero-stock",
      supplierId: "demo-supplier-1",
      categoryId: electronics.id,
      name: "USB-C Dock",
      description: "Demo product with no remaining stock.",
      priceMinor: 34_900n,
      stockQuantity: 0,
    },
    {
      id: "product-low-stock",
      supplierId: "demo-supplier-1",
      categoryId: office.id,
      name: "Thermal Label Roll",
      description: "Demo product with low stock.",
      priceMinor: 2_500n,
      stockQuantity: 3,
    },
    {
      id: "product-healthy-stock",
      supplierId: "demo-supplier-2",
      categoryId: safety.id,
      name: "Safety Gloves",
      description: "Demo product with healthy stock.",
      priceMinor: 1_800n,
      stockQuantity: 120,
    },
  ] as const;

  for (const product of products) {
    await prisma.product.upsert({
      where: { id: product.id },
      update: {
        ...product,
        archivedAt: null,
        imageUrl: "/window.svg",
        imageStorageKey: "",
      },
      create: {
        ...product,
        currency: "AED",
        imageUrl: "/window.svg",
        imageStorageKey: "",
      },
    });
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
