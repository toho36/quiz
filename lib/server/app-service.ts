import {
  createAppService,
  getAppService,
  type AppService,
} from '@/lib/server/demo-app-service';
import { getAuthoringSpacetimeEnvStatus } from '@/lib/server/authoring-spacetimedb-store';
import { getRuntimeBootstrapReadiness } from '@/lib/server/runtime-bootstrap';

export { createAppService, getAppService, type AppService };

export function getAppOperationalReadiness() {
  const authoring = getAuthoringSpacetimeEnvStatus();
  const runtime = getRuntimeBootstrapReadiness();

  return {
    authoring,
    runtime,
    canLoadAuthoring: authoring.isConfigured,
    canBootstrapRooms: authoring.isConfigured && runtime.canCreateRooms && runtime.canIssueHostClaims,
  };
}