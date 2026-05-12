'use client';

import { useEffect, useState } from 'react';
import { fetchWithAuth } from '@/lib/api';

interface Device {
  id: number;
  ip: string;
  port: number;
  location: string;
  isActive: boolean;
}

interface ZKUser {
  uid: number;
  user_id: string;
  name: string;
  privilege: number;
  password: string;
  card: number;
  group_id?: string;
}

const PRIVILEGE_LABELS: Record<number, string> = {
  0: 'User',
  2: 'Enroller',
  6: 'Manager',
  14: 'Admin',
};

const FINGER_LABELS = [
  'Left Pinky', 'Left Ring', 'Left Middle', 'Left Index', 'Left Thumb',
  'Right Thumb', 'Right Index', 'Right Middle', 'Right Ring', 'Right Pinky',
];

type ModalMode = 'edit' | 'enroll' | 'finger' | 'delete' | null;

const emptyForm = {
  user_id: '',
  name: '',
  privilege: 0,
  password: '',
  card: '',
};

export default function UsersPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [users, setUsers] = useState<ZKUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedUser, setSelectedUser] = useState<ZKUser | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [fingerIndex, setFingerIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');
  const [modalSuccess, setModalSuccess] = useState('');

  useEffect(() => {
    async function loadDevices() {
      try {
        const data = await fetchWithAuth<any>('/devices');
        const list = Array.isArray(data) ? data : data?.data || [];
        setDevices(list);
        const active = list.find((d: Device) => d.isActive);
        if (active) setSelectedDevice(active);
      } catch (err) {
        console.error('Failed to load devices:', err);
      } finally {
        setLoadingDevices(false);
      }
    }
    loadDevices();
  }, []);

  useEffect(() => {
    if (selectedDevice) fetchUsers(selectedDevice);
  }, [selectedDevice]);

  async function fetchUsers(device: Device) {
    setLoading(true);
    setError('');
    setUsers([]);
    try {
      const data = await fetchWithAuth<any>(`/users?ip=${device.ip}&port=${device.port}`);
      const list = Array.isArray(data) ? data : data?.data || [];
      setUsers(list);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch users from device');
    } finally {
      setLoading(false);
    }
  }

  function openEdit(user: ZKUser) {
    setSelectedUser(user);
    setForm({
      user_id: user.user_id,
      name: user.name,
      privilege: user.privilege,
      password: user.password || '',
      card: user.card ? String(user.card) : '',
    });
    setModalError('');
    setModalSuccess('');
    setModalMode('edit');
  }

  function openEnroll() {
    setSelectedUser(null);
    setForm({ ...emptyForm });
    setModalError('');
    setModalSuccess('');
    setModalMode('enroll');
  }

  function openFinger(user: ZKUser) {
    setSelectedUser(user);
    setFingerIndex(0);
    setModalError('');
    setModalSuccess('');
    setModalMode('finger');
  }

  function openDelete(user: ZKUser) {
    setSelectedUser(user);
    setModalError('');
    setModalSuccess('');
    setModalMode('delete');
  }

  function closeModal() {
    setModalMode(null);
    setSelectedUser(null);
    setModalError('');
    setModalSuccess('');
  }

  async function handleEdit() {
    if (!selectedUser || !selectedDevice) return;
    if (!form.name) return setModalError('Name is required');
    if (!form.user_id) return setModalError('User ID is required');

    setSaving(true);
    setModalError('');
    try {
      await fetchWithAuth(`/users/${selectedUser.uid}`, {
        method: 'PUT',
        body: JSON.stringify({
          ip: selectedDevice.ip,
          port: selectedDevice.port,
          user_id: form.user_id,
          name: form.name,
          privilege: Number(form.privilege),
          password: form.password,
          card: Number(form.card) || 0,
        }),
      });
      await fetchUsers(selectedDevice);
      closeModal();
    } catch (err: any) {
      setModalError(err.message || 'Failed to update user');
    } finally {
      setSaving(false);
    }
  }

  async function handleEnroll() {
    if (!selectedDevice) return;
    if (!form.name) return setModalError('Name is required');
    if (!form.user_id) return setModalError('User ID is required');

    setSaving(true);
    setModalError('');
    try {
      await fetchWithAuth('/users/enroll', {
        method: 'POST',
        body: JSON.stringify({
          ip: selectedDevice.ip,
          port: selectedDevice.port,
          user_id: form.user_id,
          name: form.name,
          privilege: Number(form.privilege),
          password: form.password,
          card: Number(form.card) || 0,
        }),
      });
      await fetchUsers(selectedDevice);
      closeModal();
    } catch (err: any) {
      setModalError(err.message || 'Failed to enroll user');
    } finally {
      setSaving(false);
    }
  }

  async function handleEnrollFinger() {
    if (!selectedUser || !selectedDevice) return;
    setSaving(true);
    setModalError('');
    setModalSuccess('');
    try {
      await fetchWithAuth(`/users/${selectedUser.uid}/enroll-finger`, {
        method: 'POST',
        body: JSON.stringify({
          ip: selectedDevice.ip,
          port: selectedDevice.port,
          finger_index: fingerIndex,
        }),
      });
      setModalSuccess(`Enrollment initiated! Ask ${selectedUser.name} to scan their finger on the device.`);
    } catch (err: any) {
      setModalError(err.message || 'Failed to initiate fingerprint enrollment');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedUser || !selectedDevice) return;
    setSaving(true);
    setModalError('');
    try {
      await fetchWithAuth(`/users/${selectedUser.uid}`, {
        method: 'DELETE',
        body: JSON.stringify({
          ip: selectedDevice.ip,
          port: selectedDevice.port,
        }),
      });
      await fetchUsers(selectedDevice);
      closeModal();
    } catch (err: any) {
      setModalError(err.message || 'Failed to delete user');
    } finally {
      setSaving(false);
    }
  }

  const filtered = users.filter(u =>
    search === '' ||
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.user_id?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="page-sub">Users enrolled on ZK biometric devices</p>
        </div>
        {selectedDevice && (
          <button className="btn-primary" onClick={openEnroll}>+ Enroll User</button>
        )}
      </div>

      {/* Device selector */}
      <div className="device-bar">
        <span className="device-label">Device:</span>
        {loadingDevices ? (
          <span className="muted">Loading devices...</span>
        ) : devices.length === 0 ? (
          <span className="muted">No devices registered</span>
        ) : (
          <div className="device-tabs">
            {devices.map(device => (
              <button
                key={device.id}
                className={`device-tab ${selectedDevice?.id === device.id ? 'active' : ''} ${!device.isActive ? 'offline' : ''}`}
                onClick={() => setSelectedDevice(device)}
              >
                <span className={`dot ${device.isActive ? 'online' : 'offline'}`} />
                {device.location || device.ip}
              </button>
            ))}
          </div>
        )}
        {selectedDevice && (
          <button className="btn-refresh" onClick={() => fetchUsers(selectedDevice)}>↻ Refresh</button>
        )}
      </div>

      {/* Search */}
      {users.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <input
            className="search-input"
            type="text"
            placeholder="Search by name or user ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}

      <div className="card">
        {!selectedDevice ? (
          <div className="empty"><div className="empty-icon">⊙</div><div>Select a device to view users</div></div>
        ) : loading ? (
          <div className="empty">Fetching users from {selectedDevice.ip}...</div>
        ) : error ? (
          <div className="empty error-state">
            <div className="empty-icon">⚠</div>
            <div>{error}</div>
            <button className="btn-retry" onClick={() => fetchUsers(selectedDevice)}>Try again</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">⊙</div>
            <div>{search ? 'No users match your search' : 'No users found on this device'}</div>
            {!search && <button className="btn-primary" style={{ marginTop: 12 }} onClick={openEnroll}>Enroll first user</button>}
          </div>
        ) : (
          <>
            <div className="table-info">
              Showing {filtered.length} user{filtered.length !== 1 ? 's' : ''} from{' '}
              <strong>{selectedDevice.location || selectedDevice.ip}</strong>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>UID</th>
                  <th>User ID</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Card</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(user => (
                  <tr key={user.uid}>
                    <td><span className="mono">#{user.uid}</span></td>
                    <td><span className="mono">{user.user_id}</span></td>
                    <td>
                      <div className="user-cell">
                        <div className="avatar">{user.name?.charAt(0)?.toUpperCase() || '?'}</div>
                        {user.name || <span className="muted">—</span>}
                      </div>
                    </td>
                    <td>
                      <span className={`role-badge role-${user.privilege}`}>
                        {PRIVILEGE_LABELS[user.privilege] || `Role ${user.privilege}`}
                      </span>
                    </td>
                    <td><span className="mono">{user.card || '—'}</span></td>
                    <td>
                      <div className="actions">
                        <button className="btn-icon" onClick={() => openEdit(user)} title="Edit">✎</button>
                        <button className="btn-icon fp" onClick={() => openFinger(user)} title="Enroll Fingerprint">⌖</button>
                        <button className="btn-icon danger" onClick={() => openDelete(user)} title="Delete">✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* ── EDIT MODAL ── */}
      {modalMode === 'edit' && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Edit User</h2>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>
            {modalError && <div className="error-box">{modalError}</div>}
            <div className="form-group">
              <label className="form-label">User ID *</label>
              <input className="form-input" value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Name *</label>
              <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Role</label>
              <select className="form-input" value={form.privilege} onChange={e => setForm(f => ({ ...f, privilege: Number(e.target.value) }))}>
                {Object.entries(PRIVILEGE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input className="form-input" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Leave blank to keep existing" />
            </div>
            <div className="form-group">
              <label className="form-label">Card Number</label>
              <input className="form-input" type="number" value={form.card} onChange={e => setForm(f => ({ ...f, card: e.target.value }))} placeholder="0" />
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={closeModal}>Cancel</button>
              <button className="btn-primary" onClick={handleEdit} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── ENROLL NEW USER MODAL ── */}
      {modalMode === 'enroll' && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Enroll New User</h2>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>
            {modalError && <div className="error-box">{modalError}</div>}
            <div className="form-group">
              <label className="form-label">User ID *</label>
              <input className="form-input" placeholder="e.g. EMP-001" value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <input className="form-input" placeholder="e.g. Juan dela Cruz" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Role</label>
              <select className="form-input" value={form.privilege} onChange={e => setForm(f => ({ ...f, privilege: Number(e.target.value) }))}>
                {Object.entries(PRIVILEGE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input className="form-input" type="password" placeholder="Optional" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Card Number</label>
              <input className="form-input" type="number" placeholder="0 if none" value={form.card} onChange={e => setForm(f => ({ ...f, card: e.target.value }))} />
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={closeModal}>Cancel</button>
              <button className="btn-primary" onClick={handleEnroll} disabled={saving}>{saving ? 'Enrolling...' : 'Enroll User'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── FINGERPRINT MODAL ── */}
      {modalMode === 'finger' && selectedUser && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Enroll Fingerprint</h2>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="user-info-box">
              <div className="avatar lg">{selectedUser.name?.charAt(0)?.toUpperCase() || '?'}</div>
              <div>
                <div className="user-info-name">{selectedUser.name}</div>
                <div className="user-info-sub">UID #{selectedUser.uid} · ID {selectedUser.user_id}</div>
              </div>
            </div>
            {modalError && <div className="error-box">{modalError}</div>}
            {modalSuccess && <div className="success-box">{modalSuccess}</div>}
            {!modalSuccess && (
              <>
                <div className="form-group">
                  <label className="form-label">Select Finger</label>
                  <select className="form-input" value={fingerIndex} onChange={e => setFingerIndex(Number(e.target.value))}>
                    {FINGER_LABELS.map((label, i) => (
                      <option key={i} value={i}>{label} (Finger {i})</option>
                    ))}
                  </select>
                </div>
                <p className="hint">After clicking "Start Enrollment", ask the user to place their finger on the device sensor when prompted.</p>
                <div className="modal-footer">
                  <button className="btn-secondary" onClick={closeModal}>Cancel</button>
                  <button className="btn-primary" onClick={handleEnrollFinger} disabled={saving}>{saving ? 'Initiating...' : 'Start Enrollment'}</button>
                </div>
              </>
            )}
            {modalSuccess && (
              <div className="modal-footer">
                <button className="btn-primary" onClick={closeModal}>Done</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── DELETE MODAL ── */}
      {modalMode === 'delete' && selectedUser && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Delete User</h2>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="delete-warning">
              <div className="delete-icon">⚠</div>
              <p>Are you sure you want to delete <strong>{selectedUser.name}</strong> (UID #{selectedUser.uid}) from the device?</p>
              <p className="delete-sub">This will also remove all their fingerprint data. This action cannot be undone.</p>
            </div>
            {modalError && <div className="error-box">{modalError}</div>}
            <div className="modal-footer">
              <button className="btn-secondary" onClick={closeModal}>Cancel</button>
              <button className="btn-danger" onClick={handleDelete} disabled={saving}>{saving ? 'Deleting...' : 'Delete User'}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .page { padding: 32px; font-family: 'DM Sans', system-ui, sans-serif; }
        .topbar { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; }
        .page-title { font-size: 22px; font-weight: 600; color: #111; letter-spacing: -0.4px; }
        .page-sub { font-size: 13px; color: #999; margin-top: 3px; }
        .device-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
        .device-label { font-size: 13px; color: #888; }
        .device-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
        .device-tab { display: flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 8px; border: 1px solid #e0e0de; background: #fff; font-size: 13px; cursor: pointer; color: #555; font-family: inherit; transition: all 0.15s; }
        .device-tab:hover { background: #f5f5f3; }
        .device-tab.active { background: #111; color: #fff; border-color: #111; }
        .device-tab.offline { opacity: 0.5; }
        .dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
        .dot.online { background: #22c55e; }
        .dot.offline { background: #ef4444; }
        .btn-refresh { padding: 7px 14px; background: #fff; border: 1px solid #e0e0de; border-radius: 8px; font-size: 13px; cursor: pointer; color: #555; font-family: inherit; }
        .btn-refresh:hover { background: #f5f5f3; }
        .btn-retry { margin-top: 12px; padding: 8px 16px; background: #111; color: #fff; border: none; border-radius: 8px; font-size: 13px; cursor: pointer; font-family: inherit; }
        .btn-primary { padding: 9px 16px; background: #111; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; font-family: inherit; transition: opacity 0.15s; }
        .btn-primary:hover { opacity: 0.85; }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-secondary { padding: 9px 16px; background: #fff; color: #333; border: 1px solid #e8e8e6; border-radius: 8px; font-size: 13px; cursor: pointer; font-family: inherit; }
        .btn-secondary:hover { background: #f5f5f3; }
        .btn-danger { padding: 9px 16px; background: #dc2626; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; font-family: inherit; }
        .btn-danger:hover { background: #b91c1c; }
        .btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
        .search-input { padding: 8px 12px; border: 1px solid #e0e0de; border-radius: 8px; font-size: 13px; color: #111; background: #fff; outline: none; font-family: inherit; width: 280px; }
        .search-input:focus { border-color: #aaa; }
        .card { background: #fff; border: 1px solid #e8e8e6; border-radius: 12px; overflow: hidden; }
        .table-info { padding: 12px 20px; font-size: 12px; color: #aaa; border-bottom: 1px solid #f0f0ee; background: #fafaf9; }
        .table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .table th { text-align: left; padding: 11px 20px; color: #aaa; font-weight: 400; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; background: #fafaf9; border-bottom: 1px solid #f0f0ee; }
        .table td { padding: 13px 20px; color: #333; border-bottom: 1px solid #f7f7f5; }
        .table tr:last-child td { border-bottom: none; }
        .table tr:hover td { background: #fafaf9; }
        .mono { font-family: monospace; font-size: 12px; color: #666; }
        .muted { color: #ccc; }
        .user-cell { display: flex; align-items: center; gap: 10px; }
        .avatar { width: 28px; height: 28px; border-radius: 50%; background: #f0f0ee; color: #888; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; flex-shrink: 0; }
        .avatar.lg { width: 40px; height: 40px; font-size: 15px; }
        .role-badge { display: inline-flex; align-items: center; font-size: 11px; padding: 3px 8px; border-radius: 999px; }
        .role-0 { background: #f5f5f3; color: #888; }
        .role-2 { background: #eff6ff; color: #2563eb; }
        .role-6 { background: #fefce8; color: #ca8a04; }
        .role-14 { background: #fdf2f8; color: #9333ea; }
        .actions { display: flex; gap: 6px; }
        .btn-icon { width: 30px; height: 30px; border-radius: 6px; border: 1px solid #e8e8e6; background: #fff; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; color: #666; transition: all 0.15s; }
        .btn-icon:hover { background: #f5f5f3; color: #111; }
        .btn-icon.fp:hover { background: #eff6ff; border-color: #bfdbfe; color: #2563eb; }
        .btn-icon.danger:hover { background: #fef2f2; border-color: #fecaca; color: #dc2626; }
        .empty { padding: 60px 20px; text-align: center; color: #bbb; font-size: 13px; }
        .empty-icon { font-size: 32px; margin-bottom: 12px; }
        .error-state { color: #dc2626; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 50; }
        .modal { background: #fff; border-radius: 14px; width: 100%; max-width: 440px; padding: 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.15); }
        .modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
        .modal-title { font-size: 16px; font-weight: 600; color: #111; }
        .modal-close { background: none; border: none; font-size: 16px; color: #aaa; cursor: pointer; padding: 4px; }
        .modal-close:hover { color: #333; }
        .modal-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 24px; }
        .form-group { margin-bottom: 16px; }
        .form-label { display: block; font-size: 12px; font-weight: 500; color: #555; margin-bottom: 6px; }
        .form-input { width: 100%; padding: 9px 12px; border: 1px solid #e0e0de; border-radius: 8px; font-size: 13px; color: #111; background: #fafafa; outline: none; box-sizing: border-box; font-family: inherit; }
        .form-input:focus { border-color: #aaa; background: #fff; }
        .error-box { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; border-radius: 8px; padding: 10px 14px; font-size: 13px; margin-bottom: 16px; }
        .success-box { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; border-radius: 8px; padding: 10px 14px; font-size: 13px; margin-bottom: 16px; }
        .user-info-box { display: flex; align-items: center; gap: 12px; background: #fafaf9; border: 1px solid #f0f0ee; border-radius: 10px; padding: 12px 16px; margin-bottom: 20px; }
        .user-info-name { font-size: 14px; font-weight: 600; color: #111; }
        .user-info-sub { font-size: 12px; color: #aaa; margin-top: 2px; }
        .hint { font-size: 12px; color: #999; margin: 0 0 16px; line-height: 1.5; }
        .delete-warning { text-align: center; padding: 16px 0; }
        .delete-icon { font-size: 32px; margin-bottom: 12px; color: #f59e0b; }
        .delete-warning p { font-size: 14px; color: #333; margin: 0 0 8px; line-height: 1.5; }
        .delete-sub { font-size: 12px; color: #999; }
      `}</style>
    </div>
  );
}