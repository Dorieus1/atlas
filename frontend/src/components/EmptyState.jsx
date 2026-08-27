function EmptyState({ icon: Icon, title, description, actionLabel, onAction }) {

  return (

    <div className="flex flex-col items-center justify-center py-10 text-center">

      {Icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface-muted/60 text-fg-faint">
          <Icon size={22} />
        </div>
      )}

      <p className="font-medium text-fg-muted">
        {title}
      </p>

      {description && (
        <p className="mt-1 max-w-xs text-sm text-fg-faint">
          {description}
        </p>
      )}

      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500"
        >
          {actionLabel}
        </button>
      )}

    </div>

  );

}

export default EmptyState;
