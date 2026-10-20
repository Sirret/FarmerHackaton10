// Preact twin of shared/Button.astro.
const VARIANTS = {
  brand: 'bg-brand text-brand-ink hover:opacity-90',
  go: 'bg-go text-go-ink hover:opacity-90',
  stop: 'bg-stop text-stop-ink hover:opacity-90',
  ghost: 'bg-surface text-ink border border-line hover:bg-soft',
};

export default function Button({ variant = 'brand', class: extra = '', type = 'button', children, ...rest }) {
  return (
    <button
      type={type}
      class={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${extra}`}
      {...rest}
    >
      {children}
    </button>
  );
}
