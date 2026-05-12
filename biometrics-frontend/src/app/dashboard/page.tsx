'use client';

import { useEffect, useState } from 'react';
import { fetchWithAuth } from '@/lib/api';

interface Device {
  id: number;
  ip: string;
  location: string;
  isActive: boolean;
  port: number;
}

interface Log {
  id: number;
  user_id: string;
  timestamp: string;
  punch: number;
  device_id: number;
}

interface User {
  id: number;
  name: string;
  department: string;
}

export default function DashboardPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [devicesData, logsData] = await Promise.all([
  fetchWithAuth<any>('/devices'),
  fetchWithAuth<any>('/logs'),
]);
setDevices(Array.isArray(devicesData) ? devicesData : devicesData?.data || devicesData?.devices || []);
setLogs(Array.isArray(logsData) ? logsData : logsData?.data || logsData?.logs || []);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const activeDevices = devices.filter(d => d.isActive).length;
  const todayLogs = logs.filter(log => {
    const today = new Date().toDateString();
    return new Date(log.timestamp).toDateString() === today;
  });
  const recentLogs = logs.slice(0, 5);

  function formatTime(timestamp: string) {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit'
    });
  }

  function formatDate(timestamp: string) {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric'
    });
  }

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">Welcome back — here's what's happening</p>
        </div>
        <div className="live-badge">
          <span className="live-dot" />
          Live
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading dashboard...</div>
      ) : (
        <>
          <div className="metrics">
            <div className="metric-card">
  <div className="metric-label">Offline Devices</div>
  <div className="metric-value">{devices.length - activeDevices}</div>
  <div className="metric-icon">⊙</div>
</div>
            <div className="metric-card">
              <div className="metric-label">Active Devices</div>
              <div className="metric-value">{activeDevices}<span className="metric-total">/{devices.length}</span></div>
              <div className="metric-icon">⊡</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Today's Logs</div>
              <div className="metric-value">{todayLogs.length}</div>
              <div className="metric-icon">≡</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Total Logs</div>
              <div className="metric-value">{logs.length}</div>
              <div className="metric-icon">◈</div>
            </div>
          </div>

          <div className="grid">
            <div className="card">
              <div className="card-header">
                <span className="card-title">Recent Attendance</span>
                <span className="count-badge">{recentLogs.length}</span>
              </div>
              {recentLogs.length === 0 ? (
                <div className="empty">No logs yet</div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>User ID</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentLogs.map(log => (
                      <tr key={log.id}>
                        <td><span className="uid">#{log.user_id}</span></td>
                        <td>{formatDate(log.timestamp)}</td>
                        <td>{formatTime(log.timestamp)}</td>
                        <td>
                          <span className={`punch-badge ${log.punch === 0 ? 'check-in' : 'check-out'}`}>
                            {log.punch === 0 ? 'Check in' : 'Check out'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="card">
              <div className="card-header">
                <span className="card-title">Device Status</span>
                <span className="count-badge">{devices.length}</span>
              </div>
              {devices.length === 0 ? (
                <div className="empty">No devices registered</div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>IP Address</th>
                      <th>Location</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devices.map(device => (
                      <tr key={device.id}>
                        <td><span className="mono">{device.ip}</span></td>
                        <td>{device.location || '—'}</td>
                        <td>
                          <span className={`status-badge ${device.isActive ? 'online' : 'offline'}`}>
                            <span className="status-dot" />
                            {device.isActive ? 'Online' : 'Offline'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      <style>{`
        .page { padding: 32px; font-family: 'DM Sans', system-ui, sans-serif; }
        .topbar { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 28px; }
        .page-title { font-size: 22px; font-weight: 600; color: #111; letter-spacing: -0.4px; }
        .page-sub { font-size: 13px; color: #999; margin-top: 3px; }
        .live-badge { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #666; background: #fff; border: 1px solid #e8e8e6; border-radius: 999px; padding: 5px 12px; }
        .live-dot { width: 6px; height: 6px; border-radius: 50%; background: #22c55e; animation: pulse 2s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        .loading { text-align: center; padding: 60px; color: #999; font-size: 14px; }
        .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 24px; }
        .metric-card { background: #fff; border: 1px solid #e8e8e6; border-radius: 12px; padding: 18px 20px; position: relative; overflow: hidden; }
        .metric-label { font-size: 12px; color: #999; margin-bottom: 8px; }
        .metric-value { font-size: 28px; font-weight: 600; color: #111; letter-spacing: -0.5px; }
        .metric-total { font-size: 16px; color: #bbb; font-weight: 400; }
        .metric-icon { position: absolute; right: 16px; top: 16px; font-size: 20px; color: #e8e8e6; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .card { background: #fff; border: 1px solid #e8e8e6; border-radius: 12px; overflow: hidden; }
        .card-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #f0f0ee; }
        .card-title { font-size: 14px; font-weight: 500; color: #111; }
        .count-badge { font-size: 11px; background: #f0f0ee; color: #888; padding: 2px 8px; border-radius: 999px; }
        .table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .table th { text-align: left; padding: 10px 20px; color: #aaa; font-weight: 400; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; background: #fafaf9; border-bottom: 1px solid #f0f0ee; }
        .table td { padding: 12px 20px; color: #333; border-bottom: 1px solid #f7f7f5; }
        .table tr:last-child td { border-bottom: none; }
        .table tr:hover td { background: #fafaf9; }
        .uid { font-family: monospace; font-size: 12px; color: #888; }
        .mono { font-family: monospace; font-size: 12px; }
        .punch-badge { display: inline-flex; align-items: center; font-size: 11px; padding: 3px 8px; border-radius: 999px; }
        .check-in { background: #f0fdf4; color: #16a34a; }
        .check-out { background: #eff6ff; color: #2563eb; }
        .status-badge { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; }
        .status-dot { width: 6px; height: 6px; border-radius: 50%; }
        .online .status-dot { background: #22c55e; }
        .online { color: #16a34a; }
        .offline .status-dot { background: #ef4444; }
        .offline { color: #dc2626; }
        .empty { padding: 32px 20px; text-align: center; color: #bbb; font-size: 13px; }
      `}</style>
    </div>
  );
}