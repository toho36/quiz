/// <reference types="bun-types" />

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { SectionNav } from '@/components/section-nav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type TestElementProps = {
  children?: ReactNode;
  name?: string;
  type?: string;
};

function flattenElements(node: ReactNode): Array<ReactElement<TestElementProps>> {
  if (Array.isArray(node)) {
    return node.flatMap(flattenElements);
  }

  if (!isValidElement<TestElementProps>(node)) {
    return [];
  }

  return [node, ...flattenElements(node.props.children)];
}

afterEach(() => {
  mock.restore();
});

describe('shared UI slice surfaces', () => {
  test('page shell and section card are composed from shared shadcn primitives with richer supporting content', async () => {
    const [pageShellSource, sectionCardSource] = await Promise.all([
      Bun.file('components/page-shell.tsx').text(),
      Bun.file('components/section-card.tsx').text(),
    ]);

    expect(pageShellSource).toContain("import { Badge }");
    expect(pageShellSource).toContain("import { Card, CardContent }");
    expect(pageShellSource).toContain("import { Separator }");
    expect(pageShellSource).toContain('shell-panel');
    expect(sectionCardSource).toContain("import { Badge }");
    expect(sectionCardSource).toContain('CardAction');
    expect(sectionCardSource).toContain('CardDescription');
    expect(sectionCardSource).toContain('CardHeader');
    expect(sectionCardSource).toContain('CardContent');
    expect(sectionCardSource).toContain('shell-card');
  });

  test('section nav composes route pills from shared badge and button primitives', () => {
    const elements = flattenElements(
      SectionNav({
        badge: 'Workspace',
        title: 'Authoring lanes',
        description: 'Shared route navigation.',
        routes: [{ href: '/dashboard', label: 'Dashboard', description: 'Demo dashboard', section: 'workspace' }],
      }),
    );

    expect(elements.some((element) => element.type === Badge)).toBe(true);
    expect(elements.some((element) => element.type === Button)).toBe(true);
  });

  test('join room form uses shared input, label, and button primitives with the same field contract', async () => {
    mock.module('@/app/actions', () => ({
      joinRoomAction: async () => {},
    }));

    const { JoinRoomForm } = await import('@/components/join-room-form');
    const elements = flattenElements(JoinRoomForm({ roomCode: 'ABCD-1234' }));

    expect(elements.some((element) => element.type === Label)).toBe(true);
    expect(elements.some((element) => element.type === Input && element.props.name === 'roomCode')).toBe(true);
    expect(elements.some((element) => element.type === Input && element.props.name === 'displayName')).toBe(true);
    expect(elements.some((element) => element.type === Button && element.props.type === 'submit')).toBe(true);
  });
});