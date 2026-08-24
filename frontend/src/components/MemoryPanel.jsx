import { useEffect, useState, useRef } from "react";
import { API_BASE, handleSessionExpired } from "../api/atlasApi";


function MemoryPanel({ customer }) {


  const [memories, setMemories] = useState([]);

  const [memory, setMemory] = useState("");

  const [error, setError] = useState("");

  const [saving, setSaving] = useState(false);

  const savingRef = useRef(false);




  const loadMemories = async () => {


    if (!customer) {

      setMemories([]);

      return;

    }


    try {

      const token = localStorage.getItem("token");

      const response = await fetch(

        `${API_BASE}/api/memories/${customer.id}`,

        {
          headers: {
            ...(token
              ? { Authorization: `Bearer ${token}` }
              : {})
          }
        }

      );

      if (!response.ok) {

        if (handleSessionExpired(response)) {

          return;

        }

        throw new Error("Failed to load memories");

      }

      const data = await response.json();

      setMemories(data);

    } catch (err) {

      console.error(err);

      setMemories([]);

    }


  };




  useEffect(() => {

    loadMemories();

  }, [customer]);






  const addMemory = async () => {


    if (!customer) {

      return;

    }

    if (!memory.trim()) {

      setError("Memory cannot be empty.");

      return;

    }

    if (savingRef.current) {

      return;

    }

    savingRef.current = true;

    setSaving(true);


    try {

      const token = localStorage.getItem("token");

      const res = await fetch(

        `${API_BASE}/api/memories`,

        {


          method: "POST",


          headers: {

            "Content-Type": "application/json",

            ...(token
              ? { Authorization: `Bearer ${token}` }
              : {})

          },


          body: JSON.stringify({

            customer_id: customer.id,

            memory: memory.trim(),

          }),


        }

      );

      if (!res.ok) {

        if (handleSessionExpired(res)) {

          return;

        }

        const data = await res.json().catch(() => ({}));

        throw new Error(data.error || "Failed to save memory");

      }



      setMemory("");

      setError("");

      loadMemories();

    } catch (err) {

      setError(err.message);

    } finally {

      savingRef.current = false;

      setSaving(false);

    }


  };






  if (!customer) {

    return null;

  }


  return (

    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mt-6">


      <h2 className="text-xl font-bold mb-4">
        🧠 What Atlas Remembers
      </h2>

      <p className="text-slate-400 text-sm mb-4">
        Details Atlas has picked up about {customer.name} from past conversations.
      </p>

      {error && (
        <p className="text-red-400 text-sm mb-3">
          {error}
        </p>
      )}

      {memories.length > 0 && (

        <div className="space-y-2 mb-4">

          {memories.map((item) => (

            <p key={item.id} className="bg-slate-800 rounded-lg p-3">
              {item.memory}
            </p>

          ))}

        </div>

      )}

      {memories.length === 0 && (

        <p className="text-slate-400 text-sm mb-4">
          Nothing remembered yet.
        </p>

      )}

      <div className="flex flex-wrap gap-3">

        <input

          placeholder="Add something to remember"

          value={memory}

          onChange={(e) => setMemory(e.target.value)}

          className="flex-1 bg-slate-800 text-white placeholder:text-slate-500 border border-slate-700 rounded-lg p-3"

        />

        <button

          onClick={addMemory}

          disabled={saving}

          className="bg-blue-600 hover:bg-blue-700 px-5 py-2 rounded-lg disabled:opacity-50"

        >
          {saving ? "Saving..." : "Save"}
        </button>

      </div>


    </div>

  );


}


export default MemoryPanel;
