import { describe, expect, test } from 'bun:test';

const runtimeThemeSurfaceFiles = [
  'app/(runtime)/host/page.tsx',
  'app/(runtime)/join/page.tsx',
  'app/(runtime)/play/[roomCode]/page.tsx',
  'components/protected-readiness-surfaces.tsx',
];

describe('workspace/runtime route surfaces', () => {
  test('runtime-facing surfaces avoid the old hard-coded slate/sky palette', async () => {
    const sources = await Promise.all(runtimeThemeSurfaceFiles.map((path) => Bun.file(path).text()));

    for (const source of sources) {
      expect(source).not.toContain('text-slate-');
      expect(source).not.toContain('bg-sky-');
      expect(source).not.toContain('text-sky-');
    }
  });

  test('workspace and runtime pages preserve critical route and action wiring', async () => {
    const [dashboardSource, authoringSource, hostSource, joinSource, playSource] = await Promise.all([
      Bun.file('app/(workspace)/dashboard/page.tsx').text(),
      Bun.file('app/(workspace)/authoring/page.tsx').text(),
      Bun.file('app/(runtime)/host/page.tsx').text(),
      Bun.file('app/(runtime)/join/page.tsx').text(),
      Bun.file('app/(runtime)/play/[roomCode]/page.tsx').text(),
    ]);

    expect(dashboardSource).toContain('createRoomAction');
    expect(dashboardSource).toContain('publishQuizAction');
    expect(dashboardSource).toContain("pathname: '/authoring'");
    expect(dashboardSource).toContain("pathname: '/host'");

    expect(authoringSource).toContain('saveQuizDetailsAction');
    expect(authoringSource).toContain('saveQuestionAction');
    expect(authoringSource).toContain('publishQuizAction');

    expect(hostSource).toContain('hostRoomAction');
    expect(hostSource).toContain('ensureDemoHostSessionId');
    expect(hostSource).toContain("pathname: '/join'");

    expect(joinSource).toContain('JoinRoomForm');
    expect(joinSource).toContain('getPublicRuntimeConfig');

    expect(playSource).toContain('reconnectRoomAction');
    expect(playSource).toContain('submitAnswerAction');
    expect(playSource).toContain("pathname: '/join'");
  });
});