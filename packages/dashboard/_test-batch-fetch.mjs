process.env.CONTENT_PROVIDER_API_URL = "http://localhost:12004";

const dbaPath = "/Users/pawelfluder/03_synch/01_files_programming/08_nodejs/chad/packages/dba/dist/index.js";
const { getAllDailyEntries, getAllDateEntries, runWithRepoContext } = await import(dbaPath);

const USERS = [
  { username: "pawel_f", repoGuid: "21d11bdc-f1f4-44d1-b61a-3fa6b039c641" },
  { username: "kamil_s", repoGuid: "8b603669-f8e6-4224-bd78-a474998995fa" },
];

for (const user of USERS) {
  console.log(`\n=== ${user.username} ===`);
  const t0 = Date.now();
  const daily = await runWithRepoContext(user, () => getAllDailyEntries());
  console.log(`getAllDailyEntries: ${daily.length} entries in ${Date.now() - t0}ms`);

  const t1 = Date.now();
  const dates = await runWithRepoContext(user, () => getAllDateEntries());
  console.log(`getAllDateEntries: ${dates.length} entries in ${Date.now() - t1}ms`);

  console.log("Sample daily[0]:", daily[0]);
  console.log("Sample dates[0]:", dates[0]);
}
