'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase as sb } from '../lib/supabase';

const f2 = (n) => (+n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toLocaleDateString('en-CA');
const NAMES = { '1000': 'Cash in hand', '1100': 'Bank', '1300': 'Fuel stock', '2000': 'Owed to PSO' };

export function Opening({ pid, role, fuels, toast }) {
  const [asOf, setAsOf] = useState(today()), [cash, setCash] = useState(''), [bank, setBank] = useState(''), [pso, setPso] = useState('');
  const [stock, setStock] = useState({}), [cust, setCust] = useState([]), [cb, setCb] = useState({}), [ent, setEnt] = useState([]);
  const load = useCallback(async () => {
    const [c, e] = await Promise.all([
      sb.from('customers').select('id,name').eq('pump_id', pid).order('name'),
      sb.from('opening_entries').select('*').eq('pump_id', pid).order('created_at')]);
    setCust(c.data || []); setEnt(e.data || []);
  }, [pid]);
  useEffect(() => { load(); }, [load]);
  const sv = (id) => (+stock[id]?.l || 0) * (+stock[id]?.c || 0);
  const stockVal = fuels.reduce((a, f) => a + sv(f.id), 0), custTot = cust.reduce((a, c) => a + (+cb[c.id] || 0), 0);
  const assets = (+cash || 0) + (+bank || 0) + stockVal + custTot, equity = assets - (+pso || 0);
  const setSt = (id, k, v) => setStock({ ...stock, [id]: { ...stock[id], [k]: v } });

  const saveMain = async () => {
    if (fuels.some((f) => +stock[f.id]?.l > 0 && !(+stock[f.id]?.c > 0))) return toast('Enter a cost per litre for every fuel that has stock.');
    const u = (await sb.auth.getUser()).data.user, rows = [];
    const push = (code, amt) => { if (+amt) rows.push({ pump_id: pid, as_of: asOf, account_code: code, amount: +amt, created_by: u.id }); };
    push('1000', cash); push('1100', bank); push('2000', pso);
    fuels.forEach((f) => { const v = sv(f.id); if (v > 0) rows.push({ pump_id: pid, as_of: asOf, account_code: '1300', amount: +v.toFixed(2), fuel_id: f.id, litres: +stock[f.id].l, created_by: u.id }); });
    if (!rows.length) return toast('Nothing to save');
    const { error } = await sb.from('opening_entries').insert(rows);
    if (error) return toast(error.message);
    const dips = rows.filter((r) => r.account_code === '1300').map((r) => ({ pump_id: pid, dip_date: asOf, fuel_id: r.fuel_id, litres: r.litres, note: 'Opening stock', created_by: u.id }));
    if (dips.length) { const { error: e2 } = await sb.from('stock_dips').insert(dips); if (e2) toast('Saved, but the opening dip was not created: ' + e2.message); else toast('Opening balances saved'); } else toast('Opening balances saved');
    setCash(''); setBank(''); setPso(''); setStock({}); load();
  };
  const saveCust = async () => {
    const u = (await sb.auth.getUser()).data.user;
    const rows = cust.filter((c) => +cb[c.id] > 0).map((c) => ({ pump_id: pid, customer_id: c.id, txn_date: asOf, kind: 'opening', amount: +cb[c.id], note: 'Opening balance', created_by: u.id }));
    if (!rows.length) return toast('Nothing to save');
    const { error } = await sb.from('credit_txns').insert(rows);
    if (error) return toast(error.message); setCb({}); toast('Customer balances saved');
  };
  const del = async (x) => { if (!confirm('Delete this opening entry? Any opening tank dip stays and must be deleted separately.')) return; const { error } = await sb.from('opening_entries').delete().eq('id', x.id); error ? toast(error.message) : load(); };
  return (
    <>
      <div className="card"><h2>Opening balances</h2>
        <p className="mu">Enter what the pump had at the END of the day before you start using the app. Owner's equity is not typed in: it is calculated as everything you own minus what you owe, and posted automatically. Enter each item once. Have all nozzle starting readings set in Setup as well.</p>
        {ent.length > 0 && <p className="err">Opening balances were already saved (listed below). Entering them again will double them.</p>}
        <label style={{ maxWidth: 220 }}>As of date<input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></label></div>
      <div className="card"><h2>Cash, bank, stock and PSO</h2>
        <div className="bar">
          <label>Cash in hand<input type="number" step="0.01" value={cash} onChange={(e) => setCash(e.target.value)} /></label>
          <label>Bank balance<input type="number" step="0.01" value={bank} onChange={(e) => setBank(e.target.value)} /></label>
          <label>Owed to PSO (minus if paid in advance)<input type="number" step="0.01" value={pso} onChange={(e) => setPso(e.target.value)} /></label></div>
        <div className="sc"><table><thead><tr><th>Fuel stock in tanks</th><th className="n">Litres</th><th className="n">Cost per litre</th><th className="n">Value</th></tr></thead>
          <tbody>{fuels.map((f) => <tr key={f.id}><td>{f.name}</td>
            <td><input type="number" step="0.01" value={stock[f.id]?.l ?? ''} onChange={(e) => setSt(f.id, 'l', e.target.value)} /></td>
            <td><input type="number" step="0.01" value={stock[f.id]?.c ?? ''} onChange={(e) => setSt(f.id, 'c', e.target.value)} /></td>
            <td className="n">{f2(sv(f.id))}</td></tr>)}</tbody></table></div>
        <p className="mu">Use the total litres in all tanks of that fuel from your dip chart, and your purchase cost per litre. The litres also become the opening tank dip.</p>
        <button className="pri" onClick={saveMain}>Save cash, bank, stock and PSO</button></div>
      <div className="card"><h2>Customer balances</h2>
        {cust.length ? <div className="sc"><table><thead><tr><th>Customer</th><th className="n">Amount they owe you</th></tr></thead>
          <tbody>{cust.map((c) => <tr key={c.id}><td>{c.name}</td><td><input type="number" step="0.01" value={cb[c.id] ?? ''} onChange={(e) => setCb({ ...cb, [c.id]: e.target.value })} /></td></tr>)}</tbody></table></div>
          : <p className="mu">Add your credit customers in the Credit customers tab first, then enter their balances here.</p>}
        <p className="mu">These show in each customer's statement as "Opening balance" and age from the date above.</p>
        <button className="pri" onClick={saveCust} disabled={!cust.length}>Save customer balances</button></div>
      <div className="card"><h2>Owner's equity (calculated)</h2>
        <div className="sum"><div><span className="mu">Assets entered</span><b>{f2(assets)}</b></div><div><span className="mu">Owed to PSO</span><b>{f2(+pso || 0)}</b></div><div><span className="mu">Owner's equity</span><b>{f2(equity)}</b></div></div>
        <p className="mu">This preview covers the figures typed on this screen. It is posted to the ledger when you save.</p></div>
      <div className="card sc"><h2>Saved opening entries</h2><table><thead><tr><th>As of</th><th>Account</th><th>Fuel</th><th className="n">Litres</th><th className="n">Amount</th><th></th></tr></thead>
        <tbody>{ent.length ? ent.map((x) => <tr key={x.id}><td>{x.as_of}</td><td>{NAMES[x.account_code]}</td><td>{fuels.find((f) => f.id === x.fuel_id)?.name}</td><td className="n">{x.litres ? f2(x.litres) : ''}</td><td className="n">{f2(x.amount)}</td>
          <td>{role === 'owner' && <button onClick={() => del(x)}>Delete</button>}</td></tr>) : <tr><td colSpan="6" className="mu">None yet.</td></tr>}</tbody></table></div>
    </>
  );
}
