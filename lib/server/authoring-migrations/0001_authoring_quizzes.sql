create table if not exists authoring_quizzes (
  quiz_id text primary key,
  owner_user_id text not null,
  title text not null,
  status text not null check (status in ('draft', 'published', 'archived')),
  question_count integer not null,
  updated_at text not null,
  document_json text not null
);

create index if not exists authoring_quizzes_owner_updated_idx
on authoring_quizzes (owner_user_id, updated_at desc);