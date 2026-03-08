export type AppEnvironment = 'local' | 'preview' | 'production';

export type PublicRuntimeConfig = {
  appUrl: string;
  environment: AppEnvironment;
  clerkPublishableKey: string | null;
  spacetimeEndpoint: string | null;
};

export type ServerEnv = {
  clerkSecretKey: string | null;
  cloudflareR2AccessKeyId: string | null;
  cloudflareR2AccountId: string | null;
  cloudflareR2BucketName: string;
  cloudflareR2SecretAccessKey: string | null;
  spacetimeAdminToken: string | null;
  spacetimeDatabase: string | null;
  runtimeBootstrapSigningKey: string | null;
};

export type AppRoute = {
  href: '/' | '/dashboard' | '/authoring' | '/host' | '/join';
  label: string;
  description: string;
  section: 'public' | 'workspace' | 'runtime';
};