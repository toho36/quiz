import { describe, expect, test } from 'bun:test';

describe('authoring page surface', () => {
  test('wires question and option editing actions into the authoring UI', async () => {
    const pageSource = await Bun.file('app/(workspace)/authoring/page.tsx').text();

    expect(pageSource).toContain('addQuestionAction');
    expect(pageSource).toContain('saveQuestionAction');
    expect(pageSource).toContain('addOptionAction');
    expect(pageSource).toContain('moveOptionAction');
    expect(pageSource).toContain('deleteOptionAction');
    expect(pageSource).toContain('name="questionId"');
    expect(pageSource).toContain('name="optionId"');
    expect(pageSource).toContain('type="checkbox"');
    expect(pageSource).toContain('Add question');
    expect(pageSource).toContain('Save question');
    expect(pageSource).toContain('Add option');
  });
});