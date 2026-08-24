import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check } from "lucide-react";

import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead
} from "../api/atlasApi";


const POLL_INTERVAL_MS = 30000;


function timeAgo(dateString) {

  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);

  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;

}


function NotificationBell({ align = "right" }) {

  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const containerRef = useRef(null);


  const loadUnreadCount = async () => {

    try {

      const data = await getUnreadNotificationCount();
      setUnreadCount(data.count);

    } catch (err) {

      console.error("UNREAD COUNT ERROR:", err);

    }

  };


  useEffect(() => {

    loadUnreadCount();

    const interval = setInterval(loadUnreadCount, POLL_INTERVAL_MS);

    return () => clearInterval(interval);

  }, []);


  useEffect(() => {

    const handleClickOutside = (e) => {

      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }

    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => document.removeEventListener("mousedown", handleClickOutside);

  }, []);


  const handleOpen = async () => {

    const next = !open;
    setOpen(next);

    if (next) {

      setLoading(true);
      setError("");

      try {

        const data = await getNotifications();
        setNotifications(data);

      } catch (err) {

        console.error("NOTIFICATIONS LOAD ERROR:", err);
        setError("Couldn't load notifications.");

      } finally {

        setLoading(false);

      }

    }

  };


  const handleNotificationClick = async (notification) => {

    setOpen(false);

    if (!notification.read) {

      try {

        await markNotificationRead(notification.id);
        setUnreadCount((previous) => Math.max(0, previous - 1));

      } catch (err) {

        console.error("MARK READ ERROR:", err);

      }

    }

    if (notification.link) {
      navigate(notification.link);
    }

  };


  const handleMarkAllRead = async (e) => {

    e.stopPropagation();

    try {

      await markAllNotificationsRead();
      setNotifications((previous) => previous.map((n) => ({ ...n, read: 1 })));
      setUnreadCount(0);

    } catch (err) {

      console.error("MARK ALL READ ERROR:", err);

    }

  };


  return (

    <div className="relative" ref={containerRef}>

      <button
        onClick={handleOpen}
        className="relative rounded-lg p-2 text-slate-400 transition hover:bg-ink-800 hover:text-white"
        aria-label="Notifications"
      >
        <Bell size={19} />

        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}

      </button>

      {open && (

        <div className={`
          absolute top-full z-50 mt-2 w-80 max-w-[90vw] rounded-2xl border border-ink-700 bg-ink-900 shadow-xl shadow-black/40
          ${align === "left" ? "left-0" : "right-0"}
        `}>

          <div className="flex items-center justify-between border-b border-ink-700 p-3">

            <span className="text-sm font-semibold">Notifications</span>

            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs font-medium text-brand-400 hover:text-brand-300"
              >
                <Check size={12} />
                Mark all read
              </button>
            )}

          </div>

          <div className="max-h-80 overflow-y-auto">

            {loading ? (

              <p className="p-4 text-center text-sm text-slate-500">Loading...</p>

            ) : error ? (

              <p className="p-4 text-center text-sm text-red-400">{error}</p>

            ) : notifications.length === 0 ? (

              <p className="p-4 text-center text-sm text-slate-500">Nothing yet.</p>

            ) : (

              notifications.map((notification) => (

                <button
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`
                    flex w-full flex-col items-start gap-0.5 border-b border-ink-800 p-3 text-left transition last:border-0
                    ${notification.read ? "opacity-60" : "bg-brand-600/5"}
                    hover:bg-ink-800
                  `}
                >

                  <div className="flex w-full items-center gap-2">
                    {!notification.read && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                    )}
                    <span className="truncate text-sm font-medium">
                      {notification.title}
                    </span>
                  </div>

                  {notification.body && (
                    <p className="w-full truncate pl-3.5 text-xs text-slate-400">
                      {notification.body}
                    </p>
                  )}

                  <span className="pl-3.5 text-[11px] text-slate-500">
                    {timeAgo(notification.created_at)}
                  </span>

                </button>

              ))

            )}

          </div>

        </div>

      )}

    </div>

  );

}

export default NotificationBell;
