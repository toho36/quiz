/// <reference types="bun-types" />

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { isValidElement, type ReactNode } from 'react';
import { PageShell } from '@/components/page-shell';
import { SectionCard } from '@/components/section-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

type TestElementProps = {
  children?: ReactNode;
  name?: string;
  type?: string;
};

function flattenElements(node: ReactNode): Array<React.ReactElement<TestElementProps>> {
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
  test('page shell and section card are composed from shared shadcn primitives', () => {
    const shell = PageShell({
      eyebrow: 'Dashboard',
      title: 'Author dashboard',
      description: 'Shared shell copy.',
      children: <SectionCard title="Ready" eyebrow="Updated">Body</SectionCard>,
    });

    const shellElements = flattenElements(shell);
    const cardElements = flattenElements(SectionCard({ title: 'Ready', eyebrow: 'Updated', children: 'Body' }));

    expect(shellElements.some((element) => element.type === Badge)).toBe(true);
    expect(shellElements.some((element) => element.type === Separator)).toBe(true);
    expect(cardElements.some((element) => element.type === Card)).toBe(true);
    expect(cardElements.some((element) => element.type === CardHeader)).toBe(true);
    expect(cardElements.some((element) => element.type === CardContent)).toBe(true);
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