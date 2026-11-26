-- B612 單字星球：雲端進度表
-- 在 Supabase 專案的 SQL Editor 貼上這整段，按 Run 執行一次就好。

create table if not exists public.progress (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  state      jsonb not null,
  updated_at timestamptz not null default now()
);

-- 開啟列層級安全：每個人只能讀寫自己的那一列
alter table public.progress enable row level security;

create policy "read own progress"   on public.progress for select using (auth.uid() = user_id);
create policy "insert own progress" on public.progress for insert with check (auth.uid() = user_id);
create policy "update own progress" on public.progress for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 讓登入的使用者有權限存取這張表（RLS 仍然限制每個人只能碰自己的那一列）
grant select, insert, update on public.progress to authenticated;
