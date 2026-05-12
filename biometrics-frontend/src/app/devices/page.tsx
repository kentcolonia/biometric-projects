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

interface DeviceForm {
  ip: string;
  port: string;
  location: string;
}

const emptyForm: DeviceForm = { ip: '', port: '4370', location: '' };

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editDevice, setEditDevice] = useState<Device | null>(null);
  const [form, setForm] = useState<DeviceForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState('');

  async function loadDevices() {
    try {
      const data = await fetchWithAuth<any>('/devices');
      setDevices(Array.isArray(data) ? data : data?.data || []);
    } catch (err) {
      console.error('Failed to load devices:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadDevices(); }, []);

  function openAdd() {
    setEditDevice(null);
    setForm(emptyForm);
    setError('');
    setShowModal(true);
  }

  function openEdit(device: Device) {
    setEditDevice(device);
    setForm({ ip: device.ip, port: String(device.port), location: device.location || '' });
    setError('');
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditDevice(null);
    setForm(emptyForm);
    setError('');
  }

  async function handleSave() {
    if (!form.ip) return setError('IP address is required');
    if (!form.port) return setError('Port is required');

    setSaving(true);
    setError('');

    try {
      if (editDevice) {
        await fetchWithAuth(`/devices/${editDevice.id}`, {
          method: 'PUT',
          body: JSON.stringify({ ip: form.ip, port: Number(form.port), location: form.location }),
        });
      } else {
        await fetchWithAuth('/devices', {
          method: 'POST',
          body: JSON.stringify({ ip: form.ip, port: Number(form.port), location: form.location }),
        });
      }
      await loadDevices();
      closeModal();
    } catch (err: any) {
      setError(err.message || 'Failed to save device');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this device?')) return;
    setDeletingId(id);
    try {
      await fetchWithAuth(`/devices/${id}`, { method: 'DELETE' });
      await loadDevices();
    } catch (err) {
      console.error('Failed to delete device:', err);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <h1 className="page-title">Devices</h1>
          <p className="page-sub">Manage your ZK biometric devices</p>
        </div>
        <button className="btn-primary" onClick={openAdd}>+ Add Device</button>
      </div>

      <div className="card">
        {loading ? (
          <div className="empty">Loading devices...</div>
        ) : devices.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">⊡</div>
            <div>No devices registered yet</div>
            <button className="btn-primary" style={{ marginTop: 12 }} onClick={openAdd}>Add your first device</button>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>IP Address</th>
                <th>Port</th>
                <th>Location</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {devices.map(device => (
                <tr key={device.id}>
                  <td><span className="mono">#{device.id}</span></td>
                  <td><span className="mono">{device.ip}</span></td>
                  <td><span className="mono">{device.port}</span></td>
                  <td>{device.location || <span className="muted">—</span>}</td>
                  <td>
                    <span className={`status-badge ${device.isActive ? 'online' : 'offline'}`}>
                      <span className="status-dot" />
                      {device.isActive ? 'Online' : 'Offline'}
                    </span>
                  </td>
                  <td>
                    <div className="actions">
                      <button className="btn-icon" onClick={() => openEdit(device)} title="Edit">✎</button>
                      <button
                        className="btn-icon danger"
                        onClick={() => handleDelete(device.id)}
                        disabled={deletingId === device.id}
                        title="Delete"
                      >
                        {deletingId === device.id ? '...' : '✕'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editDevice ? 'Edit Device' : 'Add Device'}</h2>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>

            {error && <div className="error-box">{error}</div>}

            <div className="form-group">
              <label className="form-label">IP Address *</label>
              <input
                className="form-input"
                type="text"
                placeholder="e.g. 192.168.1.100"
                value={form.ip}
                onChange={e => setForm(f => ({ ...f, ip: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Port *</label>
              <input
                className="form-input"
                type="number"
                placeholder="4370"
                value={form.port}
                onChange={e => setForm(f => ({ ...f, port: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Location</label>
              <input
                className="form-input"
                type="text"
                placeholder="e.g. Main Gate"
                value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              />
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={closeModal}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editDevice ? 'Save Changes' : 'Add Device'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .page { padding: 32px; font-family: 'DM Sans', system-ui, sans-serif; }
        .topbar { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 28px; }
        .page-title { font-size: 22px; font-weight: 600; color: #111; letter-spacing: -0.4px; }
        .page-sub { font-size: 13px; color: #999; margin-top: 3px; }
        .card { background: #fff; border: 1px solid #e8e8e6; border-radius: 12px; overflow: hidden; }
        .table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .table th { text-align: left; padding: 11px 20px; color: #aaa; font-weight: 400; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; background: #fafaf9; border-bottom: 1px solid #f0f0ee; }
        .table td { padding: 14px 20px; color: #333; border-bottom: 1px solid #f7f7f5; }
        .table tr:last-child td { border-bottom: none; }
        .table tr:hover td { background: #fafaf9; }
        .mono { font-family: monospace; font-size: 12px; color: #666; }
        .muted { color: #ccc; }
        .status-badge { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; }
        .status-dot { width: 6px; height: 6px; border-radius: 50%; }
        .online .status-dot { background: #22c55e; }
        .online { color: #16a34a; }
        .offline .status-dot { background: #ef4444; }
        .offline { color: #dc2626; }
        .actions { display: flex; gap: 6px; }
        .btn-icon { width: 30px; height: 30px; border-radius: 6px; border: 1px solid #e8e8e6; background: #fff; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; color: #666; transition: all 0.15s; }
        .btn-icon:hover { background: #f5f5f3; color: #111; }
        .btn-icon.danger:hover { background: #fef2f2; border-color: #fecaca; color: #dc2626; }
        .btn-icon:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-primary { padding: 9px 16px; background: #111; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; font-family: inherit; transition: opacity 0.15s; }
        .btn-primary:hover { opacity: 0.85; }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-secondary { padding: 9px 16px; background: #fff; color: #333; border: 1px solid #e8e8e6; border-radius: 8px; font-size: 13px; cursor: pointer; font-family: inherit; }
        .btn-secondary:hover { background: #f5f5f3; }
        .empty { padding: 60px 20px; text-align: center; color: #bbb; font-size: 13px; }
        .empty-icon { font-size: 32px; margin-bottom: 12px; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 50; }
        .modal { background: #fff; border-radius: 14px; width: 100%; max-width: 420px; padding: 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.15); }
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
      `}</style>
    </div>
  );
}