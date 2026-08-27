import { Moon, Sun } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

function ThemeTogglePanel() {

  const { theme, setTheme } = useTheme();

  const options = [
    { key: "dark", label: "Dark", icon: Moon },
    { key: "light", label: "Light", icon: Sun }
  ];

  return (

    <div className="bg-surface/60 border border-border rounded-2xl p-6">

      <h2 className="text-2xl font-bold flex items-center gap-2">
        <Sun size={22} />
        Appearance
      </h2>

      <p className="mt-1 text-sm text-fg-faint">
        Choose how Atlas looks on this device.
      </p>

      <div className="mt-4 flex gap-3">

        {options.map((option) => {

          const Icon = option.icon;
          const isActive = theme === option.key;

          return (

            <button
              key={option.key}
              onClick={() => setTheme(option.key)}
              className={`
                flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition
                ${
                  isActive
                    ? "border-brand-500 bg-brand-600/10 text-accent-text"
                    : "border-border text-fg-muted hover:bg-surface-muted hover:text-fg"
                }
              `}
            >
              <Icon size={16} />
              {option.label}
            </button>

          );

        })}

      </div>

    </div>

  );

}

export default ThemeTogglePanel;
