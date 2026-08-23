import {
  LayoutDashboard,
  Users,
  Flame,
  MessageSquare,
  Calendar,
  BarChart3,
  Settings
} from "lucide-react";


function Sidebar() {


  const links = [
    ["Dashboard", LayoutDashboard],
    ["Customers", Users],
    ["Leads", Flame],
    ["Inbox", MessageSquare],
    ["Calendar", Calendar],
    ["Analytics", BarChart3],
    ["Settings", Settings]
  ];



  return (

    <aside className="
      w-64
      min-h-screen
      bg-slate-900
      border-r
      border-slate-800
      p-6
    ">


      <h1 className="
        text-3xl
        font-bold
        mb-8
      ">

        Atlas AI

      </h1>



      <div className="space-y-2">


        {links.map(([name, Icon]) => (

          <div

            key={name}

            className="
              flex
              items-center
              gap-3
              p-3
              rounded-xl
              text-slate-300
              hover:bg-slate-800
              cursor-pointer
            "

          >

            <Icon size={20}/>

            {name}

          </div>

        ))}


      </div>


    </aside>

  );

}


export default Sidebar;