import {
  LayoutDashboard,
  Users,
  Flame,
  BookOpen,
  BarChart3,
  Settings
} from "lucide-react";


import { NavLink } from "react-router-dom";


function Sidebar() {


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
      min-h-screen
      bg-slate-950
      border-r
      border-slate-800
      p-6
    ">


      <h1 className="
        text-3xl
        font-bold
        mb-8
      ">

        Atlas

      </h1>



      <nav className="space-y-2">

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


    </aside>

  );


}


export default Sidebar;