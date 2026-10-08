import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const { ADMIN_NAME, ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
const prisma = new PrismaClient();

async function main() {
  if (!ADMIN_NAME || !ADMIN_USERNAME || !ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 6) {
    throw new Error(
      "Set ADMIN_NAME, ADMIN_USERNAME, ADMIN_EMAIL, and ADMIN_PASSWORD (at least 6 characters) before running this script.",
    );
  }

  const email = ADMIN_EMAIL.trim().toLowerCase();
  const username = ADMIN_USERNAME.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,50}$/.test(username)) {
    throw new Error("ADMIN_USERNAME must be 3-50 characters using letters, numbers, dots, underscores, or hyphens.");
  }
  const existingUser = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
    select: { id: true },
  });
  if (existingUser) {
    throw new Error(`An account with that email or username already exists; no account was changed.`);
  }

  const user = await prisma.user.create({
    data: {
      name: ADMIN_NAME.trim(),
      username,
      email,
      passwordHash: await hash(ADMIN_PASSWORD, 12),
      role: "ADMIN",
    },
    select: { id: true, name: true, username: true, email: true },
  });

  console.info(`Created administrator ${user.username} (user ID ${user.id}).`);
}

try {
  await main();
} catch (error) {
  console.error("Administrator creation failed.", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
