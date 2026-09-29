-- Pump Accounts: run once in Supabase > SQL Editor
create extension if not exists pgcrypto;

create table pumps (id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz default now());
create table members (
  pump_id uuid references pumps on delete cascade, user_id uuid references auth.users on delete cascade,
  role text not null check (role in ('owner','manager','accountant','cashier')), full_name text,
  primary key (pump_id, user_id));
create table fuels (id uuid primary key default gen_random_uuid(), pump_id uuid not null references pumps on delete cascade, name text not null, rate numeric(12,2) not null default 0);
create table nozzles (id uuid primary key default gen_random_uuid(), pump_id uuid not null references pumps on delete cascade, name text not null,
  fuel_id uuid not null references fuels, initial_reading numeric(14,2) not null default 0, active boolean not null default true);
create table shift_days (id uuid primary key default gen_random_uuid(), pump_id uuid not null references pumps on delete cascade, day date not null,
  cashier text, rates jsonb not null default '{}', closed boolean not null default false, saved_by uuid, updated_at timestamptz default now(), unique (pump_id, day));
create table readings (shift_day_id uuid references shift_days on delete cascade, pump_id uuid not null references pumps on delete cascade,
  nozzle_id uuid references nozzles, opening numeric(14,2) not null, closing numeric(14,2), test_litres numeric(12,2) not null default 0,
  primary key (shift_day_id, nozzle_id));
-- Ledger foundations (posting from sales/expenses comes in the next phase)
create table accounts (id uuid primary key default gen_random_uuid(), pump_id uuid not null references pumps on delete cascade, code text not null, name text not null,
  type text not null check (type in ('asset','liability','equity','income','expense')), unique (pump_id, code));
create table journal_entries (id uuid primary key default gen_random_uuid(), pump_id uuid not null references pumps on delete cascade, entry_date date not null, memo text, source text, created_by uuid default auth.uid(), created_at timestamptz default now());
create table journal_lines (id uuid primary key default gen_random_uuid(), entry_id uuid not null references journal_entries on delete cascade, pump_id uuid not null references pumps on delete cascade,
  account_id uuid not null references accounts, debit numeric(14,2) not null default 0, credit numeric(14,2) not null default 0, check (debit >= 0 and credit >= 0));
create table audit_log (id bigint generated always as identity primary key, pump_id uuid, user_id uuid, table_name text, action text, old_row jsonb, new_row jsonb, at timestamptz default now());

create function my_role(p uuid) returns text language sql stable security definer set search_path = public as
$$ select role from members where pump_id = p and user_id = auth.uid() $$;
create function day_open(d uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from shift_days s where s.id = d and (not s.closed or my_role(s.pump_id) = 'owner')) $$;

create function audit() returns trigger language plpgsql security definer set search_path = public as $$
declare r jsonb := to_jsonb(coalesce(new, old));
begin
  insert into audit_log(pump_id, user_id, table_name, action, old_row, new_row)
  values ((r->>'pump_id')::uuid, auth.uid(), tg_table_name, tg_op, to_jsonb(old), to_jsonb(new));
  return coalesce(new, old);
end $$;
create trigger a1 after insert or update or delete on shift_days for each row execute function audit();
create trigger a2 after insert or update or delete on readings for each row execute function audit();
create trigger a3 after insert or update or delete on fuels for each row execute function audit();
create trigger a4 after insert or update or delete on nozzles for each row execute function audit();
create trigger a5 after insert or update or delete on journal_entries for each row execute function audit();

alter table pumps enable row level security; alter table members enable row level security;
alter table fuels enable row level security; alter table nozzles enable row level security;
alter table shift_days enable row level security; alter table readings enable row level security;
alter table accounts enable row level security; alter table journal_entries enable row level security;
alter table journal_lines enable row level security; alter table audit_log enable row level security;

create policy p_sel on pumps for select using (my_role(id) is not null);
create policy p_upd on pumps for update using (my_role(id) = 'owner');
create policy m_sel on members for select using (my_role(pump_id) is not null);
create policy f_sel on fuels for select using (my_role(pump_id) is not null);
create policy f_w on fuels for all using (my_role(pump_id) in ('owner','manager')) with check (my_role(pump_id) in ('owner','manager'));
create policy n_sel on nozzles for select using (my_role(pump_id) is not null);
create policy n_w on nozzles for all using (my_role(pump_id) in ('owner','manager')) with check (my_role(pump_id) in ('owner','manager'));
create policy sd_sel on shift_days for select using (my_role(pump_id) is not null);
create policy sd_ins on shift_days for insert with check (my_role(pump_id) in ('owner','manager','cashier') and (not closed or my_role(pump_id) = 'owner'));
create policy sd_upd on shift_days for update using (my_role(pump_id) in ('owner','manager','cashier') and (not closed or my_role(pump_id) = 'owner'))
  with check (my_role(pump_id) in ('owner','manager','cashier') and (not closed or my_role(pump_id) = 'owner'));
create policy sd_del on shift_days for delete using (my_role(pump_id) = 'owner');
create policy r_sel on readings for select using (my_role(pump_id) is not null);
create policy r_ins on readings for insert with check (my_role(pump_id) in ('owner','manager','cashier') and day_open(shift_day_id));
create policy r_upd on readings for update using (my_role(pump_id) in ('owner','manager','cashier') and day_open(shift_day_id))
  with check (my_role(pump_id) in ('owner','manager','cashier') and day_open(shift_day_id));
create policy r_del on readings for delete using (my_role(pump_id) = 'owner');
create policy a_sel on accounts for select using (my_role(pump_id) in ('owner','manager','accountant'));
create policy a_w on accounts for all using (my_role(pump_id) in ('owner','accountant')) with check (my_role(pump_id) in ('owner','accountant'));
create policy j_sel on journal_entries for select using (my_role(pump_id) in ('owner','manager','accountant'));
create policy j_w on journal_entries for all using (my_role(pump_id) in ('owner','accountant')) with check (my_role(pump_id) in ('owner','accountant'));
create policy jl_sel on journal_lines for select using (my_role(pump_id) in ('owner','manager','accountant'));
create policy jl_w on journal_lines for all using (my_role(pump_id) in ('owner','accountant')) with check (my_role(pump_id) in ('owner','accountant'));
create policy au_sel on audit_log for select using (my_role(pump_id) = 'owner');

create function create_pump(pump_name text) returns uuid language plpgsql security definer set search_path = public as $$
declare p uuid; fp uuid; fh uuid; fo uuid; i int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from members where user_id = auth.uid()) then raise exception 'You already belong to a pump'; end if;
  insert into pumps(name) values (pump_name) returning id into p;
  insert into members values (p, auth.uid(), 'owner', null);
  insert into fuels(pump_id, name) values (p, 'Petrol (PMG)') returning id into fp;
  insert into fuels(pump_id, name) values (p, 'Diesel (HSD)') returning id into fh;
  insert into fuels(pump_id, name) values (p, 'Hi-Octane (HOBC)') returning id into fo;
  for i in 1..8 loop insert into nozzles(pump_id, name, fuel_id) values (p, 'PMG ' || i, fp); end loop;
  for i in 1..2 loop insert into nozzles(pump_id, name, fuel_id) values (p, 'HSD ' || i, fh); end loop;
  for i in 1..4 loop insert into nozzles(pump_id, name, fuel_id) values (p, 'HOBC ' || i, fo); end loop;
  insert into accounts(pump_id, code, name, type) values
    (p,'1000','Cash in hand','asset'),(p,'1100','Bank','asset'),(p,'1200','Receivables','asset'),(p,'1300','Fuel stock','asset'),
    (p,'2000','Payable to PSO','liability'),(p,'3000','Owner equity','equity'),(p,'4000','Fuel sales','income'),(p,'5000','Expenses','expense');
  return p;
end $$;

create function add_member(p_pump uuid, p_email text, p_role text, p_name text) returns void language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  if my_role(p_pump) <> 'owner' then raise exception 'Only the owner can add members'; end if;
  select id into u from auth.users where lower(email) = lower(p_email);
  if u is null then raise exception 'That person must create an account first'; end if;
  insert into members values (p_pump, u, p_role, p_name)
  on conflict (pump_id, user_id) do update set role = excluded.role, full_name = excluded.full_name;
end $$;
revoke execute on function create_pump(text) from public, anon;
revoke execute on function add_member(uuid, text, text, text) from public, anon;
grant execute on function create_pump(text) to authenticated;
grant execute on function add_member(uuid, text, text, text) to authenticated;
