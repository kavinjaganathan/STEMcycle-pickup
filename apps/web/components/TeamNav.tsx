import Link from "next/link";

/** The team site that StemCycle lives inside (ftcoverdrive.org/STEM). */
export const TEAM_SITE = "https://ftcoverdrive.org";

/**
 * The team site's folder tabs, so StemCycle reads as one of its pages and
 * visitors can get back to the rest of the site. Mirrors TABS in the team
 * site's src/config.js: keep the two in step when a team page is added.
 */
const TEAM_TABS: { id: string; label: string; enabled?: boolean }[] = [
  { id: "home", label: "Home", enabled: true },
  { id: "team", label: "Meet the Team", enabled: true },
  { id: "robot", label: "Robot" },
  { id: "awards", label: "Awards", enabled: true },
  { id: "alumni", label: "Alumni", enabled: true },
  { id: "stemcycle", label: "StemCycle", enabled: true },
  { id: "contact", label: "Contact" },
];

export function TeamNav() {
  return (
    <header className="team-nav">
      <nav aria-label="Main" className="min-w-0">
        <ul className="tabs">
          {TEAM_TABS.map((t, i) => (
            <li key={t.id} className="tab" style={{ zIndex: TEAM_TABS.length - i }}>
              {t.id === "stemcycle" ? (
                <Link href="/" aria-current="page">
                  {t.label}
                </Link>
              ) : t.enabled ? (
                <a href={t.id === "home" ? `${TEAM_SITE}/` : `${TEAM_SITE}/#${t.id}`}>{t.label}</a>
              ) : (
                <span className="tab__off" aria-disabled="true" title="Coming soon">
                  {t.label}
                </span>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
