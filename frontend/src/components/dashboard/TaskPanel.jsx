import { useEffect, useState, useRef } from "react";
import { CalendarCheck, Check, Plus, X } from "lucide-react";
import {
  getTasks,
  completeTask,
  createTask,
  getCustomers
} from "../../api/atlasApi";
import EmptyState from "../EmptyState";


function TaskPanel() {


  const [tasks, setTasks] = useState([]);

  const [error, setError] = useState("");

  const [completingId, setCompletingId] = useState(null);

  const completingRef = useRef(null);

  // Every task on this panel used to only ever come from Atlas
  // Intelligence's own "Create Follow-Up" suggestions - there was no way
  // for the owner to just jot down "call Dana back Thursday" themselves,
  // which is a strange gap for a panel literally called Follow-Up Tasks.
  const [customers, setCustomers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formCustomerId, setFormCustomerId] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDueDate, setFormDueDate] = useState("");
  const [formError, setFormError] = useState("");
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);



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

    getCustomers()
      .then(setCustomers)
      .catch((err) => console.error("CUSTOMERS LOAD ERROR:", err));

  },[]);


  const openAddForm = () => {

    setFormCustomerId("");
    setFormTitle("");
    setFormDescription("");
    setFormDueDate("");
    setFormError("");
    setShowForm(true);

  };


  const closeAddForm = () => {

    if (creating) return;

    setShowForm(false);

  };


  const handleCreateTask = async () => {

    if (!formCustomerId) {
      setFormError("Choose a customer.");
      return;
    }

    if (!formTitle.trim()) {
      setFormError("Give the task a title.");
      return;
    }

    if (creatingRef.current) {
      return;
    }

    creatingRef.current = true;
    setCreating(true);
    setFormError("");

    try {

      await createTask(
        formCustomerId,
        formTitle.trim(),
        formDescription.trim() || null,
        formDueDate ? new Date(`${formDueDate}T00:00:00`).toISOString() : null
      );

      setShowForm(false);
      await loadTasks();

    } catch (err) {

      console.error("CREATE TASK ERROR:", err);
      setFormError(err.message || "Couldn't create that task. Please try again.");

    } finally {

      creatingRef.current = false;
      setCreating(false);

    }

  };




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

      <div className="mb-6 flex items-center justify-between gap-2">

        <h2 className="
          text-2xl
          font-bold
          flex
          items-center
          gap-2
        ">

          <CalendarCheck size={24} />
          Follow-Up Tasks

        </h2>

        <button
          onClick={openAddForm}
          className="flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-sm hover:bg-ink-700"
        >
          <Plus size={15} /> Add Task
        </button>

      </div>

      {error && (
        <p className="text-danger mb-4">
          {error}
        </p>
      )}


      {tasks.length === 0 ? (

        <EmptyState
          icon={CalendarCheck}
          title="No tasks yet"
          description="Follow-up tasks you create - or ones Atlas Intelligence recommends - will show up here."
          actionLabel="Add Task"
          onAction={openAddForm}
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

      {showForm && (

        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={closeAddForm}
        >

          <div
            className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-6"
            onClick={(e) => e.stopPropagation()}
          >

            <div className="flex items-center justify-between">

              <h3 className="font-display text-lg font-bold">
                Add Follow-Up Task
              </h3>

              <button
                onClick={closeAddForm}
                disabled={creating}
                className="rounded-lg p-1 text-slate-400 hover:bg-ink-800 hover:text-white"
                aria-label="Close"
              >
                <X size={18} />
              </button>

            </div>

            {formError && (
              <p className="mt-3 text-sm text-red-400">
                {formError}
              </p>
            )}

            <div className="mt-4 flex flex-col gap-3">

              <select
                value={formCustomerId}
                onChange={(e) => setFormCustomerId(e.target.value)}
                className="w-full rounded-lg border border-ink-700 bg-ink-800 p-3 text-white focus:border-ink-600 focus:outline-none"
              >
                <option value="">Choose a customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <input
                placeholder="Title (e.g. Call back about the estimate)"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="w-full rounded-lg border border-ink-700 bg-ink-800 p-3 text-white placeholder:text-slate-500 focus:border-ink-600 focus:outline-none"
              />

              <textarea
                placeholder="Notes (optional)"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                className="h-20 w-full rounded-lg border border-ink-700 bg-ink-800 p-3 text-white placeholder:text-slate-500 focus:border-ink-600 focus:outline-none"
              />

              <div>
                <label htmlFor="task-due-date" className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Due date (optional)
                </label>
                <input
                  id="task-due-date"
                  type="date"
                  value={formDueDate}
                  onChange={(e) => setFormDueDate(e.target.value)}
                  className="w-full rounded-lg border border-ink-700 bg-ink-800 p-3 text-white focus:border-ink-600 focus:outline-none"
                />
              </div>

              <button
                onClick={handleCreateTask}
                disabled={creating}
                className="mt-1 rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
              >
                {creating ? "Adding..." : "Add Task"}
              </button>

            </div>

          </div>

        </div>

      )}

    </div>

  );

}


export default TaskPanel;