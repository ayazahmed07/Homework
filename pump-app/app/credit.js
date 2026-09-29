'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase as sb } from '../lib/supabase';

const f2 = (n) => (+n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toLocaleDateString('en-CA');

// Oldest sales are treated as paid first; whatever is left is aged from its sale date
function aging(sales, recovered) {
  let rec = recovered; const b = [0, 0, 0], now = new Date(today());
  for (const s of sales) {
    let amt = +s.amount; const use = Math.min(rec, amt); rec -= use; amt -= use;
    if (amt > 0) { const age = (now - new Date(s.txn_date)) / 864e5; b[age <= 30 ? 0 : age <= 60 ? 1 : 2] += amt; }
  }
  return b;
}

export function Customers({ pid, role, fuels, toast }) {
  const [cs, setCs] = useState([]), [tx, setTx] = useState([]), [sel, setSel] = useState('');
  const [nc, setNc] = useState({ name: '', phone: '', limit: '' });
  const [s, setS] = useState({ date: today(), fuel: '', litres: '', amount: '', vehicle: '', note: '' });
  const [r, setR] = useState({ date: today(), amount: '', acct: 'cash', note: '' });
  const load = useCallback(async () => {
    const [c, t] = await Promise.all([
      sb.from('customers').select('*').eq('pump_id', pid).order('name'),
      sb.from('credit_txns').select('*').eq('pump_id', pid).order('txn_date').order('created_at').limit(5000)]);
    setCs(c.data || []); setTx(t.data || []);
  }, [pid]);
  useEffect(() => { load(); }, [load]);
  const rows = cs.map((c) => {
    const t = tx.filter((x) => x.customer_id === c.id), sales = t.filter((x) => x.kind === 'sale');
    const S = sales.reduce((a, x) => a + +x.amount, 0), R = t.filter((x) => x.kind === 'recovery').reduce((a, x) => a + +x.amount, 0);
    return { c, sales: S, rec: R, bal: S - R, ag: aging(sales, R) };
  });
  const totBal = rows.reduce((a, x) => a + x.bal, 0);
  const cur = cs.find((c) => c.id === sel);
  const addC = async () => {
    const { error } = await sb.from('customers').insert({ pump_id: pid, name: nc.name.trim(), phone: nc.phone || null, credit_limit: +nc.limit || 0 });
    if (error) return toast(error.message); setNc({ name: '', phone: '', limit: '' }); load();
  };
  const addTx = async (v) => {
    const u = (await sb.auth.getUser()).data.user;
    const { error } = await sb.from('credit_txns').insert({ pump_id: pid, customer_id: sel, created_by: u.id, ...v });
    if (error) { toast(error.message); return false; } toast('Saved'); load(); return true;
  };
  const del = async (t) => { if (!confirm('Delete this entry? This cannot be undone.')) return; const { error } = await sb.from('credit_txns').delete().eq('id', t.id); error ? toast(error.message) : load(); };
  let run = 0;
  const stmt = tx.filter((x) => x.customer_id === sel).map((x) => { run += x.kind === 'sale' ? +x.amount : -x.amount; return { ...x, run }; });
  const curRow = rows.find((x) => x.c.id === sel);
  return (
    <>
      <div className="card"><h2>Credit customers</h2>
        <div className="sc"><table><thead><tr><th>Customer</th><th className="n">Credit sales</th><th className="n">Recovered</th><th className="n">Balance</th><th className="n">0-30 days</th><th className="n">31-60</th><th className="n">60+</th><th></th></tr></thead>
          <tbody>{rows.length ? rows.map((x) => (
            <tr key={x.c.id}><td><button onClick={() => setSel(x.c.id)} className={sel === x.c.id ? 'on' : ''}>{x.c.name}</button></td>
              <td className="n">{f2(x.sales)}</td><td className="n">{f2(x.rec)}</td>
              <td className={'n' + (x.c.credit_limit > 0 && x.bal > x.c.credit_limit ? ' bad' : '')}>{f2(x.bal)}</td>
              <td className="n">{f2(x.ag[0])}</td><td className="n">{f2(x.ag[1])}</td><td className="n">{f2(x.ag[2])}</td>
              <td className="mu">{x.c.credit_limit > 0 ? 'Limit ' + f2(x.c.credit_limit) : ''}</td></tr>)) : <tr><td colSpan="8" className="mu">No customers yet.</td></tr>}</tbody>
          <tfoot><tr><th>Total receivable</th><th></th><th></th><th className="n">{f2(totBal)}</th><th colSpan="4"></th></tr></tfoot></table></div>
        {role !== 'cashier' && <div className="bar">
          <label>New customer<input value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} /></label>
          <label>Phone<input value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} /></label>
          <label>Credit limit (optional)<input type="number" value={nc.limit} onChange={(e) => setNc({ ...nc, limit: e.target.value })} /></label>
          <button className="pri" disabled={!nc.name.trim()} onClick={addC}>Add customer</button></div>}
      </div>
      {cur && (<>
        <div className="card"><h2>{cur.name}: balance {f2(curRow?.bal)}</h2>
          <div className="bar"><b>Credit sale</b>
            <label>Date<input type="date" value={s.date} onChange={(e) => setS({ ...s, date: e.target.value })} /></label>
            <label>Fuel<select value={s.fuel} onChange={(e) => setS({ ...s, fuel: e.target.value })}><option value="">-</option>{fuels.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
            <label>Litres<input type="number" step="0.01" value={s.litres} onChange={(e) => { const l = e.target.value, f = fuels.find((x) => x.id === s.fuel); setS({ ...s, litres: l, amount: f && l ? String(+(l * f.rate).toFixed(2)) : s.amount }); }} /></label>
            <label>Amount<input type="number" step="0.01" value={s.amount} onChange={(e) => setS({ ...s, amount: e.target.value })} /></label>
            <label>Vehicle no.<input value={s.vehicle} onChange={(e) => setS({ ...s, vehicle: e.target.value })} /></label>
            <label>Note<input value={s.note} onChange={(e) => setS({ ...s, note: e.target.value })} /></label>
            <button className="pri" disabled={!(+s.amount > 0)} onClick={async () => { if (await addTx({ kind: 'sale', txn_date: s.date, fuel_id: s.fuel || null, litres: +s.litres || null, amount: +s.amount, vehicle: s.vehicle || null, note: s.note || null })) setS({ ...s, litres: '', amount: '', vehicle: '', note: '' }); }}>Add sale</button></div>
          <div className="bar"><b>Recovery</b>
            <label>Date<input type="date" value={r.date} onChange={(e) => setR({ ...r, date: e.target.value })} /></label>
            <label>Amount<input type="number" step="0.01" value={r.amount} onChange={(e) => setR({ ...r, amount: e.target.value })} /></label>
            <label>Received in<select value={r.acct} onChange={(e) => setR({ ...r, acct: e.target.value })}><option value="cash">Cash</option><option value="bank">Bank</option></select></label>
            <label>Note<input value={r.note} onChange={(e) => setR({ ...r, note: e.target.value })} /></label>
            <button className="pri" disabled={!(+r.amount > 0)} onClick={async () => { if (await addTx({ kind: 'recovery', txn_date: r.date, amount: +r.amount, pay_account: r.acct, note: r.note || null })) setR({ ...r, amount: '', note: '' }); }}>Add recovery</button></div>
          <p className="mu">Credit sales are counted in that day's total sales. Enter them before the owner closes the day.</p>
        </div>
        <div className="card sc"><h2>Statement</h2><table><thead><tr><th>Date</th><th>Type</th><th>Details</th><th className="n">Sale</th><th className="n">Recovery</th><th className="n">Balance</th><th></th></tr></thead>
          <tbody>{stmt.length ? stmt.map((x) => (
            <tr key={x.id}><td>{x.txn_date}</td><td>{x.kind === 'sale' ? 'Credit sale' : 'Recovery (' + x.pay_account + ')'}</td>
              <td>{[fuels.find((f) => f.id === x.fuel_id)?.name, x.litres && f2(x.litres) + ' L', x.vehicle, x.note].filter(Boolean).join(', ')}</td>
              <td className="n">{x.kind === 'sale' ? f2(x.amount) : ''}</td><td className="n">{x.kind === 'recovery' ? f2(x.amount) : ''}</td><td className="n">{f2(x.run)}</td>
              <td>{role === 'owner' && <button onClick={() => del(x)}>Delete</button>}</td></tr>)) : <tr><td colSpan="7" className="mu">No entries yet.</td></tr>}</tbody></table></div>
      </>)}
    </>
  );
}

export function Ledger({ pid }) {
  const [tb, setTb] = useState([]), [je, setJe] = useState([]);
  useEffect(() => { (async () => {
    const a = await sb.from('trial_balance').select('*').eq('pump_id', pid).order('code');
    const b = await sb.from('journal_entries').select('id,entry_date,memo,journal_lines(debit,credit,accounts(name))').eq('pump_id', pid).order('entry_date', { ascending: false }).order('created_at', { ascending: false }).limit(40);
    setTb(a.data || []); setJe(b.data || []);
  })(); }, [pid]);
  const D = tb.reduce((a, x) => a + +x.debit, 0), C = tb.reduce((a, x) => a + +x.credit, 0);
  return (
    <>
      <div className="card sc"><h2>Trial balance</h2><table><thead><tr><th>Code</th><th>Account</th><th className="n">Debit</th><th className="n">Credit</th><th className="n">Balance (Dr - Cr)</th></tr></thead>
        <tbody>{tb.map((x) => <tr key={x.code}><td>{x.code}</td><td>{x.name}</td><td className="n">{f2(x.debit)}</td><td className="n">{f2(x.credit)}</td><td className="n">{f2(x.debit - x.credit)}</td></tr>)}</tbody>
        <tfoot><tr><th colSpan="2">Total</th><th className="n">{f2(D)}</th><th className="n">{f2(C)}</th><th className={'n' + (Math.abs(D - C) > 0.005 ? ' bad' : '')}>{Math.abs(D - C) > 0.005 ? 'Out of balance' : 'Balanced'}</th></tr></tfoot></table>
        <p className="mu">Fuel purchases, expenses and bank entries arrive in Phase 3, so profit is not shown yet.</p></div>
      <div className="card sc"><h2>Recent entries</h2><table><thead><tr><th>Date</th><th>Memo</th><th>Lines</th></tr></thead>
        <tbody>{je.length ? je.map((e) => <tr key={e.id}><td>{e.entry_date}</td><td>{e.memo}</td>
          <td>{e.journal_lines.map((l) => (+l.debit > 0 ? 'Dr ' : 'Cr ') + l.accounts?.name + ' ' + f2(+l.debit || +l.credit)).join('  /  ')}</td></tr>) : <tr><td colSpan="3" className="mu">No entries yet. Close a day or add a credit sale.</td></tr>}</tbody></table></div>
    </>
  );
}
