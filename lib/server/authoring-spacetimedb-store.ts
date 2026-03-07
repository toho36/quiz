import {
  DbConnectionBuilder,
  DbConnectionImpl,
  procedureSchema,
  procedures,
  reducers,
  schema,
  t,
  type DbConnectionConfig,
} from 'spacetimedb';
import { parseServerEnv } from '@/lib/env/server';
import {
  ConfigurationError,
  parseRequiredAbsoluteUrl,
  readOptionalEnvString,
  type EnvSource,
} from '@/lib/env/shared';
import type { AuthenticatedAuthor, AuthoringQuizStore } from '@/lib/server/authoring-service';
import {
  authoringQuizDocumentSchema,
  type AuthoringQuizDocument,
} from '@/lib/shared/contracts';
import {
  authoringQuizDocumentType,
  authoringQuizSummaryType,
  type SpacetimeAuthoringQuizDocument,
  type SpacetimeAuthoringQuizSummary,
} from '@/lib/server/authoring-spacetimedb-types';

export type AuthoringQuizSummary = {
  quiz_id: string;
  title: string;
  status: AuthoringQuizDocument['quiz']['status'];
  question_count: number;
  updated_at: string;
};

export type AuthoringSpacetimeConfig = {
  endpoint: string;
  databaseName: string;
  adminToken: string;
};

export type AuthoringSpacetimeEnvKey =
  | 'NEXT_PUBLIC_SPACETIME_ENDPOINT'
  | 'SPACETIME_DATABASE'
  | 'SPACETIME_ADMIN_TOKEN';

export type AuthoringSpacetimeClient = {
  procedures: {
    listQuizSummaries(args: { owner_user_id: string }): Promise<SpacetimeAuthoringQuizSummary[]>;
    loadQuizDocument(args: { quiz_id: string }): Promise<SpacetimeAuthoringQuizDocument | undefined>;
    saveQuizDocument(args: { document: SpacetimeAuthoringQuizDocument }): Promise<SpacetimeAuthoringQuizDocument>;
    seedDemoDocuments(args: { documents: SpacetimeAuthoringQuizDocument[] }): Promise<number>;
  };
  disconnect(): void;
};

export type AuthoringSpacetimeClientFactory = () => Promise<AuthoringSpacetimeClient>;

type CreateSpacetimeAuthoringStoreOptions = {
  clientFactory?: AuthoringSpacetimeClientFactory;
  config?: AuthoringSpacetimeConfig;
  seedDocuments?: AuthoringQuizDocument[];
};

export type SpacetimeAuthoringStore = {
  quizStore: AuthoringQuizStore;
  getQuizDocument(quizId: string): Promise<AuthoringQuizDocument | null>;
  listQuizSummaries(actor: AuthenticatedAuthor): Promise<AuthoringQuizSummary[]>;
  close(): void;
};

const EMPTY_TABLES = schema({});
const EMPTY_REDUCERS = reducers();
const AUTHORING_PROCEDURES = procedures(
  procedureSchema('list_quiz_summaries', { owner_user_id: t.string() }, t.array(authoringQuizSummaryType)),
  procedureSchema('load_quiz_document', { quiz_id: t.string() }, t.option(authoringQuizDocumentType)),
  procedureSchema('save_quiz_document', { document: authoringQuizDocumentType }, authoringQuizDocumentType),
  procedureSchema('seed_demo_documents', { documents: t.array(authoringQuizDocumentType) }, t.u32()),
);

const AUTHORING_REMOTE_MODULE = {
  tables: EMPTY_TABLES.schemaType.tables,
  reducers: EMPTY_REDUCERS.reducersType.reducers,
  ...AUTHORING_PROCEDURES,
  versionInfo: { cliVersion: '2.0.3' as const },
};

class AuthoringSpacetimeConnection extends DbConnectionImpl<typeof AUTHORING_REMOTE_MODULE> {
  static builder() {
    return new DbConnectionBuilder(
      AUTHORING_REMOTE_MODULE,
      (config: DbConnectionConfig<typeof AUTHORING_REMOTE_MODULE>) => new AuthoringSpacetimeConnection(config),
    );
  }
}

export function getAuthoringSpacetimeEnvStatus(source: EnvSource = process.env) {
  const env = parseServerEnv(source);
  const missingKeys: AuthoringSpacetimeEnvKey[] = [];

  if (!readOptionalEnvString(source, 'NEXT_PUBLIC_SPACETIME_ENDPOINT')) {
    missingKeys.push('NEXT_PUBLIC_SPACETIME_ENDPOINT');
  }
  if (!env.spacetimeDatabase) {
    missingKeys.push('SPACETIME_DATABASE');
  }
  if (!env.spacetimeAdminToken) {
    missingKeys.push('SPACETIME_ADMIN_TOKEN');
  }

  return {
    isConfigured: missingKeys.length === 0,
    missingKeys,
  };
}

export function parseAuthoringSpacetimeConfig(source: EnvSource = process.env): AuthoringSpacetimeConfig {
  const env = parseServerEnv(source);
  const missingKeys = getAuthoringSpacetimeEnvStatus(source).missingKeys;

  if (missingKeys.length > 0) {
    throw new ConfigurationError(`Authoring persistence requires: ${missingKeys.join(', ')}`);
  }

  return {
    endpoint: parseRequiredAbsoluteUrl(source, 'NEXT_PUBLIC_SPACETIME_ENDPOINT'),
    databaseName: env.spacetimeDatabase!,
    adminToken: env.spacetimeAdminToken!,
  };
}

export function createSpacetimeAuthoringStore({
  clientFactory,
  config,
  seedDocuments = [],
}: CreateSpacetimeAuthoringStoreOptions = {}): SpacetimeAuthoringStore {
  const connect = clientFactory ?? createAuthoringSpacetimeClientFactory(config ?? parseAuthoringSpacetimeConfig());
  const preparedSeedDocuments = seedDocuments.map(cloneDocument);
  let seedPromise: Promise<void> | null = null;

  async function withClient<T>(execute: (client: AuthoringSpacetimeClient) => Promise<T>) {
    const client = await connect();

    try {
      return await execute(client);
    } finally {
      client.disconnect();
    }
  }

  async function ensureSeeded() {
    if (preparedSeedDocuments.length === 0) {
      return;
    }

    if (!seedPromise) {
      seedPromise = withClient(async (client) => {
        await client.procedures.seedDemoDocuments({ documents: preparedSeedDocuments.map(serializeQuizDocument) });
      });
    }

    try {
      await seedPromise;
    } catch (error) {
      seedPromise = null;
      throw error;
    }
  }

  const quizStore: AuthoringQuizStore & {
    getQuizDocument(quizId: string): Promise<AuthoringQuizDocument | null>;
    saveQuizDocument(document: AuthoringQuizDocument): Promise<AuthoringQuizDocument>;
  } = {
    async getQuizDocument(quizId) {
      await ensureSeeded();
      return withClient(async (client) => {
        const document = await client.procedures.loadQuizDocument({ quiz_id: quizId });
        return document ? parseQuizDocumentPayload(document) : null;
      });
    },
    async saveQuizDocument(document) {
      await ensureSeeded();
      return withClient(async (client) =>
        parseQuizDocumentPayload(
          await client.procedures.saveQuizDocument({ document: serializeQuizDocument(cloneDocument(document)) }),
        ),
      );
    },
  };

  return {
    quizStore,
    async getQuizDocument(quizId: string): Promise<AuthoringQuizDocument | null> {
      return quizStore.getQuizDocument(quizId) as Promise<AuthoringQuizDocument | null>;
    },
    async listQuizSummaries(actor: AuthenticatedAuthor): Promise<AuthoringQuizSummary[]> {
      await ensureSeeded();
      return withClient(async (client) => {
        const summaries = await client.procedures.listQuizSummaries({ owner_user_id: actor.clerkUserId });
        return summaries.map(parseQuizSummaryPayload);
      });
    },
    close() {},
  };
}

function createAuthoringSpacetimeClientFactory(config: AuthoringSpacetimeConfig): AuthoringSpacetimeClientFactory {
  return async () => connectAuthoringSpacetimeClient(config);
}

async function connectAuthoringSpacetimeClient(config: AuthoringSpacetimeConfig): Promise<AuthoringSpacetimeClient> {
  return new Promise<AuthoringSpacetimeClient>((resolve, reject) => {
    let settled = false;
    AuthoringSpacetimeConnection.builder()
      .withUri(config.endpoint)
      .withDatabaseName(config.databaseName)
      .withToken(config.adminToken)
      .onConnect((connection) => {
        if (!settled) {
          settled = true;
          resolve(connection);
        }
      })
      .onConnectError((_ctx, error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      })
      .onDisconnect((_ctx, error) => {
        if (!settled) {
          settled = true;
          reject(error ?? new Error('Disconnected before the authoring connection was established'));
        }
      })
      .build();
  });
}

function cloneDocument(document: AuthoringQuizDocument): AuthoringQuizDocument {
  return structuredClone(authoringQuizDocumentSchema.parse(document));
}

function serializeQuizDocument(document: AuthoringQuizDocument): SpacetimeAuthoringQuizDocument {
  const parsed = cloneDocument(document);
  return {
    quiz: {
      ...parsed.quiz,
      published_at: parsed.quiz.published_at,
    },
    questions: parsed.questions.map((entry) => ({
      question: {
        ...entry.question,
        time_limit_seconds: entry.question.time_limit_seconds,
        shuffle_answers: entry.question.shuffle_answers,
      },
      options: entry.options.map((option) => ({ ...option })),
    })),
  };
}

function parseQuizDocumentPayload(document: SpacetimeAuthoringQuizDocument): AuthoringQuizDocument {
  return cloneDocument(authoringQuizDocumentSchema.parse(document));
}

function parseQuizSummaryPayload(summary: SpacetimeAuthoringQuizSummary): AuthoringQuizSummary {
  return {
    quiz_id: summary.quiz_id,
    title: summary.title,
    status: parseQuizStatus(summary.status),
    question_count: summary.question_count,
    updated_at: summary.updated_at,
  };
}

function parseQuizStatus(status: string): AuthoringQuizSummary['status'] {
  switch (status) {
    case 'draft':
    case 'published':
    case 'archived':
      return status;
    default:
      throw new ConfigurationError(`Unsupported quiz status from SpacetimeDB: ${status}`);
  }
}