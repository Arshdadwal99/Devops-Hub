import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { logout } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

const navItems = [
  {
    label: "Dashboard",
    to: "/",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 13h8V3H3v10Z" />
        <path d="M13 21h8V11h-8v10Z" />
        <path d="M13 3v6h8V3h-8Z" />
        <path d="M3 21h8v-6H3v6Z" />
      </svg>
    ),
  },
  {
    label: "Repositories",
    to: "/github/repositories",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M6 4h9l3 3v13H6V4Z" />
        <path d="M15 4v4h4" />
        <path d="M9 13h6" />
        <path d="M9 16h6" />
      </svg>
    ),
  },
  {
    label: "Deployments",
    to: "/deployments/images",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z" />
        <path d="m4 12 8 4.5 8-4.5" />
        <path d="m4 16.5 8 4.5 8-4.5" />
      </svg>
    ),
  },
  {
    label: "AWS Infrastructure",
    to: "/aws/infrastructure",
    match: (pathname) => pathname.startsWith("/aws"),
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M6 18.5h11a4 4 0 0 0 .6-7.95A6.5 6.5 0 0 0 5.4 8.8 4.5 4.5 0 0 0 6 18.5Z" />
        <path d="M9 14h6" />
        <path d="M12 11v6" />
      </svg>
    ),
  },
  {
    label: "Jenkins",
    to: "/jenkins/connect",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M8 7h8" />
        <path d="M7 12h10" />
        <path d="M9 17h6" />
        <path d="M5 4h14v16H5V4Z" />
      </svg>
    ),
  },
  {
    label: "Docker Hub",
    to: "/registry/dockerhub",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 13h14a3 3 0 0 1-3 3H8a4 4 0 0 1-4-4v1Z" />
        <path d="M6 8h3v3H6V8Z" />
        <path d="M10 8h3v3h-3V8Z" />
        <path d="M10 4h3v3h-3V4Z" />
        <path d="M14 8h3v3h-3V8Z" />
        <path d="M19 10h2" />
      </svg>
    ),
  },
  {
    label: "Settings",
    to: "/settings",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
        <path d="M19.4 15a8 8 0 0 0 .1-1l2-1.5-2-3.5-2.4 1a7.5 7.5 0 0 0-1.7-1l-.3-2.6H11l-.3 2.6a7.5 7.5 0 0 0-1.7 1L6.6 9 4.6 12.5l2 1.5a8 8 0 0 0 .1 1l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 1.7 1l.3 2.5h4.1l.3-2.5a7.5 7.5 0 0 0 1.7-1l2.4 1 2-3.4-2.2-1.6Z" />
      </svg>
    ),
  },
];

function isActiveItem(item, pathname, isActive) {
  if (item.match) return item.match(pathname);
  return isActive;
}

export default function AppShell() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, logout: authLogout } = useAuth();

  const handleLogout = () => {
    logout();
    authLogout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[17rem_1fr]">
      <aside className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/90 px-4 py-4 backdrop-blur-xl lg:h-screen lg:border-b-0 lg:border-r lg:px-5">
        <div className="flex items-center justify-between gap-3 lg:block">
          <button type="button" onClick={() => navigate("/")} className="text-left">
            <p className="font-display text-xl font-bold text-slate-100">DevOps Hub</p>
            <p className="mt-1 text-xs uppercase tracking-[0.25em] text-aurora">Control Center</p>
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-red-300/20 px-3 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/10 lg:hidden"
          >
            Logout
          </button>
        </div>

        <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:mt-8 lg:block lg:space-y-2 lg:overflow-visible lg:pb-0">
          {navItems.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex min-w-max items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition lg:min-w-0 ${
                  isActiveItem(item, pathname, isActive)
                    ? "border border-aurora/30 bg-aurora/10 text-aurora shadow-[0_0_24px_rgba(89,246,210,0.08)]"
                    : "border border-transparent text-slate-400 hover:border-white/10 hover:bg-white/5 hover:text-slate-100"
                }`
              }
            >
              <span className="shrink-0">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="mt-8 hidden rounded-lg border border-white/10 bg-white/5 p-4 lg:block">
          <p className="text-sm font-semibold text-slate-100">{user?.name || "Operator"}</p>
          <p className="mt-1 break-all text-xs text-slate-400">{user?.email || "Authenticated session"}</p>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-4 w-full rounded-lg border border-red-300/20 px-3 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/10"
          >
            Logout
          </button>
        </div>
      </aside>

      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
