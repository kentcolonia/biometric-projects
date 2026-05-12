'use client';

import { useEffect, useState, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/api';

interface Log {
  id: number;
  uid: number;
  user_id: string;
  timestamp: string;
  status: number;
  punch: number;
  device_id: number;
  location: string;
  device_ip: string;
}

interface DeviceLocation {
  id: number;
  location: string;
  ip: string;
}

interface LogsResponse {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  data: Log[];
}

const PUNCH_LABELS: Record<number, { label: string; cls: string }> = {
  0: { label: '↗ Check In',  cls: 'check-in'  },
  1: { label: '↙ Check Out', cls: 'check-out' },
  2: { label: '⊕ Break Out', cls: 'break-out' },
  3: { label: '⊖ Break In',  cls: 'break-in'  },
  4: { label: '⊗ OT In',     cls: 'ot-in'     },
  5: { label: '⊘ OT Out',    cls: 'ot-out'    },
};

const PAGE_SIZES = [25, 50, 100, 200];

export default function LogsPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<DeviceLocation[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [punch, setPunch]       = useState('');
  const [page, setPage]         = useState(1);
  const [limit, setLimit]       = useState(50);

  const hasFilters = search || location || dateFrom || dateTo || punch;

  // Load locations for dropdown
  useEffect(() => {
    fetchWithAuth<any>('/logs/locations')
      .then(d => setLocations(d?.data || []))
      .catch(() => {});
  }, []);

  const loadLogs = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(p));
      params.set('limit', String(limit));
      if (search)   params.set('user_id',   search);
      if (location) params.set('location',  location);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo)   params.set('date_to',   dateTo);
      if (punch)    params.set('punch',     punch);

      const data = await fetchWithAuth<LogsResponse>(`/logs?${params.toString()}`);
      setLogs(data?.data || []);
      setTotal(data?.total || 0);
      setTotalPages(data?.total_pages || 1);
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setLoading(false);
    }
  }, [search, location, dateFrom, dateTo, punch, page, limit]);

  useEffect(() => { loadLogs(page); }, [page, limit]);

  function applyFilters() {
    setPage(1);
    loadLogs(1);
  }

  function clearFilters() {
    setSearch(''); setLocation(''); setDateFrom('');
    setDateTo(''); setPunch(''); setPage(1);
    setTimeout(() => loadLogs(1), 0);
  }

  function formatTime(ts: string) {
    return new Date(ts).toLocaleTimeString('en-PH', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }

  function formatDate(ts: string) {
    return new Date(ts).toLocaleDateString('en-PH', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  }

  function exportCSV() {
    const headers = ['Log ID', 'User ID', 'Location', 'Device IP', 'Date', 'Time', 'Type', 'Status'];
    const rows = logs.map(log => [
      log.id,
      log.user_id,
      log.location || '',
      log.device_ip || '',
      formatDate(log.timestamp),
      formatTime(log.timestamp),
      PUNCH_LABELS[log.punch]?.label.replace(/[↗↙⊕⊖⊗⊘]\s/, '') || log.punch,
      log.status,
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page">

      {/* Header */}
      <div className="topbar">
        <div>
          <h1 className="page-title">Attendance Logs</h1>
          <p className="page-sub">{total.toLocaleString()} total records</p>
        </div>
        <button className="btn-export" onClick={exportCSV}>↓ Export CSV</button>
      </div>

      {/* Filters */}
      <div className="filter-card">
        <div className="filter-grid">
          <div className="filter-group">
            <label className="filter-label">User ID</label>
            <input
              className="filter-input"
              type="text"
              placeholder="Search user ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applyFilters()}
            />
          </div>
          <div className="filter-group">
            <label className="filter-label">Location</label>
            <select className="filter-input" value={location} onChange={e => setLocation(e.target.value)}>
              <option value="">All locations</option>
              {locations.map(d => (
                <option key={d.id} value={d.location}>{d.location || d.ip}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label className="filter-label">From</label>
            <input className="filter-input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="filter-group">
            <label className="filter-label">To</label>
            <input className="filter-input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <div className="filter-group">
            <label className="filter-label">Type</label>
            <select className="filter-input" value={punch} onChange={e => setPunch(e.target.value)}>
              <option value="">All types</option>
              {Object.entries(PUNCH_LABELS).map(([val, { label }]) => (
                <option key={val} value={val}>{label.replace(/[↗↙⊕⊖⊗⊘]\s/, '')}</option>
              ))}
            </select>
          </div>
          <div className="filter-group filter-actions">
            <label className="filter-label">&nbsp;</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-apply" onClick={applyFilters}>Apply</button>
              {hasFilters && <button className="btn-clear" onClick={clearFilters}>Clear</button>}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <div className="empty">Loading logs...</div>
        ) : logs.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">≡</div>
            <div>No logs found{hasFilters ? ' for these filters' : ''}</div>
            {hasFilters && <button className="btn-clear-sm" onClick={clearFilters}>Clear filters</button>}
          </div>
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>Log ID</th>
                  <th>User ID</th>
                  <th>Location</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Type</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => {
                  const punch_info = PUNCH_LABELS[log.punch] || { label: `Punch ${log.punch}`, cls: 'neutral' };
                  return (
                    <tr key={log.id}>
                      <td><span className="mono">#{log.id}</span></td>
                      <td><span className="mono">{log.user_id}</span></td>
                      <td>
                        <div className="location-cell">
                          <span className="location-dot" />
                          {log.location || <span className="muted">Device #{log.device_id}</span>}
                        </div>
                      </td>
                      <td>{formatDate(log.timestamp)}</td>
                      <td><span className="time">{formatTime(log.timestamp)}</span></td>
                      <td>
                        <span className={`punch-badge ${punch_info.cls}`}>{punch_info.label}</span>
                      </td>
                      <td>
                        <span className={`status-badge ${log.status === 1 ? 'success' : 'neutral'}`}>
                          {log.status === 1 ? 'Success' : log.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            <div className="pagination">
              <div className="pagination-info">
                Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} of {total.toLocaleString()}
              </div>
              <div className="pagination-controls">
                <select className="page-size-select" value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>
                  {PAGE_SIZES.map(s => <option key={s} value={s}>{s} / page</option>)}
                </select>
                <button className="page-btn" onClick={() => setPage(1)} disabled={page === 1}>«</button>
                <button className="page-btn" onClick={() => setPage(p => p - 1)} disabled={page === 1}>‹</button>
                <span className="page-indicator">{page} / {totalPages}</span>
                <button className="page-btn" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>›</button>
                <button className="page-btn" onClick={() => setPage(totalPages)} disabled={page >= totalPages}>»</button>
              </div>
            </div>
          </>
        )}
      </div>

      <style>{`
        .page { padding: 32px; font-family: 'DM Sans', system-ui, sans-serif; }
        .topbar { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; }
        .page-title { font-size: 22px; font-weight: 600; color: #111; letter-spacing: -0.4px; }
        .page-sub { font-size: 13px; color: #999; margin-top: 3px; }

        /* Filter card */
        .filter-card { background: #fff; border: 1px solid #e8e8e6; border-radius: 12px; padding: 16px 20px; margin-bottom: 16px; }
        .filter-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; align-items: end; }
        .filter-group { display: flex; flex-direction: column; gap: 5px; }
        .filter-label { font-size: 11px; font-weight: 500; color: #888; text-transform: uppercase; letter-spacing: 0.4px; }
        .filter-input { padding: 8px 10px; border: 1px solid #e0e0de; border-radius: 8px; font-size: 13px; color: #111; background: #fafafa; outline: none; font-family: inherit; width: 100%; box-sizing: border-box; }
        .filter-input:focus { border-color: #aaa; background: #fff; }
        .filter-actions { justify-content: flex-end; }
        .btn-apply { padding: 8px 16px; background: #111; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; font-family: inherit; }
        .btn-apply:hover { opacity: 0.85; }
        .btn-clear { padding: 8px 14px; background: #fff; border: 1px solid #e0e0de; border-radius: 8px; font-size: 13px; color: #888; cursor: pointer; font-family: inherit; }
        .btn-clear:hover { background: #f5f5f3; }
        .btn-clear-sm { margin-top: 12px; padding: 7px 14px; background: #fff; border: 1px solid #e0e0de; border-radius: 8px; font-size: 12px; color: #888; cursor: pointer; font-family: inherit; }

        .btn-export { padding: 9px 16px; background: #fff; color: #333; border: 1px solid #e8e8e6; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; font-family: inherit; }
        .btn-export:hover { background: #f5f5f3; }

        /* Table */
        .card { background: #fff; border: 1px solid #e8e8e6; border-radius: 12px; overflow: hidden; }
        .table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .table th { text-align: left; padding: 11px 20px; color: #aaa; font-weight: 400; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; background: #fafaf9; border-bottom: 1px solid #f0f0ee; }
        .table td { padding: 13px 20px; color: #333; border-bottom: 1px solid #f7f7f5; }
        .table tr:last-child td { border-bottom: none; }
        .table tr:hover td { background: #fafaf9; }
        .mono { font-family: monospace; font-size: 12px; color: #666; }
        .time { font-family: monospace; font-size: 12px; color: #333; font-weight: 500; }
        .muted { color: #ccc; }

        .location-cell { display: flex; align-items: center; gap: 7px; font-size: 13px; }
        .location-dot { width: 6px; height: 6px; border-radius: 50%; background: #22c55e; flex-shrink: 0; }

        .punch-badge { display: inline-flex; align-items: center; font-size: 11px; padding: 3px 8px; border-radius: 999px; font-weight: 500; white-space: nowrap; }
        .check-in   { background: #f0fdf4; color: #16a34a; }
        .check-out  { background: #eff6ff; color: #2563eb; }
        .break-out  { background: #fefce8; color: #ca8a04; }
        .break-in   { background: #fff7ed; color: #ea580c; }
        .ot-in      { background: #fdf2f8; color: #9333ea; }
        .ot-out     { background: #f5f3ff; color: #7c3aed; }
        .neutral    { background: #f5f5f3; color: #888; }

        .status-badge { display: inline-flex; align-items: center; font-size: 11px; padding: 3px 8px; border-radius: 999px; }
        .success { background: #f0fdf4; color: #16a34a; }

        .empty { padding: 60px 20px; text-align: center; color: #bbb; font-size: 13px; }
        .empty-icon { font-size: 32px; margin-bottom: 12px; }

        /* Pagination */
        .pagination { display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; border-top: 1px solid #f0f0ee; background: #fafaf9; flex-wrap: wrap; gap: 10px; }
        .pagination-info { font-size: 12px; color: #aaa; }
        .pagination-controls { display: flex; align-items: center; gap: 6px; }
        .page-size-select { padding: 5px 8px; border: 1px solid #e0e0de; border-radius: 6px; font-size: 12px; color: #555; background: #fff; outline: none; font-family: inherit; }
        .page-btn { width: 28px; height: 28px; border-radius: 6px; border: 1px solid #e8e8e6; background: #fff; cursor: pointer; font-size: 13px; color: #555; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
        .page-btn:hover:not(:disabled) { background: #f5f5f3; color: #111; }
        .page-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .page-indicator { font-size: 12px; color: #888; padding: 0 4px; white-space: nowrap; }
      `}</style>
    </div>
  );
}