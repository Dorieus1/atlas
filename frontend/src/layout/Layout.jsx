import Sidebar from "./Sidebar";


function Layout({children}) {


  return (

    <div className="
      flex
      min-h-screen
      bg-slate-900
      text-white
    ">

      <Sidebar />

      <main className="
        flex-1
        overflow-auto
      ">

        {children}

      </main>


    </div>

  );

}


export default Layout;