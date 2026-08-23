function Recommendations(){


  const recommendations = [

    "🔥 Follow up with hot leads first",

    "📅 Schedule pending customer appointments",

    "📧 Send follow-up messages to new leads",

  ];



  return (

    <div className="
      bg-slate-900
      border
      border-slate-800
      rounded-2xl
      p-6
    ">


      <h2 className="
        text-xl
        font-bold
        mb-5
      ">

        🧠 AI Recommendations

      </h2>



      <div className="space-y-3">


        {recommendations.map((item)=>(


          <div

            key={item}

            className="
              bg-slate-800
              rounded-xl
              p-4
            "

          >

            {item}

          </div>


        ))}



      </div>



    </div>

  );


}


export default Recommendations;