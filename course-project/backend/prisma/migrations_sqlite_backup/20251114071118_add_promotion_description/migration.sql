/*
  Warnings:

  - Added the required column `pointsRemain` to the `Event` table without a default value. This is not possible if the table is not empty.
  - Made the column `description` on table `Event` required. This step will fail if there are existing NULL values in that column.
  - Made the column `location` on table `Event` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `description` to the `Promotion` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Event" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "capacity" INTEGER,
    "pointsRemain" INTEGER NOT NULL,
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_Event" (
    "id",
    "name",
    "description",
    "location",
    "startTime",
    "endTime",
    "published",
    "capacity",
    "pointsRemain",
    "pointsAwarded"
) SELECT
    "id",
    COALESCE("name", ''),
    COALESCE("description", ''),
    COALESCE("location", ''),
    "startTime",
    "endTime",
    COALESCE("published", false),
    NULL,
    0,
    0
FROM "Event";
DROP TABLE "Event";
ALTER TABLE "new_Event" RENAME TO "Event";
CREATE TABLE "new_Promotion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME NOT NULL,
    "minSpending" REAL,
    "rate" REAL,
    "points" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Promotion" ("createdAt", "endTime", "id", "minSpending", "name", "points", "rate", "startTime", "type") SELECT "createdAt", "endTime", "id", "minSpending", "name", "points", "rate", "startTime", "type" FROM "Promotion";
DROP TABLE "Promotion";
ALTER TABLE "new_Promotion" RENAME TO "Promotion";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
