/**
 * js/storage/storage-manager.js
 * Unified StorageManager Facade fulfilling PROJECT.md Interface Contracts.
 */

import { WebReaderDB } from './db.js';
import { SettingsManager } from './settings-store.js';

export class StorageManager {
  // --- Database Lifecycle ---
  static async openDB() {
    return WebReaderDB.openDB();
  }

  // --- Books CRUD ---
  static async getAllBooks() {
    return WebReaderDB.getAllBooks();
  }

  static async getAllBooksMetadata() {
    return WebReaderDB.getAllBooks();
  }

  static async getBook(id) {
    return WebReaderDB.getBook(id);
  }

  static async getBookMetadata(id) {
    return WebReaderDB.getBookMetadata(id);
  }

  static async getBookFile(id) {
    return WebReaderDB.getBookFile(id);
  }

  static async getBooksByFormat(format) {
    return WebReaderDB.getBooksByFormat(format);
  }

  static async saveBook(bookRecord) {
    return WebReaderDB.saveBook(bookRecord);
  }

  static async deleteBook(id) {
    return WebReaderDB.deleteBook(id);
  }

  // --- Reading Progress CRUD ---
  static async getProgress(bookId) {
    return WebReaderDB.getProgress(bookId);
  }

  static async saveProgress(progressRecord) {
    return WebReaderDB.saveProgress(progressRecord);
  }

  // --- Bookmarks CRUD ---
  static async getBookmarks(bookId) {
    return WebReaderDB.getBookmarks(bookId);
  }

  static async addBookmark(bookmarkRecord) {
    return WebReaderDB.addBookmark(bookmarkRecord);
  }

  static async deleteBookmark(id) {
    return WebReaderDB.deleteBookmark(id);
  }

  // --- Settings Convenience Delegation ---
  static getSettings() {
    return SettingsManager.getSettings();
  }

  static saveSettings(partialSettings) {
    return SettingsManager.saveSettings(partialSettings);
  }

  // --- Storage Quota Inspection Utility ---
  static async getQuotaInfo() {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      try {
        const { quota, usage } = await navigator.storage.estimate();
        return {
          quotaBytes: quota,
          usageBytes: usage,
          percentUsed: quota > 0 ? (usage / quota) * 100 : 0
        };
      } catch (e) {
        return null;
      }
    }
    return null;
  }
}

// Re-export SettingsManager for unified import convenience
export { SettingsManager };
