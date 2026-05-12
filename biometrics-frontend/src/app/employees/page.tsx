'use client';
import { useEffect, useState } from 'react';
import { fetchWithAuth } from '@/lib/api';

interface Company { id: number; name: string; address: string; }
interface Department { id: number; name: string; company_id: number; company_name: string; }
interface Shift { id: number; name: string; time_in: string; time_out: string; grace_period: number; is_night_shift: boolean; company_id?: number; }
interface Employee {
  id: number; user_id: string; name: string; email: string;
  company_id: number; company_name: string;
  department_id: number; department_name: string;
  shift_id: number; shift_name: string; shift_time_in: string; shift_time_out: string;
  is_active: boolean;
}

const emptyForm = { user_id: '', name: '', email: '', company_id: '', department_id: '', shift_id: '', is_active: true };

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editEmp, setEditEmp] = useState<Employee | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterDept, setFilterDept] = useState('');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [empData, compData, deptData, shiftData] = await Promise.all([
        fetchWithAuth<any>('/employees'),
        fetchWithAuth<any>('/companies'),
        fetchWithAuth<any>('/departments'),
        fetchWithAuth<any>('/shifts'),
      ]);
      setEmployees(empData?.data || []);
      setCompanies(compData?.data || []);
      setDepartments(deptData?.data || []);
      setShifts(shiftData?.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  function openAdd() {
    setEditEmp(null); setForm({ ...emptyForm }); setError(''); setShowModal(true);
  }
  function openEdit(emp: Employee) {
    setEditEmp(emp);
    setForm({
      user_id: emp.user_id, name: emp.name, email: emp.email || '',
      company_id: String(emp.company_id || ''), department_id: String(emp.department_id || ''),
      shift_id: String(emp.shift_id || ''), is_active: emp.is_active,
    });
    setError(''); setShowModal(true);
  }
  function closeModal() { setShowModal(false); setEditEmp(null); setError(''); }

  async function handleSave() {
    if (!form.user_id) return setError('User ID is required');
    if (!form.name) return setError('Name is required');
    setSaving(true); setError('');
    try {
      const body = {
        user_id: form.user_id, name: form.name, email: form.email,
        company_id: form.company_id ? Number(form.company_id) : null,
        department_id: form.department_id ? Number(form.department_id) : null,
        shift_id: form.shift_id ? Number(form.shift_id) : null,
        is_active: form.is_active,
      };
      if (editEmp) {
        await fetchWithAuth(`/employees/${editEmp.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await fetchWithAuth('/employees', { method: 'POST', body: JSON.stringify(body) });
      }
      await loadAll(); closeModal();
    } catch (e: any) { setError(e.message || 'Failed to save'); }
    finally { setSaving(false); }
  }

  async function handleDelete(emp: Employee) {
    if (!confirm(`Delete ${emp.name}?`)) return;
    try {
      await fetchWithAuth(`/employees/${emp.id}`, { method: 'DELETE' });
      await loadAll();
    } catch (e) { console.error(e); }
  }

  const filteredDepts = departments.filter(d => !form.company_id || d.company_id === Number(form.company_id));
  const filteredShifts = shifts.filter(s => !form.company_id || !s.company_id || s.company_id === Number(form.company_id));

  const filtered = employees.filter(e => {
    const matchSearch = !search || e.name.toLowerCase().includes(search.toLowerCase()) || e.user_id.toLowerCase().includes(search.toLowerCase());
    const matchCompany = !filterCompany || e.company_id === Number(filterCompany);
    const matchDept = !filterDept || e.department_id === Number(filterDept);
    return matchSearch && matchCompany && matchDept;
  });

  return (
    <div className="page">
      <div className="topbar">
        <div><h1 className="page-title">Employees</h1><p className="page-sub">Manage employee records linked to biometric users</p></div>
        <button className="btn-primary" onClick={openAdd}>+ Add Employee</button>
      </div>

      <div className="filters">
        <input className="filter-input" placeholder="Search name or user ID..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="filter-input" value={filterCompany} onChange={e => setFilterCompany(e.target.value)}>
          <option value="">All companies</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="filter-input" value={filterDept} onChange={e => setFilterDept(e.target.value)}>
          <option value="">All departments</option>
          {departments.filter(d => !filterCompany || d.company_id === Number(filterCompany)).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      <div className="card">
        {loading ? <div className="empty">Loading...</div> : filtered.length === 0 ? (
          <div className="empty"><div className="empty-icon">👤</div><div>No employees found</div></div>
        ) : (
          <table className="table">
            <thead><tr><th>User ID</th><th>Name</th><th>Company</th><th>Department</th><th>Shift</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(emp => (
                <tr key={emp.id}>
                  <td><span className="mono">{emp.user_id}</span></td>
                  <td><div className="user-cell"><div className="avatar">{emp.name.charAt(0).toUpperCase()}</div>{emp.name}</div></td>
                  <td>{emp.company_name || <span className="muted">—</span>}</td>
                  <td>{emp.department_name || <span className="muted">—</span>}</td>
                  <td>{emp.shift_name ? <span className="shift-tag">{emp.shift_name}<span className="shift-time">{emp.shift_time_in}–{emp.shift_time_out}</span></span> : <span className="muted">—</span>}</td>
                  <td><span className={`status-pill ${emp.is_active ? 'active' : 'inactive'}`}>{emp.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td><div className="actions">
                    <button className="btn-icon" onClick={() => openEdit(emp)} title="Edit">✎</button>
                    <button className="btn-icon danger" onClick={() => handleDelete(emp)} title="Delete">✕</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editEmp ? 'Edit Employee' : 'Add Employee'}</h2>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>
            {error && <div className="error-box">{error}</div>}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Biometric User ID *</label>
                <input className="form-input" value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))} placeholder="Must match device user_id" />
              </div>
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Company</label>
                <select className="form-input" value={form.company_id} onChange={e => setForm(f => ({ ...f, company_id: e.target.value, department_id: '', shift_id: '' }))}>
                  <option value="">Select company</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Department</label>
                <select className="form-input" value={form.department_id} onChange={e => setForm(f => ({ ...f, department_id: e.target.value }))}>
                  <option value="">Select department</option>
                  {filteredDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Shift Schedule</label>
                <select className="form-input" value={form.shift_id} onChange={e => setForm(f => ({ ...f, shift_id: e.target.value }))}>
                  <option value="">Select shift</option>
                  {filteredShifts.map(s => <option key={s.id} value={s.id}>{s.name} ({s.time_in}–{s.time_out})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-input" value={String(form.is_active)} onChange={e => setForm(f => ({ ...f, is_active: e.target.value === 'true' }))}>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={closeModal}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editEmp ? 'Save Changes' : 'Add Employee'}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .page{padding:32px;font-family:'DM Sans',system-ui,sans-serif}
        .topbar{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px}
        .page-title{font-size:22px;font-weight:600;color:#111;letter-spacing:-.4px}
        .page-sub{font-size:13px;color:#999;margin-top:3px}
        .filters{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap}
        .filter-input{padding:8px 12px;border:1px solid #e0e0de;border-radius:8px;font-size:13px;color:#111;background:#fff;outline:none;font-family:inherit}
        .card{background:#fff;border:1px solid #e8e8e6;border-radius:12px;overflow:hidden}
        .table{width:100%;border-collapse:collapse;font-size:13px}
        .table th{text-align:left;padding:11px 20px;color:#aaa;font-weight:400;font-size:11px;text-transform:uppercase;letter-spacing:.5px;background:#fafaf9;border-bottom:1px solid #f0f0ee}
        .table td{padding:13px 20px;color:#333;border-bottom:1px solid #f7f7f5}
        .table tr:last-child td{border-bottom:none}
        .table tr:hover td{background:#fafaf9}
        .mono{font-family:monospace;font-size:12px;color:#666}
        .muted{color:#ccc}
        .user-cell{display:flex;align-items:center;gap:10px}
        .avatar{width:28px;height:28px;border-radius:50%;background:#f0f0ee;color:#888;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;flex-shrink:0}
        .shift-tag{display:inline-flex;flex-direction:column;gap:1px}
        .shift-time{font-size:11px;color:#aaa}
        .status-pill{display:inline-flex;align-items:center;font-size:11px;padding:3px 8px;border-radius:999px}
        .active{background:#f0fdf4;color:#16a34a}
        .inactive{background:#f5f5f3;color:#888}
        .actions{display:flex;gap:6px}
        .btn-icon{width:30px;height:30px;border-radius:6px;border:1px solid #e8e8e6;background:#fff;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;color:#666;transition:all .15s}
        .btn-icon:hover{background:#f5f5f3;color:#111}
        .btn-icon.danger:hover{background:#fef2f2;border-color:#fecaca;color:#dc2626}
        .btn-primary{padding:9px 16px;background:#111;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit}
        .btn-primary:disabled{opacity:.5;cursor:not-allowed}
        .btn-secondary{padding:9px 16px;background:#fff;color:#333;border:1px solid #e8e8e6;border-radius:8px;font-size:13px;cursor:pointer;font-family:inherit}
        .empty{padding:60px 20px;text-align:center;color:#bbb;font-size:13px}
        .empty-icon{font-size:32px;margin-bottom:12px}
        .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:50}
        .modal{background:#fff;border-radius:14px;width:100%;max-width:520px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.15);max-height:90vh;overflow-y:auto}
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