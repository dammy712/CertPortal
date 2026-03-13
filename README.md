# Module 22 — HOTFIX (no DB required)

Settings now stored in a JSON file — no Prisma model needed.

## REPLACE these 2 files:
1. apps/backend/src/services/settings.service.ts  ← rewritten to use JSON file
2. apps/backend/prisma/schema.prisma              ← SystemSettings model removed

## No --build needed. Nodemon will restart automatically on save.
# CertPortal

This is beautiful