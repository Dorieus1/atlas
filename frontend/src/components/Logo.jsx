function Logo({ size = 32, withWordmark = false, className = "" }) {

  return (

    <div className={`flex items-center gap-2.5 ${className}`}>

      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="atlas-logo-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fdba74" />
            <stop offset="1" stopColor="#ea580c" />
          </linearGradient>
        </defs>

        <rect width="32" height="32" rx="9" fill="url(#atlas-logo-grad)" />

        <path
          d="M16 8L23 23H19.2L17.6 19.4H14.4L12.8 23H9L16 8ZM16 13.6L14.8 16.4H17.2L16 13.6Z"
          fill="#08090d"
        />

      </svg>

      {withWordmark && (
        <span className="font-display text-xl font-bold tracking-tight">
          Atlas
        </span>
      )}

    </div>

  );

}

export default Logo;
