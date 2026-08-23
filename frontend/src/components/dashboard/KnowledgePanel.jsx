import { useEffect, useState } from "react";
import { getKnowledge } from "../../api/atlasApi";

function KnowledgePanel() {


  const [knowledge, setKnowledge] = useState([]);



  useEffect(() => {

  async function loadKnowledge() {

    try {

      const data = await getKnowledge("1");

      setKnowledge(data);

    } catch (error) {

      console.error(
        "Knowledge error:",
        error
      );

    }

  }

  loadKnowledge();

}, []);

  return (

    <div className="
      mt-8
      bg-slate-900
      border
      border-slate-800
      rounded-2xl
      p-6
    ">

      <h2 className="text-2xl font-bold">

        📚 Business Knowledge

      </h2>



      {knowledge.length === 0 ? (

        <p className="mt-4 text-slate-400">

          No business knowledge added yet.

        </p>


      ) : (

        knowledge.map((item) => (

          <div

            key={item.id}

            className="
              mt-4
              bg-slate-800
              rounded-xl
              p-4
            "

          >

            <h3 className="font-bold">

              {item.title}

            </h3>


            <p className="mt-2 whitespace-pre-wrap">

              {item.content}

            </p>


          </div>

        ))

      )}


    </div>

  );

}


export default KnowledgePanel;