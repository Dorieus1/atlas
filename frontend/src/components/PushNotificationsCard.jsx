import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { getPushPublicKey, subscribeToPush, unsubscribeFromPush } from "../api/atlasApi";

// Same VAPID-key-to-Uint8Array conversion every Web Push tutorial uses -
// PushManager.subscribe() requires the key as raw bytes, but servers
// hand it out as a URL-safe base64 string (see .env's VAPID_PUBLIC_KEY).
function urlBase64ToUint8Array(base64String) {

  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;

}

// Per-device, like Appearance right above it - notifications are enabled
// separately on each browser/device someone uses, not once for the whole
// team, since a push subscription IS a specific browser's own endpoint.
function PushNotificationsCard() {

  // "unsupported" covers older Safari/browsers with no Push API at all,
  // so the card can say something honest instead of a button that would
  // just silently fail.
  const [status, setStatus] = useState("checking");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {

    async function checkStatus() {

      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {

        setStatus("unsupported");
        return;

      }

      if (Notification.permission === "denied") {

        setStatus("denied");
        return;

      }

      try {

        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();

        setStatus(existing ? "enabled" : "disabled");

      } catch (err) {

        console.error("Push status check failed:", err);
        setStatus("disabled");

      }

    }

    checkStatus();

  }, []);

  const handleEnable = async () => {

    setBusy(true);
    setError("");

    try {

      const permission = await Notification.requestPermission();

      if (permission !== "granted") {

        setStatus(permission === "denied" ? "denied" : "disabled");
        setBusy(false);
        return;

      }

      const { publicKey } = await getPushPublicKey();

      const registration = await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });

      await subscribeToPush(subscription.toJSON());

      setStatus("enabled");

    } catch (err) {

      console.error("Enabling push notifications failed:", err);
      setError("Couldn't turn on notifications. Please try again.");

    } finally {

      setBusy(false);

    }

  };

  const handleDisable = async () => {

    setBusy(true);
    setError("");

    try {

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {

        await unsubscribeFromPush(subscription.endpoint);
        await subscription.unsubscribe();

      }

      setStatus("disabled");

    } catch (err) {

      console.error("Disabling push notifications failed:", err);
      setError("Couldn't turn off notifications. Please try again.");

    } finally {

      setBusy(false);

    }

  };

  return (

    <div className="bg-surface/60 border border-border rounded-2xl p-6">

      <h2 className="text-2xl font-bold flex items-center gap-2">
        <Bell size={22} />
        Notifications
      </h2>

      <p className="mt-1 text-sm text-fg-faint">
        Get a real-time alert on this device when a new lead comes in, a customer books, or a quote gets signed - even when Atlas isn't open.
      </p>

      {error && (
        <p className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-4">

        {status === "checking" && (
          <p className="text-sm text-fg-muted">Checking this device...</p>
        )}

        {status === "unsupported" && (
          <p className="text-sm text-fg-muted">
            This browser doesn't support push notifications. Try a recent version of Chrome, Edge, or Safari.
          </p>
        )}

        {status === "denied" && (
          <p className="text-sm text-fg-muted">
            Notifications are blocked for Atlas in this browser. Allow them in your browser's site settings, then reload this page.
          </p>
        )}

        {status === "disabled" && (

          <button
            onClick={handleEnable}
            disabled={busy}
            className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-60"
          >
            <BellRing size={16} />
            {busy ? "Turning on..." : "Enable notifications"}
          </button>

        )}

        {status === "enabled" && (

          <div className="flex items-center gap-3">

            <span className="flex items-center gap-1.5 text-sm font-medium text-success">
              <BellRing size={16} />
              Enabled on this device
            </span>

            <button
              onClick={handleDisable}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-sm font-medium text-fg-muted transition hover:bg-surface-muted disabled:opacity-60"
            >
              <BellOff size={14} />
              {busy ? "Turning off..." : "Turn off"}
            </button>

          </div>

        )}

      </div>

    </div>

  );

}

export default PushNotificationsCard;
