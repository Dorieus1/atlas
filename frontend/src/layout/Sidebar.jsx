import {
  LayoutDashboard,
  Users,
  Flame,
  BookOpen,
  BarChart3,
  Settings,
  LogOut
} from "lucide-react";


import { NavLink, useNavigate } from "react-router-dom";


function Sidebar() {

  const navigate = useNavigate();

  const handleLogout = () => {

    localStorage.removeItem("token");
    localStorage.removeItem("business_id");
    localStorage.removeItem("user");

    navigate("/login");

  };


  const links = [

    {
      name: "Dashboard",
      path: "/",
      icon: LayoutDashboard
    },

    {
      name: "Customers",
      path: "/customers",
      icon: Users
    },

    {
      name: "Leads",
      path: "/leads",
      icon: Flame
    },

    {
      name: "Knowledge",
      path: "/knowledge",
      icon: BookOpen
    },

    {
      name: "Analytics",
      path: "/analytics",
      icon: BarChart3
    },

    {
      name: "Settings",
      path: "/settings",
      icon: Settings
    }

  ];



  return (

    <aside className="
      w-64
      h-screen
      sticky
      top-0
      overflow-y-auto
      bg-slate-950
      border-r
      border-slate-800
      p-6
      flex
      flex-col
    ">


      <h1 className="
        text-3xl
        font-bold
        mb-8
      ">

        Atlas

      </h1>



      <nav className="space-y-2 flex-1">

        {links.map((link)=>{


          const Icon = link.icon;


          return (

            <NavLink

              key={link.path}

              to={link.path}

              className={({isActive})=>

                `
                flex
                items-center
                gap-3
                p-3
                rounded-xl
                ${
                  isActive
                  ? "bg-blue-600"
                  : "hover:bg-slate-800"
                }
                `

              }

            >

              <Icon size={20}/>

              {link.name}

            </NavLink>

          );


        })}

      </nav>


      <button

        onClick={handleLogout}

        className="
          flex
          items-center
          gap-3
          p-3
          rounded-xl
          text-slate-400
          hover:bg-slate-800
          hover:text-white
        "

      >

        <LogOut size={20}/>

        Log Out

      </button>


    </aside>

  );


}


export default Sidebar;