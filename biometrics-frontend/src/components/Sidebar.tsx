'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { removeToken, getUsername } from '@/lib/auth';

const navItems = [
  { href: '/dashboard',  label: 'Dashboard',  icon: '⊞' },
  { href: '/devices',    label: 'Devices',     icon: '⊡' },
  { href: '/users',      label: 'Users',       icon: '⊙' },
  { href: '/logs',       label: 'Logs',        icon: '≡' },
];

const hrItems = [
  { href: '/employees',  label: 'Employees',   icon: '👤' },
  { href: '/reports',    label: 'Reports',     icon: '📋' },
  { href: '/settings',   label: 'Settings',    icon: '⚙' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const username = getUsername();

  function handleLogout() {
    removeToken();
    router.push('/login');
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-icon">◈</div>
        <div>
          <div className="brand-name">BioTrack</div>
          <div className="brand-sub">Attendance System</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">Biometrics</div>
        {navItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-link ${pathname === item.href ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </Link>
        ))}

        <div className="nav-section-label" style={{ marginTop: 16 }}>HR Management</div>
        {hrItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-link ${pathname === item.href ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="user-info">
          <div className="user-avatar">{username?.charAt(0).toUpperCase() || 'A'}</div>
          <div className="user-name">{username || 'Admin'}</div>
        </div>
        <button className="logout-btn" onClick={handleLogout}>
          ⎋ Sign out
        </button>
      </div>

      <style>{`
        .sidebar {
          width: 220px;
          height: 100vh;
          background: #0f0f0f;
          border-right: 1px solid #1f1f1f;
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
          font-family: 'DM Sans', system-ui, sans-serif;
        }
        .sidebar-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 24px 20px 20px;
          border-bottom: 1px solid #1f1f1f;
        }
        .brand-icon { font-size: 22px; color: #e8e8e8; }
        .brand-name { font-size: 15px; font-weight: 600; color: #f0f0f0; letter-spacing: -0.3px; }
        .brand-sub { font-size: 11px; color: #555; margin-top: 1px; }
        .sidebar-nav {
          flex: 1;
          padding: 16px 12px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          overflow-y: auto;
        }
        .nav-section-label {
          font-size: 10px;
          font-weight: 500;
          color: #3a3a3a;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          padding: 4px 10px;
          margin-bottom: 2px;
        }
        .nav-link {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 10px;
          border-radius: 8px;
          color: #666;
          text-decoration: none;
          font-size: 13px;
          transition: all 0.15s;
        }
        .nav-link:hover { background: #1a1a1a; color: #ccc; }
        .nav-link.active { background: #1f1f1f; color: #f0f0f0; }
        .nav-icon { font-size: 15px; width: 20px; text-align: center; }
        .sidebar-footer {
          padding: 16px 12px;
          border-top: 1px solid #1f1f1f;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .user-info { display: flex; align-items: center; gap: 10px; padding: 6px 10px; }
        .user-avatar {
          width: 28px; height: 28px; border-radius: 50%;
          background: #2a2a2a; color: #aaa;
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 500;
        }
        .user-name { font-size: 13px; color: #888; }
        .logout-btn {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 10px; border-radius: 8px; border: none;
          background: none; color: #555; font-size: 13px;
          cursor: pointer; width: 100%; text-align: left;
          transition: all 0.15s; font-family: inherit;
        }
        .logout-btn:hover { background: #1a1a1a; color: #e55; }
      `}</style>
    </aside>
  );
}