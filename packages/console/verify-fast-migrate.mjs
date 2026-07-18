import { migrateRepo, printReport } from "./dist/migrateCpToMongo.js";
import { makeFsGetItem, makeFsGetFolderChildren } from "dba";

const REPO = "21d11bdc-f1f4-44d1-b61a-3fa6b039c641";
const ROOT = "/Users/pawelfluder/Dropbox/chad/" + REPO;

const report = await migrateRepo(REPO, "validate-only", console.log, {
  getItem: makeFsGetItem(REPO, ROOT),
  getFolderChildren: makeFsGetFolderChildren(ROOT),
});
printReport(report);
process.exit(0);
