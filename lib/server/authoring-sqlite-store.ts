import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AuthenticatedAuthor, AuthoringQuizStore } from '@/lib/server/authoring-service';
import { createDemoSeedQuizDocuments } from '@/lib/server/demo-seed';
import { authoringQuizDocumentSchema, type AuthoringQuizDocument } from '@/lib/shared/contracts';

export type AuthoringQuizSummary = {
  quiz_id: string;
  title: string;
  status: AuthoringQuizDocument['quiz']['status'];
  question_count: number;
  updated_at: string;
};

type CreateSqliteAuthoringStoreOptions = {
  databasePath?: string;
  seedDocuments?: AuthoringQuizDocument[];
};

type AuthoringMigrationResult = {
  databasePath: string;
  appliedMigrations: string[];
};

type StoredQuizDocumentRow = {
  document_json: string;
};

type SqliteDatabase = {
  query(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): unknown;
  };
  exec(sql: string): void;
  transaction<T extends unknown[]>(callback: (...args: T) => void): (...args: T) => void;
  close(): void;
};

type BunSqliteModule = {
  Database: new (databasePath: string) => SqliteDatabase;
};

const DEFAULT_AUTHORING_SQLITE_PATH = 'data/authoring.sqlite';
const AUTHORING_MIGRATIONS_DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), 'authoring-migrations');

export function createSqliteAuthoringStore({
  databasePath,
  seedDocuments = createDemoSeedQuizDocuments(),
}: CreateSqliteAuthoringStoreOptions = {}) {
  const resolvedDatabasePath = resolveAuthoringSqliteDatabasePath(databasePath);
  const database = openAuthoringDatabase(resolvedDatabasePath);

  applyPendingMigrations(database);
  seedAuthoringDocumentsIfEmpty(database, seedDocuments);

  const quizStore: AuthoringQuizStore = {
    async getQuizDocument(quizId) {
      return loadStoredQuizDocument(database, quizId);
    },
    async saveQuizDocument(document) {
      return persistQuizDocument(database, document);
    },
  };

  return {
    databasePath: resolvedDatabasePath,
    quizStore,
    getQuizDocument(quizId: string) {
      return loadStoredQuizDocument(database, quizId);
    },
    listQuizSummaries(actor: AuthenticatedAuthor): AuthoringQuizSummary[] {
      const rows = database
        .query(
          `select quiz_id, title, status, question_count, updated_at
           from authoring_quizzes
           where owner_user_id = ?
           order by updated_at desc`,
        )
        .all(actor.clerkUserId) as Array<AuthoringQuizSummary>;

      return rows.map((row) => ({ ...row }));
    },
    close() {
      database.close();
    },
  };
}

export function runAuthoringSqliteMigrations(databasePath?: string): AuthoringMigrationResult {
  const resolvedDatabasePath = resolveAuthoringSqliteDatabasePath(databasePath);
  const database = openAuthoringDatabase(resolvedDatabasePath);

  try {
    return {
      databasePath: resolvedDatabasePath,
      appliedMigrations: applyPendingMigrations(database),
    };
  } finally {
    database.close();
  }
}

export function resolveAuthoringSqliteDatabasePath(databasePath?: string) {
  const configuredPath = databasePath?.trim() || process.env.AUTHORING_SQLITE_PATH?.trim() || DEFAULT_AUTHORING_SQLITE_PATH;

  if (configuredPath === ':memory:') {
    return configuredPath;
  }

  return isAbsolute(configuredPath) ? configuredPath : resolve(process.cwd(), configuredPath);
}

function openAuthoringDatabase(databasePath: string) {
  if (databasePath !== ':memory:') {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  const { Database } = getBunSqliteModule();
  return new Database(databasePath);
}

function applyPendingMigrations(database: SqliteDatabase) {
  database.exec(`
    create table if not exists authoring_schema_migrations (
      name text primary key,
      applied_at text not null
    );
  `);

  const appliedMigrations = new Set(
    (database.query('select name from authoring_schema_migrations order by name').all() as Array<{ name: string }>).map(
      (row) => row.name,
    ),
  );

  const migrationNames = readdirSync(AUTHORING_MIGRATIONS_DIRECTORY)
    .filter((name) => name.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));

  const runMigration = database.transaction((name: string, sql: string, appliedAt: string) => {
    database.exec(sql);
    database.query('insert into authoring_schema_migrations (name, applied_at) values (?, ?)').run(name, appliedAt);
  });

  const applied: string[] = [];

  for (const migrationName of migrationNames) {
    if (appliedMigrations.has(migrationName)) {
      continue;
    }

    runMigration(migrationName, readFileSync(join(AUTHORING_MIGRATIONS_DIRECTORY, migrationName), 'utf8'), new Date().toISOString());
    applied.push(migrationName);
  }

  return applied;
}

function seedAuthoringDocumentsIfEmpty(database: SqliteDatabase, seedDocuments: AuthoringQuizDocument[]) {
  const row = database.query('select count(*) as count from authoring_quizzes').get() as { count: number } | null;

  if ((row?.count ?? 0) > 0) {
    return;
  }

  const insertSeedDocuments = database.transaction((documents: AuthoringQuizDocument[]) => {
    for (const document of documents) {
      persistQuizDocument(database, document);
    }
  });

  insertSeedDocuments(seedDocuments);
}

function loadStoredQuizDocument(database: SqliteDatabase, quizId: string) {
  const row = database.query('select document_json from authoring_quizzes where quiz_id = ?').get(quizId) as StoredQuizDocumentRow | null;

  if (!row) {
    return null;
  }

  return structuredClone(authoringQuizDocumentSchema.parse(JSON.parse(row.document_json)));
}

function persistQuizDocument(database: SqliteDatabase, document: AuthoringQuizDocument) {
  const parsed = authoringQuizDocumentSchema.parse(document);

  database
    .query(
      `insert into authoring_quizzes (
        quiz_id,
        owner_user_id,
        title,
        status,
        question_count,
        updated_at,
        document_json
      ) values (?, ?, ?, ?, ?, ?, ?)
      on conflict(quiz_id) do update set
        owner_user_id = excluded.owner_user_id,
        title = excluded.title,
        status = excluded.status,
        question_count = excluded.question_count,
        updated_at = excluded.updated_at,
        document_json = excluded.document_json`,
    )
    .run(
      parsed.quiz.quiz_id,
      parsed.quiz.owner_user_id,
      parsed.quiz.title,
      parsed.quiz.status,
      parsed.questions.length,
      parsed.quiz.updated_at,
      JSON.stringify(parsed),
    );

  return structuredClone(parsed);
}

function getBunSqliteModule() {
  const { require: bunRequire } = import.meta as ImportMeta & {
    require?: (specifier: string) => unknown;
  };

  if (typeof bunRequire !== 'function') {
    throw new Error('bun:sqlite is only available when running under Bun');
  }

  return bunRequire('bun:sqlite') as BunSqliteModule;
}