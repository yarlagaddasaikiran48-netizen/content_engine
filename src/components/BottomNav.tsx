"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Four destinations, fixed to the bottom because that is where a thumb rests
 * on a phone held one-handed. Stats was held back until there was analytics
 * behind it, on the grounds that an empty tab is worse than no tab; there is
 * now. Targets are 48px minimum, and the bar clears the iOS home indicator via
 * the --safe-bottom variable.
 *
 * Approve and publish became separate events, so Queue is not optional: it is
 * the only place to see what the channel is about to post.
 */
const TABS = [
  { href: "/", label: "Review", icon: "♡" },
  { href: "/queue", label: "Queue", icon: "≡" },
  { href: "/performance", label: "Stats", icon: "◔" },
  { href: "/settings", label: "Settings", icon: "⚙" },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav" aria-label="Main">
      {TABS.map((tab) => {
        // "/" would prefix-match every route, so it is compared exactly. The
        // legacy /dashboard list still counts as Review.
        const active =
          tab.href === "/"
            ? pathname === "/" || pathname.startsWith("/dashboard")
            : pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`bottom-nav__tab${active ? " is-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <span aria-hidden="true" className="bottom-nav__icon">
              {tab.icon}
            </span>
            <span className="bottom-nav__label">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
