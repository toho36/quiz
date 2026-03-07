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
import { parseRuntimeBootstrapSpacetimeConfig, type RuntimeBootstrapSpacetimeConfig } from '@/lib/server/runtime-bootstrap';
import {
  runtimeBootstrapPayloadType,
  type SpacetimeRuntimeBootstrapPayload,
} from '@/lib/server/runtime-spacetimedb-types';
import {
  runtimeQuestionOptionSnapshotSchema,
  runtimeQuestionSnapshotSchema,
  runtimeRoomSchema,
  type RoomPolicy,
  type RuntimeQuestionOptionSnapshot,
  type RuntimeQuestionSnapshot,
  type RuntimeRoom,
} from '@/lib/shared/contracts';

export type RuntimeBootstrapSnapshot = {
  room: RuntimeRoom;
  questionSnapshots: RuntimeQuestionSnapshot[];
  optionSnapshots: RuntimeQuestionOptionSnapshot[];
};

export type RuntimeBootstrapProvisioner = {
  createRoom(input: { sourceQuizId: string; ownerUserId: string; roomPolicy: RoomPolicy }): Promise<RuntimeBootstrapSnapshot>;
};

export type RuntimeBootstrapSpacetimeClient = {
  procedures: {
    bootstrapRoom(args: { source_quiz_id: string; owner_user_id: string }): Promise<SpacetimeRuntimeBootstrapPayload>;
  };
  disconnect(): void;
};

export type RuntimeBootstrapSpacetimeClientFactory = () => Promise<RuntimeBootstrapSpacetimeClient>;

type CreateRuntimeBootstrapProvisionerOptions = {
  clientFactory?: RuntimeBootstrapSpacetimeClientFactory;
  config?: RuntimeBootstrapSpacetimeConfig;
};

const EMPTY_TABLES = schema({});
const EMPTY_REDUCERS = reducers();
const RUNTIME_BOOTSTRAP_PROCEDURES = procedures(
  procedureSchema('bootstrap_room', { source_quiz_id: t.string(), owner_user_id: t.string() }, runtimeBootstrapPayloadType),
);

const RUNTIME_BOOTSTRAP_REMOTE_MODULE = {
  tables: EMPTY_TABLES.schemaType.tables,
  reducers: EMPTY_REDUCERS.reducersType.reducers,
  ...RUNTIME_BOOTSTRAP_PROCEDURES,
  versionInfo: { cliVersion: '2.0.3' as const },
};

class RuntimeBootstrapConnection extends DbConnectionImpl<typeof RUNTIME_BOOTSTRAP_REMOTE_MODULE> {
  static builder() {
    return new DbConnectionBuilder(
      RUNTIME_BOOTSTRAP_REMOTE_MODULE,
      (config: DbConnectionConfig<typeof RUNTIME_BOOTSTRAP_REMOTE_MODULE>) => new RuntimeBootstrapConnection(config),
    );
  }
}

export function createSpacetimeRuntimeBootstrapProvisioner({
  clientFactory,
  config,
}: CreateRuntimeBootstrapProvisionerOptions = {}): RuntimeBootstrapProvisioner {
  const connect = clientFactory ?? createRuntimeBootstrapSpacetimeClientFactory(config ?? parseRuntimeBootstrapSpacetimeConfig());

  async function withClient<T>(execute: (client: RuntimeBootstrapSpacetimeClient) => Promise<T>) {
    const client = await connect();

    try {
      return await execute(client);
    } finally {
      client.disconnect();
    }
  }

  return {
    async createRoom({ sourceQuizId, ownerUserId }) {
      return withClient(async (client) =>
        parseRuntimeBootstrapPayload(
          await client.procedures.bootstrapRoom({
            source_quiz_id: sourceQuizId,
            owner_user_id: ownerUserId,
          }),
        ),
      );
    },
  };
}

function createRuntimeBootstrapSpacetimeClientFactory(
  config: RuntimeBootstrapSpacetimeConfig,
): RuntimeBootstrapSpacetimeClientFactory {
  return async () => connectRuntimeBootstrapSpacetimeClient(config);
}

async function connectRuntimeBootstrapSpacetimeClient(
  config: RuntimeBootstrapSpacetimeConfig,
): Promise<RuntimeBootstrapSpacetimeClient> {
  return new Promise<RuntimeBootstrapSpacetimeClient>((resolve, reject) => {
    let settled = false;
    RuntimeBootstrapConnection.builder()
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
          reject(error ?? new Error('Disconnected before the runtime bootstrap connection was established'));
        }
      })
      .build();
  });
}

function parseRuntimeBootstrapPayload(payload: SpacetimeRuntimeBootstrapPayload): RuntimeBootstrapSnapshot {
  return {
    room: runtimeRoomSchema.parse({
      ...payload.room,
      current_question_index: payload.room.current_question_index ?? null,
      started_at: payload.room.started_at ?? null,
      ended_at: payload.room.ended_at ?? null,
    }),
    questionSnapshots: payload.question_snapshots.map((snapshot) =>
      runtimeQuestionSnapshotSchema.parse({
        ...snapshot,
        effective_time_limit_seconds: snapshot.effective_time_limit_seconds ?? null,
      }),
    ),
    optionSnapshots: payload.option_snapshots.map((snapshot) => runtimeQuestionOptionSnapshotSchema.parse(snapshot)),
  };
}