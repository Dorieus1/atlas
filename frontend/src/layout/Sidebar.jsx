import {
  LayoutDashboard,
  Sun,
  Users,
  Flame,
  CalendarDays,
  FileText,
  Repeat,
  BookOpen,
  BarChart3,
  Clock,
  Settings,
  LogOut,
  Search,
  X
} from "lucide-react";


import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import Logo from "../components/Logo";
import NotificationBell from "../components/NotificationBell";
import { getBusinesses } from "../api/atlasApi";


function Sidebar({ open, onClose, onOpenSearch }) {

  const navigate = useNavigate();

  // Defaults to true (shown) so the link doesn't flicker in and back out
  // for the common case - a business that's turned it off is the
  // exception, not the norm. Fetched once here (Sidebar mounts once for
  // the whole logged-in session, unlike the page content inside it)
  // rather than threading the setting down from every page that has its
  // own Clock In/Out button.
  const [timeTrackingEnabled, setTimeTrackingEnabled] = useState(true);

  useEffect(() => {

    getBusinesses()
      .then((businesses) => setTimeTrackingEnabled(businesses?.[0]?.time_tracking_enabled !== 0))
      .catch((error) => console.error("SIDEBAR BUSINESS LOAD ERROR:", error));

  }, []);

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


  // Not a real security boundary (the backend already 403s a staff
  // login on every /api/timesheets route) - just avoids sending a crew
  // member into a dead-end click for a report about their coworkers'
  // pay that they were never going to be allowed to see anyway.
  const isOwner = (() => {

    try {
      return JSON.parse(localStorage.getItem("user") || "{}").role === "owner";
    } catch {
      return false;
    }

  })();

  const links = [

    {
      name: "Dashboard",
      path: "/dashboard",
      icon: LayoutDashboard
    },

    {
      name: "Today",
      path: "/today",
      icon: Sun,
      tourId: "nav-today"
    },

    {
      name: "Customers",
      path: "/customers",
      icon: Users,
      tourId: "nav-customers"
    },

    {
      name: "Leads",
      path: "/leads",
      icon: Flame,
      tourId: "nav-leads"
    },

    {
      name: "Schedule",
      path: "/schedule",
      icon: CalendarDays,
      tourId: "nav-schedule"
    },

    {
      name: "Quotes",
      path: "/quotes",
      icon: FileText,
      tourId: "nav-quotes"
    },

    {
      name: "Plans",
      path: "/plans",
      icon: Repeat,
      tourId: "nav-plans"
    },

    {
      name: "Knowledge",
      path: "/knowledge",
      icon: BookOpen,
      tourId: "nav-knowledge"
    },

    {
      name: "Analytics",
      path: "/analytics",
      icon: BarChart3,
      tourId: "nav-analytics"
    },

    ...(isOwner && timeTrackingEnabled ? [{
      name: "Timesheets",
      path: "/timesheets",
      icon: Clock
    }] : []),

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
      bg-surface
      border-r
      border-border
      p-6
      flex
      flex-col
      ${open ? "" : "hidden"}
      md:flex
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
            className="hidden rounded-lg p-1.5 text-fg-muted transition hover:bg-surface-muted hover:text-fg md:block"
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

              data-tour={link.tourId}

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
                  ? "border-brand-500 bg-brand-600/10 text-accent-text font-semibold"
                  : "border-transparent text-fg-muted hover:bg-surface-muted hover:text-fg"
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
          text-fg-muted
          hover:bg-surface-muted
          hover:text-fg
        "

      >

        <LogOut size={20}/>

        Log Out

      </button>


    </aside>

  );


}


export default Sidebar;