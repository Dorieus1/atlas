function StatCard({

  title,

  value,

  icon,

  description

}) {


  return (

    <div className="
      bg-ink-900/60
      border
      border-ink-700
      rounded-2xl
      p-5
      hover:border-ink-600
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
          bg-brand-600/15
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