import {
  LayoutDashboard,
  Users,
  Flame,
  CalendarDays,
  FileText,
  BookOpen,
  BarChart3,
  Settings,
  LogOut,
  Search,
  X
} from "lucide-react";


import { NavLink, useNavigate } from "react-router-dom";
import Logo from "../components/Logo";
import NotificationBell from "../components/NotificationBell";


function Sidebar({ open, onClose, onOpenSearch }) {

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
      name: "Schedule",
      path: "/schedule",
      icon: CalendarDays
    },

    {
      name: "Quotes",
      path: "/quotes",
      icon: FileText
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

        <Logo size={30} withWordmark />

        <div className="flex items-center gap-1">

          <button
            onClick={onOpenSearch}
            className="hidden rounded-lg p-1.5 text-slate-400 transition hover:bg-ink-800 hover:text-white md:block"
            aria-label="Search"
          >
            <Search size={19} />
          </button>

          <div className="hidden md:block">
            <NotificationBell align="left" />
          </div>

          <button
            onClick={onClose}
            className="p-1 md:hidden"
            aria-label="Close menu"
          >
            <X size={24} />
          </button>

        </div>

      </div>



      <nav className="space-y-2 flex-1 overflow-y-auto">

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
                px-3.5
                py-2.5
                rounded-xl
                border-l-2
                transition
                ${
                  isActive
                  ? "border-brand-500 bg-brand-600/10 text-brand-400 font-semibold"
                  : "border-transparent text-slate-400 hover:bg-ink-800 hover:text-slate-100"
                }
                `

              }

            >

              <Icon size={19}/>

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