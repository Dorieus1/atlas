import AnimatedNumber from "../AnimatedNumber";

function StatCard({

  title,

  value,

  icon,

  description,

  format

}) {


  return (

    <div className="
      relative
      overflow-hidden
      bg-surface/60
      border
      border-border
      rounded-2xl
      p-5
      transition
      hover:border-border-strong
      hover:-translate-y-0.5
      hover:shadow-xl
      hover:shadow-black/20
    ">

      <div
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/60 to-transparent"
        aria-hidden="true"
      />

      <div className="
        flex
        justify-between
        items-start
      ">


        <div>


          <p className="text-sm font-medium text-fg-muted">

            {title}

          </p>



          <h2 className="
            font-display
            text-4xl
            font-bold
            tracking-tight
            mt-2
          ">

            <AnimatedNumber value={value} format={format} />

          </h2>


        </div>



        <div className="
          text-xl
          bg-gradient-to-br
          from-brand-500/20
          to-brand-600/10
          border
          border-brand-500/20
          rounded-xl
          p-3
        ">

          {icon}

        </div>


      </div>




      <p className="
        text-sm
        text-fg-faint
        mt-4
      ">

        {description}

      </p>



    </div>

  );


}


export default StatCard;