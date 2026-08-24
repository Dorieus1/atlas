import { useState } from "react";
import { Menu } from "lucide-react";
import Sidebar from "./Sidebar";
import Logo from "../components/Logo";


function Layout({children}) {

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isLoggedIn = !!localStorage.getItem("token");

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


    </div>

  );

}


export default Layout;
