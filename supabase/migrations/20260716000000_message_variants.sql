-- Answer version history for the Regenerate button.
--
-- `variants`      : every generated version of an assistant reply, oldest first,
--                   INCLUDING the one currently shown. jsonb array of strings.
-- `variant_index` : which entry of `variants` is currently active.
--
-- `content` always mirrors variants[variant_index], so every existing reader
-- (exports, shared chats, the model's own history, analytics) keeps working
-- untouched and never needs to know variants exist.
--
-- Backwards compatible: both columns are nullable with no default, so existing
-- rows stay NULL and the UI shows no version arrows for them — no backfill, no
-- behavior change, safe to run on a live table.

alter table public.messages
  add column if not exists variants      jsonb,
  add column if not exists variant_index integer;

comment on column public.messages.variants is
  'Assistant reply versions, oldest first, including the active one. NULL = never regenerated.';
comment on column public.messages.variant_index is
  'Index into variants[] of the version mirrored in content.';

-- Guard against a variant_index that points nowhere. NULL variants (the common
-- case) is always allowed; when variants IS set the index must be in range.
alter table public.messages
  drop constraint if exists messages_variant_index_valid;
alter table public.messages
  add constraint messages_variant_index_valid check (
    variants is null
    or (
      jsonb_typeof(variants) = 'array'
      and variant_index is not null
      and variant_index >= 0
      and variant_index < jsonb_array_length(variants)
    )
  );

-- No RLS change required: both columns live on `messages`, which is already
-- scoped to the owning user by the existing row policies.
