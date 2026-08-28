import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Menu, Search } from "lucide-react";
import Sidebar from "./Sidebar";
import Logo from "../components/Logo";
import NotificationBell from "../components/NotificationBell";
import SearchPalette from "../components/SearchPalette";


// Routes that must never show the business's own CRM navigation, no
// matter what's sitting in localStorage - these are pages a customer
// (not the business owner) is meant to land on directly. A business
// owner who stays logged in on a shared/office computer must not have
// their own sidebar (Dashboard, Customers, Leads, Analytics, Settings,
// Log Out) wrap around the page a walk-in customer opens from a chat
// link or a portal QR code.
const PUBLIC_PATH_PREFIXES = [
  "/talk/",
  "/book/",
  "/portal/",
  "/login",
  "/forgot-password",
  "/reset-password"
];

function isPublicPath(pathname) {

  if (pathname === "/") {
    return true;
  }

  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));

}


function Layout({children}) {

  const location = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const isLoggedIn = !!localStorage.getItem("token") && !isPublicPath(location.pathname);


  // Global Cmd/Ctrl+K, works from anywhere in the app regardless of what
  // page or component currently has focus.
  useEffect(() => {

    if (!isLoggedIn) {
      return;
    }

    const handleKeyDown = (e) => {

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {

        e.preventDefault();
        setSearchOpen(true);

      }

    };

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);

  }, [isLoggedIn]);

  if (!isLoggedIn) {

    return (

      <div className="
        min-h-screen
        bg-bg
        text-fg
      ">

        {children}

      </div>

    );

  }

  return (

    <div className="
      flex
      min-h-screen
      bg-bg
      text-fg
    ">

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpenSearch={() => setSearchOpen(true)}
      />

      {sidebarOpen && (

        <div
          onClick={() => setSidebarOpen(false)}
          className="
            fixed inset-0 z-30
            bg-black/50
            md:hidden
          "
        />

      )}

      <div className="
        flex-1
        flex
        flex-col
        min-w-0
      ">

        <header className="
          md:hidden
          flex
          items-center
          gap-4
          p-4
          border-b
          border-border
          bg-surface
        ">

          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1"
            aria-label="Open menu"
            data-tour="mobile-menu"
          >
            <Menu size={24} />
          </button>

          <Logo size={26} withWordmark />

          <div className="ml-auto flex items-center gap-1">

            <button
              onClick={() => setSearchOpen(true)}
              className="rounded-lg p-2 text-fg-muted transition hover:bg-surface-muted hover:text-fg"
              aria-label="Search"
            >
              <Search size={19} />
            </button>

            <NotificationBell />

          </div>

        </header>

        {/*
          `isolate` gives <main> its own stacking context (so the
          decorative glow div's -z-10 below stays behind this page's
          content, not the whole app) - but a stacking context with no
          explicit z-index of its own paints in the "z-index:auto" group,
          BEHIND any sibling that has one. Sidebar has an explicit z-40,
          so without a z-index here, <main>'s entire contents - including
          any fixed inset-0 modal rendered inside it, no matter how high
          that modal's own z-index is - paint behind the sidebar; the
          modal's z-index never even gets compared to Sidebar's.

          md:z-40 (not a plain z-40) is deliberate: matching Sidebar's
          z-40 makes DOM order break the tie, and main renders AFTER
          Sidebar - so main wins ties both on desktop (correctly lifting
          a modal above the sidebar) AND on mobile, where Sidebar becomes
          a `fixed` full-screen drawer when opened. A plain z-40 here
          made the OPEN mobile drawer lose that same tie to main's normal
          page content, painting the two on top of each other as a
          garbled mess - a regression a design review caught. Restricting
          the z-40 to md+ (where Sidebar is `md:sticky`, not an overlay,
          so there's nothing for main to visually collide with) leaves
          <main> in the unstyled "auto" group on mobile, where it
          unconditionally loses to Sidebar's explicit z-40 - exactly what
          an open drawer needs, regardless of DOM order.
        */}
        <main className="
          flex-1
          overflow-auto
          relative
          isolate
          md:z-40
        ">

          <div
            className="pointer-events-none fixed -top-32 right-0 -z-10 h-[420px] w-[560px] rounded-full bg-brand-600/[0.07] blur-[120px]"
            aria-hidden="true"
          />

          {children}

        </main>

      </div>

      <SearchPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
      />

    </div>

  );

}


export default Layout;
