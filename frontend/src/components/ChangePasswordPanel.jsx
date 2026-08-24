import { useState, useRef } from "react";
import { changePassword } from "../api/atlasApi";

function ChangePasswordPanel() {

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const handleSubmit = async () => {

    if (!currentPassword || !newPassword || !confirmPassword) {

      setError("All fields are required.");
      setSuccess("");
      return;

    }

    if (newPassword.length < 6) {

      setError("New password must be at least 6 characters.");
      setSuccess("");
      return;

    }

    if (newPassword !== confirmPassword) {

      setError("New password and confirmation don't match.");
      setSuccess("");
      return;

    }

    if (savingRef.current) {

      return;

    }

    savingRef.current = true;

    setError("");
    setSuccess("");
    setSaving(true);

    try {

      await changePassword(currentPassword, newPassword);

      setSuccess("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

    } catch (err) {

      setError(err.message || "Failed to update password.");

    } finally {

      savingRef.current = false;

      setSaving(false);

    }

  };

  return (

    <div className="bg-ink-900/60 border border-ink-700 rounded-2xl p-6 mt-6">

      <h2 className="text-xl font-bold mb-4">
        Change Your Password
      </h2>

      {error && (
        <p className="text-red-400 text-sm mb-3">
          {error}
        </p>
      )}

      {success && (
        <p className="text-green-400 text-sm mb-3">
          {success}
        </p>
      )}

      <input

        value={currentPassword}

        type="password"

        placeholder="Current password"

        className="w-full bg-ink-800 text-white placeholder:text-slate-500 border border-ink-700 rounded-lg p-3 mb-3"

        onChange={(e) => setCurrentPassword(e.target.value)}

      />

      <input

        value={newPassword}

        type="password"

        placeholder="New password"

        className="w-full bg-ink-800 text-white placeholder:text-slate-500 border border-ink-700 rounded-lg p-3 mb-3"

        onChange={(e) => setNewPassword(e.target.value)}

      />

      <input

        value={confirmPassword}

        type="password"

        placeholder="Confirm new password"

        className="w-full bg-ink-800 text-white placeholder:text-slate-500 border border-ink-700 rounded-lg p-3 mb-3"

        onChange={(e) => setConfirmPassword(e.target.value)}

      />

      <button

        onClick={handleSubmit}

        disabled={saving}

        className="bg-brand-600 hover:bg-brand-500 px-5 py-2 rounded-lg disabled:opacity-50"

      >

        {saving ? "Updating..." : "Update Password"}

      </button>

    </div>

  );

}

export default ChangePasswordPanel;
