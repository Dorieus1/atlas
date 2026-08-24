import {
  LayoutDashboard,
  Users,
  Flame,
  BookOpen,
  BarChart3,
  Settings,
  LogOut,
  X
} from "lucide-react";


import { NavLink, useNavigate } from "react-router-dom";


function Sidebar({ open, onClose }) {

  const navigate = useNavigate();

  const handleLogout = () => {

    localStorage.removeItem("token");
    localStorage.removeItem("business_id");
    localStorage.removeItem("user");

    navigate("/login");

  };

  const handleLinkClick = () => {

    if (onClose) {

      onClose();

    }

  };


  const links = [

    {
      name: "Dashboard",
      path: "/dashboard",
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

    <aside className={`
      fixed
      inset-y-0
      left-0
      z-40
      w-64
      h-screen
      overflow-y-auto
      bg-ink-900
      border-r
      border-ink-700
      p-6
      flex
      flex-col
      transform
      transition-transform
      duration-200
      ${open ? "translate-x-0" : "-translate-x-full"}
      md:translate-x-0
      md:sticky
      md:top-0
    `}>


      <div className="
        flex
        items-center
        justify-between
        mb-8
      ">

        <h1 className="
          text-3xl
          font-bold
        ">

          Atlas

        </h1>

        <button
          onClick={onClose}
          className="p-1 md:hidden"
          aria-label="Close menu"
        >
          <X size={24} />
        </button>

      </div>



      <nav className="space-y-2 flex-1">

        {links.map((link)=>{


          const Icon = link.icon;


          return (

            <NavLink

              key={link.path}

              to={link.path}

              onClick={handleLinkClick}

              className={({isActive})=>

                `
                flex
                items-center
                gap-3
                p-3
                rounded-xl
                ${
                  isActive
                  ? "bg-brand-600"
                  : "hover:bg-ink-800"
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
          hover:bg-ink-800
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