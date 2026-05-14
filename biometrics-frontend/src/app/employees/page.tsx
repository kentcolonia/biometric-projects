'use client';
import { useEffect, useState, useMemo } from 'react';
import { fetchWithAuth } from '@/lib/api';

interface Company { id: number; name: string; address: string; }
interface Department { id: number; name: string; company_id: number; company_name: string; }
interface Shift { id: number; name: string; time_in: string; time_out: string; grace_period: number; is_night_shift: boolean; company_id?: number; }
interface Employee { id: number; user_id: string; name: string; email: string; company_id: number; company_name: string; department_id: number; department_name: string; shift_id: number; shift_name: string; shift_time_in: string; shift_time_out: string; is_active: boolean; }
interface Device { id: number; ip: string; port: number; location: string; isActive: boolean; }
interface ZKUser { uid: number; user_id: string; name: string; privilege: number; }

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

  // Import from biometrics state
  const [showImport, setShowImport] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [importUsers, setImportUsers] = useState<(ZKUser & { device_location: string; already_exists: boolean })[]>([]);
  const [importSelected, setImportSelected] = useState<Set<string>>(new Set());
  const [importCompany, setImportCompany] = useState('');
  const [importDept, setImportDept] = useState('');
  const [importShift, setImportShift] = useState('');
  const [importProgress, setImportProgress] = useState<{ done: number; total: number; errors: string[] } | null>(null);
  const [importSuccess, setImportSuccess] = useState('');

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

  function openAdd() { setEditEmp(null); setForm({ ...emptyForm }); setError(''); setShowModal(true); }
  function openEdit(emp: Employee) {
    setEditEmp(emp);
    setForm({ user_id: emp.user_id, name: emp.name, email: emp.email || '', company_id: String(emp.company_id || ''), department_id: String(emp.department_id || ''), shift_id: String(emp.shift_id || ''), is_active: emp.is_active });
    setError(''); setShowModal(true);
  }
  function closeModal() { setShowModal(false); setEditEmp(null); setError(''); }

  async function handleSave() {
    if (!form.user_id) return setError('User ID is required');
    if (!form.name) return setError('Name is required');
    setSaving(true); setError('');
    try {
      const body = { user_id: form.user_id, name: form.name, email: form.email, company_id: form.company_id ? Number(form.company_id) : null, department_id: form.department_id ? Number(form.department_id) : null, shift_id: form.shift_id ? Number(form.shift_id) : null, is_active: form.is_active };
      if (editEmp) { await fetchWithAuth(`/employees/${editEmp.id}`, { method: 'PUT', body: JSON.stringify(body) }); }
      else { await fetchWithAuth('/employees', { method: 'POST', body: JSON.stringify(body) }); }
      await loadAll(); closeModal();
    } catch (e: any) { setError(e.message || 'Failed to save'); }
    finally { setSaving(false); }
  }

  async function handleDelete(emp: Employee) {
    if (!confirm(`Delete ${emp.name}?`)) return;
    try { await fetchWithAuth(`/employees/${emp.id}`, { method: 'DELETE' }); await loadAll(); }
    catch (e) { console.error(e); }
  }

  // ── Import from biometrics ──
  async function openImport() {
    setShowImport(true);
    setImportError('');
    setImportUsers([]);
    setImportSelected(new Set());
    setImportProgress(null);
    setImportSuccess('');
    setImportCompany('');
    setImportDept('');
    setImportShift('');
    setImportLoading(true);

    try {
      // Fetch all devices
      const devData = await fetchWithAuth<any>('/devices');
      const devices: Device[] = Array.isArray(devData) ? devData : devData?.data || [];

      // Fetch users from each active device
      const existingUserIds = new Set(employees.map(e => e.user_id));
      const seen = new Set<string>();
      const allUsers: (ZKUser & { device_location: string; already_exists: boolean })[] = [];

      await Promise.allSettled(
        devices.filter(d => d.isActive).map(async (device) => {
          try {
            const data = await fetchWithAuth<any>(`/users?ip=${device.ip}&port=${device.port}`);
            const users: ZKUser[] = Array.isArray(data) ? data : data?.data || [];
            for (const u of users) {
              if (!seen.has(u.user_id)) {
                seen.add(u.user_id);
                allUsers.push({ ...u, device_location: device.location || device.ip, already_exists: existingUserIds.has(u.user_id) });
              }
            }
          } catch { /* skip offline */ }
        })
      );

      allUsers.sort((a, b) => a.name?.localeCompare(b.name || '') || 0);
      setImportUsers(allUsers);

      // Auto-select new users only
      const newUsers = allUsers.filter(u => !u.already_exists);
      setImportSelected(new Set(newUsers.map(u => u.user_id)));
    } catch (e: any) {
      setImportError(e.message || 'Failed to fetch biometric users');
    } finally {
      setImportLoading(false);
    }
  }

  function closeImport() { setShowImport(false); setImportProgress(null); setImportSuccess(''); }

  function toggleImportUser(user_id: string) {
    setImportSelected(prev => {
      const next = new Set(prev);
      next.has(user_id) ? next.delete(user_id) : next.add(user_id);
      return next;
    });
  }

  const newImportUsers = useMemo(() => importUsers.filter(u => !u.already_exists), [importUsers]);
  const allNewSelected = newImportUsers.length > 0 && importSelected.size === newImportUsers.length;

  function toggleAllNew() {
    if (allNewSelected) { setImportSelected(new Set()); }
    else { setImportSelected(new Set(newImportUsers.map(u => u.user_id))); }
  }

  async function handleImport() {
    const toImport = importUsers.filter(u => importSelected.has(u.user_id));
    if (toImport.length === 0) return;

    setSaving(true);
    setImportProgress({ done: 0, total: toImport.length, errors: [] });
    setImportSuccess('');

    const errors: string[] = [];
    let done = 0;

    for (const user of toImport) {
      try {
        await fetchWithAuth('/employees', {
          method: 'POST',
          body: JSON.stringify({
            user_id: user.user_id,
            name: user.name,
            email: '',
            company_id: importCompany ? Number(importCompany) : null,
            department_id: importDept ? Number(importDept) : null,
            shift_id: importShift ? Number(importShift) : null,
            is_active: true,
          }),
        });
      } catch (e: any) {
        errors.push(`${user.name}: ${e.message || 'failed'}`);
      }
      done++;
      setImportProgress({ done, total: toImport.length, errors: [...errors] });
    }

    setSaving(false);
    const successCount = done - errors.length;
    if (successCount > 0) {
      setImportSuccess(`Imported ${successCount} employee${successCount !== 1 ? 's' : ''} successfully.`);
      await loadAll();
    }
    setImportProgress({ done, total: toImport.length, errors });
  }

  const filteredDepts = departments.filter(d => !form.company_id || d.company_id === Number(form.company_id));
  const filteredShifts = shifts.filter(s => !form.company_id || !s.company_id || s.company_id === Number(form.company_id));
  const importDepts = departments.filter(d => !importCompany || d.company_id === Number(importCompany));
  const importShifts = shifts.filter(s => !importCompany || !s.company_id || s.company_id === Number(importCompany));

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
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-import" onClick={openImport}>⟳ Import from Biometrics</button>
          <button className="btn-primary" onClick={openAdd}>+ Add Employee</button>
        </div>
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
        {loading ? <div className="empty"><div className="spinner" />Loading...</div> : filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">👤</div>
            <div style={{ marginBottom: 12 }}>No employees found</div>
            <button className="btn-import" onClick={openImport}>⟳ Import from Biometrics</button>
          </div>
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

      {/* ── IMPORT FROM BIOMETRICS MODAL ── */}
      {showImport && (
        <div className="modal-overlay" onClick={!saving ? closeImport : undefined}>
          <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Import from Biometrics</h2>
                <p className="modal-sub">Users pulled from all active devices</p>
              </div>
              <button className="modal-close" onClick={closeImport} disabled={saving}>✕</button>
            </div>

            {importError && <div className="error-box">{importError}</div>}
            {importSuccess && <div className="success-box">{importSuccess}</div>}

            {importLoading && (
              <div className="import-loading">
                <div className="spinner" />
                Fetching users from biometric devices...
              </div>
            )}

            {!importLoading && importUsers.length === 0 && !importError && (
              <div className="import-empty">No users found on active devices.</div>
            )}

            {!importLoading && importUsers.length > 0 && !importProgress && (
              <>
                {/* Stats */}
                <div className="import-stats">
                  <div className="stat-chip new">
                    <span className="stat-num">{newImportUsers.length}</span>
                    <span className="stat-label">New</span>
                  </div>
                  <div className="stat-chip exists">
                    <span className="stat-num">{importUsers.filter(u => u.already_exists).length}</span>
                    <span className="stat-label">Already exist</span>
                  </div>
                  <div className="stat-chip total">
                    <span className="stat-num">{importUsers.length}</span>
                    <span className="stat-label">Total found</span>
                  </div>
                </div>

                {/* Assign defaults */}
                <div className="import-defaults">
                  <div className="import-defaults-label">Assign to (optional — applies to all imported)</div>
                  <div className="import-defaults-row">
                    <select className="form-input" value={importCompany} onChange={e => { setImportCompany(e.target.value); setImportDept(''); setImportShift(''); }}>
                      <option value="">No company</option>
                      {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <select className="form-input" value={importDept} onChange={e => setImportDept(e.target.value)} disabled={!importCompany}>
                      <option value="">No department</option>
                      {importDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <select className="form-input" value={importShift} onChange={e => setImportShift(e.target.value)}>
                      <option value="">No shift</option>
                      {importShifts.map(s => <option key={s.id} value={s.id}>{s.name} ({s.time_in}–{s.time_out})</option>)}
                    </select>
                  </div>
                </div>

                {/* User list */}
                <div className="import-list-header">
                  <button className="select-new-btn" onClick={toggleAllNew}>
                    <span className={`checkbox ${allNewSelected ? 'checked' : importSelected.size > 0 ? 'partial' : ''}`} />
                    {allNewSelected ? 'Deselect all new' : 'Select all new'}
                  </button>
                  {importSelected.size > 0 && <span className="sel-count">{importSelected.size} selected</span>}
                </div>

                <div className="import-list">
                  {importUsers.map(user => (
                    <div
                      key={user.user_id}
                      className={`import-row ${user.already_exists ? 'exists' : ''} ${importSelected.has(user.user_id) ? 'selected' : ''}`}
                      onClick={!user.already_exists ? () => toggleImportUser(user.user_id) : undefined}
                      style={!user.already_exists ? { cursor: 'pointer' } : undefined}
                    >
                      <div className="import-row-left">
                        {!user.already_exists ? (
                          <span className={`checkbox ${importSelected.has(user.user_id) ? 'checked' : ''}`} />
                        ) : (
                          <span className="already-check">✓</span>
                        )}
                        <div className="imp-avatar">{user.name?.charAt(0)?.toUpperCase() || '?'}</div>
                        <div>
                          <div className="imp-name">{user.name || <span className="muted">—</span>}</div>
                          <div className="imp-meta">
                            <span className="mono-sm">{user.user_id}</span>
                            <span className="sep">·</span>
                            <span className="device-loc">{user.device_location}</span>
                          </div>
                        </div>
                      </div>
                      {user.already_exists ? (
                        <span className="exists-badge">Already employee</span>
                      ) : (
                        <span className="new-badge">New</span>
                      )}
                    </div>
                  ))}
                </div>

                <div className="modal-footer">
                  <button className="btn-secondary" onClick={closeImport}>Cancel</button>
                  <button className="btn-primary" onClick={handleImport} disabled={saving || importSelected.size === 0}>
                    {saving ? 'Importing...' : `Import ${importSelected.size} Employee${importSelected.size !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </>
            )}

            {/* Progress view */}
            {importProgress && (
              <>
                <div className="progress-wrap">
                  <div className="prog-label-row">
                    <span>Importing employees...</span>
                    <span>{importProgress.done} / {importProgress.total}</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${(importProgress.done / importProgress.total) * 100}%` }} />
                  </div>
                </div>
                {importProgress.errors.length > 0 && (
                  <div className="error-list">
                    <div className="error-list-title">Errors</div>
                    {importProgress.errors.map((e, i) => <div key={i} className="error-list-item">• {e}</div>)}
                  </div>
                )}
                {importProgress.done === importProgress.total && (
                  <div className="modal-footer">
                    <button className="btn-primary" onClick={closeImport}>Done</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── ADD / EDIT MODAL ── */}
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
        .page { padding: 32px; font-family: 'DM Sans', system-ui, sans-serif; color: #f4f4f5; }
        .topbar { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; }
        .page-title { font-size: 22px; font-weight: 600; color: #f4f4f5; letter-spacing: -0.4px; }
        .page-sub { font-size: 13px; color: #71717a; margin-top: 3px; }
        .filters { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
        .filter-input { padding: 8px 12px; border: 1px solid #27272a; border-radius: 8px; font-size: 13px; color: #f4f4f5; background: #18181b; outline: none; font-family: inherit; }
        .filter-input:focus { border-color: rgba(16,185,129,0.4); }
        .filter-input option { background: #18181b; }
        .card { background: #18181b; border: 1px solid #27272a; border-radius: 12px; overflow: hidden; }
        .table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .table th { text-align: left; padding: 11px 20px; color: #52525b; font-weight: 400; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; background: #141418; border-bottom: 1px solid #27272a; }
        .table td { padding: 13px 20px; color: #a1a1aa; border-bottom: 1px solid #1f1f23; }
        .table tr:last-child td { border-bottom: none; }
        .table tr:hover td { background: #1c1c21; color: #d4d4d8; }
        .mono { font-family: monospace; font-size: 12px; color: #52525b; }
        .muted { color: #3f3f46; }
        .user-cell { display: flex; align-items: center; gap: 10px; }
        .avatar { width: 28px; height: 28px; border-radius: 50%; background: #27272a; color: #71717a; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; flex-shrink: 0; }
        .shift-tag { display: inline-flex; flex-direction: column; gap: 1px; }
        .shift-time { font-size: 11px; color: #52525b; }
        .status-pill { display: inline-flex; align-items: center; font-size: 11px; padding: 3px 8px; border-radius: 999px; }
        .active { background: rgba(16,185,129,0.12); color: #34d399; }
        .inactive { background: #27272a; color: #71717a; }
        .actions { display: flex; gap: 6px; }
        .btn-icon { width: 30px; height: 30px; border-radius: 6px; border: 1px solid #27272a; background: #18181b; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; color: #52525b; transition: all 0.15s; }
        .btn-icon:hover { background: #27272a; color: #a1a1aa; }
        .btn-icon.danger:hover { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.3); color: #f87171; }
        .btn-primary { padding: 9px 16px; background: #10b981; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; font-family: inherit; transition: all 0.15s; white-space: nowrap; }
        .btn-primary:hover { background: #059669; }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-import { padding: 9px 16px; background: rgba(16,185,129,0.1); color: #10b981; border: 1px solid rgba(16,185,129,0.25); border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; font-family: inherit; transition: all 0.15s; white-space: nowrap; }
        .btn-import:hover { background: rgba(16,185,129,0.18); }
        .btn-secondary { padding: 9px 16px; background: #27272a; color: #a1a1aa; border: 1px solid #3f3f46; border-radius: 8px; font-size: 13px; cursor: pointer; font-family: inherit; transition: all 0.15s; }
        .btn-secondary:hover { color: #f4f4f5; }
        .empty { padding: 60px 20px; text-align: center; color: #52525b; font-size: 13px; display: flex; flex-direction: column; align-items: center; gap: 4px; }
        .empty-icon { font-size: 32px; margin-bottom: 8px; }
        .spinner { width: 20px; height: 20px; border: 2px solid #27272a; border-top-color: #10b981; border-radius: 50%; animation: spin 0.7s linear infinite; margin-bottom: 4px; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Modals */
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 50; backdrop-filter: blur(4px); }
        .modal { background: #18181b; border: 1px solid #27272a; border-radius: 14px; width: 100%; max-width: 520px; padding: 24px; box-shadow: 0 25px 60px rgba(0,0,0,0.5); max-height: 90vh; overflow-y: auto; }
        .modal-wide { max-width: 600px; }
        .modal-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; }
        .modal-title { font-size: 15px; font-weight: 600; color: #f4f4f5; }
        .modal-sub { font-size: 12px; color: #71717a; margin-top: 3px; }
        .modal-close { background: none; border: none; font-size: 16px; color: #52525b; cursor: pointer; padding: 4px; flex-shrink: 0; }
        .modal-close:hover { color: #a1a1aa; }
        .modal-close:disabled { opacity: 0.3; cursor: not-allowed; }
        .modal-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .form-group { margin-bottom: 16px; }
        .form-label { display: block; font-size: 11px; font-weight: 500; color: #71717a; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.4px; }
        .form-input { width: 100%; padding: 9px 12px; border: 1px solid #27272a; border-radius: 8px; font-size: 13px; color: #f4f4f5; background: #09090b; outline: none; box-sizing: border-box; font-family: inherit; }
        .form-input:focus { border-color: rgba(16,185,129,0.4); }
        .form-input:disabled { opacity: 0.5; }
        .form-input option { background: #18181b; }
        .error-box { background: rgba(239,68,68,0.1); color: #f87171; border: 1px solid rgba(239,68,68,0.2); border-radius: 8px; padding: 10px 14px; font-size: 13px; margin-bottom: 16px; }
        .success-box { background: rgba(16,185,129,0.1); color: #34d399; border: 1px solid rgba(16,185,129,0.2); border-radius: 8px; padding: 10px 14px; font-size: 13px; margin-bottom: 16px; }

        /* Import-specific */
        .import-loading { display: flex; align-items: center; gap: 12px; padding: 32px 0; color: #71717a; font-size: 13px; justify-content: center; }
        .import-empty { text-align: center; color: #52525b; font-size: 13px; padding: 32px 0; }
        .import-stats { display: flex; gap: 10px; margin-bottom: 20px; }
        .stat-chip { flex: 1; background: #141418; border: 1px solid #27272a; border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; }
        .stat-chip.new { border-color: rgba(16,185,129,0.2); background: rgba(16,185,129,0.06); }
        .stat-chip.exists { border-color: rgba(113,113,122,0.3); }
        .stat-num { font-size: 22px; font-weight: 600; color: #f4f4f5; }
        .stat-chip.new .stat-num { color: #10b981; }
        .stat-label { font-size: 11px; color: #71717a; }
        .import-defaults { background: #141418; border: 1px solid #27272a; border-radius: 10px; padding: 14px 16px; margin-bottom: 16px; }
        .import-defaults-label { font-size: 11px; color: #71717a; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 10px; }
        .import-defaults-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
        .import-list-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
        .select-new-btn { display: flex; align-items: center; gap: 8px; background: none; border: none; color: #a1a1aa; font-size: 13px; cursor: pointer; font-family: inherit; padding: 0; }
        .select-new-btn:hover { color: #f4f4f5; }
        .sel-count { font-size: 12px; color: #10b981; background: rgba(16,185,129,0.12); padding: 2px 8px; border-radius: 999px; }
        .import-list { display: flex; flex-direction: column; gap: 4px; max-height: 280px; overflow-y: auto; margin-bottom: 4px; padding-right: 2px; }
        .import-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-radius: 8px; border: 1px solid #27272a; background: #141418; transition: all 0.1s; }
        .import-row:not(.exists):hover { border-color: rgba(16,185,129,0.25); background: rgba(16,185,129,0.04); }
        .import-row.selected { border-color: rgba(16,185,129,0.3); background: rgba(16,185,129,0.08); }
        .import-row.exists { opacity: 0.5; }
        .import-row-left { display: flex; align-items: center; gap: 10px; }
        .imp-avatar { width: 30px; height: 30px; border-radius: 50%; background: #27272a; color: #71717a; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; flex-shrink: 0; }
        .import-row.selected .imp-avatar { background: rgba(16,185,129,0.15); color: #10b981; }
        .imp-name { font-size: 13px; color: #e4e4e7; font-weight: 500; }
        .imp-meta { display: flex; align-items: center; gap: 5px; margin-top: 2px; }
        .mono-sm { font-family: monospace; font-size: 11px; color: #52525b; }
        .sep { color: #3f3f46; font-size: 10px; }
        .device-loc { font-size: 11px; color: #52525b; }
        .new-badge { font-size: 10px; background: rgba(16,185,129,0.12); color: #10b981; border: 1px solid rgba(16,185,129,0.2); padding: 2px 7px; border-radius: 999px; white-space: nowrap; }
        .exists-badge { font-size: 10px; background: #27272a; color: #52525b; border: 1px solid #3f3f46; padding: 2px 7px; border-radius: 999px; white-space: nowrap; }
        .already-check { width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; color: #52525b; font-size: 12px; flex-shrink: 0; }
        .checkbox { display: inline-flex; width: 16px; height: 16px; border-radius: 4px; border: 1.5px solid #3f3f46; background: transparent; cursor: pointer; flex-shrink: 0; position: relative; transition: all 0.1s; }
        .checkbox.checked { background: #10b981; border-color: #10b981; }
        .checkbox.checked::after { content: ''; position: absolute; inset: 2px; background: url("data:image/svg+xml,%3Csvg viewBox='0 0 10 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 4L3.5 6.5L9 1' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/contain no-repeat; }
        .checkbox.partial { background: #27272a; border-color: #10b981; }
        .checkbox.partial::after { content: ''; position: absolute; top: 50%; left: 2px; right: 2px; height: 1.5px; background: #10b981; transform: translateY(-50%); border-radius: 1px; }
        .progress-wrap { margin: 16px 0; }
        .prog-label-row { display: flex; justify-content: space-between; font-size: 12px; color: #71717a; margin-bottom: 8px; }
        .progress-bar { height: 6px; background: #27272a; border-radius: 999px; overflow: hidden; }
        .progress-fill { height: 100%; background: linear-gradient(90deg, #10b981, #06b6d4); border-radius: 999px; transition: width 0.3s ease; }
        .error-list { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.15); border-radius: 8px; padding: 10px 14px; margin-top: 12px; }
        .error-list-title { font-size: 11px; color: #f87171; font-weight: 500; margin-bottom: 6px; text-transform: uppercase; }
        .error-list-item { font-size: 12px; color: #f87171; line-height: 1.6; opacity: 0.8; }
      `}</style>
    </div>
  );
}