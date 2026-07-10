const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
	// Hash passwords
	const pawelPasswordHash = await bcrypt.hash("changeme", 10);
	const kamilPasswordHash = await bcrypt.hash("changeme", 10);

	// Create or update users (upsert)
	await prisma.user.upsert({
		where: { username: "Pawel_F" },
		update: {
			passwordHash: pawelPasswordHash,
			displayName: "Paweł F",
			isActive: true,
		},
		create: {
			username: "Pawel_F",
			passwordHash: pawelPasswordHash,
			displayName: "Paweł F",
			isActive: true,
		},
	});

	await prisma.user.upsert({
		where: { username: "Kamil_S" },
		update: {
			passwordHash: kamilPasswordHash,
			displayName: "Kamil S",
			isActive: true,
		},
		create: {
			username: "Kamil_S",
			passwordHash: kamilPasswordHash,
			displayName: "Kamil S",
			isActive: true,
		},
	});

	console.log("Seed completed. Users created/updated:");
	console.log("  - Pawel_F / changeme (Paweł F)");
	console.log("  - Kamil_S / changeme (Kamil S)");
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});