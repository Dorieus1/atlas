import { useState, useEffect } from "react";
import { Menu, Search } from "lucide-react";
import Sidebar from "./Sidebar";
import Logo from "../components/Logo";
import NotificationBell from "../components/NotificationBell";
import SearchPalette from "../components/SearchPalette";


function Layout({children}) {

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const isLoggedIn = !!localStorage.getItem("token");


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
        bg-ink-950
        text-white
      ">

        {children}

      </div>

    );

  }

  return (

    <div className="
      flex
      min-h-screen
      bg-ink-950
      text-white
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
          border-ink-700
          bg-ink-900
        ">

          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1"
            aria-label="Open menu"
          >
            <Menu size={24} />
          </button>

          <Logo size={26} withWordmark />

          <div className="ml-auto flex items-center gap-1">

            <button
              onClick={() => setSearchOpen(true)}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-ink-800 hover:text-white"
              aria-label="Search"
            >
              <Search size={19} />
            </button>

            <NotificationBell />

          </div>

        </header>

        <main className="
          flex-1
          overflow-auto
          relative
          isolate
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
