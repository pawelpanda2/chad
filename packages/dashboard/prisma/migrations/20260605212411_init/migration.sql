-- CreateTable
CREATE TABLE "Outing" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "location" TEXT,
    "description" TEXT NOT NULL,
    "moodBefore" TEXT,
    "moodAfter" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "age" INTEGER,
    "source" TEXT NOT NULL,
    "phone" TEXT,
    "instagram" TEXT,
    "facebook" TEXT,
    "whatsappName" TEXT,
    "shortDescription" TEXT,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "outingId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Lead_outingId_fkey" FOREIGN KEY ("outingId") REFERENCES "Outing" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
