import 'server-only';

export function getServerEnv() {
  return {
    clerkSecretKey: process.env.CLERK_SECRET_KEY ?? null,
    cloudflareR2AccessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ?? null,
    cloudflareR2AccountId: process.env.CLOUDFLARE_R2_ACCOUNT_ID ?? null,
    cloudflareR2BucketName: process.env.CLOUDFLARE_R2_BUCKET_NAME?.trim() || 'quiz',
    cloudflareR2SecretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ?? null,
    spacetimeAdminToken: process.env.SPACETIME_ADMIN_TOKEN ?? null,
    runtimeBootstrapSigningKey: process.env.RUNTIME_BOOTSTRAP_SIGNING_KEY ?? null,
  };
}