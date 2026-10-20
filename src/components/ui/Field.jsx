// Labelled form controls. Inputs share one class string so forms look the same everywhere.
export const inputClass = 'min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-accent focus:outline-none';

export function Field({ label, hint, class: extra = '', children }) {
  return (
    <label class={`block text-sm ${extra}`}>
      <span class="mb-1 block font-medium">{label}</span>
      {children}
      {hint && <span class="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Input({ class: extra = '', ...rest }) {
  return <input class={`${inputClass} ${extra}`} {...rest} />;
}

export function Select({ options, class: extra = '', ...rest }) {
  return (
    <select class={`${inputClass} ${extra}`} {...rest}>
      {options.map((o) => <option value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** Toggle chips for picking several values (crops, districts). */
export function ChipPicker({ options, value, onChange }) {
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div class="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            type="button"
            aria-pressed={on}
            onClick={() => toggle(o.value)}
            class={`min-h-11 rounded-full border px-3 text-sm ${on ? 'border-brand bg-brand text-brand-ink' : 'border-line bg-surface hover:bg-soft'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Success / error line under a form or button. */
export function Notice({ notice }) {
  if (!notice) return null;
  return (
    <p role="status" class={`mt-2 rounded-lg px-3 py-2 text-sm ${notice.error ? 'bg-stop-soft text-ink' : 'bg-go-soft text-ink'}`}>
      {notice.error ? '✕ ' : '✓ '}{notice.text}
    </p>
  );
}
