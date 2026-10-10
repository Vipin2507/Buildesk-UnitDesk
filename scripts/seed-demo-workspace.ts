/**
 * Wipe & reseed the platform "demo" client with full prisma/seed.ts data.
 *
 *   npm run db:seed:demo
 */
import { bootstrapPlatform } from "../server/lib/platform-bootstrap.ts";
import { DEMO_WORKSPACE } from "../server/lib/demo-workspace.ts";
import { platformPrisma } from "../server/lib/platform-prisma.ts";

process.env.FORCE_DEMO_SEED = "true";

await bootstrapPlatform();

console.log("\nDemo workspace ready");
console.log(`  Login:    /login`);
console.log(`  Email:    ${DEMO_WORKSPACE.adminEmail}`);
console.log(`  Password: ${DEMO_WORKSPACE.adminPassword}`);
console.log(`  Sales:    ${DEMO_WORKSPACE.salesEmail} / ${DEMO_WORKSPACE.salesPassword}`);
console.log(`  Partner:  ${DEMO_WORKSPACE.partnerEmail} / ${DEMO_WORKSPACE.partnerPassword}`);
console.log(`  Slug:     ${DEMO_WORKSPACE.slug} (internal only)`);

await platformPrisma.$disconnect();
process.exit(0);
