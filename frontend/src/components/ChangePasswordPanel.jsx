import { useState } from "react";
import { changePassword } from "../api/atlasApi";

function ChangePasswordPanel() {

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

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

      setSaving(false);

    }

  };

  return (

    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mt-6">

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

        className="w-full bg-slate-800 text-white placeholder:text-slate-500 border border-slate-700 rounded-lg p-3 mb-3"

        onChange={(e) => setCurrentPassword(e.target.value)}

      />

      <input

        value={newPassword}

        type="password"

        placeholder="New password"

        className="w-full bg-slate-800 text-white placeholder:text-slate-500 border border-slate-700 rounded-lg p-3 mb-3"

        onChange={(e) => setNewPassword(e.target.value)}

      />

      <input

        value={confirmPassword}

        type="password"

        placeholder="Confirm new password"

        className="w-full bg-slate-800 text-white placeholder:text-slate-500 border border-slate-700 rounded-lg p-3 mb-3"

        onChange={(e) => setConfirmPassword(e.target.value)}

      />

      <button

        onClick={handleSubmit}

        disabled={saving}

        className="bg-blue-600 hover:bg-blue-700 px-5 py-2 rounded-lg disabled:opacity-50"

      >

        {saving ? "Updating..." : "Update Password"}

      </button>

    </div>

  );

}

export default ChangePasswordPanel;
