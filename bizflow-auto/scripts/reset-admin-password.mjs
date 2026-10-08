import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const prisma = new PrismaClient();

function readHidden(prompt) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("Run this command in an interactive terminal so the password can be entered privately.");
  }

  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise((resolve, reject) => {
    let value = "";

    function finish(error) {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    }

    function onData(buffer) {
      for (const character of buffer.toString()) {
        if (character === "\u0003") {
          finish(new Error("Password reset cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
        } else if (character >= " ") {
          value += character;
        }
      }
    }

    stdin.on("data", onData);
  });
}

async function main() {
  const terminal = createInterface({ input: stdin, output: stdout });
  let username;
  try {
    username = (await terminal.question("Administrator username: ")).trim().toLowerCase();
  } finally {
    terminal.close();
  }

  if (!/^[a-z0-9._-]{3,50}$/.test(username)) {
    throw new Error("Enter a valid administrator username.");
  }

  const admin = await prisma.user.findFirst({
    where: { username, role: "ADMIN" },
    select: { id: true, username: true },
  });
  if (!admin) {
    throw new Error("No administrator account exists with that username.");
  }

  const password = await readHidden("New password (6-128 characters): ");
  if (password.length < 6 || password.length > 128) {
    throw new Error("Password must be between 6 and 128 characters.");
  }
  const confirmation = await readHidden("Confirm new password: ");
  if (password !== confirmation) {
    throw new Error("Passwords do not match.");
  }

  await prisma.user.update({
    where: { id: admin.id },
    data: { passwordHash: await hash(password, 12) },
  });
  console.info(`Password reset for administrator ${admin.username}.`);
}

try {
  await main();
} catch (error) {
  console.error("Administrator password reset failed.", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
