import { getDemoAppService } from '@/lib/server/demo-app-service';
import { getDemoAuthorActor, getDemoGuestSessionId } from '@/lib/server/demo-session';
import { AuthorizationError, NotFoundError } from '@/lib/server/service-errors';

const RUNTIME_ASSET_NOT_FOUND_MESSAGE = 'Runtime quiz image was not found.';
const RUNTIME_ASSET_LOAD_ERROR_MESSAGE = 'Could not load runtime quiz image.';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const roomCode = searchParams.get('roomCode')?.trim();
    const objectKey = searchParams.get('objectKey')?.trim();
    const viewer = searchParams.get('viewer')?.trim();

    if (!roomCode || !objectKey || (viewer !== 'host' && viewer !== 'player')) {
      return new Response('Missing roomCode, objectKey, or viewer.', { status: 400 });
    }

    const app = getDemoAppService();
    const asset = await (
      viewer === 'host'
        ? app.readHostRuntimeQuizImageAsset({
            actor: (await getDemoAuthorActor()) ?? (() => {
              throw new AuthorizationError('Sign in as the demo author to load host runtime quiz images.');
            })(),
            roomCode,
            objectKey,
          })
        : app.readPlayerRuntimeQuizImageAsset({
            guestSessionId: (await getDemoGuestSessionId()) ?? (() => {
              throw new AuthorizationError('Join the room before loading runtime quiz images.');
            })(),
            roomCode,
            objectKey,
          })
    );

    return new Response(Uint8Array.from(asset.data).buffer, {
      headers: {
        'cache-control': 'no-store',
        'content-length': String(asset.bytes),
        'content-type': asset.content_type,
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return new Response(error.message, { status: 403 });
    }
    if (error instanceof NotFoundError) {
      return new Response(RUNTIME_ASSET_NOT_FOUND_MESSAGE, { status: 404 });
    }
    return new Response(RUNTIME_ASSET_LOAD_ERROR_MESSAGE, { status: 500 });
  }
}