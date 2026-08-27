import { useEffect, useState, useRef } from "react";
import { CalendarCheck, Check } from "lucide-react";
import {
  getTasks,
  completeTask
} from "../../api/atlasApi";
import EmptyState from "../EmptyState";


function TaskPanel() {


  const [tasks, setTasks] = useState([]);

  const [error, setError] = useState("");

  const [completingId, setCompletingId] = useState(null);

  const completingRef = useRef(null);



  const loadTasks = async () => {


    try {

      const data = await getTasks();

      setTasks(data);

      setError("");

    } catch(err) {

      console.error(err);

      setError("Couldn't load your tasks. Please refresh to try again.");

    }


  };



  useEffect(()=>{

    loadTasks();

  },[]);




  const finishTask = async (id)=>{

    if (completingRef.current) {

      return;

    }

    completingRef.current = id;

    setCompletingId(id);

    try {

      await completeTask(id);

      setError("");

      loadTasks();

    } catch(err){

      console.error(err);

      setError("Failed to complete task. Please try again.");

    } finally {

      completingRef.current = null;

      setCompletingId(null);

    }


  };


  const sortedTasks = [...tasks].sort((a, b) => {

    if (a.status === "completed" && b.status !== "completed") return 1;
    if (a.status !== "completed" && b.status === "completed") return -1;

    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;

    return new Date(a.due_date) - new Date(b.due_date);

  });


  const isOverdue = (task) =>
    task.status !== "completed" &&
    task.due_date &&
    new Date(task.due_date) < new Date();


  const formatDueDate = (dateStr) =>
    new Date(dateStr).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric"
    });


  return (

    <div className="
      h-full
      bg-surface/60
      border
      border-border
      rounded-2xl
      p-6
    ">

      <h2 className="
        text-2xl
        font-bold
        mb-6
        flex
        items-center
        gap-2
      ">

        <CalendarCheck size={24} />
        Follow-Up Tasks

      </h2>

      {error && (
        <p className="text-danger mb-4">
          {error}
        </p>
      )}


      {tasks.length === 0 ? (

        <EmptyState
          icon={CalendarCheck}
          title="No tasks yet"
          description="Follow-up tasks you create will show up here."
        />

      ) : (

        sortedTasks.map((task)=>(

          <div

            key={task.id}

            className={`
              bg-surface-muted
              rounded-xl
              p-5
              mb-4
              ${isOverdue(task) ? "border border-red-600/50" : ""}
            `}

          >

            <h3 className="font-bold text-xl">

              {task.title}

            </h3>

            <p className="mt-2">

              {task.description}

            </p>

            <p className="
              mt-2
              text-fg-muted
            ">

              Status: {task.status}

            </p>

            {task.due_date && (

              <p className={`mt-1 ${isOverdue(task) ? "text-danger font-semibold" : "text-fg-muted"}`}>

                {isOverdue(task) ? "Overdue since " : "Due "}
                {formatDueDate(task.due_date)}

              </p>

            )}

            {task.status !== "completed" && (

              <button

                onClick={()=>finishTask(task.id)}

                disabled={completingId === task.id}

                className="
                  mt-4
                  bg-brand-600
                  hover:bg-brand-500
                  px-4
                  py-2
                  rounded-lg
                  disabled:opacity-50
                  flex
                  items-center
                  gap-1.5
                "

              >

                {completingId === task.id ? "Completing..." : (<><Check size={16} /> Complete</>)}

              </button>

            )}

          </div>

        ))

      )}

    </div>

  );

}


export default TaskPanel;