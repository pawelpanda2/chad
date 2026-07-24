#!/usr/bin/env node
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(root, ".env.local") });
const user = process.env.MONGO_ROOT_USERNAME;
const pass = process.env.MONGO_ROOT_PASSWORD;
if (!user || !pass) throw new Error("Missing MONGO creds in .env.local");
process.env.MONGODB_URI = `mongodb://${user}:${pass}@100.117.139.83:12040/chad?authSource=admin&directConnection=true`;
process.env.DBA_MONGO_ENABLED = "true";
process.env.DBA_CONTENT_PROVIDER_ENABLED = "false";
