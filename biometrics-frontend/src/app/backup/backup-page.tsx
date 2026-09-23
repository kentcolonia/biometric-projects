'use client';
import { useEffect, useState, useRef } from 'react';
import { fetchWithAuth } from '@/lib/api';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://10.10.0.21:5002';

interface Device { id: number; ip: string; port: number; location: string; isActive: boolean; }
interface DbBackupFile { filename: string; size_kb: number; created_at: string; }
interface DeviceBackupFile { filename: string; size_kb: number; device_location: string; device_ip: string; user_count: number; template_count: number; backup_time: string; }

export default function BackupPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [dbBackups, setDbBackups] = useState<DbBackupFile[]>([]);
  const [deviceBackups, setDeviceBackups] = useState<DeviceBackupFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);
  const [activeSection, setActiveSection] = useState<'db' | 'device'>('db');

  // Restore state
  const [dbRestoreFile, setDbRestoreFile] = useState<File | null>(null);
  const [deviceRestoreFile, setDeviceRestoreFile] = useState<File | null>(null);
  const [restoreTargetDevice, setRestoreTargetDevice] = useState<number | ''>('');
  const [restoring, setRestoring] = useState(false);
  const [backingUpDeviceId, setBackingUpDeviceId] = useState<number | null>(null);

  const dbFileRef = useRef<HTMLInputElement>(null);
  const deviceFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [d, db, dv] = await Promise.all([
        fetchWithAuth<any>('/devices'),
        fetchWithAuth<any>('/backup/database/list'),
        fetchWithAuth<any>('/backup/device/list'),
      ]);
      setDevices(Array.isArray(d) ? d : d?.data || []);
      setDbBackups(db?.data || []);
      setDeviceBackups(dv?.data || []);
    } catch (e) { console.error(e); }
  }

  function showStatus(type: 'success' | 'error' | 'info', msg: string) {
    setStatus({ type, msg });
    setTimeout(() => setStatus(null), 5000);
  }

  // ── MySQL Backup ──────────────────────────────────────────────────────────────
  async function handleDbBackup() {
    setLoading(true);
    showStatus('info', 'Creating database backup...');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BASE_URL}/backup/database`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Backup failed');
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `bio_api_backup_${Date.now()}.sql`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      showStatus('success', `Backup downloaded: ${filename}`);
      await loadData();
    } catch (e: any) {
      showStatus('error', e.message || 'Backup failed');
    } finally { setLoading(false); }
  }

  async function handleDbDownload(filename: string) {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BASE_URL}/backup/database/download/${filename}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { showStatus('error', e.message); }
  }

  async function handleDbRestore() {
    if (!dbRestoreFile) return showStatus('error', 'Please select a .sql file');
    if (!confirm('This will overwrite the current database. Are you sure?')) return;
    setRestoring(true);
    showStatus('info', 'Restoring database...');
    try {
      const formData = new FormData();
      formData.append('file', dbRestoreFile);
      const token = localStorage.getItem('token');
      const res = await fetch(`${BASE_URL}/backup/database/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Restore failed');
      showStatus('success', data.message);
      setDbRestoreFile(null);
      if (dbFileRef.current) dbFileRef.current.value = '';
    } catch (e: any) { showStatus('error', e.message); }
    finally { setRestoring(false); }
  }

  // ── Device Backup ─────────────────────────────────────────────────────────────
  async function handleDeviceBackup(device: Device) {
    setBackingUpDeviceId(device.id);
    showStatus('info', `Backing up ${device.location}...`);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BASE_URL}/backup/device/${device.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Backup failed');
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `device_${device.id}_backup.json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      showStatus('success', `Device backup downloaded: ${filename}`);
      await loadData();
    } catch (e: any) { showStatus('error', e.message); }
    finally { setBackingUpDeviceId(null); }
  }

  async function handleDeviceRestore() {
    if (!deviceRestoreFile) return showStatus('error', 'Please select a .json backup file');
    if (!restoreTargetDevice) return showStatus('error', 'Please select a target device');
    const device = devices.find(d => d.id === restoreTargetDevice);
    if (!confirm(`This will push users & fingerprints to ${device?.location}. Continue?`)) return;
    setRestoring(true);
    showStatus('info', `Restoring to ${device?.location}...`);
    try {
      const formData = new FormData();
      formData.append('file', deviceRestoreFile);
      const token = localStorage.getItem('token');
      const res = await fetch(`${BASE_URL}/backup/device/${restoreTargetDevice}/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Restore failed');
      showStatus('success', `Restored: ${data.users_added} users added, ${data.users_skipped} skipped, ${data.fingers_restored} fingerprints restored`);
      setDeviceRestoreFile(null);
      setRestoreTargetDevice('');
      if (deviceFileRef.current) deviceFileRef.current.value = '';
    } catch (e: any) { showStatus('error', e.message); }
    finally { setRestoring(false); }
  }

  function fmtDate(iso: string) {
    try { return new Date(iso).toLocaleString('en-PH'); } catch { return iso; }
  }

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <h1 className="page-title">Backup & Restore</h1>
          <p className="page-sub">Backup your database and biometric device data</p>
        </div>
      </div>

      {/* Status banner */}
      {status && (
        <div className={`status-banner ${status.type}`}>
          {status.type === 'success' ? '✓' : status.type === 'error' ? '⚠' : 'ℹ'} {status.msg}
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${activeSection === 'db' ? 'active' : ''}`} onClick={() => setActiveSection('db')}>
          🗄 MySQL Database
        </button>
        <button className={`tab ${activeSection === 'device' ? 'active' : ''}`} onClick={() => setActiveSection('device')}>
          ⌖ Biometric Devices
        </button>
      </div>

      {/* ── DATABASE SECTION ── */}
      {activeSection === 'db' && (
        <div>
          {/* Backup */}
          <div className="section-card">
            <div className="section-header">
              <div>
                <div className="section-title">Create Database Backup</div>
                <div className="section-sub">Exports all tables — attendance logs, employees, shifts, companies, and more</div>
              </div>
              <button className="btn-primary" onClick={handleDbBackup} disabled={loading}>
                {loading ? 'Creating...' : '↓ Backup Now'}
              </button>
            </div>
          </div>

          {/* Restore */}
          <div className="section-card">
            <div className="section-title">Restore Database</div>
            <div className="section-sub" style={{ marginBottom: 16 }}>Upload a <code>.sql</code> backup file to restore. ⚠ This will overwrite existing data.</div>
            <div className="upload-row">
              <input
                ref={dbFileRef}
                type="file"
                accept=".sql"
                className="file-input"
                onChange={e => setDbRestoreFile(e.target.files?.[0] || null)}
              />
              <button className="btn-danger" onClick={handleDbRestore} disabled={restoring || !dbRestoreFile}>
                {restoring ? 'Restoring...' : '↑ Restore'}
              </button>
            </div>
            {dbRestoreFile && <div className="file-selected">Selected: <strong>{dbRestoreFile.name}</strong> ({(dbRestoreFile.size / 1024).toFixed(1)} KB)</div>}
          </div>

          {/* Saved backups */}
          <div className="section-card">
            <div className="section-title">Saved Backups on Server</div>
            {dbBackups.length === 0 ? (
              <div className="empty-list">No backups saved yet. Create one above.</div>
            ) : (
              <table className="table">
                <thead><tr><th>Filename</th><th>Size</th><th>Created</th><th>Action</th></tr></thead>
                <tbody>
                  {dbBackups.map(b => (
                    <tr key={b.filename}>
                      <td><span className="mono">{b.filename}</span></td>
                      <td>{b.size_kb} KB</td>
                      <td>{fmtDate(b.created_at)}</td>
                      <td><button className="btn-sm" onClick={() => handleDbDownload(b.filename)}>↓ Download</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── DEVICE SECTION ── */}
      {activeSection === 'device' && (
        <div>
          {/* Backup per device */}
          <div className="section-card">
            <div className="section-title">Backup Device Users & Fingerprints</div>
            <div className="section-sub" style={{ marginBottom: 16 }}>Exports all enrolled users and fingerprint templates from the selected device as a <code>.json</code> file</div>
            <div className="device-grid">
              {devices.length === 0 ? (
                <div className="empty-list">No devices registered.</div>
              ) : devices.map(d => (
                <div key={d.id} className="device-backup-card">
                  <div className="device-backup-info">
                    <span className={`dot ${d.isActive ? 'dot-on' : 'dot-off'}`} />
                    <div>
                      <div className="device-backup-name">{d.location}</div>
                      <div className="device-backup-ip mono">{d.ip}:{d.port}</div>
                    </div>
                  </div>
                  <button
                    className="btn-primary"
                    onClick={() => handleDeviceBackup(d)}
                    disabled={backingUpDeviceId === d.id}
                  >
                    {backingUpDeviceId === d.id ? 'Backing up...' : '↓ Backup'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Restore to device */}
          <div className="section-card">
            <div className="section-title">Restore Users to Device</div>
            <div className="section-sub" style={{ marginBottom: 16 }}>Upload a device <code>.json</code> backup and push users + fingerprints to a target device. Existing users are skipped.</div>
            <div className="form-group">
              <label className="form-label">Target Device</label>
              <select className="form-input" value={restoreTargetDevice} onChange={e => setRestoreTargetDevice(Number(e.target.value))}>
                <option value="">— Select device —</option>
                {devices.map(d => <option key={d.id} value={d.id}>{d.location} ({d.ip})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Backup File (.json)</label>
              <div className="upload-row">
                <input
                  ref={deviceFileRef}
                  type="file"
                  accept=".json"
                  className="file-input"
                  onChange={e => setDeviceRestoreFile(e.target.files?.[0] || null)}
                />
                <button className="btn-primary" onClick={handleDeviceRestore} disabled={restoring || !deviceRestoreFile || !restoreTargetDevice}>
                  {restoring ? 'Restoring...' : '↑ Restore to Device'}
                </button>
              </div>
              {deviceRestoreFile && <div className="file-selected">Selected: <strong>{deviceRestoreFile.name}</strong> ({(deviceRestoreFile.size / 1024).toFixed(1)} KB)</div>}
            </div>
          </div>

          {/* Saved device backups */}
          <div className="section-card">
            <div className="section-title">Saved Device Backups on Server</div>
            {deviceBackups.length === 0 ? (
              <div className="empty-list">No device backups saved yet.</div>
            ) : (
              <table className="table">
                <thead><tr><th>Device</th><th>Users</th><th>Fingerprints</th><th>Size</th><th>Backup Time</th></tr></thead>
                <tbody>
                  {deviceBackups.map(b => (
                    <tr key={b.filename}>
                      <td>
                        <div className="device-backup-name">{b.device_location}</div>
                        <div className="mono" style={{ fontSize: 11, color: '#aaa' }}>{b.device_ip}</div>
                      </td>
                      <td>{b.user_count}</td>
                      <td>{b.template_count}</td>
                      <td>{b.size_kb} KB</td>
                      <td>{fmtDate(b.backup_time)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <style>{`
        .page{padding:32px;font-family:'DM Sans',system-ui,sans-serif}
        .topbar{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px}
        .page-title{font-size:22px;font-weight:600;color:#111;letter-spacing:-.4px}
        .page-sub{font-size:13px;color:#999;margin-top:3px}
        .status-banner{padding:12px 18px;border-radius:10px;font-size:13px;margin-bottom:20px;font-weight:500}
        .status-banner.success{background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0}
        .status-banner.error{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca}
        .status-banner.info{background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe}
        .tabs{display:flex;gap:4px;margin-bottom:20px;background:#f5f5f3;padding:4px;border-radius:10px;width:fit-content}
        .tab{padding:8px 20px;border-radius:7px;border:none;background:none;font-size:13px;cursor:pointer;font-family:inherit;color:#888;transition:all .15s}
        .tab.active{background:#fff;color:#111;font-weight:500;box-shadow:0 1px 3px rgba(0,0,0,.08)}
        .section-card{background:#fff;border:1px solid #e8e8e6;border-radius:12px;padding:20px;margin-bottom:16px}
        .section-header{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
        .section-title{font-size:15px;font-weight:600;color:#111;margin-bottom:4px}
        .section-sub{font-size:13px;color:#888;line-height:1.5}
        .section-sub code{background:#f5f5f3;padding:1px 5px;border-radius:4px;font-size:12px}
        .btn-primary{padding:9px 18px;background:#111;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;white-space:nowrap;transition:opacity .15s}
        .btn-primary:hover{opacity:.85}
        .btn-primary:disabled{opacity:.5;cursor:not-allowed}
        .btn-danger{padding:9px 18px;background:#dc2626;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;white-space:nowrap}
        .btn-danger:hover{background:#b91c1c}
        .btn-danger:disabled{opacity:.5;cursor:not-allowed}
        .btn-sm{padding:6px 12px;background:#fff;color:#333;border:1px solid #e8e8e6;border-radius:7px;font-size:12px;cursor:pointer;font-family:inherit}
        .btn-sm:hover{background:#f5f5f3}
        .upload-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
        .file-input{flex:1;padding:8px 12px;border:1px dashed #d0d0ce;border-radius:8px;font-size:13px;font-family:inherit;background:#fafaf9;min-width:0;cursor:pointer}
        .file-selected{font-size:12px;color:#666;margin-top:8px}
        .form-group{margin-bottom:16px}
        .form-label{display:block;font-size:12px;font-weight:500;color:#555;margin-bottom:6px}
        .form-input{width:100%;padding:9px 12px;border:1px solid #e0e0de;border-radius:8px;font-size:13px;color:#111;background:#fafafa;outline:none;box-sizing:border-box;font-family:inherit}
        .form-input:focus{border-color:#aaa;background:#fff}
        .table{width:100%;border-collapse:collapse;font-size:13px;margin-top:12px}
        .table th{text-align:left;padding:10px 16px;color:#aaa;font-weight:400;font-size:11px;text-transform:uppercase;letter-spacing:.5px;background:#fafaf9;border-bottom:1px solid #f0f0ee}
        .table td{padding:12px 16px;color:#333;border-bottom:1px solid #f7f7f5;vertical-align:middle}
        .table tr:last-child td{border-bottom:none}
        .table tr:hover td{background:#fafaf9}
        .mono{font-family:monospace;font-size:12px;color:#666}
        .empty-list{padding:24px;text-align:center;color:#bbb;font-size:13px;background:#fafaf9;border-radius:8px;border:1px dashed #e8e8e6}
        .device-grid{display:flex;flex-direction:column;gap:10px}
        .device-backup-card{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:#fafaf9;border:1px solid #eeeeec;border-radius:10px;gap:16px}
        .device-backup-info{display:flex;align-items:center;gap:12px}
        .device-backup-name{font-size:14px;font-weight:500;color:#111}
        .device-backup-ip{font-size:11px;color:#aaa;margin-top:2px}
        .dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
        .dot-on{background:#22c55e;box-shadow:0 0 6px #22c55e}
        .dot-off{background:#ef4444}
      `}</style>
    </div>
  );
}