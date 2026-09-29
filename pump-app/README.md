# Pump Accounts (Phase 1)

Multi-pump web app: login, roles (owner / manager / accountant / cashier), configurable fuels and nozzles,
daily sales register with test litres, day closing, audit log, and ledger tables ready for Phase 2.

## 1. Create the database (10 minutes)
1. Create a free project at https://supabase.com.
2. Open SQL Editor, paste all of `supabase/schema.sql`, click Run. It should finish with no errors.
3. Authentication > Providers > Email: for testing, turn OFF "Confirm email" (turn it back on before real use).
4. Project Settings > API: copy the Project URL and the `anon` public key.

## 2. Run it on your computer
1. Install Node.js LTS from https://nodejs.org.
2. In this folder, copy `.env.example` to `.env.local` and paste your URL and anon key.
3. Run `npm install`, then `npm run dev`, then open http://localhost:3000.
4. Create an account, then create your pump. It starts with 8 PMG, 2 HSD and 4 HOBC nozzles; change them in Setup.
5. In Setup, set the rates and each nozzle's starting meter reading. Then enter a day in Daily register.

## 3. Add staff
Staff open the app and create an account. The owner then opens Team, enters their email and role, and saves.
- cashier: enters and saves readings on open days
- manager: same, plus Setup
- accountant: reads accounting data (full use comes in Phase 2)
- owner: everything, including closing/reopening/deleting days and Team

## 4. Test before trusting it
- Sign in as each role (use a second browser) and confirm a cashier cannot edit a closed day, open Setup or Team.
- Enter a week of real readings alongside your paper register and compare litres and amounts every day.
- Check the audit trail in Supabase: Table Editor > audit_log.

## 5. Deploy
1. Put this folder on GitHub (private repository). `.env.local` is ignored and stays off GitHub.
2. Import the repository at https://vercel.com, add the two environment variables, and deploy.
3. In Supabase > Authentication > URL Configuration, set Site URL to your Vercel address.

## Security notes
- The anon key is meant to be public; Row Level Security in schema.sql is what protects each pump's data.
- Never put the `service_role` key in this app or in GitHub.
- The free Supabase plan does not include daily backups you can restore from. Before real use, upgrade to a paid plan
  with backups, or export the tables regularly.

## Next phases
Phase 2: post sales to the ledger, credit customers and receivables. Phase 3: bank and cash, expenses, tank dips and
stock variance. Phase 4: reports and Excel/PDF export.
