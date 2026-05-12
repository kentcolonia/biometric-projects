'use client';
import { useState, useEffect } from 'react';
import { fetchWithAuth } from '@/lib/api';

interface Company { id: number; name: string; }
interface Department { id: number; name: string; company_id: number; }
interface Employee { id: number; name: string; user_id: string; }
interface DayRecord {
  date: string; employee_name: string; user_id: string; department: string; company: string;
  shift: string; shift_time_in: string; shift_time_out: string;
  first_in: string | null; last_out: string | null;
  is_absent: boolean; is_late: boolean; late_minutes: number;
  is_undertime: boolean; undertime_minutes: number;
  is_overtime: boolean; overtime_minutes: number; hours_worked: number;
}
interface EmpReport {
  employee: any;
  records: DayRecord[];
  summary: { total_days: number; present: number; absent: number; late: number; late_minutes: number; undertime: number; undertime_minutes: number; overtime: number; overtime_minutes: number; total_hours: number; };
}

function fmtMins(mins: number) {
  if (!mins) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function today() { return new Date().toISOString().split('T')[0]; }
function monthStart() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; }

export default function ReportsPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [report, setReport] = useState<EmpReport[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const [dateFrom, setDateFrom] = useState(monthStart());
  const [dateTo, setDateTo] = useState(today());
  const [period, setPeriod] = useState('monthly');
  const [companyId, setCompanyId] = useState('');
  const [deptId, setDeptId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [expandedEmp, setExpandedEmp] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      fetchWithAuth<any>('/companies'),
      fetchWithAuth<any>('/departments'),
      fetchWithAuth<any>('/employees'),
    ]).then(([c, d, e]) => {
      setCompanies(c?.data || []);
      setDepartments(d?.data || []);
      setEmployees(e?.data || []);
    }).catch(console.error);
  }, []);

  async function generateReport() {
    if (!dateFrom || !dateTo) return;
    setLoading(true); setGenerated(false);
    try {
      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo, period });
      if (companyId) params.set('company_id', companyId);
      if (deptId) params.set('department_id', deptId);
      if (employeeId) params.set('employee_id', employeeId);
      const data = await fetchWithAuth<any>(`/reports/attendance?${params}`);
      setReport(data?.data || []);
      setSummary(data?.overall_summary || null);
      setGenerated(true);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  function exportCSV() {
    const rows: string[][] = [['Employee', 'User ID', 'Department', 'Company', 'Shift', 'Date', 'Time In', 'Time Out', 'Hours', 'Absent', 'Late', 'Late Duration', 'Undertime', 'UT Duration', 'Overtime', 'OT Duration']];
    report.forEach(emp => {
      emp.records.forEach(r => {
        rows.push([
          emp.employee.name, emp.employee.user_id, r.department || '', r.company || '',
          r.shift || '', r.date, r.first_in || '', r.last_out || '',
          String(r.hours_worked),
          r.is_absent ? 'Yes' : 'No',
          r.is_late ? 'Yes' : 'No', fmtMins(r.late_minutes),
          r.is_undertime ? 'Yes' : 'No', fmtMins(r.undertime_minutes),
          r.is_overtime ? 'Yes' : 'No', fmtMins(r.overtime_minutes),
        ]);
      });
    });
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `attendance-report-${dateFrom}-${dateTo}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const filteredDepts = departments.filter(d => !companyId || d.company_id === Number(companyId));
  const filteredEmps = employees.filter(e => {
    const emp = e as any;
    if (companyId && emp.company_id !== Number(companyId)) return false;
    if (deptId && emp.department_id !== Number(deptId)) return false;
    return true;
  });

  return (
    <div className="page">
      <div className="topbar">
        <div><h1 className="page-title">Attendance Reports</h1><p className="page-sub">Late, Absent, Overtime, Undertime per employee</p></div>
        {generated && <button className="btn-export" onClick={exportCSV}>↓ Export CSV</button>}
      </div>

      {/* Filter panel */}
      <div className="filter-card">
        <div className="filter-grid">
          <div className="filter-group">
            <label className="filter-label">Period</label>
            <select className="filter-input" value={period} onChange={e => setPeriod(e.target.value)}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div className="filter-group">
            <label className="filter-label">Date From</label>
            <input className="filter-input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="filter-group">
            <label className="filter-label">Date To</label>
            <input className="filter-input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <div className="filter-group">
            <label className="filter-label">Company</label>
            <select className="filter-input" value={companyId} onChange={e => { setCompanyId(e.target.value); setDeptId(''); setEmployeeId(''); }}>
              <option value="">All companies</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label className="filter-label">Department</label>
            <select className="filter-input" value={deptId} onChange={e => { setDeptId(e.target.value); setEmployeeId(''); }}>
              <option value="">All departments</option>
              {filteredDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label className="filter-label">Employee</label>
            <select className="filter-input" value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
              <option value="">All employees</option>
              {filteredEmps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn-generate" onClick={generateReport} disabled={loading}>
            {loading ? 'Generating...' : '▶ Generate Report'}
          </button>
        </div>
      </div>

      {/* Overall summary */}
      {generated && summary && (
        <div className="summary-cards">
          <div className="summary-card"><div className="summary-val">{summary.total_employees}</div><div className="summary-label">Employees</div></div>
          <div className="summary-card absent"><div className="summary-val">{summary.total_absent}</div><div className="summary-label">Absent Days</div></div>
          <div className="summary-card late"><div className="summary-val">{summary.total_late}</div><div className="summary-label">Late Days</div></div>
          <div className="summary-card undertime"><div className="summary-val">{summary.total_undertime}</div><div className="summary-label">Undertime Days</div></div>
          <div className="summary-card overtime"><div className="summary-val">{summary.total_overtime}</div><div className="summary-label">Overtime Days</div></div>
        </div>
      )}

      {/* Per employee */}
      {generated && report.length === 0 && (
        <div className="card"><div className="empty"><div className="empty-icon">📋</div><div>No data found for this period</div></div></div>
      )}

      {generated && report.map((emp, i) => (
        <div key={emp.employee.id} className="emp-card">
          <div className="emp-header" onClick={() => setExpandedEmp(expandedEmp === i ? null : i)}>
            <div className="emp-info">
              <div className="avatar">{emp.employee.name.charAt(0).toUpperCase()}</div>
              <div>
                <div className="emp-name">{emp.employee.name}</div>
                <div className="emp-sub">{emp.employee.department_name || 'No department'} · {emp.employee.shift_name || 'No shift'}</div>
              </div>
            </div>
            <div className="emp-stats">
              <div className="stat"><span className="stat-val">{emp.summary.present}</span><span className="stat-label">Present</span></div>
              <div className="stat absent"><span className="stat-val">{emp.summary.absent}</span><span className="stat-label">Absent</span></div>
              <div className="stat late"><span className="stat-val">{emp.summary.late}</span><span className="stat-label">Late</span></div>
              <div className="stat undertime"><span className="stat-val">{emp.summary.undertime}</span><span className="stat-label">Undertime</span></div>
              <div className="stat overtime"><span className="stat-val">{emp.summary.overtime}</span><span className="stat-label">Overtime</span></div>
              <div className="stat"><span className="stat-val">{emp.summary.total_hours}h</span><span className="stat-label">Total Hours</span></div>
            </div>
            <button className="expand-btn">{expandedEmp === i ? '▲' : '▼'}</button>
          </div>

          {expandedEmp === i && (
            <div className="emp-detail">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th><th>Time In</th><th>Time Out</th><th>Hours</th>
                    <th>Late</th><th>Undertime</th><th>Overtime</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {emp.records.map(r => (
                    <tr key={r.date} className={r.is_absent ? 'row-absent' : ''}>
                      <td>{new Date(r.date).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                      <td><span className="mono">{r.first_in || <span className="muted">—</span>}</span></td>
                      <td><span className="mono">{r.last_out || <span className="muted">—</span>}</span></td>
                      <td>{r.hours_worked > 0 ? `${r.hours_worked}h` : <span className="muted">—</span>}</td>
                      <td>{r.is_late ? <span className="flag-late">{fmtMins(r.late_minutes)}</span> : <span className="muted">—</span>}</td>
                      <td>{r.is_undertime ? <span className="flag-ut">{fmtMins(r.undertime_minutes)}</span> : <span className="muted">—</span>}</td>
                      <td>{r.is_overtime ? <span className="flag-ot">{fmtMins(r.overtime_minutes)}</span> : <span className="muted">—</span>}</td>
                      <td>
                        {r.is_absent ? <span className="badge absent">Absent</span>
                          : r.is_late ? <span className="badge late">Late</span>
                          : <span className="badge present">Present</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      {!generated && !loading && (
        <div className="card">
          <div className="empty"><div className="empty-icon">📋</div><div>Set filters and click Generate Report</div></div>
        </div>
      )}

      <style>{`
        .page{padding:32px;font-family:'DM Sans',system-ui,sans-serif}
        .topbar{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px}
        .page-title{font-size:22px;font-weight:600;color:#111;letter-spacing:-.4px}
        .page-sub{font-size:13px;color:#999;margin-top:3px}
        .btn-export{padding:9px 16px;background:#fff;color:#333;border:1px solid #e8e8e6;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit}
        .btn-export:hover{background:#f5f5f3}
        .filter-card{background:#fff;border:1px solid #e8e8e6;border-radius:12px;padding:20px;margin-bottom:20px}
        .filter-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}
        .filter-group{display:flex;flex-direction:column;gap:5px}
        .filter-label{font-size:11px;font-weight:500;color:#888;text-transform:uppercase;letter-spacing:.4px}
        .filter-input{padding:8px 10px;border:1px solid #e0e0de;border-radius:8px;font-size:13px;color:#111;background:#fafafa;outline:none;font-family:inherit;width:100%;box-sizing:border-box}
        .filter-input:focus{border-color:#aaa;background:#fff}
        .btn-generate{padding:10px 24px;background:#111;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit}
        .btn-generate:hover{opacity:.85}
        .btn-generate:disabled{opacity:.5;cursor:not-allowed}

        .summary-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;margin-bottom:20px}
        .summary-card{background:#fff;border:1px solid #e8e8e6;border-radius:12px;padding:16px 20px}
        .summary-card.absent{border-color:#fecaca;background:#fef2f2}
        .summary-card.late{border-color:#fde68a;background:#fefce8}
        .summary-card.undertime{border-color:#fed7aa;background:#fff7ed}
        .summary-card.overtime{border-color:#bbf7d0;background:#f0fdf4}
        .summary-val{font-size:28px;font-weight:700;color:#111;line-height:1}
        .summary-label{font-size:12px;color:#888;margin-top:4px}

        .emp-card{background:#fff;border:1px solid #e8e8e6;border-radius:12px;margin-bottom:12px;overflow:hidden}
        .emp-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;cursor:pointer;gap:16px;flex-wrap:wrap}
        .emp-header:hover{background:#fafaf9}
        .emp-info{display:flex;align-items:center;gap:12px;min-width:200px}
        .avatar{width:36px;height:36px;border-radius:50%;background:#f0f0ee;color:#888;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;flex-shrink:0}
        .emp-name{font-size:14px;font-weight:600;color:#111}
        .emp-sub{font-size:12px;color:#aaa;margin-top:2px}
        .emp-stats{display:flex;gap:20px;flex-wrap:wrap}
        .stat{display:flex;flex-direction:column;align-items:center;gap:2px}
        .stat-val{font-size:16px;font-weight:600;color:#111}
        .stat-label{font-size:10px;color:#aaa;text-transform:uppercase;letter-spacing:.3px}
        .stat.absent .stat-val{color:#dc2626}
        .stat.late .stat-val{color:#ca8a04}
        .stat.undertime .stat-val{color:#ea580c}
        .stat.overtime .stat-val{color:#16a34a}
        .expand-btn{background:none;border:none;font-size:12px;color:#aaa;cursor:pointer;padding:4px 8px}

        .emp-detail{border-top:1px solid #f0f0ee}
        .table{width:100%;border-collapse:collapse;font-size:13px}
        .table th{text-align:left;padding:10px 20px;color:#aaa;font-weight:400;font-size:11px;text-transform:uppercase;letter-spacing:.5px;background:#fafaf9;border-bottom:1px solid #f0f0ee}
        .table td{padding:12px 20px;color:#333;border-bottom:1px solid #f7f7f5}
        .table tr:last-child td{border-bottom:none}
        .row-absent td{background:#fef9f9}
        .mono{font-family:monospace;font-size:12px}
        .muted{color:#ccc}
        .flag-late{color:#ca8a04;font-size:12px;font-weight:500}
        .flag-ut{color:#ea580c;font-size:12px;font-weight:500}
        .flag-ot{color:#16a34a;font-size:12px;font-weight:500}
        .badge{display:inline-flex;font-size:11px;padding:2px 8px;border-radius:999px;font-weight:500}
        .badge.present{background:#f0fdf4;color:#16a34a}
        .badge.absent{background:#fef2f2;color:#dc2626}
        .badge.late{background:#fefce8;color:#ca8a04}
        .card{background:#fff;border:1px solid #e8e8e6;border-radius:12px;overflow:hidden}
        .empty{padding:60px 20px;text-align:center;color:#bbb;font-size:13px}
        .empty-icon{font-size:32px;margin-bottom:12px}
      `}</style>
    </div>
  );
}