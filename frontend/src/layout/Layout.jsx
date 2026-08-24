import { useState } from "react";
import { Menu } from "lucide-react";
import Sidebar from "./Sidebar";


function Layout({children}) {

  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (

    <div className="
      flex
      min-h-screen
      bg-slate-900
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
          border-slate-800
          bg-slate-950
        ">

          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1"
            aria-label="Open menu"
          >
            <Menu size={24} />
          </button>

          <h1 className="text-xl font-bold">
            Atlas
          </h1>

        </header>

        <main className="
          flex-1
          overflow-auto
        ">

          {children}

        </main>

      </div>


    </div>

  );

}


export default Layout;
