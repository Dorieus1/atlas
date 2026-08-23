import { useEffect, useState } from "react";
import {
  getTasks,
  completeTask
} from "../../api/atlasApi";


function TaskPanel() {


  const [tasks, setTasks] = useState([]);

  const [error, setError] = useState("");



  const loadTasks = async () => {


    try {

      const data = await getTasks();

      setTasks(data);

    } catch(error) {

      console.error(error);

      setTasks([]);

    }


  };



  useEffect(()=>{

    loadTasks();

  },[]);




  const finishTask = async (id)=>{


    try {

      await completeTask(id);

      setError("");

      loadTasks();

    } catch(err){

      console.error(err);

      setError("Failed to complete task. Please try again.");

    }


  };




  return (

    <div className="
      bg-slate-800
      rounded-xl
      p-6
    ">

      <h2 className="
        text-2xl
        font-bold
        mb-6
      ">

        📅 Follow-Up Tasks

      </h2>

      {error && (
        <p className="text-red-400 mb-4">
          {error}
        </p>
      )}


      {tasks.length === 0 ? (

        <p className="text-slate-400">

          No tasks yet.

        </p>

      ) : (

        tasks.map((task)=>(

          <div

            key={task.id}

            className="
              bg-slate-900
              rounded-xl
              p-5
              mb-4
            "

          >

            <h3 className="font-bold text-xl">

              {task.title}

            </h3>

            <p className="mt-2">

              {task.description}

            </p>

            <p className="
              mt-2
              text-slate-400
            ">

              Status: {task.status}

            </p>

            {task.status !== "completed" && (

              <button

                onClick={()=>finishTask(task.id)}

                className="
                  mt-4
                  bg-green-600
                  hover:bg-green-700
                  px-4
                  py-2
                  rounded-lg
                "

              >

                ✅ Complete

              </button>

            )}

          </div>

        ))

      )}

    </div>

  );

}


export default TaskPanel;