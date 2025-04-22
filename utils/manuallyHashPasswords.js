import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();
const email = "ranjan@kplus.lk"; // Change this to the correct user's email
const newPassword = "SecurePass123"; // The raw password to be hashed

async function updatePassword() {
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.teamMember.update({
        where: { email },
        data: { password: hashedPassword },
    });

    console.log(`Password updated for ${email}`);
}

updatePassword()
    .catch((err) => console.error(err))
    .finally(() => prisma.$disconnect());
