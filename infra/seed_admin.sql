-- Seed the first Super Admin for a tenant.
-- Substitute :enrollment and :password before running, e.g. via bootstrap.sh:
--   psql "$DB_URL" -v enrollment="975116" -v password="changeme123" -f seed_admin.sql
--
-- Creates the auth user (enrollment@students.merzal.local), confirms it, links
-- a roster row, and promotes the profile to role='admin'. Idempotent.

do $$
declare
  v_enroll text := :'enrollment';
  v_pass   text := :'password';
  v_email  text := lower(regexp_replace(v_enroll, '[^a-z0-9._-]', '', 'gi')) || '@students.merzal.local';
  v_uid    uuid;
begin
  select id into v_uid from auth.users where email = v_email;
  if v_uid is null then
    v_uid := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) values (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_email,
      extensions.crypt(v_pass, extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name','Super Admin','enrollment',v_enroll), false, false,
      '', '', '', ''
    );
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
    values (gen_random_uuid(), v_email, v_uid,
            jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
            'email', now(), now(), now());
  else
    update auth.users
      set encrypted_password = extensions.crypt(v_pass, extensions.gen_salt('bf')),
          email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
      where id = v_uid;
  end if;

  insert into public.user_profiles (id, role, onboarding_done) values (v_uid, 'admin', false)
    on conflict (id) do update set role = 'admin';

  insert into public.students (name, mobile, status, user_id, password_set)
    values ('Super Admin', v_enroll, 'active', v_uid, true)
    on conflict (mobile) do update set status = 'active', user_id = v_uid, password_set = true;

  raise notice 'Super admin ready: enrollment=% email=%', v_enroll, v_email;
end $$;
