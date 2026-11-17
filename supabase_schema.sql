-- ==============================================================================
-- GIGACHAIN - Supabase Database Schema
-- Run this in your Supabase Dashboard: SQL Editor -> New query -> Paste & Run (Ctrl+Enter)
-- ==============================================================================

-- 1. Create Profiles Table (Linked with Supabase Auth Users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  email text,
  wallet_address text default '0x71C8A6987C2188B6Fa08779a1F04bE1049b4b9C3',
  balance_giga numeric(18, 4) default 0.0000,
  balance_usdt numeric(18, 2) default 0.00,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS) for data protection
alter table public.profiles enable row level security;

-- Policies: users can view and update only their own profile
create policy "Users can view own profile" 
  on public.profiles for select 
  using (auth.uid() = id);

create policy "Users can update own profile" 
  on public.profiles for update 
  using (auth.uid() = id);

-- 2. Trigger: Automatically create profile when a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'Gigachain Member'),
    new.email
  );
  return new;
end;
$$ language plpgsql security definer;

-- Attach trigger to auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 3. Staking Table (Liquid Staking Pool Records)
create table if not exists public.stakes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  amount_giga numeric(18, 4) not null,
  apy_rate numeric(5, 2) default 18.5,
  daily_yield numeric(18, 4) not null,
  staked_at timestamp with time zone default timezone('utc'::text, now()) not null,
  status text default 'active' check (status in ('active', 'unstaked'))
);

alter table public.stakes enable row level security;

create policy "Users can view and create own stakes"
  on public.stakes for all
  using (auth.uid() = user_id);

-- 4. Transactions Table (Swap and Staking Transaction History)
create table if not exists public.transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  tx_hash text not null,
  type text not null, -- 'swap', 'stake', 'unstake'
  from_token text,
  to_token text,
  amount_in numeric(18, 4),
  amount_out numeric(18, 4),
  status text default 'confirmed',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.transactions enable row level security;

create policy "Users can view and insert own transactions"
  on public.transactions for all
  using (auth.uid() = user_id);

