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
  const [role, setRole] = useState("staff");

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

  // The teammates list (fetched fresh on every load, below) is the source
  // of truth for the current user's own role - not the JWT/localStorage
  // "user" object captured at login, which would go stale if this user's
  // role changed after they logged in and never refreshed the page.
  // Default to false (hide owner-only controls) until the list has
  // loaded, rather than briefly flashing controls a staff member can't
  // actually use.
  const currentUser = teammates.find((t) => t.id === currentUserId);
  const isOwner = currentUser?.role === "owner";

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

      await inviteTeammate(name.trim(), email.trim(), password, role);

      setName("");
      setEmail("");
      setPassword("");
      setRole("staff");

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

    <div className="bg-ink-900/60 border border-ink-700 rounded-2xl p-6 mt-6">

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
              className="flex flex-wrap items-center justify-between gap-3 bg-ink-800 rounded-lg p-3"
            >

              <div>

                <p className="font-semibold">
                  {teammate.name || teammate.email}
                  {teammate.id === currentUserId && (
                    <span className="text-slate-400 font-normal"> (you)</span>
                  )}
                  <span className="ml-2 text-xs uppercase tracking-wide text-slate-400 bg-ink-700 rounded px-2 py-0.5 align-middle">
                    {teammate.role === "owner" ? "Owner" : "Staff"}
                  </span>
                </p>

                <p className="text-slate-400 text-sm">
                  {teammate.email}
                </p>

              </div>

              {isOwner && teammate.id !== currentUserId && (

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
                      className="bg-ink-700 hover:bg-ink-600 px-3 py-1 rounded-lg text-sm"
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

      {isOwner ? (

        <>

          <h3 className="font-semibold mb-3">
            Add a teammate
          </h3>

          {error && (
            <p className="text-red-400 text-sm mb-3">
              {error}
            </p>
          )}

          <label htmlFor="teammate-name" className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Name
          </label>

          <input

            id="teammate-name"

            value={name}

            placeholder="Name"

            className="w-full bg-ink-800 text-white placeholder:text-slate-500 border border-ink-700 rounded-lg p-3 mb-3"

            onChange={(e) => setName(e.target.value)}

          />

          <label htmlFor="teammate-email" className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Email
          </label>

          <input

            id="teammate-email"

            value={email}

            placeholder="Email"

            className="w-full bg-ink-800 text-white placeholder:text-slate-500 border border-ink-700 rounded-lg p-3 mb-3"

            onChange={(e) => setEmail(e.target.value)}

          />

          <label htmlFor="teammate-password" className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Password
          </label>

          <input

            id="teammate-password"

            value={password}

            type="password"

            placeholder="Password"

            className="w-full bg-ink-800 text-white placeholder:text-slate-500 border border-ink-700 rounded-lg p-3 mb-3"

            onChange={(e) => setPassword(e.target.value)}

          />

          <label htmlFor="teammate-role" className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Role
          </label>

          <select

            id="teammate-role"

            value={role}

            className="w-full bg-ink-800 text-white border border-ink-700 rounded-lg p-3 mb-3"

            onChange={(e) => setRole(e.target.value)}

          >

            <option value="staff">Staff</option>
            <option value="owner">Owner</option>

          </select>

          <p className="text-slate-400 text-xs mb-3">
            Staff can use the CRM day-to-day. Owners can also manage the team and payment settings.
          </p>

          <button

            onClick={handleInvite}

            disabled={saving}

            className="bg-brand-600 hover:bg-brand-500 px-5 py-2 rounded-lg disabled:opacity-50"

          >

            {saving ? "Adding..." : "Add Teammate"}

          </button>

        </>

      ) : (

        <p className="text-slate-400 text-sm">
          Only the business owner can add or remove teammates.
        </p>

      )}

    </div>

  );

}

export default TeamPanel;
