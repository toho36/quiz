import 'server-only';

export function getServerEnv() {
  return {
    clerkSecretKey: process.env.CLERK_SECRET_KEY ?? null,
    spacetimeAdminToken: process.env.SPACETIME_ADMIN_TOKEN ?? null,
    runtimeBootstrapSigningKey: process.env.RUNTIME_BOOTSTRAP_SIGNING_KEY ?? null,
  };
}