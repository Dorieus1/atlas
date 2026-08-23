function StatCard({

  title,

  value,

  icon,

  description

}) {


  return (

    <div className="
      bg-slate-900
      border
      border-slate-800
      rounded-2xl
      p-5
      hover:border-slate-600
      transition
    ">


      <div className="
        flex
        justify-between
        items-start
      ">


        <div>


          <p className="text-slate-400">

            {title}

          </p>



          <h2 className="
            text-4xl
            font-bold
            mt-2
          ">

            {value}

          </h2>


        </div>



        <div className="
          text-2xl
          bg-slate-800
          rounded-xl
          p-3
        ">

          {icon}

        </div>


      </div>




      <p className="
        text-sm
        text-slate-500
        mt-4
      ">

        {description}

      </p>



    </div>

  );


}


export default StatCard;