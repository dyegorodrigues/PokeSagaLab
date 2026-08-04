import { Creature } from "../types";

const DB_NAME = "SAGASpriteLabDB";
const STORE_CREATURES = "creatures";
const DB_VERSION = 1;

function cloneCreature(creature: Creature): Creature {
  if (typeof structuredClone === "function") return structuredClone(creature);
  return JSON.parse(JSON.stringify(creature)) as Creature;
}

function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(
      new Error("IndexedDB não está disponível neste navegador ou contexto."),
    );
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_CREATURES)) {
        const store = database.createObjectStore(STORE_CREATURES, { keyPath: "id" });
        store.createIndex("sourceKind", "sourceKind", { unique: false });
        store.createIndex("numericId", "numericId", { unique: false });
        store.createIndex("updatedAt", "provenance.updatedAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Falha ao abrir IndexedDB."));
    request.onblocked = () =>
      reject(new Error("Atualização do banco bloqueada por outra aba aberta."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error || new Error("Transação IndexedDB falhou."));
    transaction.onabort = () =>
      reject(transaction.error || new Error("Transação IndexedDB foi abortada."));
  });
}

export class LocalStore {
  static async saveCreature(creature: Creature): Promise<void> {
    const database = await openDB();
    try {
      const transaction = database.transaction(STORE_CREATURES, "readwrite");
      const now = Date.now();
      transaction.objectStore(STORE_CREATURES).put({
        ...cloneCreature(creature),
        provenance: {
          ...creature.provenance,
          updatedAt: now,
        },
      });
      await transactionDone(transaction);
    } finally {
      database.close();
    }
  }

  static async getAllLocalCreatures(): Promise<Creature[]> {
    const database = await openDB();
    try {
      const transaction = database.transaction(STORE_CREATURES, "readonly");
      const request = transaction.objectStore(STORE_CREATURES).getAll();
      const result = await new Promise<Creature[]>((resolve, reject) => {
        request.onsuccess = () => resolve((request.result || []) as Creature[]);
        request.onerror = () =>
          reject(request.error || new Error("Falha ao ler os projetos locais."));
      });
      await transactionDone(transaction);
      return result.sort(
        (a, b) => (b.provenance.updatedAt || 0) - (a.provenance.updatedAt || 0),
      );
    } finally {
      database.close();
    }
  }

  static async getCreatureById(id: string): Promise<Creature | null> {
    const database = await openDB();
    try {
      const transaction = database.transaction(STORE_CREATURES, "readonly");
      const request = transaction.objectStore(STORE_CREATURES).get(id);
      const result = await new Promise<Creature | null>((resolve, reject) => {
        request.onsuccess = () => resolve((request.result as Creature | undefined) || null);
        request.onerror = () =>
          reject(request.error || new Error(`Falha ao ler o projeto '${id}'.`));
      });
      await transactionDone(transaction);
      return result;
    } finally {
      database.close();
    }
  }

  static async deleteCreature(id: string): Promise<void> {
    const database = await openDB();
    try {
      const transaction = database.transaction(STORE_CREATURES, "readwrite");
      transaction.objectStore(STORE_CREATURES).delete(id);
      await transactionDone(transaction);
    } finally {
      database.close();
    }
  }

  static async duplicateToLocal(sourceCreature: Creature): Promise<Creature> {
    const source = cloneCreature(sourceCreature);
    const now = Date.now();
    const id = `local:${now}_${Math.random().toString(36).slice(2, 8)}`;
    const versionId = `v1_${now}`;
    const localCopy: Creature = {
      ...source,
      id,
      sourceKind: "local",
      sourceRef: sourceCreature.sourceRef || sourceCreature.id,
      displayName: source.displayName.includes("Cópia local")
        ? source.displayName
        : `${source.displayName} (Cópia local)`,
      animations: source.animations.map((animation) => ({
        ...animation,
        locked: false,
      })),
      provenance: {
        origin: sourceCreature.provenance.origin,
        author: sourceCreature.provenance.author,
        commitHash: sourceCreature.provenance.commitHash,
        createdAt: now,
        updatedAt: now,
        parentCreatureId: sourceCreature.id,
      },
      versions: [
        {
          versionId,
          timestamp: now,
          description: `Duplicação editável de ${sourceCreature.id}`,
          author: "Usuário",
        },
      ],
      currentVersionId: versionId,
    };

    await this.saveCreature(localCopy);
    return localCopy;
  }
}
