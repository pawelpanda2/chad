#!/usr/bin/env node
/**
 * Story 96 — idempotently ensures the shared knowledge structure exists:
 *
 *   chad_shared (repo root)                 ← created only if missing
 *   └── knowledge                           ← find-or-create
 *       └── Verbal Game                     ← find-or-create
 *           ├── <section Folder> × 6        ← find-or-create
 *           │   └── <document Text> × 4     ← find-or-create, EMPTY body
 *
 * Section/document names mirror the previous static GROUPS of
 * `knowledge/verbal-game/page.tsx` (owner-authored mockup labels) so the
 * page keeps its current look. Document bodies are deliberately empty —
 * the static page never had real document content and none is fabricated.
 *
 * Safe to re-run any number of times: every step is find-or-create
 * (`ensureSharedKnowledgeRoot` / `createOrGetChild`), nothing is ever
 * overwritten or deleted, and existing bodies are never touched.
 *
 * Run from repo root (after `pnpm --filter dba build`):
 *   set -a; source .env.local; set +a
 *   node packages/dba/scripts/ensure-shared-knowledge.mjs
 */
process.env.DBA_PRIMARY_BACKEND = "postgres";
process.env.DBA_POSTGRES_ENABLED = "true";
process.env.DBA_MONGO_ENABLED = "false";
process.env.DBA_CONTENT_PROVIDER_ENABLED = "false";

const { ensureSharedKnowledgeRoot, CHAD_SHARED_REPO_GUID, CHAD_SHARED_REPO_NAME } = await import(
  "../dist/knowledge.js"
);
const { createOrGetChild, getChildrenOf } = await import("../dist/item-ops.js");
const { runWithRepoContext } = await import("../dist/repo-context.js");
const { closePostgresConnection } = await import("../dist/postgres.js");

// Names ported 1:1 from the static GROUPS the dynamic page replaces.
const VERBAL_GAME_STRUCTURE = [
  {
    section: "Podstawy rozmowy",
    documents: [
      "Jak rozwijać temat zamiast go ucinać",
      "Pytania otwarte i follow-upy",
      "Skojarzenia i nowe wątki",
      "Unikanie trybu wywiadu",
    ],
  },
  {
    section: "Historie i opowiadanie",
    documents: [
      "Struktura krótkiej historii",
      "Historie z dzieciństwa",
      "Ćwiczenie: historia w 60 sekund",
      "Puenta, emocja i detal",
    ],
  },
  {
    section: "Flirt i man-to-woman",
    documents: [
      "Premisa i intencja",
      "Teasing i lekka prowokacja",
      "Komplement sytuacyjny",
      "Ćwiczenie: flirtujące skojarzenia",
    ],
  },
  {
    section: "Tematy i inspiracje",
    documents: [
      "Podróże i miejsca",
      "Styl, wnętrza i kultura",
      "Relacje, ambicje i wartości",
      "Zabawne obserwacje z codzienności",
    ],
  },
  {
    section: "Ćwiczenia solo",
    documents: [
      "10 skojarzeń do jednego słowa",
      "Mówienie bez przerwy przez 3 minuty",
      "Rozwijanie jednego szczegółu",
      "Losowy temat dnia",
    ],
  },
  {
    section: "Analiza i poprawa",
    documents: [
      "Dlaczego rozmowa traci energię",
      "Lista powtarzających się błędów",
      "Co mogłem powiedzieć zamiast",
      "Powtórka po randce",
    ],
  },
];

await runWithRepoContext(
  { repoGuid: CHAD_SHARED_REPO_GUID, username: CHAD_SHARED_REPO_NAME },
  async () => {
    const { repoRoot, knowledgeRoot, createdRepoRoot } = await ensureSharedKnowledgeRoot();
    console.log(
      `[ensure-shared-knowledge] repo root ${createdRepoRoot ? "CREATED" : "already existed"}: ` +
        `${repoRoot.config.address} (name=${repoRoot.config.name})`
    );
    console.log(`[ensure-shared-knowledge] knowledge root: ${knowledgeRoot.config.address}`);

    const category = await createOrGetChild(knowledgeRoot, "Verbal Game", "Folder");
    console.log(`[ensure-shared-knowledge] category "Verbal Game": ${category.config.address}`);

    for (const { section, documents } of VERBAL_GAME_STRUCTURE) {
      const sectionItem = await createOrGetChild(category, section, "Folder");
      for (const documentName of documents) {
        await createOrGetChild(sectionItem, documentName, "Text", "");
      }
      const count = (await getChildrenOf(sectionItem.config.address)).length;
      console.log(
        `[ensure-shared-knowledge] section "${section}": ${sectionItem.config.address} (${count} documents)`
      );
    }

    console.log("[ensure-shared-knowledge] DONE (idempotent — re-running changes nothing)");
  }
);

await closePostgresConnection();
