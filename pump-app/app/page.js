'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase as sb } from '../lib/supabase';

const f2 = (n) => (+n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toLocaleDateString('en-CA');

export default function App() {
  const [user, setUser] = useState(null), [ready, setReady] = useState(false), [mem, setMem] = useState(null);
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => { setUser(data.session?.user ?? null); setReady(true); });
    const { data } = sb.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);
  const loadMem = useCallback(async () => {
    if (!user) { setMem(null); return; }
    const { data } = await sb.from('members').select('pump_id,role,pumps(name)').eq('user_id', user.id).limit(1);
    setMem(data?.[0] || false);
  }, [user]);
  useEffect(() => { loadMem(); }, [loadMem]);
  if (!ready) return <p className="wrap">Loading...</p>;
  if (!user) return <Login />;
  if (mem === null) return <p className="wrap">Loading...</p>;
  if (mem === false) return <Onboard done={loadMem} />;
  return <Pump mem={mem} />;
}

function Login() {
  const [em, setEm] = useState(''), [pw, setPw] = useState(''), [m, setM] = useState('');
  const go = async (up) => {
    setM('');
    const r = up ? await sb.auth.signUp({ email: em, password: pw }) : await sb.auth.signInWithPassword({ email: em, password: pw });
    if (r.error) setM(r.error.message);
    else if (up && !r.data.session) setM('Check your email to confirm your account, then sign in.');
  };
  return (
    <div className="wrap narrow"><h1>Pump Accounts</h1>
      <div className="card">
        <label>Email<input type="email" value={em} onChange={(e) => setEm(e.target.value)} /></label>
        <label>Password<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        <div className="bar"><button className="pri" onClick={() => go(false)}>Sign in</button><button onClick={() => go(true)}>Create account</button></div>
        {m && <p className="err">{m}</p>}
      </div>
    </div>
  );
}

function Onboard({ done }) {
  const [n, setN] = useState(''), [m, setM] = useState('');
  const go = async () => { const { error } = await sb.rpc('create_pump', { pump_name: n }); error ? setM(error.message) : done(); };
  return (
    <div className="wrap narrow"><h1>Set up your pump</h1>
      <div className="card">
        <label>Pump name<input value={n} onChange={(e) => setN(e.target.value)} /></label>
        <button className="pri" onClick={go} disabled={!n.trim()}>Create pump</button>
        {m && <p className="err">{m}</p>}
        <p className="mu">Staff: if your owner has already added you, refresh this page.</p>
      </div>
      <button onClick={() => sb.auth.signOut()}>Sign out</button>
    </div>
  );
}

function Pump({ mem }) {
  const pid = mem.pump_id, role = mem.role, isOwner = role === 'owner', canSetup = isOwner || role === 'manager';
  const [tab, setTab] = useState('reg'), [fuels, setFuels] = useState([]), [nozzles, setNozzles] = useState([]), [days, setDays] = useState([]);
  const [day, setDay] = useState(today()), [msg, setMsg] = useState('');
  const toast = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };
  const load = useCallback(async () => {
    const [f, n, d] = await Promise.all([
      sb.from('fuels').select('*').eq('pump_id', pid).order('name'),
      sb.from('nozzles').select('*').eq('pump_id', pid).order('name'),
      sb.from('shift_days').select('*,readings(*)').eq('pump_id', pid).order('day', { ascending: false }).limit(90),
    ]);
    setFuels(f.data || []); setNozzles(n.data || []); setDays(d.data || []);
  }, [pid]);
  useEffect(() => { load(); }, [load]);
  const tabs = [['reg', 'Daily register'], ['hist', 'History']].concat(canSetup ? [['set', 'Setup']] : [], isOwner ? [['team', 'Team']] : []);
  const p = { pid, role, fuels, nozzles, days, day, setDay, reload: load, toast, setTab };
  return (
    <div className="wrap">
      <div className="bar"><h1 style={{ flex: 1 }}>{mem.pumps?.name} <span className="mu">({role})</span></h1><button onClick={() => sb.auth.signOut()}>Sign out</button></div>
      <div className="bar">{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'reg' && <Register {...p} />}
      {tab === 'hist' && <History {...p} />}
      {tab === 'set' && <Setup {...p} />}
      {tab === 'team' && <Team {...p} />}
      {msg && <div className="toast">{msg}</div>}
    </div>
  );
}

function Register({ pid, role, fuels, nozzles, days, day, setDay, reload, toast }) {
  const act = nozzles.filter((n) => n.active);
  const [cashier, setCashier] = useState(''), [rates, setRates] = useState({}), [rd, setRd] = useState({}), [closed, setClosed] = useState(false);
  const ex = days.find((d) => d.day === day);
  const prev = (n) => {
    for (const d of days) if (d.day < day) { const x = d.readings.find((y) => y.nozzle_id === n.id && y.closing != null); if (x) return x.closing; }
    return n.initial_reading;
  };
  useEffect(() => {
    const r = {}, q = {};
    fuels.forEach((f) => { r[f.id] = ex?.rates?.[f.id] ?? f.rate; });
    act.forEach((n) => { const x = ex?.readings?.find((y) => y.nozzle_id === n.id); q[n.id] = { open: x ? x.opening : prev(n), close: x?.closing ?? '', test: x?.test_litres || '' }; });
    setRates(r); setRd(q); setCashier(ex?.cashier || ''); setClosed(!!ex?.closed);
    // eslint-disable-next-line
  }, [day, days, fuels, nozzles]);
  const set = (id, k, v) => setRd({ ...rd, [id]: { ...rd[id], [k]: v } });
  const calc = (n) => { const r = rd[n.id] || {}; const lit = r.close === '' || r.close == null ? 0 : +r.close - +r.open - (+r.test || 0); return { lit, amt: lit * (+rates[n.fuel_id] || 0), test: +r.test || 0 }; };
  const tot = {}; let L = 0, A = 0, T = 0;
  act.forEach((n) => { const c = calc(n); const t = (tot[n.fuel_id] = tot[n.fuel_id] || { l: 0, a: 0, t: 0 }); t.l += c.lit; t.a += c.amt; t.t += c.test; L += c.lit; A += c.amt; T += c.test; });
  const off = closed && role !== 'owner';
  const save = async (c = closed) => {
    const u = (await sb.auth.getUser()).data.user;
    const { data, error } = await sb.from('shift_days').upsert({ pump_id: pid, day, cashier, rates, closed: c, saved_by: u.id, updated_at: new Date().toISOString() }, { onConflict: 'pump_id,day' }).select('id').single();
    if (error) return toast(error.message);
    const rows = act.map((n) => ({ shift_day_id: data.id, pump_id: pid, nozzle_id: n.id, opening: +rd[n.id].open || 0, closing: rd[n.id].close === '' ? null : +rd[n.id].close, test_litres: +rd[n.id].test || 0 }));
    const e2 = (await sb.from('readings').upsert(rows, { onConflict: 'shift_day_id,nozzle_id' })).error;
    toast(e2 ? e2.message : 'Saved'); reload();
  };
  return (
    <>
      <div className="card"><div className="bar">
        <label>Date<input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} /></label>
        <label>Cashier<input value={cashier} disabled={off} onChange={(e) => setCashier(e.target.value)} /></label>
        <button className="pri" disabled={off} onClick={() => save()}>Save day</button>
        {role === 'owner' && <button onClick={() => save(!closed)}>{closed ? 'Reopen day' : 'Close day'}</button>}
      </div>{closed && <p className="mu">This day is closed{off ? '. Ask the owner to reopen it.' : '.'}</p>}</div>
      <div className="card"><h2>Rates (per litre)</h2><div className="bar">
        {fuels.map((f) => <label key={f.id}>{f.name}<input type="number" step="0.01" disabled={off} value={rates[f.id] ?? ''} onChange={(e) => setRates({ ...rates, [f.id]: e.target.value })} /></label>)}
      </div></div>
      <div className="card"><h2>Nozzle readings</h2><div className="sc"><table>
        <thead><tr><th>Nozzle</th><th>Fuel</th><th className="n">Opening</th><th className="n">Closing</th><th className="n">Test L</th><th className="n">Litres</th><th className="n">Amount</th></tr></thead>
        <tbody>{act.map((n) => { const r = rd[n.id] || {}, c = calc(n), bad = r.close !== '' && +r.close < +r.open; return (
          <tr key={n.id}><td>{n.name}</td><td>{fuels.find((f) => f.id === n.fuel_id)?.name}</td>
            {['open', 'close', 'test'].map((k) => <td key={k}><input type="number" step="0.01" disabled={off} value={r[k] ?? ''} onChange={(e) => set(n.id, k, e.target.value)} /></td>)}
            <td className={'n' + (bad ? ' bad' : '')}>{f2(c.lit)}</td><td className="n">{f2(c.amt)}</td></tr>); })}</tbody>
        <tfoot><tr><th colSpan="4">Day total</th><th className="n">{f2(T)}</th><th className="n">{f2(L)}</th><th className="n">{f2(A)}</th></tr></tfoot>
      </table></div></div>
      <div className="card"><h2>Day total</h2><div className="sum">
        {fuels.map((f) => { const t = tot[f.id] || { l: 0, a: 0, t: 0 }; return <div key={f.id}><span className="mu">{f.name}</span><b>{f2(t.l)} L</b>{f2(t.a)}<br /><span className="mu">Test: {f2(t.t)} L</span></div>; })}
        <div><span className="mu">All fuels</span><b>{f2(A)}</b>{f2(L)} L sold<br /><span className="mu">Test: {f2(T)} L</span></div>
      </div></div>
    </>
  );
}

function History({ days, nozzles, role, reload, toast, setDay, setTab }) {
  const totals = (d) => { let L = 0, A = 0, T = 0; d.readings.forEach((r) => { const n = nozzles.find((x) => x.id === r.nozzle_id); T += +r.test_litres || 0; if (!n || r.closing == null) return; const l = +r.closing - +r.opening - (+r.test_litres || 0); L += l; A += l * (+d.rates[n.fuel_id] || 0); }); return { L, A, T }; };
  const del = async (d) => { if (!confirm('Delete ' + d.day + '? This cannot be undone.')) return; const { error } = await sb.from('shift_days').delete().eq('id', d.id); error ? toast(error.message) : reload(); };
  return (
    <div className="card sc"><table>
      <thead><tr><th>Date</th><th>Cashier</th><th className="n">Litres sold</th><th className="n">Test L</th><th className="n">Amount</th><th></th></tr></thead>
      <tbody>{days.length ? days.map((d) => { const t = totals(d); return (
        <tr key={d.id}><td>{d.day}{d.closed ? ' (closed)' : ''}</td><td>{d.cashier || '-'}</td><td className="n">{f2(t.L)}</td><td className="n">{f2(t.T)}</td><td className="n">{f2(t.A)}</td>
          <td><button onClick={() => { setDay(d.day); setTab('reg'); }}>Open</button> {role === 'owner' && <button onClick={() => del(d)}>Delete</button>}</td></tr>); })
        : <tr><td colSpan="6" className="mu">No saved days yet.</td></tr>}</tbody>
    </table></div>
  );
}

function Setup({ pid, fuels, nozzles, reload, toast }) {
  const upd = async (t, id, v) => { const { error } = await sb.from(t).update(v).eq('id', id); error ? toast(error.message) : reload(); };
  const ins = async (t, v) => { const { error } = await sb.from(t).insert({ pump_id: pid, ...v }); error ? toast(error.message) : reload(); };
  return (
    <>
      <div className="card"><h2>Fuel types</h2><div className="sc"><table><thead><tr><th>Name</th><th className="n">Default rate</th></tr></thead>
        <tbody>{fuels.map((f) => <tr key={f.id + f.name + f.rate}><td><input style={{ textAlign: 'left' }} defaultValue={f.name} onBlur={(e) => e.target.value !== f.name && upd('fuels', f.id, { name: e.target.value })} /></td>
          <td><input type="number" step="0.01" defaultValue={f.rate} onBlur={(e) => +e.target.value !== +f.rate && upd('fuels', f.id, { rate: +e.target.value })} /></td></tr>)}</tbody></table></div>
        <button onClick={() => ins('fuels', { name: 'New fuel', rate: 0 })}>Add fuel</button></div>
      <div className="card"><h2>Nozzles</h2><div className="sc"><table><thead><tr><th>Name</th><th>Fuel</th><th className="n">Starting reading</th><th>Active</th></tr></thead>
        <tbody>{nozzles.map((n) => <tr key={n.id + n.name + n.fuel_id + n.active}><td><input style={{ textAlign: 'left' }} defaultValue={n.name} onBlur={(e) => e.target.value !== n.name && upd('nozzles', n.id, { name: e.target.value })} /></td>
          <td><select value={n.fuel_id} onChange={(e) => upd('nozzles', n.id, { fuel_id: e.target.value })}>{fuels.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></td>
          <td><input type="number" step="0.01" defaultValue={n.initial_reading} onBlur={(e) => +e.target.value !== +n.initial_reading && upd('nozzles', n.id, { initial_reading: +e.target.value })} /></td>
          <td><input type="checkbox" checked={n.active} onChange={(e) => upd('nozzles', n.id, { active: e.target.checked })} /></td></tr>)}</tbody></table></div>
        <button onClick={() => fuels[0] && ins('nozzles', { name: 'Nozzle ' + (nozzles.length + 1), fuel_id: fuels[0].id })}>Add nozzle</button>
        <p className="mu">Set each nozzle's starting reading before its first day. Untick Active to hide a nozzle without losing its history.</p></div>
    </>
  );
}

function Team({ pid, toast }) {
  const [m, setM] = useState([]), [em, setEm] = useState(''), [nm, setNm] = useState(''), [r, setR] = useState('cashier');
  const ld = useCallback(async () => { const { data } = await sb.from('members').select('user_id,role,full_name').eq('pump_id', pid); setM(data || []); }, [pid]);
  useEffect(() => { ld(); }, [ld]);
  const add = async () => { const { error } = await sb.rpc('add_member', { p_pump: pid, p_email: em, p_role: r, p_name: nm }); if (error) return toast(error.message); setEm(''); setNm(''); ld(); toast('Member saved'); };
  return (
    <div className="card"><h2>Team</h2>
      <p className="mu">Ask your staff to open the app and create an account first, then add them here by email. Adding the same email again changes their role.</p>
      <div className="bar">
        <label>Email<input value={em} onChange={(e) => setEm(e.target.value)} /></label>
        <label>Name<input value={nm} onChange={(e) => setNm(e.target.value)} /></label>
        <label>Role<select value={r} onChange={(e) => setR(e.target.value)}><option>cashier</option><option>manager</option><option>accountant</option><option>owner</option></select></label>
        <button className="pri" onClick={add} disabled={!em}>Save member</button>
      </div>
      <table><thead><tr><th>Name</th><th>Role</th></tr></thead><tbody>{m.map((x) => <tr key={x.user_id}><td>{x.full_name || '(no name)'}</td><td>{x.role}</td></tr>)}</tbody></table>
    </div>
  );
}
