'use client';

import { useEffect, useState, useCallback } from 'react';
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

// Per-device live status: 'checking' | 'online' | 'offline'
type LiveStatus = 'checking' | 'online' | 'offline';

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [liveStatus, setLiveStatus] = useState<Record<number, LiveStatus>>({});
  const [loading, setLoading] = useState(true);
  const [pinging, setPinging] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editDevice, setEditDevice] = useState<Device | null>(null);
  const [form, setForm] = useState<DeviceForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  async function loadDevices() {
    try {
      const data = await fetchWithAuth<any>('/devices');
      const list: Device[] = Array.isArray(data) ? data : data?.data || [];
      setDevices(list);
      return list;
    } catch (err) {
      console.error('Failed to load devices:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }

  // Ping each device via the backend health/ping endpoint
  const checkLiveStatus = useCallback(async (deviceList: Device[]) => {
    if (deviceList.length === 0) return;
    setPinging(true);

    // Mark all as checking
    const checking: Record<number, LiveStatus> = {};
    deviceList.forEach(d => { checking[d.id] = 'checking'; });
    setLiveStatus(checking);

    // Check each device concurrently
    await Promise.allSettled(
      deviceList.map(async (device) => {
        try {
          // Try to ping the device through the backend
          await fetchWithAuth(`/devices/${device.id}/ping`, { method: 'GET' });
          setLiveStatus(prev => ({ ...prev, [device.id]: 'online' }));
        } catch {
          // If the ping endpoint doesn't exist, fall back to fetching users with a short timeout
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            await fetchWithAuth(`/users?ip=${device.ip}&port=${device.port}`, { signal: controller.signal } as any);
            clearTimeout(timeout);
            setLiveStatus(prev => ({ ...prev, [device.id]: 'online' }));
          } catch {
            setLiveStatus(prev => ({ ...prev, [device.id]: 'offline' }));
          }
        }
      })
    );

    setLastChecked(new Date());
    setPinging(false);
  }, []);

  useEffect(() => {
    loadDevices().then(list => checkLiveStatus(list));
  }, []);

  async function handleRefresh() {
    const list = await loadDevices();
    await checkLiveStatus(list);
  }

  function openAdd() { setEditDevice(null); setForm(emptyForm); setError(''); setShowModal(true); }
  function openEdit(device: Device) {
    setEditDevice(device);
    setForm({ ip: device.ip, port: String(device.port), location: device.location || '' });
    setError(''); setShowModal(true);
  }
  function closeModal() { setShowModal(false); setEditDevice(null); setForm(emptyForm); setError(''); }

  async function handleSave() {
    if (!form.ip) return setError('IP address is required');
    if (!form.port) return setError('Port is required');
    setSaving(true); setError('');
    try {
      if (editDevice) {
        await fetchWithAuth(`/devices/${editDevice.id}`, { method: 'PUT', body: JSON.stringify({ ip: form.ip, port: Number(form.port), location: form.location }) });
      } else {
        await fetchWithAuth('/devices', { method: 'POST', body: JSON.stringify({ ip: form.ip, port: Number(form.port), location: form.location }) });
      }
      const list = await loadDevices();
      await checkLiveStatus(list);
      closeModal();
    } catch (err: any) { setError(err.message || 'Failed to save device'); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this device?')) return;
    setDeletingId(id);
    try {
      await fetchWithAuth(`/devices/${id}`, { method: 'DELETE' });
      await loadDevices();
    } catch (err) { console.error(err); }
    finally { setDeletingId(null); }
  }

  function getStatus(device: Device): LiveStatus {
    return liveStatus[device.id] ?? 'checking';
  }

  const onlineCount = Object.values(liveStatus).filter(s => s === 'online').length;
  const offlineCount = Object.values(liveStatus).filter(s => s === 'offline').length;

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <h1 className="page-title">Devices</h1>
          <p className="page-sub">Manage your ZK biometric devices</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn-outline" onClick={handleRefresh} disabled={pinging}>
            <span className={pinging ? 'spin' : ''}>↻</span>
            {pinging ? 'Checking...' : 'Check Status'}
          </button>
          <button className="btn-primary" onClick={openAdd}>+ Add Device</button>
        </div>
      </div>

      {/* Summary bar */}
      {devices.length > 0 && !loading && (
        <div className="summary-bar">
          <div className="summary-item">
            <span className="dot online" />
            <span className="summary-num">{onlineCount}</span>
            <span className="summary-label">Online</span>
          </div>
          <div className="summary-sep" />
          <div className="summary-item">
            <span className="dot offline" />
            <span className="summary-num">{offlineCount}</span>
            <span className="summary-label">Offline</span>
          </div>
          <div className="summary-sep" />
          <div className="summary-item">
            <span className="summary-num">{devices.length}</span>
            <span className="summary-label">Total</span>
          </div>
          {lastChecked && (
            <div className="last-checked">
              Last checked {lastChecked.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
          )}
        </div>
      )}

      <div className="card">
        {loading ? (
          <div className="empty"><div className="spinner" />Loading devices...</div>
        ) : devices.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">⊡</div>
            <div>No devices registered yet</div>
            <button className="btn-primary" style={{ marginTop: 12 }} onClick={openAdd}>Add your first device</button>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr><th>ID</th><th>IP Address</th><th>Port</th><th>Location</th><th>Live Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {devices.map(device => {
                const status = getStatus(device);
                return (
                  <tr key={device.id}>
                    <td><span className="mono">#{device.id}</span></td>
                    <td><span className="mono ip">{device.ip}</span></td>
                    <td><span className="mono">{device.port}</span></td>
                    <td>{device.location || <span className="muted">—</span>}</td>
                    <td>
                      {status === 'checking' ? (
                        <span className="status-badge checking">
                          <span className="checking-dots"><span /><span /><span /></span>
                          Checking
                        </span>
                      ) : (
                        <span className={`status-badge ${status}`}>
                          <span className="status-dot" />
                          {status === 'online' ? 'Online' : 'Offline'}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="actions">
                        <button className="btn-icon" onClick={() => openEdit(device)} title="Edit">✎</button>
                        <button className="btn-icon danger" onClick={() => handleDelete(device.id)} disabled={deletingId === device.id} title="Delete">
                          {deletingId === device.id ? '…' : '✕'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
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
              <input className="form-input" type="text" placeholder="e.g. 192.168.1.100" value={form.ip} onChange={e => setForm(f => ({ ...f, ip: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Port *</label>
              <input className="form-input" type="number" placeholder="4370" value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Location</label>
              <input className="form-input" type="text" placeholder="e.g. Main Gate" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={closeModal}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editDevice ? 'Save Changes' : 'Add Device'}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .page { padding: 32px; font-family: 'DM Sans', system-ui, sans-serif; color: #f4f4f5; }
        .topbar { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; }
        .page-title { font-size: 22px; font-weight: 600; color: #f4f4f5; letter-spacing: -0.4px; }
        .page-sub { font-size: 13px; color: #71717a; margin-top: 3px; }

        .summary-bar { display: flex; align-items: center; gap: 16px; background: #18181b; border: 1px solid #27272a; border-radius: 10px; padding: 12px 20px; margin-bottom: 16px; }
        .summary-item { display: flex; align-items: center; gap: 7px; }
        .summary-num { font-size: 16px; font-weight: 600; color: #f4f4f5; }
        .summary-label { font-size: 12px; color: #71717a; }
        .summary-sep { width: 1px; height: 18px; background: #27272a; }
        .last-checked { margin-left: auto; font-size: 11px; color: #52525b; }

        .card { background: #18181b; border: 1px solid #27272a; border-radius: 12px; overflow: hidden; }
        .table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .table th { text-align: left; padding: 11px 20px; color: #52525b; font-weight: 400; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; background: #141418; border-bottom: 1px solid #27272a; }
        .table td { padding: 14px 20px; color: #a1a1aa; border-bottom: 1px solid #1f1f23; }
        .table tr:last-child td { border-bottom: none; }
        .table tr:hover td { background: #1c1c21; color: #d4d4d8; }
        .mono { font-family: monospace; font-size: 12px; color: #52525b; }
        .ip { color: #a1a1aa; }
        .muted { color: #3f3f46; }

        .status-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }
        .status-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
        .online .status-dot { background: #10b981; box-shadow: 0 0 6px #10b981; }
        .online { color: #34d399; }
        .offline .status-dot { background: #ef4444; }
        .offline { color: #f87171; }
        .checking { color: #71717a; }

        /* Animated checking dots */
        .checking-dots { display: inline-flex; gap: 3px; align-items: center; }
        .checking-dots span { width: 4px; height: 4px; border-radius: 50%; background: #52525b; animation: blink 1.2s infinite; }
        .checking-dots span:nth-child(2) { animation-delay: 0.2s; }
        .checking-dots span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes blink { 0%,80%,100%{opacity:0.2} 40%{opacity:1} }

        .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
        .dot.online { background: #10b981; box-shadow: 0 0 5px #10b981; }
        .dot.offline { background: #ef4444; }

        .actions { display: flex; gap: 6px; }
        .btn-icon { width: 30px; height: 30px; border-radius: 6px; border: 1px solid #27272a; background: #18181b; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; color: #52525b; transition: all 0.15s; }
        .btn-icon:hover { background: #27272a; color: #a1a1aa; }
        .btn-icon.danger:hover { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.3); color: #f87171; }
        .btn-icon:disabled { opacity: 0.4; cursor: not-allowed; }

        .btn-primary { padding: 9px 16px; background: #10b981; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; font-family: inherit; transition: all 0.15s; white-space: nowrap; }
        .btn-primary:hover { background: #059669; }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-outline { display: flex; align-items: center; gap: 6px; padding: 9px 16px; background: #18181b; color: #a1a1aa; border: 1px solid #27272a; border-radius: 8px; font-size: 13px; cursor: pointer; font-family: inherit; transition: all 0.15s; white-space: nowrap; }
        .btn-outline:hover:not(:disabled) { border-color: #3f3f46; color: #f4f4f5; }
        .btn-outline:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-secondary { padding: 9px 16px; background: #27272a; color: #a1a1aa; border: 1px solid #3f3f46; border-radius: 8px; font-size: 13px; cursor: pointer; font-family: inherit; }
        .btn-secondary:hover { color: #f4f4f5; }

        .empty { padding: 60px 20px; text-align: center; color: #52525b; font-size: 13px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .empty-icon { font-size: 32px; }
        .spinner { width: 20px; height: 20px; border: 2px solid #27272a; border-top-color: #10b981; border-radius: 50%; animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { display: inline-block; animation: spin 0.7s linear infinite; }

        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 50; backdrop-filter: blur(4px); }
        .modal { background: #18181b; border: 1px solid #27272a; border-radius: 14px; width: 100%; max-width: 420px; padding: 24px; box-shadow: 0 25px 60px rgba(0,0,0,0.5); }
        .modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
        .modal-title { font-size: 15px; font-weight: 600; color: #f4f4f5; }
        .modal-close { background: none; border: none; font-size: 16px; color: #52525b; cursor: pointer; padding: 4px; }
        .modal-close:hover { color: #a1a1aa; }
        .modal-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 24px; }
        .form-group { margin-bottom: 16px; }
        .form-label { display: block; font-size: 11px; font-weight: 500; color: #71717a; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.4px; }
        .form-input { width: 100%; padding: 9px 12px; border: 1px solid #27272a; border-radius: 8px; font-size: 13px; color: #f4f4f5; background: #09090b; outline: none; box-sizing: border-box; font-family: inherit; }
        .form-input:focus { border-color: rgba(16,185,129,0.4); }
        .error-box { background: rgba(239,68,68,0.1); color: #f87171; border: 1px solid rgba(239,68,68,0.2); border-radius: 8px; padding: 10px 14px; font-size: 13px; margin-bottom: 16px; }
      `}</style>
    </div>
  );
}