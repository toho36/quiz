import { getDemoAppService } from '@/lib/server/demo-app-service';
import { getDemoAuthorActor } from '@/lib/server/demo-session';
import { AuthorizationError, NotFoundError } from '@/lib/server/service-errors';

const AUTHORING_ASSET_NOT_FOUND_MESSAGE = 'Quiz image preview was not found.';
const AUTHORING_ASSET_LOAD_ERROR_MESSAGE = 'Could not load quiz image preview.';

export async function GET(request: Request) {
  try {
    const actor = await getDemoAuthorActor();
    if (!actor) {
      throw new AuthorizationError('Sign in as the demo author to preview quiz images.');
    }

    const { searchParams } = new URL(request.url);
    const quizId = searchParams.get('quizId')?.trim();
    const objectKey = searchParams.get('objectKey')?.trim();
    if (!quizId || !objectKey) {
      return new Response('Missing quizId or objectKey.', { status: 400 });
    }

    const asset = await getDemoAppService().readAuthoringQuizImageAsset({ actor, quizId, objectKey });
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
      return new Response(AUTHORING_ASSET_NOT_FOUND_MESSAGE, { status: 404 });
    }
    return new Response(AUTHORING_ASSET_LOAD_ERROR_MESSAGE, { status: 500 });
  }
}