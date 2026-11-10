"use client";
/**
 * Editor del horario de atención.
 *
 * "Always open" = el bot atiende a toda hora. "Scheduled" = el dueño elige qué días trabaja y de qué hora a
 * qué hora (un turno puede cruzar la medianoche, p. ej. 18:00–02:00). Atajos: lunes a domingo, lunes a
 * viernes y lunes a sábado. Fuera de horario el bot responde con cuándo abre y cierra, y no toma pedidos.
 * Se guarda con la función de la base set_business_hours() (valida todo otra vez en el servidor).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormAlert, SubmitButton } from "@/components/forms/form-feedback";
import { notify } from "@/components/feedback/notify";
import { saveHours } from "@/features/settings/actions/hours";
import { cn } from "@/lib/utils";

export type DayState = { weekday: number; isOpen: boolean; opensAt: string; closesAt: string };

const NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const PRESETS = [
  { label: "Monday to Sunday", days: [1, 2, 3, 4, 5, 6, 7] },
  { label: "Monday to Saturday", days: [1, 2, 3, 4, 5, 6] },
  { label: "Monday to Friday", days: [1, 2, 3, 4, 5] },
];

export function HoursEditor({ initialEnabled, initialDays }: { initialEnabled: boolean; initialDays: DayState[] }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [days, setDays] = useState<DayState[]>(initialDays);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const update = (weekday: number, change: Partial<DayState>) => setDays((current) => current.map((day) => (day.weekday === weekday ? { ...day, ...change } : day)));

  function applyPreset(open: number[]) {
    const model = days.find((day) => day.isOpen) ?? days[0];
    setDays((current) => current.map((day) => ({ ...day, isOpen: open.includes(day.weekday), opensAt: model?.opensAt ?? "09:00", closesAt: model?.closesAt ?? "18:00" })));
  }

  function onSave() {
    setError(null);
    startTransition(async () => {
      const result = await saveHours({ enabled, days: days.map((d) => ({ weekday: d.weekday, isOpen: d.isOpen, opensAt: d.isOpen ? d.opensAt : null, closesAt: d.isOpen ? d.closesAt : null })) });
      if (!result.ok) return setError(result.error);
      notify.success(result.message ?? "Saved");
      router.refresh();
    });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      {error ? <FormAlert>{error}</FormAlert> : null}

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">When do you take orders?</legend>
        {[
          { value: false, title: "Always open", text: "The bot answers and takes orders at any hour." },
          { value: true, title: "Set my hours", text: "Choose the days and hours. Outside them the bot tells customers when you open." },
        ].map((option) => (
          <label key={String(option.value)} className={cn("flex cursor-pointer gap-3 rounded-lg border p-4", enabled === option.value ? "border-black" : "border-border hover:bg-canvas")}>
            <input type="radio" name="mode" checked={enabled === option.value} onChange={() => setEnabled(option.value)} className="mt-1 size-4 accent-black" />
            <span>
              <span className="block text-sm font-semibold text-fg">{option.title}</span>
              <span className="block text-xs text-fg-muted">{option.text}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {enabled ? (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Shortcuts">
            {PRESETS.map((preset) => (
              <Button key={preset.label} type="button" variant="outline" size="sm" onClick={() => applyPreset(preset.days)}>
                {preset.label}
              </Button>
            ))}
          </div>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {days.map((day) => (
              <li key={day.weekday} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <label className="flex w-36 items-center gap-3 text-sm font-medium text-fg">
                  <input type="checkbox" checked={day.isOpen} onChange={(event) => update(day.weekday, { isOpen: event.target.checked })} className="size-4 rounded border-border accent-black" />
                  {NAMES[day.weekday - 1]}
                </label>
                {day.isOpen ? (
                  <div className="flex items-center gap-2 text-sm">
                    <label className="sr-only" htmlFor={`open-${day.weekday}`}>{NAMES[day.weekday - 1]} opens at</label>
                    <input id={`open-${day.weekday}`} type="time" step={300} value={day.opensAt} onChange={(event) => update(day.weekday, { opensAt: event.target.value })} className="h-9 rounded-lg border border-border px-2 outline-none focus:border-black" />
                    <span className="text-fg-muted">to</span>
                    <label className="sr-only" htmlFor={`close-${day.weekday}`}>{NAMES[day.weekday - 1]} closes at</label>
                    <input id={`close-${day.weekday}`} type="time" step={300} value={day.closesAt} onChange={(event) => update(day.weekday, { closesAt: event.target.value })} className="h-9 rounded-lg border border-border px-2 outline-none focus:border-black" />
                    {day.closesAt && day.opensAt && day.closesAt < day.opensAt ? (
                      <span className="inline-flex items-center gap-1 text-xs text-fg-muted"><Moon className="size-3.5" aria-hidden /> closes the next day</span>
                    ) : null}
                  </div>
                ) : (
                  <span className="text-sm text-fg-muted">Closed</span>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <div>
        <SubmitButton type="button" pending={isPending} onClick={onSave} className="sm:w-auto sm:px-8">Save hours</SubmitButton>
      </div>
    </div>
  );
}
