// Preact twin of shared/Card.astro, with an optional title row.
export default function Card({ title, actions, class: extra = '', children }) {
  return (
    <section class={`rounded-xl border border-line bg-surface p-4 shadow-sm ${extra}`}>
      {(title || actions) && (
        <div class="mb-3 flex flex-wrap items-center gap-2">
          {title && <h2 class="font-semibold">{title}</h2>}
          {actions && <div class="ml-auto flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
