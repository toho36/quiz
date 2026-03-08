import { describe, expect, test } from 'bun:test';
import cs from '@/lib/i18n/dictionaries/cs';
import en from '@/lib/i18n/dictionaries/en';
import { formatLocalizedClientFacingError } from '@/lib/server/client-facing-errors';
import { AuthorizationError, InvalidOperationError } from '@/lib/server/service-errors';

describe('action localization', () => {
  test('exposes localized notice copy for representative action outcomes', () => {
    expect(cs.actionMessages.notices.draftSaved).toBe('Koncept uložen.');
    expect(cs.actionMessages.fallbacks.createRoom).toBe('Nepodařilo se teď vytvořit místnost moderátora. Zkuste to prosím znovu.');
    expect(en.actionMessages.notices.draftSaved).toBe('Draft saved.');
    expect(en.actionMessages.fallbacks.createRoom).toBe('Could not create the host room right now. Please try again.');
  });

  test('localizes safe authorization and invalid-operation errors for Czech and English', () => {
    expect(formatLocalizedClientFacingError(new AuthorizationError('Sign in as the demo author to continue.'), cs.actionMessages.errors, cs.actionMessages.fallbacks.saveQuizDetails)).toBe(
      'Přihlaste se jako demo autor a pokračujte.',
    );
    expect(
      formatLocalizedClientFacingError(
        new InvalidOperationError('Only published quizzes can bootstrap runtime rooms'),
        cs.actionMessages.errors,
        cs.actionMessages.fallbacks.createRoom,
      ),
    ).toBe('Moderátorskou místnost lze vytvořit jen z publikovaného kvízu.');

    expect(
      formatLocalizedClientFacingError(
        new InvalidOperationError('Late join is rejected once gameplay is active'),
        en.actionMessages.errors,
        en.actionMessages.fallbacks.joinRoom,
      ),
    ).toBe('Late joins are blocked once gameplay is active.');
  });
});