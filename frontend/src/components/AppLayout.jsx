import { NavLink, Outlet } from "react-router-dom";

const navigation = [
  { to: "/", label: "Ana Sayfa", end: true },
  { to: "/analiz", label: "Analiz" },
  { to: "/mimari", label: "Mimari" },
  { to: "/graf", label: "Graf" },
  { to: "/senaryolar", label: "Senaryolar" }
];

function AppLayout() {
  return (
    <div className="site-shell">
      <div className="site-backdrop" />
      <header className="site-header">
        <div className="container nav-shell">
          <NavLink className="brand" to="/">
            <span className="brand-mark">TG</span>
            <div>
              <strong>ThreatGraph AI</strong>
              <p>Attack intelligence powered by knowledge graph & ML</p>
            </div>
          </NavLink>

          <nav className="main-nav" aria-label="Ana navigasyon">
            {navigation.map((item) => (
              <NavLink
                key={item.to}
                className={({ isActive }) => `nav-link${isActive ? " nav-link-active" : ""}`}
                end={item.end}
                to={item.to}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <NavLink className="button button-primary button-small" to="/analiz">
            Analizi Dene
          </NavLink>
        </div>
      </header>

      <main className="site-main">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="container footer-grid">
          <div>
            <strong>ThreatGraph AI</strong>
            <p>
              Knowledge graph ve makine öğrenmesi ile saldırı davranışını çözümleyen karar
              destek sistemi. Artifact, saldırı, tactic ve savunma bağlamını tek ürün deneyiminde
              birleştirir.
            </p>
          </div>
          <div>
            <span className="footer-label">Sayfalar</span>
            <div className="footer-links">
              {navigation.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end}>
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
          <div>
            <span className="footer-label">Odak</span>
            <p>
              Knowledge graph tabanlı saldırı analizi, akıllı savunma önerileri, canlı graph
              görünümü ve güven skoruna dayalı dürüst karar desteği.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default AppLayout;
