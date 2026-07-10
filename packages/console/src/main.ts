// import {
//   checkHealth,
//   getAllRepos,
//   getUsersList,
//   GetAllGirls,
//   printChildItemNames,
// } from "./contentProviderClient.js";

// async function main() {
//   console.log("=== Content Provider API - Read-Only Tests ===\n");

//   // Step 1: Check health
//   console.log("1. Checking API health...");
//   const isHealthy = await checkHealth();
//   console.log(`   Health status: ${isHealthy ? "✓ OK" : "✗ FAILED"}`);

//   if (!isHealthy) {
//     console.log("\n⚠ API is not healthy. Make sure Docker container is running.");
//     console.log("   Run: docker ps | grep webapi");
//     process.exit(1);
//   }

//     // Step 4: Get all girls
//   console.log("\n4. Getting all girls...");
//   try {
//     const girls = await GetAllGirls();
//     console.log("   ✓ Success!");
//     console.log("   Response:", JSON.stringify(girls, null, 2));
//     console.log("\n   Child item names:");
//     printChildItemNames(girls);
//   } catch (error) {
//     console.log("   ✗ Failed:", error instanceof Error ? error.message : error);
//   }

//   // Step 2: Get all repositories
//   console.log("\n2. Getting all repositories...");
//   try {
//     const repos = await getAllRepos();
//     console.log("   ✓ Success!");
//     console.log("   Response:", JSON.stringify(repos, null, 2));
//   } catch (error) {
//     console.log("   ✗ Failed:", error instanceof Error ? error.message : error);
//   }

//   // Step 3: Get users list
//   console.log("\n3. Getting users list...");
//   try {
//     const users = await getUsersList();
//     console.log("   ✓ Success!");
//     console.log("   Response:", JSON.stringify(users, null, 2));
//   } catch (error) {
//     console.log("   ✗ Failed:", error instanceof Error ? error.message : error);
//   }



//   console.log("\n=== Read-only tests completed ===");
//   console.log("\nFor write operations (Post/Put), run: npm run test:write");
// }

// main().catch((error) => {
//   console.error("\n⚠ Unexpected error:", error);
//   process.exit(1);
// });