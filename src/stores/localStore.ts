import { Creature, SourceKind } from "../types";

const DB_NAME = "SAGASpriteLabDB";
const STORE_CREATURES = "creatures";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_CREATURES)) {
        const store = db.createObjectStore(STORE_CREATURES, { keyPath: "id" });
        store.createIndex("sourceKind", "sourceKind", { unique: false });
        store.createIndex("numericId", "numericId", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class LocalStore {
  /**
   * Saves or updates a creature in the local IndexedDB.
   */
  public static async saveCreature(creature: Creature): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CREATURES, "readwrite");
      const store = tx.objectStore(STORE_CREATURES);
      const req = store.put({
        ...creature,
        provenance: {
          ...creature.provenance,
          updatedAt: Date.now(),
        },
      });

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Fetches all locally stored creatures.
   */
  public static async getAllLocalCreatures(): Promise<Creature[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CREATURES, "readonly");
      const store = tx.objectStore(STORE_CREATURES);
      const req = store.getAll();

      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Gets a single creature by ID.
   */
  public static async getCreatureById(id: string): Promise<Creature | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CREATURES, "readonly");
      const store = tx.objectStore(STORE_CREATURES);
      const req = store.get(id);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Deletes a local creature by ID.
   */
  public static async deleteCreature(id: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CREATURES, "readwrite");
      const store = tx.objectStore(STORE_CREATURES);
      const req = store.delete(id);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Duplicates a creature to create a local editable copy.
   */
  public static async duplicateToLocal(sourceCreature: Creature): Promise<Creature> {
    const newId = `local:${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();

    const localCopy: Creature = {
      ...sourceCreature,
      id: newId,
      sourceKind: "local",
      displayName: `${sourceCreature.displayName} (Cópia Local)`,
      provenance: {
        origin: sourceCreature.id,
        author: "Usuário Local",
        createdAt: now,
        updatedAt: now,
        parentCreatureId: sourceCreature.id,
      },
      versions: [
        {
          versionId: `v1_${now}`,
          timestamp: now,
          description: "Duplicação inicial a partir de " + sourceCreature.id,
          author: "Usuário",
        },
      ],
      currentVersionId: `v1_${now}`,
    };

    await this.saveCreature(localCopy);
    return localCopy;
  }
}
