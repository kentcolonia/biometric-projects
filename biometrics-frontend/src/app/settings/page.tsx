'use client';
import { useEffect, useState } from 'react';
import { fetchWithAuth } from '@/lib/api';

interface Company { id: number; name: string; address: string; }
interface Department { id: number; name: string; company_id: number; company_name: string; }
interface Shift {
  id: number; name: string; time_in: string; time_out: string;
  break_start: string | null; break_end: string | null; has_break: boolean;
  saturday_time_out: string | null;
  grace_period: number; is_night_shift: boolean; company_id: number;
}

type Tab = 'companies' | 'departments' | 'shifts';

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('companies');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<Tab>('companies');
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [c, d, s] = await Promise.all([
        fetchWithAuth<any>('/companies'),
        fetchWithAuth<any>('/departments'),
        fetchWithAuth<any>('/shifts'),
      ]);
      setCompanies(c?.data || []);
      setDepartments(d?.data || []);
      setShifts(s?.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  function openAdd(type: Tab) {
    setModalType(type);
    setEditItem(null);
    setForm(type === 'shifts' ? {
      grace_period: '15', is_night_shift: false, has_break: false,
      saturday_mode: 'none', // 'none' | 'halfday'
    } : {});
    setError('');
    setShowModal(true);
  }

  function openEdit(type: Tab, item: any) {
    setModalType(type);
    setEditItem(item);
    if (type === 'shifts') {
      setForm({
        name: item.name,
        time_in: item.time_in,
        time_out: item.time_out,
        break_start: item.break_start || '',
        break_end: item.break_end || '',
        has_break: item.has_break || false,
        saturday_mode: item.saturday_time_out ? 'halfday' : 'none',
        saturday_time_out: item.saturday_time_out || '',
        grace_period: String(item.grace_period),
        is_night_shift: item.is_night_shift,
        company_id: String(item.company_id || ''),
      });
    } else if (type === 'departments') {
      setForm({ name: item.name, company_id: String(item.company_id) });
    } else {
      setForm({ name: item.name, address: item.address || '' });
    }
    setError('');
    setShowModal(true);
  }

  function closeModal() { setShowModal(false); setEditItem(null); setError(''); }

  async function handleSave() {
    setSaving(true); setError('');
    try {
      let body: any = {};
      if (modalType === 'companies') {
        if (!form.name) return setError('Name is required');
        body = { name: form.name, address: form.address || '' };
      } else if (modalType === 'departments') {
        if (!form.name) return setError('Name is required');
        if (!form.company_id) return setError('Company is required');
        body = { name: form.name, company_id: Number(form.company_id) };
      } else {
        if (!form.name) return setError('Name is required');
        if (!form.time_in) return setError('Time In is required');
        if (!form.time_out) return setError('Time Out is required');
        if (form.has_break && (!form.break_start || !form.break_end))
          return setError('Both Break Start and Break End are required for split shifts');
        if (form.saturday_mode === 'halfday' && !form.saturday_time_out)
          return setError('Saturday end time is required for half-day Saturday');
        body = {
          name: form.name,
          time_in: form.time_in,
          time_out: form.time_out,
          break_start: form.has_break ? form.break_start : '',
          break_end: form.has_break ? form.break_end : '',
          has_break: form.has_break,
          saturday_time_out: form.saturday_mode === 'halfday' ? form.saturday_time_out : '',
          grace_period: Number(form.grace_period || 15),
          is_night_shift: form.is_night_shift,
          company_id: form.company_id ? Number(form.company_id) : null,
        };
      }
      const url = `/${modalType}${editItem ? `/${editItem.id}` : ''}`;
      await fetchWithAuth(url, { method: editItem ? 'PUT' : 'POST', body: JSON.stringify(body) });
      await loadAll();
      closeModal();
    } catch (e: any) { setError(e.message || 'Failed to save'); }
    finally { setSaving(false); }
  }

  async function handleDelete(type: Tab, id: number) {
    if (!confirm('Delete this item?')) return;
    setDeletingId(id);
    try {
      await fetchWithAuth(`/${type}/${id}`, { method: 'DELETE' });
      await loadAll();
    } catch (e) { console.error(e); }
    finally { setDeletingId(null); }
  }

  return (
    <div className="page">
      <div className="topbar">
        <div><h1 className="page-title">Settings</h1><p className="page-sub">Manage companies, departments, and shift schedules</p></div>
      </div>

      <div className="tabs">
        {(['companies', 'departments', 'shifts'] as Tab[]).map(t => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'companies' ? '🏢 Companies' : t === 'departments' ? '🗂 Departments' : '🕐 Shifts'}
          </button>
        ))}
      </div>

      {/* COMPANIES */}
      {tab === 'companies' && (
        <div>
          <div className="section-header">
            <span>{companies.length} companies</span>
            <button className="btn-primary" onClick={() => openAdd('companies')}>+ Add Company</button>
          </div>
          <div className="card">
            {loading ? <div className="empty">Loading...</div> : companies.length === 0 ? (
              <div className="empty"><div className="empty-icon">🏢</div><div>No companies yet</div><button className="btn-primary" style={{marginTop:12}} onClick={() => openAdd('companies')}>Add Company</button></div>
            ) : (
              <table className="table">
                <thead><tr><th>Name</th><th>Address</th><th>Departments</th><th>Actions</th></tr></thead>
                <tbody>
                  {companies.map(c => (
                    <tr key={c.id}>
                      <td><strong>{c.name}</strong></td>
                      <td>{c.address || <span className="muted">—</span>}</td>
                      <td><span className="count-badge">{departments.filter(d => d.company_id === c.id).length}</span></td>
                      <td><div className="actions">
                        <button className="btn-icon" onClick={() => openEdit('companies', c)}>✎</button>
                        <button className="btn-icon danger" onClick={() => handleDelete('companies', c.id)} disabled={deletingId === c.id}>{deletingId === c.id ? '...' : '✕'}</button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* DEPARTMENTS */}
      {tab === 'departments' && (
        <div>
          <div className="section-header">
            <span>{departments.length} departments</span>
            <button className="btn-primary" onClick={() => openAdd('departments')}>+ Add Department</button>
          </div>
          <div className="card">
            {loading ? <div className="empty">Loading...</div> : departments.length === 0 ? (
              <div className="empty"><div className="empty-icon">🗂</div><div>No departments yet</div></div>
            ) : (
              <table className="table">
                <thead><tr><th>Name</th><th>Company</th><th>Actions</th></tr></thead>
                <tbody>
                  {departments.map(d => (
                    <tr key={d.id}>
                      <td><strong>{d.name}</strong></td>
                      <td>{d.company_name}</td>
                      <td><div className="actions">
                        <button className="btn-icon" onClick={() => openEdit('departments', d)}>✎</button>
                        <button className="btn-icon danger" onClick={() => handleDelete('departments', d.id)} disabled={deletingId === d.id}>{deletingId === d.id ? '...' : '✕'}</button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* SHIFTS */}
      {tab === 'shifts' && (
        <div>
          <div className="section-header">
            <span>{shifts.length} shifts</span>
            <button className="btn-primary" onClick={() => openAdd('shifts')}>+ Add Shift</button>
          </div>
          <div className="card">
            {loading ? <div className="empty">Loading...</div> : shifts.length === 0 ? (
              <div className="empty"><div className="empty-icon">🕐</div><div>No shifts yet</div></div>
            ) : (
              <table className="table">
                <thead><tr><th>Name</th><th>Schedule</th><th>Saturday</th><th>Grace</th><th>Type</th><th>Actions</th></tr></thead>
                <tbody>
                  {shifts.map(s => (
                    <tr key={s.id}>
                      <td><strong>{s.name}</strong></td>
                      <td>
                        <div className="schedule-cell">
                          {s.has_break && s.break_start && s.break_end ? (
                            <>
                              <span className="time-badge">{s.time_in}</span>
                              <span className="schedule-sep">to</span>
                              <span className="time-badge">{s.break_start}</span>
                              <span className="break-chip">break</span>
                              <span className="time-badge">{s.break_end}</span>
                              <span className="schedule-sep">to</span>
                              <span className="time-badge">{s.time_out}</span>
                            </>
                          ) : (
                            <>
                              <span className="time-badge">{s.time_in}</span>
                              <span className="schedule-sep">–</span>
                              <span className="time-badge">{s.time_out}</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td>
                        {s.saturday_time_out
                          ? <span className="sat-badge">½ day until {s.saturday_time_out}</span>
                          : <span className="muted">—</span>}
                      </td>
                      <td>{s.grace_period} min</td>
                      <td><span className={`shift-type ${s.is_night_shift ? 'night' : 'day'}`}>{s.is_night_shift ? '🌙 Night' : '☀️ Day'}</span></td>
                      <td><div className="actions">
                        <button className="btn-icon" onClick={() => openEdit('shifts', s)}>✎</button>
                        <button className="btn-icon danger" onClick={() => handleDelete('shifts', s.id)} disabled={deletingId === s.id}>{deletingId === s.id ? '...' : '✕'}</button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* MODAL */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editItem ? 'Edit' : 'Add'} {modalType === 'companies' ? 'Company' : modalType === 'departments' ? 'Department' : 'Shift'}</h2>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>
            {error && <div className="error-box">{error}</div>}

            <div className="form-group">
              <label className="form-label">Name *</label>
              <input className="form-input" value={form.name || ''} onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))} />
            </div>

            {modalType === 'companies' && (
              <div className="form-group">
                <label className="form-label">Address</label>
                <input className="form-input" value={form.address || ''} onChange={e => setForm((f: any) => ({ ...f, address: e.target.value }))} />
              </div>
            )}

            {modalType === 'departments' && (
              <div className="form-group">
                <label className="form-label">Company *</label>
                <select className="form-input" value={form.company_id || ''} onChange={e => setForm((f: any) => ({ ...f, company_id: e.target.value }))}>
                  <option value="">Select company</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}

            {modalType === 'shifts' && (<>
              <div className="form-group">
                <label className="form-label">Company</label>
                <select className="form-input" value={form.company_id || ''} onChange={e => setForm((f: any) => ({ ...f, company_id: e.target.value }))}>
                  <option value="">All companies</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Weekday schedule type */}
              <div className="form-group">
                <label className="form-label">Weekday Schedule</label>
                <div className="toggle-group">
                  <button type="button" className={`toggle-btn ${!form.has_break ? 'active' : ''}`}
                    onClick={() => setForm((f: any) => ({ ...f, has_break: false, break_start: '', break_end: '' }))}>
                    ⏱ Full Day
                  </button>
                  <button type="button" className={`toggle-btn ${form.has_break ? 'active' : ''}`}
                    onClick={() => setForm((f: any) => ({ ...f, has_break: true }))}>
                    ✂️ Split Shift
                  </button>
                </div>
              </div>

              {/* Full day */}
              {!form.has_break && (
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Time In *</label>
                    <input className="form-input" type="time" value={form.time_in || ''} onChange={e => setForm((f: any) => ({ ...f, time_in: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Time Out *</label>
                    <input className="form-input" type="time" value={form.time_out || ''} onChange={e => setForm((f: any) => ({ ...f, time_out: e.target.value }))} />
                  </div>
                </div>
              )}

              {/* Split shift */}
              {form.has_break && (<>
                <div className="split-section">
                  <div className="split-label">🌅 AM Session</div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Start *</label>
                      <input className="form-input" type="time" value={form.time_in || ''} onChange={e => setForm((f: any) => ({ ...f, time_in: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Break Start *</label>
                      <input className="form-input" type="time" value={form.break_start || ''} onChange={e => setForm((f: any) => ({ ...f, break_start: e.target.value }))} />
                    </div>
                  </div>
                </div>
                <div className="split-section">
                  <div className="split-label">🌇 PM Session</div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Break End *</label>
                      <input className="form-input" type="time" value={form.break_end || ''} onChange={e => setForm((f: any) => ({ ...f, break_end: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">End *</label>
                      <input className="form-input" type="time" value={form.time_out || ''} onChange={e => setForm((f: any) => ({ ...f, time_out: e.target.value }))} />
                    </div>
                  </div>
                </div>
                {form.time_in && form.break_start && form.break_end && form.time_out && (
                  <div className="schedule-preview">
                    📅 <strong>{form.time_in}–{form.break_start}</strong> break <strong>{form.break_end}–{form.time_out}</strong>
                  </div>
                )}
              </>)}

              {/* Saturday */}
              <div className="form-group saturday-group">
                <label className="form-label">Saturday</label>
                <div className="toggle-group">
                  <button type="button" className={`toggle-btn ${form.saturday_mode === 'none' ? 'active' : ''}`}
                    onClick={() => setForm((f: any) => ({ ...f, saturday_mode: 'none', saturday_time_out: '' }))}>
                    🚫 No Work
                  </button>
                  <button type="button" className={`toggle-btn ${form.saturday_mode === 'halfday' ? 'active sat-active' : ''}`}
                    onClick={() => setForm((f: any) => ({ ...f, saturday_mode: 'halfday' }))}>
                    🌤 Half Day
                  </button>
                  <button type="button" className={`toggle-btn ${form.saturday_mode === 'fullday' ? 'active' : ''}`}
                    onClick={() => setForm((f: any) => ({ ...f, saturday_mode: 'fullday', saturday_time_out: form.time_out || '' }))}>
                    ☀️ Full Day
                  </button>
                </div>
                {form.saturday_mode === 'halfday' && (
                  <div style={{ marginTop: 10 }}>
                    <label className="form-label">Saturday End Time *</label>
                    <input
                      className="form-input sat-input"
                      type="time"
                      value={form.saturday_time_out || ''}
                      onChange={e => setForm((f: any) => ({ ...f, saturday_time_out: e.target.value }))}
                      placeholder="e.g. 12:00"
                    />
                    {form.time_in && form.saturday_time_out && (
                      <div className="schedule-preview sat-preview">
                        🌤 Saturday: <strong>{form.time_in} – {form.saturday_time_out}</strong> (half day)
                      </div>
                    )}
                  </div>
                )}
                {form.saturday_mode === 'fullday' && (
                  <div className="schedule-preview" style={{ marginTop: 10 }}>
                    ☀️ Saturday same as weekday: <strong>{form.time_in || '?'} – {form.time_out || '?'}</strong>
                  </div>
                )}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Grace Period (min)</label>
                  <input className="form-input" type="number" min="0" value={form.grace_period || '15'} onChange={e => setForm((f: any) => ({ ...f, grace_period: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Shift Type</label>
                  <select className="form-input" value={String(form.is_night_shift)} onChange={e => setForm((f: any) => ({ ...f, is_night_shift: e.target.value === 'true' }))}>
                    <option value="false">☀️ Day Shift</option>
                    <option value="true">🌙 Night Shift</option>
                  </select>
                </div>
              </div>
            </>)}

            <div className="modal-footer">
              <button className="btn-secondary" onClick={closeModal}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editItem ? 'Save Changes' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .page{padding:32px;font-family:'DM Sans',system-ui,sans-serif}
        .topbar{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px}
        .page-title{font-size:22px;font-weight:600;color:#111;letter-spacing:-.4px}
        .page-sub{font-size:13px;color:#999;margin-top:3px}
        .tabs{display:flex;gap:4px;margin-bottom:20px;background:#f5f5f3;padding:4px;border-radius:10px;width:fit-content}
        .tab{padding:8px 18px;border-radius:7px;border:none;background:none;font-size:13px;cursor:pointer;font-family:inherit;color:#888;transition:all .15s}
        .tab.active{background:#fff;color:#111;font-weight:500;box-shadow:0 1px 3px rgba(0,0,0,.08)}
        .section-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;font-size:13px;color:#888}
        .card{background:#fff;border:1px solid #e8e8e6;border-radius:12px;overflow:hidden}
        .table{width:100%;border-collapse:collapse;font-size:13px}
        .table th{text-align:left;padding:11px 20px;color:#aaa;font-weight:400;font-size:11px;text-transform:uppercase;letter-spacing:.5px;background:#fafaf9;border-bottom:1px solid #f0f0ee}
        .table td{padding:13px 20px;color:#333;border-bottom:1px solid #f7f7f5;vertical-align:middle}
        .table tr:last-child td{border-bottom:none}
        .table tr:hover td{background:#fafaf9}
        .muted{color:#ccc}
        .count-badge{display:inline-flex;align-items:center;background:#f0f0ee;color:#888;font-size:11px;padding:2px 8px;border-radius:999px}
        .schedule-cell{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
        .time-badge{font-family:monospace;font-size:13px;font-weight:600;color:#111;background:#f5f5f3;padding:2px 6px;border-radius:4px}
        .schedule-sep{font-size:11px;color:#999}
        .break-chip{font-size:10px;background:#fef9c3;color:#a16207;border-radius:999px;padding:2px 7px;font-weight:500}
        .sat-badge{display:inline-flex;align-items:center;gap:4px;font-size:11px;background:#fef3c7;color:#b45309;border-radius:999px;padding:3px 9px;font-weight:500}
        .shift-type{font-size:12px}
        .actions{display:flex;gap:6px}
        .btn-icon{width:30px;height:30px;border-radius:6px;border:1px solid #e8e8e6;background:#fff;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;color:#666;transition:all .15s}
        .btn-icon:hover{background:#f5f5f3;color:#111}
        .btn-icon.danger:hover{background:#fef2f2;border-color:#fecaca;color:#dc2626}
        .btn-icon:disabled{opacity:.5;cursor:not-allowed}
        .btn-primary{padding:9px 16px;background:#111;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;transition:opacity .15s}
        .btn-primary:disabled{opacity:.5;cursor:not-allowed}
        .btn-secondary{padding:9px 16px;background:#fff;color:#333;border:1px solid #e8e8e6;border-radius:8px;font-size:13px;cursor:pointer;font-family:inherit}
        .empty{padding:60px 20px;text-align:center;color:#bbb;font-size:13px}
        .empty-icon{font-size:32px;margin-bottom:12px}
        .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:50;padding:20px}
        .modal{background:#fff;border-radius:14px;width:100%;max-width:480px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.15);max-height:90vh;overflow-y:auto}
        .modal-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}
        .modal-title{font-size:16px;font-weight:600;color:#111}
        .modal-close{background:none;border:none;font-size:16px;color:#aaa;cursor:pointer}
        .modal-footer{display:flex;justify-content:flex-end;gap:8px;margin-top:24px}
        .form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .form-group{margin-bottom:16px}
        .form-label{display:block;font-size:12px;font-weight:500;color:#555;margin-bottom:6px}
        .form-input{width:100%;padding:9px 12px;border:1px solid #e0e0de;border-radius:8px;font-size:13px;color:#111;background:#fafafa;outline:none;box-sizing:border-box;font-family:inherit}
        .form-input:focus{border-color:#aaa;background:#fff}
        .error-box{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;font-size:13px;margin-bottom:16px}
        .toggle-group{display:flex;gap:6px}
        .toggle-btn{flex:1;padding:9px 12px;border-radius:8px;border:1px solid #e0e0de;background:#fafafa;font-size:12px;cursor:pointer;font-family:inherit;color:#666;transition:all .15s;text-align:center}
        .toggle-btn:hover{background:#f5f5f3;border-color:#ccc}
        .toggle-btn.active{background:#111;color:#fff;border-color:#111}
        .toggle-btn.sat-active{background:#d97706;border-color:#d97706}
        .split-section{background:#f9f9f7;border:1px solid #eeeeec;border-radius:10px;padding:14px 14px 2px;margin-bottom:12px}
        .split-label{font-size:11px;font-weight:600;color:#888;margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px}
        .saturday-group{background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px;margin-bottom:4px}
        .sat-input{border-color:#fcd34d !important}
        .schedule-preview{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;font-size:13px;color:#15803d;margin-bottom:4px;margin-top:8px}
        .sat-preview{background:#fffbeb;border-color:#fde68a;color:#92400e}
      `}</style>
    </div>
  );
}