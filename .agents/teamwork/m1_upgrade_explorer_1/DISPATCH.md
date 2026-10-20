## 2026-10-17T18:48:47Z
You are teamwork_preview_explorer (instance m1_upgrade_explorer_1).
Your working directory is:
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m1_upgrade_explorer_1/

MANDATORY FIRST STEP: Read the user request file at:
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/ORIGINAL_REQUEST.md
specifically paying attention to ## 2026-10-17T18:34:26Z.
Also read PROJECT.md at the project root:
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/PROJECT.md

Your Milestone Scope:
Milestone 1 — Multi-Format Library, Format Badges & Storage V2.
Your specific technical focus:
1. StorageManager & IndexedDB Schema V2 (`js/storage/db.js`, `js/storage/storage-manager.js`):
   - Design the two-tier IndexedDB schema upgrade (`WebReaderDB` version 2):
     - `books` store: stores ONLY lightweight metadata (`id`, `title`, `author`, `format`, `coverBlob`, `lastRead`, `addedAt`, `totalChapters`, etc.). NEVER store `fileBlob` here.
     - `book_files` store: stores binary payloads `{ id, fileBlob }`.
     - Auto-migration in `onupgradeneeded` so existing databases upgrade cleanly without losing books or progress.
   - Refactor `getAllBooks()`: queries only `books` store (zero `fileBlob` loaded into memory).
   - Refactor `getBook(id)`: retrieves metadata from `books` and loads `fileBlob` from `book_files` on demand.
   - Refactor `saveBook(bookRecord)`: writes metadata to `books` and binary to `book_files` in a single transaction.
   - Refactor `deleteBook(id)`: atomically deletes from `books`, `book_files`, `reading_progress`, and `bookmarks`.
   - Update `StorageManager` facade methods to match interface contracts in `PROJECT.md`.

Deliverable:
Write a comprehensive technical blueprint and implementation guide to:
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m1_upgrade_explorer_1/analysis.md
and a structured handoff.md summarizing findings. Send completion message when done.
