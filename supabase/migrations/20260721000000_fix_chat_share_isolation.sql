-- Fix cross-user chat leak. The public "share via link" feature exposed EVERY
-- shared chat + its messages to ALL users: the "public read" policies matched
-- any row present in shared_chats for role `public`, and the client lists chats
-- with no user_id filter (RLS was the only guard). Replace the broad table-read
-- policies with a token-scoped SECURITY DEFINER function so only someone holding
-- the exact secret link can read that ONE conversation — nothing leaks into any
-- signed-in user's normal chat list, and tokens are no longer enumerable.
--
-- Applied to the live project via the Supabase MCP on 2026-07-21; kept here so
-- the schema history in the repo matches production.

create or replace function public.get_shared_chat(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_chat_id uuid;
  result jsonb;
begin
  if p_token is null or length(p_token) < 8 then
    return null;
  end if;
  select chat_id into v_chat_id from public.shared_chats where token = p_token;
  if v_chat_id is null then
    return null;
  end if;
  select jsonb_build_object(
    'title', coalesce((select title from public.chats where id = v_chat_id), 'Shared conversation'),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'chat_id', m.chat_id,
        'role', m.role,
        'content', m.content,
        'mode', m.mode,
        'created_at', m.created_at
      ) order by m.created_at asc)
      from public.messages m
      where m.chat_id = v_chat_id
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke execute on function public.get_shared_chat(text) from public;
grant execute on function public.get_shared_chat(text) to anon, authenticated;

-- Remove the over-broad policies that leaked shared chats into every user's list.
drop policy if exists "public read shared chat" on public.chats;
drop policy if exists "public read shared messages" on public.messages;
drop policy if exists "public read share tokens" on public.shared_chats;

-- Least-privilege: these self-scoping RPCs are never legitimately called by anon.
-- (admin_analytics() gates on is_super_admin(); active_temp_knowledge() joins on
-- auth.uid() and returns nothing without a session.)
revoke execute on function public.admin_analytics() from anon;
revoke execute on function public.active_temp_knowledge() from anon;
