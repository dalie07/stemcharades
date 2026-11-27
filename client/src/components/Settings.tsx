import { useEffect, useRef, useState } from "react";
import { useSettings, type ThemeChoice } from "../state/settings";

const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "Like my device" },
  { value: "light", label: "Whiteboard" },
  { value: "dark", label: "Chalkboard" },
];

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex min-h-12 items-center justify-between gap-4">
      <span>
        <span className="block font-hand text-xl">{label}</span>
        {hint && <span className="block text-sm text-ink-muted">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-6 w-11 accent-[var(--accent)]" />
    </label>
  );
}

/** A small gear in the corner that opens the board, sound and vibration settings. */
export function SettingsButton() {
  const [open, setOpen] = useState(false);
  const { theme, sound, vibration, set } = useSettings();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Settings"
        onClick={() => setOpen(true)}
        className="corner-top fixed right-3 z-20 grid h-11 w-11 place-items-center rounded-full bg-surface text-xl text-ink shadow"
      >
        ⚙
      </button>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        aria-labelledby="settings-title"
        className="m-auto w-[min(92vw,24rem)] rounded-2xl bg-surface p-5 text-left text-ink backdrop:bg-black/50"
      >
        <h2 id="settings-title" className="font-chalk text-3xl">
          Settings
        </h2>
        <fieldset className="mt-4">
          <legend className="font-hand text-xl">Board</legend>
          <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Board">
            {THEMES.map((t) => (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={theme === t.value}
                onClick={() => set({ theme: t.value })}
                className={`min-h-12 rounded-xl border-2 px-2 text-sm ${theme === t.value ? "border-accent bg-surface-2" : "border-line"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="mt-4 space-y-2">
          <Toggle label="Sound" hint="Ticks, chimes and buzzers" checked={sound} onChange={(v) => set({ sound: v })} />
          <Toggle label="Vibration" hint="On phones that support it" checked={vibration} onChange={(v) => set({ vibration: v })} />
        </div>
        <button type="button" onClick={() => setOpen(false)} className="mt-5 min-h-12 w-full rounded-2xl bg-accent font-hand text-xl text-accent-ink">
          Done
        </button>
      </dialog>
    </>
  );
}
