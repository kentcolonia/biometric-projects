'use client';

import { useEffect, useState } from 'react';
import { fetchWithAuth } from '@/lib/api';

interface Device { id: number; ip: string; port: number; location: string; isActive: boolean; }
interface ZKUser { uid: number; user_id: string; name: string; privilege: number; password: string; card: number; group_id?: string; }
interface Assignment { id: number; user_id: string; device_id: number; device_ip: string; device_location: string; created_at: string; }

const PRIVILEGE_LABELS: Record<number, string> = { 0: 'User', 2: 'Enroller', 6: 'Manager', 14: 'Admin' };
const FINGER_LABELS = ['Left Pinky','Left Ring','Left Middle','Left Index','Left Thumb','Right Thumb','Right Index','Right Middle','Right Ring','Right Pinky'];
type ModalMode = 'edit' | 'enroll' | 'finger' | 'delete' | 'transfer' | 'assign' | 'bulk' | null;
const emptyForm = { user_id: '', name: '', privilege: 0, password: '', card: '' };

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
  const [targetDeviceId, setTargetDeviceId] = useState<number | ''>('');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [assignDeviceId, setAssignDeviceId] = useState<number | ''>('');
  const [openMenuUid, setOpenMenuUid] = useState<number | null>(null);

  // Bulk selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedUids, setSelectedUids] = useState<Set<number>>(new Set());
  const [bulkAction, setBulkAction] = useState<'move' | 'copy'>('copy');
  const [bulkTargetDeviceId, setBulkTargetDeviceId] = useState<number | ''>('');
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; errors: string[] } | null>(null);

  useEffect(() => {
    async function loadDevices() {
      try {
        const data = await fetchWithAuth<any>('/devices');
        const list = Array.isArray(data) ? data : data?.data || [];
        setDevices(list);
        const active = list.find((d: Device) => d.isActive);
        if (active) setSelectedDevice(active);
      } catch (err) { console.error(err); }
      finally { setLoadingDevices(false); }
    }
    loadDevices();
  }, []);

  useEffect(() => { if (selectedDevice) fetchUsers(selectedDevice); }, [selectedDevice]);

  useEffect(() => {
    if (openMenuUid === null) return;
    function handleOutside() { setOpenMenuUid(null); }
    document.addEventListener('click', handleOutside);
    return () => document.removeEventListener('click', handleOutside);
  }, [openMenuUid]);

  async function fetchUsers(device: Device) {
    setLoading(true); setError(''); setUsers([]);
    try {
      const data = await fetchWithAuth<any>(`/users?ip=${device.ip}&port=${device.port}`);
      setUsers(Array.isArray(data) ? data : data?.data || []);
    } catch (err: any) { setError(err.message || 'Failed to fetch users'); }
    finally { setLoading(false); }
  }

  async function fetchAssignments(userId: string) {
    setLoadingAssignments(true);
    try {
      const data = await fetchWithAuth<any>(`/assignments?user_id=${userId}`);
      setAssignments(data?.data || []);
    } catch { setAssignments([]); }
    finally { setLoadingAssignments(false); }
  }

  function openEdit(user: ZKUser) { setSelectedUser(user); setForm({ user_id: user.user_id, name: user.name, privilege: user.privilege, password: user.password||'', card: user.card?String(user.card):'' }); setModalError(''); setModalSuccess(''); setModalMode('edit'); }
  function openEnroll() { setSelectedUser(null); setForm({...emptyForm}); setModalError(''); setModalSuccess(''); setModalMode('enroll'); }
  function openFinger(user: ZKUser) { setSelectedUser(user); setFingerIndex(0); setModalError(''); setModalSuccess(''); setModalMode('finger'); }
  function openDelete(user: ZKUser) { setSelectedUser(user); setModalError(''); setModalSuccess(''); setModalMode('delete'); }
  function openTransfer(user: ZKUser) { setSelectedUser(user); setTargetDeviceId(''); setModalError(''); setModalSuccess(''); setModalMode('transfer'); }
  function openAssign(user: ZKUser) { setSelectedUser(user); setAssignDeviceId(''); setModalError(''); setModalSuccess(''); fetchAssignments(user.user_id); setModalMode('assign'); }

  function closeModal() { setModalMode(null); setSelectedUser(null); setModalError(''); setModalSuccess(''); setTargetDeviceId(''); setAssignDeviceId(''); setAssignments([]); setBulkProgress(null); setBulkTargetDeviceId(''); }

  function toggleSelectionMode() {
    setSelectionMode(v => !v);
    setSelectedUids(new Set());
  }

  function toggleUser(uid: number) {
    setSelectedUids(prev => {
      const next = new Set(prev);
      next.has(uid) ? next.delete(uid) : next.add(uid);
      return next;
    });
  }

  function toggleAll() {
    if (selectedUids.size === filtered.length) {
      setSelectedUids(new Set());
    } else {
      setSelectedUids(new Set(filtered.map(u => u.uid)));
    }
  }

  function openBulkModal(action: 'move' | 'copy') {
    setBulkAction(action);
    setBulkTargetDeviceId('');
    setModalError('');
    setModalSuccess('');
    setBulkProgress(null);
    setModalMode('bulk');
  }

  async function handleBulkAction() {
    if (!bulkTargetDeviceId || !selectedDevice) return setModalError('Please select a target device');
    const usersToProcess = filtered.filter(u => selectedUids.has(u.uid));
    if (usersToProcess.length === 0) return setModalError('No users selected');

    setSaving(true);
    setModalError('');
    setModalSuccess('');
    setBulkProgress({ done: 0, total: usersToProcess.length, errors: [] });

    const errors: string[] = [];
    let done = 0;

    for (const user of usersToProcess) {
      try {
        await fetchWithAuth<any>('/assignments/transfer', {
          method: 'POST',
          body: JSON.stringify({
            user_id: user.user_id,
            source_device_id: selectedDevice.id,
            target_device_id: bulkTargetDeviceId,
          }),
        });
        done++;
        setBulkProgress({ done, total: usersToProcess.length, errors: [...errors] });
      } catch (err: any) {
        errors.push(`${user.name}: ${err.message || 'failed'}`);
        done++;
        setBulkProgress({ done, total: usersToProcess.length, errors: [...errors] });
      }
    }

    // If move, delete from source after copying
    if (bulkAction === 'move') {
      for (const user of usersToProcess) {
        if (!errors.find(e => e.startsWith(user.name))) {
          try {
            await fetchWithAuth(`/users/${user.uid}`, {
              method: 'DELETE',
              body: JSON.stringify({ ip: selectedDevice.ip, port: selectedDevice.port }),
            });
          } catch (err: any) {
            errors.push(`Delete ${user.name}: ${err.message || 'failed'}`);
          }
        }
      }
    }

    setSaving(false);
    setBulkProgress({ done, total: usersToProcess.length, errors });

    const successCount = done - errors.length;
    if (successCount > 0) {
      setModalSuccess(`${bulkAction === 'move' ? 'Moved' : 'Copied'} ${successCount} user${successCount !== 1 ? 's' : ''} successfully.`);
      await fetchUsers(selectedDevice);
      if (bulkAction === 'move') { setSelectedUids(new Set()); setSelectionMode(false); }
    }
  }

  async function handleEdit() {
    if (!selectedUser || !selectedDevice) return;
    if (!form.name) return setModalError('Name is required');
    if (!form.user_id) return setModalError('User ID is required');
    setSaving(true); setModalError('');
    try {
      await fetchWithAuth(`/users/${selectedUser.uid}`, { method: 'PUT', body: JSON.stringify({ ip: selectedDevice.ip, port: selectedDevice.port, user_id: form.user_id, name: form.name, privilege: Number(form.privilege), password: form.password, card: Number(form.card)||0 }) });
      await fetchUsers(selectedDevice); closeModal();
    } catch (err: any) { setModalError(err.message || 'Failed to update user'); }
    finally { setSaving(false); }
  }

  async function handleEnroll() {
    if (!selectedDevice) return;
    if (!form.name) return setModalError('Name is required');
    if (!form.user_id) return setModalError('User ID is required');
    setSaving(true); setModalError('');
    try {
      await fetchWithAuth('/users/enroll', { method: 'POST', body: JSON.stringify({ ip: selectedDevice.ip, port: selectedDevice.port, user_id: form.user_id, name: form.name, privilege: Number(form.privilege), password: form.password, card: Number(form.card)||0 }) });
      await fetchUsers(selectedDevice); closeModal();
    } catch (err: any) { setModalError(err.message || 'Failed to enroll user'); }
    finally { setSaving(false); }
  }

  async function handleEnrollFinger() {
    if (!selectedUser || !selectedDevice) return;
    setSaving(true); setModalError(''); setModalSuccess('');
    try {
      await fetchWithAuth(`/users/${selectedUser.uid}/enroll-finger`, { method: 'POST', body: JSON.stringify({ ip: selectedDevice.ip, port: selectedDevice.port, finger_index: fingerIndex }) });
      setModalSuccess(`Enrollment initiated! Ask ${selectedUser.name} to scan their finger on the device.`);
    } catch (err: any) { setModalError(err.message || 'Failed to initiate fingerprint enrollment'); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!selectedUser || !selectedDevice) return;
    setSaving(true); setModalError('');
    try {
      await fetchWithAuth(`/users/${selectedUser.uid}`, { method: 'DELETE', body: JSON.stringify({ ip: selectedDevice.ip, port: selectedDevice.port }) });
      await fetchUsers(selectedDevice); closeModal();
    } catch (err: any) { setModalError(err.message || 'Failed to delete user'); }
    finally { setSaving(false); }
  }

  async function handleTransfer() {
    if (!selectedUser || !selectedDevice || !targetDeviceId) return setModalError('Please select a target device');
    setSaving(true); setModalError(''); setModalSuccess('');
    try {
      const result = await fetchWithAuth<any>('/assignments/transfer', { method: 'POST', body: JSON.stringify({ user_id: selectedUser.user_id, source_device_id: selectedDevice.id, target_device_id: targetDeviceId }) });
      setModalSuccess(`${result.message}. ${result.fingers_copied} fingerprint(s) copied.`);
    } catch (err: any) { setModalError(err.message || 'Transfer failed'); }
    finally { setSaving(false); }
  }

  async function handleAssign() {
    if (!selectedUser || !assignDeviceId) return setModalError('Please select a device');
    setSaving(true); setModalError('');
    try {
      await fetchWithAuth('/assignments', { method: 'POST', body: JSON.stringify({ user_id: selectedUser.user_id, device_id: assignDeviceId }) });
      await fetchAssignments(selectedUser.user_id); setAssignDeviceId('');
    } catch (err: any) { setModalError(err.message || 'Failed to assign user'); }
    finally { setSaving(false); }
  }

  async function handleUnassign(assignmentId: number) {
    try {
      await fetchWithAuth(`/assignments/${assignmentId}`, { method: 'DELETE' });
      if (selectedUser) await fetchAssignments(selectedUser.user_id);
    } catch (err: any) { setModalError(err.message || 'Failed to remove assignment'); }
  }

  async function handleSyncAssignments() {
    setSaving(true); setModalError(''); setModalSuccess('');
    try {
      const result = await fetchWithAuth<any>('/assignments/sync', { method: 'POST' });
      const totalDeleted = result.results?.reduce((sum: number, r: any) => sum + (r.deleted?.length||0), 0) || 0;
      setModalSuccess(`Sync complete. Removed ${totalDeleted} unauthorized user(s) across all devices.`);
    } catch (err: any) { setModalError(err.message || 'Sync failed'); }
    finally { setSaving(false); }
  }

  const filtered = users.filter(u =>
    search === '' || u.name?.toLowerCase().includes(search.toLowerCase()) || u.user_id?.toLowerCase().includes(search.toLowerCase())
  );
  const otherDevices = devices.filter(d => d.id !== selectedDevice?.id);
  const allSelected = filtered.length > 0 && selectedUids.size === filtered.length;

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="page-sub">Users enrolled on ZK biometric devices</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn-outline" onClick={handleSyncAssignments}>⟳ Sync Assignments</button>
          {selectedDevice && !selectionMode && (
            <button className="btn-outline" onClick={toggleSelectionMode}>
              ☐ Select
            </button>
          )}
          {selectionMode && (
            <button className="btn-outline-cancel" onClick={toggleSelectionMode}>✕ Cancel</button>
          )}
          {selectedDevice && (
            <button className="btn-primary" onClick={openEnroll}>+ Enroll User</button>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selectionMode && (
        <div className="bulk-bar">
          <div className="bulk-bar-left">
            <button className="bulk-select-all" onClick={toggleAll}>
              <span className={`checkbox ${allSelected ? 'checked' : selectedUids.size > 0 ? 'partial' : ''}`} />
              {allSelected ? 'Deselect all' : `Select all (${filtered.length})`}
            </button>
            {selectedUids.size > 0 && (
              <span className="bulk-count">{selectedUids.size} selected</span>
            )}
          </div>
          {selectedUids.size > 0 && (
            <div className="bulk-actions">
              <button className="btn-bulk-copy" onClick={() => openBulkModal('copy')}>
                ⊕ Copy to Device
              </button>
              <button className="btn-bulk-move" onClick={() => openBulkModal('move')}>
                ⇄ Move to Device
              </button>
            </div>
          )}
        </div>
      )}

      {/* Device selector */}
      <div className="device-bar">
        <span className="device-label">Device:</span>
        {loadingDevices ? <span className="muted">Loading devices...</span>
          : devices.length === 0 ? <span className="muted">No devices registered</span>
          : (
            <div className="device-tabs">
              {devices.map(device => (
                <button key={device.id} className={`device-tab ${selectedDevice?.id === device.id ? 'active' : ''} ${!device.isActive ? 'offline-tab' : ''}`} onClick={() => { setSelectedDevice(device); setSelectedUids(new Set()); }}>
                  <span className={`dot ${device.isActive ? 'online' : 'offline'}`} />
                  {device.location || device.ip}
                </button>
              ))}
            </div>
          )}
        {selectedDevice && <button className="btn-refresh" onClick={() => fetchUsers(selectedDevice)}>↻ Refresh</button>}
      </div>

      {users.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <input className="search-input" type="text" placeholder="Search by name or user ID..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      )}

      <div className="card">
        {!selectedDevice ? (
          <div className="empty"><div className="empty-icon">⊙</div><div>Select a device to view users</div></div>
        ) : loading ? (
          <div className="empty">Fetching users from {selectedDevice.ip}...</div>
        ) : error ? (
          <div className="empty error-state"><div className="empty-icon">⚠</div><div>{error}</div><button className="btn-retry" onClick={() => fetchUsers(selectedDevice)}>Try again</button></div>
        ) : filtered.length === 0 ? (
          <div className="empty"><div className="empty-icon">⊙</div><div>{search ? 'No users match your search' : 'No users found on this device'}</div>{!search && <button className="btn-primary" style={{ marginTop: 12 }} onClick={openEnroll}>Enroll first user</button>}</div>
        ) : (
          <>
            <div className="table-info">Showing {filtered.length} user{filtered.length !== 1 ? 's' : ''} from <strong>{selectedDevice.location || selectedDevice.ip}</strong></div>
            <table className="table">
              <thead>
                <tr>
                  {selectionMode && <th style={{ width: 40 }}></th>}
                  <th>UID</th><th>User ID</th><th>Name</th><th>Role</th><th>Card</th>
                  {!selectionMode && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(user => (
                  <tr key={user.uid} className={selectionMode && selectedUids.has(user.uid) ? 'row-selected' : ''} onClick={selectionMode ? () => toggleUser(user.uid) : undefined} style={selectionMode ? { cursor: 'pointer' } : undefined}>
                    {selectionMode && (
                      <td>
                        <span className={`checkbox ${selectedUids.has(user.uid) ? 'checked' : ''}`} onClick={e => { e.stopPropagation(); toggleUser(user.uid); }} />
                      </td>
                    )}
                    <td><span className="mono">#{user.uid}</span></td>
                    <td><span className="mono">{user.user_id}</span></td>
                    <td>
                      <div className="user-cell">
                        <div className="avatar">{user.name?.charAt(0)?.toUpperCase() || '?'}</div>
                        {user.name || <span className="muted">—</span>}
                      </div>
                    </td>
                    <td><span className={`role-badge role-${user.privilege}`}>{PRIVILEGE_LABELS[user.privilege] || `Role ${user.privilege}`}</span></td>
                    <td><span className="mono">{user.card || '—'}</span></td>
                    {!selectionMode && (
                      <td>
                        <div className="actions" style={{position:'relative'}}>
                          <button className="btn-edit" onClick={() => openEdit(user)}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            Edit
                          </button>
                          <button
                            className="btn-more"
                            aria-label="More actions"
                            onClick={e => { e.stopPropagation(); setOpenMenuUid(openMenuUid === user.uid ? null : user.uid); }}
                          >···</button>
                          {openMenuUid === user.uid && (
                            <div className="action-menu" onClick={e => e.stopPropagation()}>
                              <button className="menu-item" onClick={() => { setOpenMenuUid(null); openFinger(user); }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M2 12a10 10 0 0 1 18-6"/><path d="M2 16h.01"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/><path d="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M9 6.8a6 6 0 0 1 9 5.2v2"/></svg>
                                Enroll fingerprint
                              </button>
                              <button className="menu-item" onClick={() => { setOpenMenuUid(null); openTransfer(user); }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="8" width="8" height="8" rx="1"/><path d="M4 10a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2"/><path d="M14 20a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2"/></svg>
                                Copy to device
                              </button>
                              <button className="menu-item" onClick={() => { setOpenMenuUid(null); openAssign(user); }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>
                                Manage devices
                              </button>
                              <div className="menu-divider"/>
                              <button className="menu-item danger" onClick={() => { setOpenMenuUid(null); openDelete(user); }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                Delete user
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* ── BULK MODAL ── */}
      {modalMode === 'bulk' && (
        <div className="modal-overlay" onClick={!saving ? closeModal : undefined}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{bulkAction === 'copy' ? '⊕ Copy Users to Device' : '⇄ Move Users to Device'}</h2>
              <button className="modal-close" onClick={closeModal} disabled={saving}>✕</button>
            </div>

            <div className="bulk-summary">
              <div className="bulk-summary-count">{selectedUids.size}</div>
              <div className="bulk-summary-label">user{selectedUids.size !== 1 ? 's' : ''} will be {bulkAction === 'copy' ? 'copied' : 'moved'}</div>
            </div>

            <div className="selected-users-preview">
              {filtered.filter(u => selectedUids.has(u.uid)).map(u => (
                <span key={u.uid} className="user-chip">
                  <span className="chip-avatar">{u.name?.charAt(0)?.toUpperCase() || '?'}</span>
                  {u.name}
                </span>
              ))}
            </div>

            {modalError && <div className="error-box">{modalError}</div>}
            {modalSuccess && <div className="success-box">{modalSuccess}</div>}

            {!bulkProgress && (
              <>
                <div className="form-group">
                  <label className="form-label">{bulkAction === 'copy' ? 'Copy' : 'Move'} to Device</label>
                  {otherDevices.length === 0 ? (
                    <div className="hint">No other devices available.</div>
                  ) : (
                    <select className="form-input" value={bulkTargetDeviceId} onChange={e => setBulkTargetDeviceId(Number(e.target.value))}>
                      <option value="">— Select target device —</option>
                      {otherDevices.map(d => (
                        <option key={d.id} value={d.id}>{d.location || d.ip} ({d.ip}) {!d.isActive ? '— Offline' : ''}</option>
                      ))}
                    </select>
                  )}
                </div>
                {bulkAction === 'move' && (
                  <div className="warning-box">⚠ Move will copy users to the target device and then delete them from <strong>{selectedDevice?.location || selectedDevice?.ip}</strong>.</div>
                )}
                {bulkAction === 'copy' && (
                  <p className="hint">User profiles and fingerprint templates will be copied to the selected device. Users remain on the source device.</p>
                )}
                <div className="modal-footer">
                  <button className="btn-secondary" onClick={closeModal}>Cancel</button>
                  <button className={bulkAction === 'move' ? 'btn-danger' : 'btn-primary'} onClick={handleBulkAction} disabled={saving || !bulkTargetDeviceId}>
                    {saving ? 'Processing...' : bulkAction === 'copy' ? `Copy ${selectedUids.size} User${selectedUids.size !== 1 ? 's' : ''}` : `Move ${selectedUids.size} User${selectedUids.size !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </>
            )}

            {bulkProgress && (
              <>
                <div className="progress-wrap">
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }} />
                  </div>
                  <div className="progress-label">{bulkProgress.done} / {bulkProgress.total}</div>
                </div>
                {bulkProgress.errors.length > 0 && (
                  <div className="error-list">
                    <div className="error-list-title">Errors:</div>
                    {bulkProgress.errors.map((e, i) => <div key={i} className="error-list-item">• {e}</div>)}
                  </div>
                )}
                {bulkProgress.done === bulkProgress.total && (
                  <div className="modal-footer">
                    <button className="btn-primary" onClick={closeModal}>Done</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── EDIT MODAL ── */}
      {modalMode === 'edit' && (
        <div className="modal-overlay" onClick={closeModal}><div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><h2 className="modal-title">Edit User</h2><button className="modal-close" onClick={closeModal}>✕</button></div>
          {modalError && <div className="error-box">{modalError}</div>}
          <div className="form-group"><label className="form-label">User ID *</label><input className="form-input" value={form.user_id} onChange={e => setForm(f => ({...f, user_id: e.target.value}))} /></div>
          <div className="form-group"><label className="form-label">Name *</label><input className="form-input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} /></div>
          <div className="form-group"><label className="form-label">Role</label><select className="form-input" value={form.privilege} onChange={e => setForm(f => ({...f, privilege: Number(e.target.value)}))}>{Object.entries(PRIVILEGE_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Password</label><input className="form-input" type="password" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} placeholder="Leave blank to keep existing" /></div>
          <div className="form-group"><label className="form-label">Card Number</label><input className="form-input" type="number" value={form.card} onChange={e => setForm(f => ({...f, card: e.target.value}))} placeholder="0" /></div>
          <div className="modal-footer"><button className="btn-secondary" onClick={closeModal}>Cancel</button><button className="btn-primary" onClick={handleEdit} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button></div>
        </div></div>
      )}

      {/* ── ENROLL MODAL ── */}
      {modalMode === 'enroll' && (
        <div className="modal-overlay" onClick={closeModal}><div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><h2 className="modal-title">Enroll New User</h2><button className="modal-close" onClick={closeModal}>✕</button></div>
          {modalError && <div className="error-box">{modalError}</div>}
          <div className="form-group"><label className="form-label">User ID *</label><input className="form-input" placeholder="e.g. EMP-001" value={form.user_id} onChange={e => setForm(f => ({...f, user_id: e.target.value}))} /></div>
          <div className="form-group"><label className="form-label">Full Name *</label><input className="form-input" placeholder="e.g. Juan dela Cruz" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} /></div>
          <div className="form-group"><label className="form-label">Role</label><select className="form-input" value={form.privilege} onChange={e => setForm(f => ({...f, privilege: Number(e.target.value)}))}>{Object.entries(PRIVILEGE_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Password</label><input className="form-input" type="password" placeholder="Optional" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} /></div>
          <div className="form-group"><label className="form-label">Card Number</label><input className="form-input" type="number" placeholder="0 if none" value={form.card} onChange={e => setForm(f => ({...f, card: e.target.value}))} /></div>
          <div className="modal-footer"><button className="btn-secondary" onClick={closeModal}>Cancel</button><button className="btn-primary" onClick={handleEnroll} disabled={saving}>{saving ? 'Enrolling...' : 'Enroll User'}</button></div>
        </div></div>
      )}

      {/* ── FINGERPRINT MODAL ── */}
      {modalMode === 'finger' && selectedUser && (
        <div className="modal-overlay" onClick={closeModal}><div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><h2 className="modal-title">Enroll Fingerprint</h2><button className="modal-close" onClick={closeModal}>✕</button></div>
          <div className="user-info-box"><div className="avatar lg">{selectedUser.name?.charAt(0)?.toUpperCase()||'?'}</div><div><div className="user-info-name">{selectedUser.name}</div><div className="user-info-sub">UID #{selectedUser.uid} · ID {selectedUser.user_id}</div></div></div>
          {modalError && <div className="error-box">{modalError}</div>}
          {modalSuccess && <div className="success-box">{modalSuccess}</div>}
          {!modalSuccess && (<><div className="form-group"><label className="form-label">Select Finger</label><select className="form-input" value={fingerIndex} onChange={e => setFingerIndex(Number(e.target.value))}>{FINGER_LABELS.map((l,i) => <option key={i} value={i}>{l} (Finger {i})</option>)}</select></div><p className="hint">After clicking "Start Enrollment", ask the user to place their finger on the device sensor when prompted.</p><div className="modal-footer"><button className="btn-secondary" onClick={closeModal}>Cancel</button><button className="btn-primary" onClick={handleEnrollFinger} disabled={saving}>{saving ? 'Initiating...' : 'Start Enrollment'}</button></div></>)}
          {modalSuccess && <div className="modal-footer"><button className="btn-primary" onClick={closeModal}>Done</button></div>}
        </div></div>
      )}

      {/* ── TRANSFER MODAL ── */}
      {modalMode === 'transfer' && selectedUser && (
        <div className="modal-overlay" onClick={closeModal}><div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><h2 className="modal-title">Copy User to Device</h2><button className="modal-close" onClick={closeModal}>✕</button></div>
          <div className="user-info-box"><div className="avatar lg">{selectedUser.name?.charAt(0)?.toUpperCase()||'?'}</div><div><div className="user-info-name">{selectedUser.name}</div><div className="user-info-sub">ID {selectedUser.user_id} · from <strong>{selectedDevice?.location||selectedDevice?.ip}</strong></div></div></div>
          {modalError && <div className="error-box">{modalError}</div>}
          {modalSuccess && <div className="success-box">{modalSuccess}</div>}
          {!modalSuccess && (<><div className="form-group"><label className="form-label">Copy to Device</label>{otherDevices.length === 0 ? <div className="hint" style={{marginBottom:0}}>No other devices available.</div> : <select className="form-input" value={targetDeviceId} onChange={e => setTargetDeviceId(Number(e.target.value))}><option value="">— Select target device —</option>{otherDevices.map(d => <option key={d.id} value={d.id}>{d.location||d.ip} ({d.ip}) {!d.isActive ? '— Offline' : ''}</option>)}</select>}</div><p className="hint">This will copy the user's profile and fingerprint templates to the selected device. The user will remain on the source device.</p><div className="modal-footer"><button className="btn-secondary" onClick={closeModal}>Cancel</button><button className="btn-primary" onClick={handleTransfer} disabled={saving||!targetDeviceId||otherDevices.length===0}>{saving ? 'Copying...' : 'Copy User'}</button></div></>)}
          {modalSuccess && <div className="modal-footer"><button className="btn-primary" onClick={closeModal}>Done</button></div>}
        </div></div>
      )}

      {/* ── ASSIGN MODAL ── */}
      {modalMode === 'assign' && selectedUser && (
        <div className="modal-overlay" onClick={closeModal}><div className="modal modal-wide" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><h2 className="modal-title">Device Assignments</h2><button className="modal-close" onClick={closeModal}>✕</button></div>
          <div className="user-info-box"><div className="avatar lg">{selectedUser.name?.charAt(0)?.toUpperCase()||'?'}</div><div><div className="user-info-name">{selectedUser.name}</div><div className="user-info-sub">ID {selectedUser.user_id}</div></div></div>
          {modalError && <div className="error-box">{modalError}</div>}
          {modalSuccess && <div className="success-box">{modalSuccess}</div>}
          <div className="section-label">Allowed Devices</div>
          {loadingAssignments ? <div className="hint">Loading assignments...</div> : assignments.length === 0 ? <div className="empty-assignments"><span>⊘</span> No restrictions — user can access all devices.<br/>Assign to specific devices to restrict access.</div> : <div className="assignment-list">{assignments.map(a => <div key={a.id} className="assignment-item"><div className="assignment-info"><span className="assignment-loc">{a.device_location||a.device_ip}</span><span className="assignment-ip">{a.device_ip}</span></div><button className="btn-unassign" onClick={() => handleUnassign(a.id)}>Remove</button></div>)}</div>}
          <div className="section-label" style={{marginTop:16}}>Add Device</div>
          <div style={{display:'flex',gap:8}}><select className="form-input" style={{flex:1}} value={assignDeviceId} onChange={e => setAssignDeviceId(Number(e.target.value))}><option value="">— Select a device —</option>{devices.filter(d => !assignments.some(a => a.device_id===d.id)).map(d => <option key={d.id} value={d.id}>{d.location||d.ip} ({d.ip})</option>)}</select><button className="btn-primary" onClick={handleAssign} disabled={saving||!assignDeviceId}>{saving ? 'Assigning...' : 'Assign'}</button></div>
          <p className="hint" style={{marginTop:12}}>Removing an assignment will also delete the user from that physical device. Use <strong>Sync Assignments</strong> on the main page to enforce restrictions across all devices.</p>
          <div className="modal-footer"><button className="btn-primary" onClick={closeModal}>Done</button></div>
        </div></div>
      )}

      {/* ── DELETE MODAL ── */}
      {modalMode === 'delete' && selectedUser && (
        <div className="modal-overlay" onClick={closeModal}><div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><h2 className="modal-title">Delete User</h2><button className="modal-close" onClick={closeModal}>✕</button></div>
          <div className="delete-warning"><div className="delete-icon">⚠</div><p>Are you sure you want to delete <strong>{selectedUser.name}</strong> (UID #{selectedUser.uid}) from the device?</p><p className="delete-sub">This will also remove all their fingerprint data. This action cannot be undone.</p></div>
          {modalError && <div className="error-box">{modalError}</div>}
          <div className="modal-footer"><button className="btn-secondary" onClick={closeModal}>Cancel</button><button className="btn-danger" onClick={handleDelete} disabled={saving}>{saving ? 'Deleting...' : 'Delete User'}</button></div>
        </div></div>
      )}

      <style>{`
        .page { padding: 32px; font-family: 'DM Sans', system-ui, sans-serif; color: #f4f4f5; }
        .topbar { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; }
        .page-title { font-size: 22px; font-weight: 600; color: #f4f4f5; letter-spacing: -0.4px; }
        .page-sub { font-size: 13px; color: #71717a; margin-top: 3px; }

        /* Bulk bar */
        .bulk-bar { display: flex; align-items: center; justify-content: space-between; background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.2); border-radius: 10px; padding: 10px 16px; margin-bottom: 16px; }
        .bulk-bar-left { display: flex; align-items: center; gap: 12px; }
        .bulk-select-all { display: flex; align-items: center; gap: 8px; background: none; border: none; color: #a1a1aa; font-size: 13px; cursor: pointer; font-family: inherit; padding: 0; }
        .bulk-select-all:hover { color: #f4f4f5; }
        .bulk-count { font-size: 12px; color: #10b981; font-weight: 500; background: rgba(16,185,129,0.15); padding: 2px 8px; border-radius: 999px; }
        .bulk-actions { display: flex; gap: 8px; }
        .btn-bulk-copy { padding: 7px 14px; background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3); border-radius: 8px; color: #10b981; font-size: 13px; font-weight: 500; cursor: pointer; font-family: inherit; transition: all 0.15s; }
        .btn-bulk-copy:hover { background: rgba(16,185,129,0.25); }
        .btn-bulk-move { padding: 7px 14px; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25); border-radius: 8px; color: #f87171; font-size: 13px; font-weight: 500; cursor: pointer; font-family: inherit; transition: all 0.15s; }
        .btn-bulk-move:hover { background: rgba(239,68,68,0.2); }

        /* Checkbox */
        .checkbox { display: inline-flex; width: 16px; height: 16px; border-radius: 4px; border: 1.5px solid #3f3f46; background: transparent; cursor: pointer; flex-shrink: 0; position: relative; transition: all 0.1s; }
        .checkbox.checked { background: #10b981; border-color: #10b981; }
        .checkbox.checked::after { content: ''; position: absolute; inset: 2px; background: url("data:image/svg+xml,%3Csvg viewBox='0 0 10 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 4L3.5 6.5L9 1' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/contain no-repeat; }
        .checkbox.partial { background: #27272a; border-color: #10b981; }
        .checkbox.partial::after { content: ''; position: absolute; top: 50%; left: 2px; right: 2px; height: 1.5px; background: #10b981; transform: translateY(-50%); border-radius: 1px; }
        .row-selected td { background: rgba(16,185,129,0.05) !important; }

        /* Device bar */
        .device-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
        .device-label { font-size: 13px; color: #71717a; }
        .device-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
        .device-tab { display: flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 8px; border: 1px solid #27272a; background: #18181b; font-size: 13px; cursor: pointer; color: #71717a; font-family: inherit; transition: all 0.15s; }
        .device-tab:hover { background: #27272a; color: #a1a1aa; }
        .device-tab.active { background: rgba(16,185,129,0.1); color: #10b981; border-color: rgba(16,185,129,0.2); }
        .device-tab.offline-tab { opacity: 0.5; }
        .dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
        .dot.online { background: #10b981; box-shadow: 0 0 4px #10b981; }
        .dot.offline { background: #ef4444; }

        /* Buttons */
        .btn-refresh { padding: 7px 14px; background: #18181b; border: 1px solid #27272a; border-radius: 8px; font-size: 13px; cursor: pointer; color: #71717a; font-family: inherit; transition: all 0.15s; }
        .btn-refresh:hover { color: #f4f4f5; }
        .btn-retry { margin-top: 12px; padding: 8px 16px; background: #10b981; color: #fff; border: none; border-radius: 8px; font-size: 13px; cursor: pointer; font-family: inherit; }
        .btn-primary { padding: 9px 16px; background: #10b981; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; font-family: inherit; transition: all 0.15s; white-space: nowrap; }
        .btn-primary:hover { background: #059669; }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-outline { padding: 9px 16px; background: #18181b; color: #a1a1aa; border: 1px solid #27272a; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; font-family: inherit; transition: all 0.15s; white-space: nowrap; }
        .btn-outline:hover { border-color: #3f3f46; color: #f4f4f5; }
        .btn-outline-cancel { padding: 9px 16px; background: rgba(239,68,68,0.1); color: #f87171; border: 1px solid rgba(239,68,68,0.25); border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; font-family: inherit; transition: all 0.15s; white-space: nowrap; }
        .btn-outline-cancel:hover { background: rgba(239,68,68,0.2); }
        .btn-secondary { padding: 9px 16px; background: #27272a; color: #a1a1aa; border: 1px solid #3f3f46; border-radius: 8px; font-size: 13px; cursor: pointer; font-family: inherit; transition: all 0.15s; }
        .btn-secondary:hover { color: #f4f4f5; }
        .btn-danger { padding: 9px 16px; background: #dc2626; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; font-family: inherit; }
        .btn-danger:hover { background: #b91c1c; }
        .btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-unassign { padding: 5px 12px; background: rgba(239,68,68,0.1); color: #f87171; border: 1px solid rgba(239,68,68,0.2); border-radius: 6px; font-size: 12px; cursor: pointer; font-family: inherit; transition: all 0.15s; white-space: nowrap; }
        .btn-unassign:hover { background: rgba(239,68,68,0.2); }

        /* Search */
        .search-input { padding: 8px 12px; border: 1px solid #27272a; border-radius: 8px; font-size: 13px; color: #f4f4f5; background: #18181b; outline: none; font-family: inherit; width: 280px; }
        .search-input::placeholder { color: #52525b; }
        .search-input:focus { border-color: rgba(16,185,129,0.4); }

        /* Table */
        .card { background: #18181b; border: 1px solid #27272a; border-radius: 12px; overflow: hidden; }
        .table-info { padding: 12px 20px; font-size: 12px; color: #52525b; border-bottom: 1px solid #27272a; background: #141418; }
        .table-info strong { color: #a1a1aa; }
        .table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .table th { text-align: left; padding: 11px 20px; color: #52525b; font-weight: 400; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; background: #141418; border-bottom: 1px solid #27272a; }
        .table td { padding: 13px 20px; color: #a1a1aa; border-bottom: 1px solid #1f1f23; }
        .table tr:last-child td { border-bottom: none; }
        .table tr:hover td { background: #1c1c21; color: #d4d4d8; }
        .mono { font-family: monospace; font-size: 12px; color: #52525b; }
        .muted { color: #3f3f46; }
        .user-cell { display: flex; align-items: center; gap: 10px; }
        .avatar { width: 28px; height: 28px; border-radius: 50%; background: #27272a; color: #71717a; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; flex-shrink: 0; }
        .avatar.lg { width: 40px; height: 40px; font-size: 15px; }
        .role-badge { display: inline-flex; font-size: 11px; padding: 3px 8px; border-radius: 999px; }
        .role-0 { background: #27272a; color: #71717a; }
        .role-2 { background: rgba(6,182,212,0.1); color: #22d3ee; }
        .role-6 { background: rgba(234,179,8,0.1); color: #facc15; }
        .role-14 { background: rgba(168,85,247,0.1); color: #c084fc; }
        .actions { display: flex; gap: 6px; align-items: center; }
        .btn-edit { display: inline-flex; align-items: center; gap: 5px; padding: 5px 11px; background: rgba(24,130,245,0.12); border: 1px solid rgba(24,130,245,0.25); border-radius: 7px; font-size: 12px; font-weight: 500; color: #60a5fa; cursor: pointer; font-family: inherit; transition: all 0.15s; white-space: nowrap; }
        .btn-edit:hover { background: rgba(24,130,245,0.22); border-color: rgba(24,130,245,0.4); color: #93c5fd; }
        .btn-more { width: 30px; height: 30px; border-radius: 7px; border: 1px solid #27272a; background: #18181b; cursor: pointer; font-size: 18px; display: flex; align-items: center; justify-content: center; color: #52525b; transition: all 0.15s; letter-spacing: 1px; padding-bottom: 3px; line-height: 1; }
        .btn-more:hover { background: #27272a; color: #a1a1aa; border-color: #3f3f46; }
        .action-menu { position: absolute; right: 0; top: calc(100% + 6px); background: #1c1c21; border: 1px solid #2e2e34; border-radius: 10px; padding: 5px; min-width: 180px; z-index: 100; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
        .menu-item { display: flex; align-items: center; gap: 9px; width: 100%; padding: 8px 10px; border: none; background: none; color: #a1a1aa; font-size: 13px; cursor: pointer; font-family: inherit; border-radius: 7px; text-align: left; transition: all 0.12s; }
        .menu-item:hover { background: #27272a; color: #f4f4f5; }
        .menu-item.danger { color: #f87171; }
        .menu-item.danger:hover { background: rgba(239,68,68,0.12); color: #fca5a5; }
        .menu-divider { height: 1px; background: #27272a; margin: 4px 0; }
        .empty { padding: 60px 20px; text-align: center; color: #52525b; font-size: 13px; }
        .empty-icon { font-size: 32px; margin-bottom: 12px; }
        .error-state { color: #f87171; }

        /* Modals */
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 50; backdrop-filter: blur(4px); }
        .modal { background: #18181b; border: 1px solid #27272a; border-radius: 14px; width: 100%; max-width: 440px; padding: 24px; box-shadow: 0 25px 60px rgba(0,0,0,0.5); max-height: 90vh; overflow-y: auto; }
        .modal-wide { max-width: 520px; }
        .modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
        .modal-title { font-size: 15px; font-weight: 600; color: #f4f4f5; }
        .modal-close { background: none; border: none; font-size: 16px; color: #52525b; cursor: pointer; padding: 4px; }
        .modal-close:hover { color: #a1a1aa; }
        .modal-close:disabled { opacity: 0.3; cursor: not-allowed; }
        .modal-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 24px; }
        .form-group { margin-bottom: 16px; }
        .form-label { display: block; font-size: 11px; font-weight: 500; color: #71717a; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.4px; }
        .form-input { width: 100%; padding: 9px 12px; border: 1px solid #27272a; border-radius: 8px; font-size: 13px; color: #f4f4f5; background: #09090b; outline: none; box-sizing: border-box; font-family: inherit; }
        .form-input:focus { border-color: rgba(16,185,129,0.4); }
        .form-input option { background: #18181b; }
        .error-box { background: rgba(239,68,68,0.1); color: #f87171; border: 1px solid rgba(239,68,68,0.2); border-radius: 8px; padding: 10px 14px; font-size: 13px; margin-bottom: 16px; }
        .success-box { background: rgba(16,185,129,0.1); color: #34d399; border: 1px solid rgba(16,185,129,0.2); border-radius: 8px; padding: 10px 14px; font-size: 13px; margin-bottom: 16px; }
        .warning-box { background: rgba(234,179,8,0.08); color: #fbbf24; border: 1px solid rgba(234,179,8,0.2); border-radius: 8px; padding: 10px 14px; font-size: 12px; margin-bottom: 16px; }
        .user-info-box { display: flex; align-items: center; gap: 12px; background: #141418; border: 1px solid #27272a; border-radius: 10px; padding: 12px 16px; margin-bottom: 20px; }
        .user-info-name { font-size: 14px; font-weight: 600; color: #f4f4f5; }
        .user-info-sub { font-size: 12px; color: #52525b; margin-top: 2px; }
        .hint { font-size: 12px; color: #71717a; margin: 0 0 16px; line-height: 1.5; }
        .delete-warning { text-align: center; padding: 16px 0; }
        .delete-icon { font-size: 32px; margin-bottom: 12px; color: #f59e0b; }
        .delete-warning p { font-size: 14px; color: #a1a1aa; margin: 0 0 8px; line-height: 1.5; }
        .delete-sub { font-size: 12px; color: #52525b; }
        .section-label { font-size: 11px; font-weight: 500; color: #52525b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
        .assignment-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 4px; }
        .assignment-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: #141418; border: 1px solid #27272a; border-radius: 8px; }
        .assignment-info { display: flex; flex-direction: column; gap: 2px; }
        .assignment-loc { font-size: 13px; font-weight: 500; color: #e4e4e7; }
        .assignment-ip { font-size: 11px; color: #52525b; font-family: monospace; }
        .empty-assignments { font-size: 13px; color: #52525b; background: #141418; border: 1px dashed #27272a; border-radius: 8px; padding: 14px 16px; margin-bottom: 4px; line-height: 1.6; }

        /* Bulk modal specifics */
        .bulk-summary { text-align: center; padding: 16px 0 8px; }
        .bulk-summary-count { font-size: 40px; font-weight: 700; color: #10b981; line-height: 1; }
        .bulk-summary-label { font-size: 13px; color: #71717a; margin-top: 4px; }
        .selected-users-preview { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 20px; max-height: 100px; overflow-y: auto; padding: 2px; }
        .user-chip { display: inline-flex; align-items: center; gap: 6px; background: #27272a; border: 1px solid #3f3f46; border-radius: 999px; padding: 3px 10px 3px 4px; font-size: 12px; color: #a1a1aa; }
        .chip-avatar { width: 20px; height: 20px; border-radius: 50%; background: rgba(16,185,129,0.15); color: #10b981; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; }
        .progress-wrap { margin: 16px 0; }
        .progress-bar { height: 6px; background: #27272a; border-radius: 999px; overflow: hidden; margin-bottom: 8px; }
        .progress-fill { height: 100%; background: linear-gradient(90deg, #10b981, #06b6d4); border-radius: 999px; transition: width 0.3s ease; }
        .progress-label { font-size: 12px; color: #71717a; text-align: right; }
        .error-list { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.15); border-radius: 8px; padding: 10px 14px; margin-top: 12px; }
        .error-list-title { font-size: 11px; color: #f87171; font-weight: 500; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.4px; }
        .error-list-item { font-size: 12px; color: #f87171; line-height: 1.6; opacity: 0.8; }
      `}</style>
    </div>
  );
}