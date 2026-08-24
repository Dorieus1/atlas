function EmptyState({ icon: Icon, title, description }) {

  return (

    <div className="flex flex-col items-center justify-center py-10 text-center">

      {Icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-ink-700 bg-ink-800/60 text-slate-500">
          <Icon size={22} />
        </div>
      )}

      <p className="font-medium text-slate-300">
        {title}
      </p>

      {description && (
        <p className="mt-1 max-w-xs text-sm text-slate-500">
          {description}
        </p>
      )}

    </div>

  );

}

export default EmptyState;
