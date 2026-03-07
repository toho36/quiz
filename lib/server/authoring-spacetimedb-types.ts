import { t } from 'spacetimedb';

export type SpacetimeAuthoringQuiz = {
  quiz_id: string;
  owner_user_id: string;
  title: string;
  description: string;
  status: string;
  default_scoring_mode: string;
  default_question_time_limit_seconds: number;
  shuffle_answers_default: boolean;
  created_at: string;
  updated_at: string;
  published_at: string | undefined;
};

export type SpacetimeAuthoringQuestion = {
  question_id: string;
  quiz_id: string;
  position: number;
  prompt: string;
  question_type: string;
  evaluation_policy: string;
  base_points: number;
  time_limit_seconds: number | undefined;
  shuffle_answers: boolean | undefined;
  created_at: string;
  updated_at: string;
};

export type SpacetimeAuthoringQuestionOption = {
  option_id: string;
  question_id: string;
  position: number;
  text: string;
  is_correct: boolean;
};

export type SpacetimeAuthoringQuestionDocument = {
  question: SpacetimeAuthoringQuestion;
  options: SpacetimeAuthoringQuestionOption[];
};

export type SpacetimeAuthoringQuizDocument = {
  quiz: SpacetimeAuthoringQuiz;
  questions: SpacetimeAuthoringQuestionDocument[];
};

export type SpacetimeAuthoringQuizSummary = {
  quiz_id: string;
  title: string;
  status: string;
  question_count: number;
  updated_at: string;
};

const authoringQuizType = t.object('AuthoringQuiz', {
  quiz_id: t.string(),
  owner_user_id: t.string(),
  title: t.string(),
  description: t.string(),
  status: t.string(),
  default_scoring_mode: t.string(),
  default_question_time_limit_seconds: t.u32(),
  shuffle_answers_default: t.bool(),
  created_at: t.string(),
  updated_at: t.string(),
  published_at: t.option(t.string()),
});

const authoringQuestionType = t.object('AuthoringQuestion', {
  question_id: t.string(),
  quiz_id: t.string(),
  position: t.u32(),
  prompt: t.string(),
  question_type: t.string(),
  evaluation_policy: t.string(),
  base_points: t.u32(),
  time_limit_seconds: t.option(t.u32()),
  shuffle_answers: t.option(t.bool()),
  created_at: t.string(),
  updated_at: t.string(),
});

const authoringQuestionOptionType = t.object('AuthoringQuestionOption', {
  option_id: t.string(),
  question_id: t.string(),
  position: t.u32(),
  text: t.string(),
  is_correct: t.bool(),
});

const authoringQuestionEntryType = t.object('AuthoringQuestionEntry', {
  question: authoringQuestionType,
  options: t.array(authoringQuestionOptionType),
});

export const authoringQuizDocumentType = t.object('AuthoringQuizDocument', {
  quiz: authoringQuizType,
  questions: t.array(authoringQuestionEntryType),
});

export const authoringQuizSummaryType = t.object('AuthoringQuizSummary', {
  quiz_id: t.string(),
  title: t.string(),
  status: t.string(),
  question_count: t.u32(),
  updated_at: t.string(),
});