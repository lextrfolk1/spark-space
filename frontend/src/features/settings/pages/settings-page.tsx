import { Card } from "../../../components/shared/ui";
import { useNotebookStore } from "../../../store/notebook-store";
import { clsx } from "clsx";

const THEMES = [
  { id: "dark-sunset", label: "Sunset Dark", colors: ["#0c0e14", "#f2c96d"] },
  { id: "dark-ocean", label: "Oceanic Breeze", colors: ["#080f18", "#38bdf8"] },
  { id: "dark-forest", label: "Forest Emerald", colors: ["#050d0a", "#34d399"] },
  { id: "light-clean", label: "Clean Light", colors: ["#f8fafc", "#2563eb"] },
] as const;

const settingCards = [
  {
    title: "Execution Controls",
    body: "Timeouts, row limits, and notebook defaults are driven from YAML plus environment overrides.",
  },
  {
    title: "Storage Strategy",
    body: "Local and S3-compatible storage providers can back dataset uploads without changing the dataset contract.",
  },
  {
    title: "Rule Engine Readiness",
    body: "The editor speaks to a generic execution API so parser and planner swaps do not force a front-end redesign.",
  },
];

export function SettingsPage() {
  const { theme, setTheme } = useNotebookStore();

  return (
    <div className="space-y-6 w-full max-w-4xl mx-auto py-2">
      <div>
        <h1 className="text-xl font-bold font-display text-ink mb-1">Settings</h1>
        <p className="text-xs text-muted">Customize your interactive notebook experience and theme preferences.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Theme Card */}
        <Card className="p-5 md:col-span-2 space-y-4 bg-panel border-border">
          <div>
            <h3 className="font-display text-base font-semibold text-ink">Interface Theme</h3>
            <p className="text-xs text-muted mt-1">Select your preferred color scheme for the application workspace and code editors.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {THEMES.map((t) => {
              const isActive = theme === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={clsx(
                    "flex flex-col gap-2 p-3 rounded-xl border text-left transition-all duration-200 hover:scale-[1.01] select-none",
                    isActive
                      ? "border-accent bg-accent/[0.04] ring-1 ring-accent/25"
                      : "border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.04]"
                  )}
                >
                  <span className="text-xs font-semibold text-ink">{t.label}</span>
                  <div className="flex gap-1 mt-1">
                    <span className="w-4 h-4 rounded-full border border-white/10 shrink-0" style={{ backgroundColor: t.colors[0] }} />
                    <span className="w-4 h-4 rounded-full border border-white/10 shrink-0" style={{ backgroundColor: t.colors[1] }} />
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Info Card */}
        <Card className="p-5 space-y-3 bg-panel border-border flex flex-col justify-center">
          <p className="font-display text-base font-semibold text-ink">Extensible Platform</p>
          <p className="text-xs text-muted leading-relaxed">
            SparkSpace decouples the notebook editor layer from actual SQL and natural language pipeline execution, making it ready for future query strategies.
          </p>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {settingCards.map((card) => (
          <Card key={card.title} className="p-5 bg-panel border-border">
            <p className="font-display text-sm font-semibold text-ink">{card.title}</p>
            <p className="mt-2 text-xs text-muted leading-relaxed">{card.body}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

