'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase as sb } from '../lib/supabase';

const f2 = (n) => (+n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toLocaleDateString('en-CA');
const CATS = ['Salaries', 'Electricity', 'Rent', 'Maintenance', 'Tea and refreshments', 'Stationery', 'Miscellaneous'];
const KINDS = { deposit: 'Cash deposited to bank', withdrawal: 'Cash withdrawn from bank', pso_payment: 'Payment to PSO', owner_in: 'Owner put money in', owner_out: 'Owner took money out' };

function useTable(t, pid, dateCol) {
  const [rows, setRows] = useState([]);
  const load = useCallback(async () => {
    const { data } = await sb.from(t).select('*').eq('pump_id', pid).order(dateCol, { ascending: false }).order('created_at', { ascending: false }).limit(1000);
    setRows(data || []);
  }, [t, pid, dateCol]);
  useEffect(() => { load(); }, [load]);
  return [rows, load];
}
async function add(t, pid, v, toast, after) {
  const u = (await sb.auth.getUser()).data.user;
  const { error } = await sb.from(t).insert({ pump_id: pid, created_by: u.id, ...v });
  if (error) { toast(error.message); return false; }
  toast('Saved'); after(); return true;
}
async function remove(t, id, toast, after) {
  if (!confirm('Delete this entry? This cannot be undone.')) return;
  const { error } = await sb.from(t).delete().eq('id', id);
  error ? toast(error.message) : after();
}

export function Finance({ pid, role, fuels, toast }) {
  const subs = role === 'cashier' ? [['stock', 'Stock and dips']] : [['money', 'Cash and bank'], ['exp', 'Expenses'], ['pur', 'Fuel purchases'], ['stock', 'Stock and dips']];
  const [sub, setSub] = useState(subs[0][0]);
  const p = { pid, role, fuels, toast };
  return (
    <>
      <div className="bar">{subs.map(([k, l]) => <button key={k} className={sub === k ? 'on' : ''} onClick={() => setSub(k)}>{l}</button>)}</div>
      {sub === 'money' && <Money {...p} />}
      {sub === 'exp' && <Expenses {...p} />}
      {sub === 'pur' && <Purchases {...p} />}
      {sub === 'stock' && <Stock {...p} />}
    </>
  );
}

function Money({ pid, role, toast }) {
  const [rows, load] = useTable('money_txns', pid, 'txn_date'), [tb, setTb] = useState([]);
  const [f, setF] = useState({ date: today(), kind: 'deposit', amount: '', acct: 'cash', note: '' });
  const loadTb = useCallback(async () => { const { data } = await sb.from('trial_balance').select('*').eq('pump_id', pid); setTb(data || []); }, [pid]);
  useEffect(() => { loadTb(); }, [loadTb]);
  const bal = (c) => { const x = tb.find((t) => t.code === c); return x ? x.debit - x.credit : 0; };
  const after = () => { load(); loadTb(); };
  const needAcct = ['pso_payment', 'owner_in', 'owner_out'].includes(f.kind);
  return (
    <>
      <div className="card"><div className="sum">
        <div><span className="mu">Cash in hand</span><b>{f2(bal('1000'))}</b></div>
        <div><span className="mu">Bank</span><b>{f2(bal('1100'))}</b></div>
        <div><span className="mu">Owed to PSO</span><b>{f2(-bal('2000'))}</b><span className="mu">A minus sign means paid in advance</span></div>
        <div><span className="mu">Receivable from customers</span><b>{f2(bal('1200'))}</b></div>
      </div></div>
      <div className="card"><h2>Record a cash or bank movement</h2><div className="bar">
        <label>Date<input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
        <label>Type<select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        {needAcct && <label>{f.kind === 'owner_in' ? 'Received in' : 'Paid from'}<select value={f.acct} onChange={(e) => setF({ ...f, acct: e.target.value })}><option value="cash">Cash</option><option value="bank">Bank</option></select></label>}
        <label>Amount<input type="number" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>
        <label>Note<input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
        <button className="pri" disabled={!(+f.amount > 0)} onClick={async () => { if (await add('money_txns', pid, { txn_date: f.date, kind: f.kind, amount: +f.amount, pay_account: needAcct ? f.acct : null, note: f.note || null }, toast, after)) setF({ ...f, amount: '', note: '' }); }}>Save</button>
      </div></div>
      <div className="card sc"><table><thead><tr><th>Date</th><th>Type</th><th>Account</th><th>Note</th><th className="n">Amount</th><th></th></tr></thead>
        <tbody>{rows.length ? rows.map((x) => <tr key={x.id}><td>{x.txn_date}</td><td>{KINDS[x.kind]}</td><td>{x.pay_account || ''}</td><td>{x.note}</td><td className="n">{f2(x.amount)}</td>
          <td>{role === 'owner' && <button onClick={() => remove('money_txns', x.id, toast, after)}>Delete</button>}</td></tr>) : <tr><td colSpan="6" className="mu">Nothing recorded yet.</td></tr>}</tbody></table></div>
    </>
  );
}

function Expenses({ pid, role, toast }) {
  const [rows, load] = useTable('expenses', pid, 'exp_date');
  const [f, setF] = useState({ date: today(), cat: '', amount: '', acct: 'cash', note: '' }), [mo, setMo] = useState(today().slice(0, 7));
  const list = rows.filter((x) => x.exp_date.startsWith(mo)), by = {};
  list.forEach((x) => { by[x.category] = (by[x.category] || 0) + +x.amount; });
  const total = list.reduce((a, x) => a + +x.amount, 0);
  return (
    <>
      <div className="card"><h2>Add expense</h2><div className="bar">
        <label>Date<input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
        <label>Category<input list="cats" value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })} /></label>
        <datalist id="cats">{CATS.map((c) => <option key={c} value={c} />)}</datalist>
        <label>Amount<input type="number" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>
        <label>Paid from<select value={f.acct} onChange={(e) => setF({ ...f, acct: e.target.value })}><option value="cash">Cash</option><option value="bank">Bank</option></select></label>
        <label>Note<input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
        <button className="pri" disabled={!(+f.amount > 0) || !f.cat.trim()} onClick={async () => { if (await add('expenses', pid, { exp_date: f.date, category: f.cat.trim(), amount: +f.amount, pay_account: f.acct, note: f.note || null }, toast, load)) setF({ ...f, amount: '', note: '' }); }}>Save</button>
      </div></div>
      <div className="card"><div className="bar"><h2 style={{ margin: 0 }}>Month</h2><input type="month" value={mo} onChange={(e) => e.target.value && setMo(e.target.value)} /></div>
        <div className="sum">{Object.entries(by).map(([k, v]) => <div key={k}><span className="mu">{k}</span><b>{f2(v)}</b></div>)}<div><span className="mu">Total for the month</span><b>{f2(total)}</b></div></div></div>
      <div className="card sc"><table><thead><tr><th>Date</th><th>Category</th><th>Paid from</th><th>Note</th><th className="n">Amount</th><th></th></tr></thead>
        <tbody>{list.length ? list.map((x) => <tr key={x.id}><td>{x.exp_date}</td><td>{x.category}</td><td>{x.pay_account}</td><td>{x.note}</td><td className="n">{f2(x.amount)}</td>
          <td>{role === 'owner' && <button onClick={() => remove('expenses', x.id, toast, load)}>Delete</button>}</td></tr>) : <tr><td colSpan="6" className="mu">No expenses in this month.</td></tr>}</tbody></table></div>
    </>
  );
}

function Purchases({ pid, role, fuels, toast }) {
  const [rows, load] = useTable('purchases', pid, 'pur_date');
  const [f, setF] = useState({ date: today(), fuel: '', litres: '', amount: '', inv: '', note: '' });
  return (
    <>
      <div className="card"><h2>Record a fuel delivery from PSO</h2><div className="bar">
        <label>Date received<input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
        <label>Fuel<select value={f.fuel} onChange={(e) => setF({ ...f, fuel: e.target.value })}><option value="">Select</option>{fuels.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label>Litres<input type="number" step="0.01" value={f.litres} onChange={(e) => setF({ ...f, litres: e.target.value })} /></label>
        <label>Invoice amount<input type="number" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>
        <label>Invoice no.<input value={f.inv} onChange={(e) => setF({ ...f, inv: e.target.value })} /></label>
        <label>Note<input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
        <button className="pri" disabled={!f.fuel || !(+f.litres > 0) || !(+f.amount > 0)} onClick={async () => { if (await add('purchases', pid, { pur_date: f.date, fuel_id: f.fuel, litres: +f.litres, amount: +f.amount, invoice_no: f.inv || null, note: f.note || null }, toast, load)) setF({ ...f, litres: '', amount: '', inv: '', note: '' }); }}>Save</button>
      </div><p className="mu">A delivery adds to fuel stock and to what you owe PSO. Record what you pay PSO under Cash and bank, as a payment to PSO.</p></div>
      <div className="card sc"><table><thead><tr><th>Date</th><th>Fuel</th><th>Invoice</th><th className="n">Litres</th><th className="n">Amount</th><th className="n">Per litre</th><th></th></tr></thead>
        <tbody>{rows.length ? rows.map((x) => <tr key={x.id}><td>{x.pur_date}</td><td>{fuels.find((y) => y.id === x.fuel_id)?.name}</td><td>{x.invoice_no}</td><td className="n">{f2(x.litres)}</td><td className="n">{f2(x.amount)}</td><td className="n">{f2(x.amount / x.litres)}</td>
          <td>{role === 'owner' && <button onClick={() => remove('purchases', x.id, toast, load)}>Delete</button>}</td></tr>) : <tr><td colSpan="7" className="mu">No deliveries recorded yet.</td></tr>}</tbody></table></div>
    </>
  );
}

function Stock({ pid, role, fuels, toast }) {
  const [rows, load] = useTable('stock_dips', pid, 'dip_date'), [v, setV] = useState([]);
  const [f, setF] = useState({ date: today(), fuel: '', litres: '', note: '' });
  const lv = useCallback(async () => { const { data } = await sb.rpc('stock_variance', { p_pump: pid }); setV(data || []); }, [pid]);
  useEffect(() => { lv(); }, [lv]);
  const after = () => { load(); lv(); };
  const fn = (id) => fuels.find((x) => x.id === id)?.name;
  return (
    <>
      <div className="card"><h2>Record a tank dip</h2><div className="bar">
        <label>Date<input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
        <label>Fuel<select value={f.fuel} onChange={(e) => setF({ ...f, fuel: e.target.value })}><option value="">Select</option>{fuels.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label>Total litres in tanks<input type="number" step="0.01" value={f.litres} onChange={(e) => setF({ ...f, litres: e.target.value })} /></label>
        <label>Note<input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
        <button className="pri" disabled={!f.fuel || f.litres === ''} onClick={async () => { if (await add('stock_dips', pid, { dip_date: f.date, fuel_id: f.fuel, litres: +f.litres, note: f.note || null }, toast, after)) setF({ ...f, litres: '', note: '' }); }}>Save</button>
      </div><p className="mu">Take the dip at the end of the day, after that day's sales. Convert the dip reading to litres with your tank chart and enter the total for all tanks of that fuel.</p></div>
      <div className="card sc"><h2>Stock variance</h2><table><thead><tr><th>Fuel</th><th>Period</th><th className="n">Opening</th><th className="n">Purchased</th><th className="n">Sold</th><th className="n">Expected</th><th className="n">Actual dip</th><th className="n">Variance</th><th className="n">% of sold</th></tr></thead>
        <tbody>{v.length ? v.map((x, i) => { const pct = +x.o_sold > 0 ? (100 * x.o_var) / x.o_sold : 0, bad = x.o_var < 0 && pct < -0.5; return (
          <tr key={i}><td>{fn(x.o_fuel)}</td><td>{x.o_from} to {x.o_to}</td><td className="n">{f2(x.o_open)}</td><td className="n">{f2(x.o_purch)}</td><td className="n">{f2(x.o_sold)}</td><td className="n">{f2(x.o_expected)}</td><td className="n">{f2(x.o_actual)}</td>
            <td className={'n' + (bad ? ' bad' : '')}>{f2(x.o_var)}</td><td className={'n' + (bad ? ' bad' : '')}>{f2(pct)}%</td></tr>); }) : <tr><td colSpan="9" className="mu">Variance appears once a fuel has two dips.</td></tr>}</tbody></table>
        <p className="mu">Variance = actual dip minus expected stock. A minus sign means a shortage. Shortages worse than 0.5% of litres sold are shown in red; this threshold is only a visual flag.</p></div>
      <div className="card sc"><h2>Dips recorded</h2><table><thead><tr><th>Date</th><th>Fuel</th><th className="n">Litres</th><th>Note</th><th></th></tr></thead>
        <tbody>{rows.length ? rows.map((x) => <tr key={x.id}><td>{x.dip_date}</td><td>{fn(x.fuel_id)}</td><td className="n">{f2(x.litres)}</td><td>{x.note}</td>
          <td>{role === 'owner' && <button onClick={() => remove('stock_dips', x.id, toast, after)}>Delete</button>}</td></tr>) : <tr><td colSpan="5" className="mu">No dips yet.</td></tr>}</tbody></table></div>
    </>
  );
}
