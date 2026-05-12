'use client';
import { useEffect, useState } from 'react';
import { fetchWithAuth } from '@/lib/api';

interface Company { id: number; name: string; address: string; }
interface Department { id: number; name: string; company_id: number; company_name: string; }
interface Shift { id: number; name: string; time_in: string; time_out: string; grace_period: number; is_night_shift: boolean; company_id: number; }

type Tab = 'companies' | 'departments' | 'shifts';

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('companies');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
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
    setForm(type === 'shifts' ? { grace_period: '15', is_night_shift: false } : {});
    setError('');
    setShowModal(true);
  }

  function openEdit(type: Tab, item: any) {
    setModalType(type);
    setEditItem(item);
    if (type === 'shifts') {
      setForm({ name: item.name, time_in: item.time_in, time_out: item.time_out, grace_period: String(item.grace_period), is_night_shift: item.is_night_shift, company_id: String(item.company_id || '') });
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
        body = { name: form.name, time_in: form.time_in, time_out: form.time_out, grace_period: Number(form.grace_period || 15), is_night_shift: form.is_night_shift, company_id: form.company_id ? Number(form.company_id) : null };
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
                <thead><tr><th>Name</th><th>Company</th><th>Employees</th><th>Actions</th></tr></thead>
                <tbody>
                  {departments.map(d => (
                    <tr key={d.id}>
                      <td><strong>{d.name}</strong></td>
                      <td>{d.company_name}</td>
                      <td><span className="count-badge">—</span></td>
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
                <thead><tr><th>Name</th><th>Time In</th><th>Time Out</th><th>Grace Period</th><th>Type</th><th>Actions</th></tr></thead>
                <tbody>
                  {shifts.map(s => (
                    <tr key={s.id}>
                      <td><strong>{s.name}</strong></td>
                      <td><span className="time-badge">{s.time_in}</span></td>
                      <td><span className="time-badge">{s.time_out}</span></td>
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
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Grace Period (minutes)</label>
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
        .table td{padding:13px 20px;color:#333;border-bottom:1px solid #f7f7f5}
        .table tr:last-child td{border-bottom:none}
        .table tr:hover td{background:#fafaf9}
        .muted{color:#ccc}
        .count-badge{display:inline-flex;align-items:center;background:#f0f0ee;color:#888;font-size:11px;padding:2px 8px;border-radius:999px}
        .time-badge{font-family:monospace;font-size:13px;font-weight:600;color:#111}
        .shift-type{font-size:12px}
        .actions{display:flex;gap:6px}
        .btn-icon{width:30px;height:30px;border-radius:6px;border:1px solid #e8e8e6;background:#fff;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;color:#666;transition:all .15s}
        .btn-icon:hover{background:#f5f5f3;color:#111}
        .btn-icon.danger:hover{background:#fef2f2;border-color:#fecaca;color:#dc2626}
        .btn-icon:disabled{opacity:.5;cursor:not-allowed}
        .btn-primary{padding:9px 16px;background:#111;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit}
        .btn-primary:disabled{opacity:.5;cursor:not-allowed}
        .btn-secondary{padding:9px 16px;background:#fff;color:#333;border:1px solid #e8e8e6;border-radius:8px;font-size:13px;cursor:pointer;font-family:inherit}
        .empty{padding:60px 20px;text-align:center;color:#bbb;font-size:13px}
        .empty-icon{font-size:32px;margin-bottom:12px}
        .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:50}
        .modal{background:#fff;border-radius:14px;width:100%;max-width:460px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.15)}
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
      `}</style>
    </div>
  );
}