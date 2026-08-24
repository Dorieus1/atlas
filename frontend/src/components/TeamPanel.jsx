import { useEffect, useState, useRef } from "react";
import {
  getTeammates,
  inviteTeammate,
  removeTeammate
} from "../api/atlasApi";

function TeamPanel() {

  const [teammates, setTeammates] = useState([]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [removingId, setRemovingId] = useState(null);
  const removingRef = useRef(null);

  const currentUserId = (() => {

    try {

      return JSON.parse(localStorage.getItem("user") || "{}").id;

    } catch {

      return null;

    }

  })();

  const loadTeammates = async () => {

    try {

      const data = await getTeammates();

      setTeammates(data);

      setLoadError("");

    } catch (err) {

      console.error("TEAMMATES LOAD ERROR:", err);

      setLoadError("Couldn't load your team. Please refresh to try again.");

    }

  };

  useEffect(() => {

    loadTeammates();

  }, []);

  const handleInvite = async () => {

    if (!name.trim() || !email.trim() || !password) {

      setError("Name, email, and password are all required.");

      return;

    }

    if (password.length < 6) {

      setError("Password must be at least 6 characters.");

      return;

    }

    if (savingRef.current) {

      return;

    }

    savingRef.current = true;

    setError("");

    setSaving(true);

    try {

      await inviteTeammate(name.trim(), email.trim(), password);

      setName("");
      setEmail("");
      setPassword("");

      await loadTeammates();

    } catch (err) {

      setError(err.message || "Failed to add teammate.");

    } finally {

      savingRef.current = false;

      setSaving(false);

    }

  };

  const handleRemove = async (id) => {

    if (removingRef.current) {

      return;

    }

    removingRef.current = id;

    setRemovingId(id);

    setDeleteError("");

    try {

      await removeTeammate(id);

      setConfirmingDeleteId(null);

      await loadTeammates();

    } catch (err) {

      setDeleteError(err.message || "Failed to remove teammate.");

    } finally {

      removingRef.current = null;

      setRemovingId(null);

    }

  };

  return (

    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mt-6">

      <h2 className="text-xl font-bold mb-4">
        Team Logins
      </h2>

      <p className="text-slate-400 text-sm mb-4">
        Anyone added here gets their own email and password to log in to this business.
      </p>

      {loadError && (
        <p className="text-red-400 text-sm mb-4">
          {loadError}
        </p>
      )}

      {teammates.length > 0 && (

        <div className="space-y-3 mb-6">

          {teammates.map((teammate) => (

            <div
              key={teammate.id}
              className="flex flex-wrap items-center justify-between gap-3 bg-slate-800 rounded-lg p-3"
            >

              <div>

                <p className="font-semibold">
                  {teammate.name || teammate.email}
                  {teammate.id === currentUserId && (
                    <span className="text-slate-400 font-normal"> (you)</span>
                  )}
                </p>

                <p className="text-slate-400 text-sm">
                  {teammate.email}
                </p>

              </div>

              {teammate.id !== currentUserId && (

                confirmingDeleteId === teammate.id ? (

                  <div className="flex items-center gap-2">

                    <button
                      onClick={() => handleRemove(teammate.id)}
                      disabled={removingId === teammate.id}
                      className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded-lg text-sm disabled:opacity-50"
                    >
                      {removingId === teammate.id ? "Removing..." : "Confirm"}
                    </button>

                    <button
                      onClick={() => setConfirmingDeleteId(null)}
                      className="bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded-lg text-sm"
                    >
                      Cancel
                    </button>

                  </div>

                ) : (

                  <button
                    onClick={() => setConfirmingDeleteId(teammate.id)}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Remove
                  </button>

                )

              )}

            </div>

          ))}

        </div>

      )}

      {deleteError && (
        <p className="text-red-400 text-sm mb-4">
          {deleteError}
        </p>
      )}

      <h3 className="font-semibold mb-3">
        Add a teammate
      </h3>

      {error && (
        <p className="text-red-400 text-sm mb-3">
          {error}
        </p>
      )}

      <input

        value={name}

        placeholder="Name"

        className="w-full bg-slate-800 text-white placeholder:text-slate-500 border border-slate-700 rounded-lg p-3 mb-3"

        onChange={(e) => setName(e.target.value)}

      />

      <input

        value={email}

        placeholder="Email"

        className="w-full bg-slate-800 text-white placeholder:text-slate-500 border border-slate-700 rounded-lg p-3 mb-3"

        onChange={(e) => setEmail(e.target.value)}

      />

      <input

        value={password}

        type="password"

        placeholder="Password"

        className="w-full bg-slate-800 text-white placeholder:text-slate-500 border border-slate-700 rounded-lg p-3 mb-3"

        onChange={(e) => setPassword(e.target.value)}

      />

      <button

        onClick={handleInvite}

        disabled={saving}

        className="bg-blue-600 hover:bg-blue-700 px-5 py-2 rounded-lg disabled:opacity-50"

      >

        {saving ? "Adding..." : "Add Teammate"}

      </button>

    </div>

  );

}

export default TeamPanel;
