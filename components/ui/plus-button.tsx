export const PlusButton = ({
    onClick,
    label,
    position = "left",
    disabled = false,
  }: {
    onClick: () => void;
    label: string;
    position?: "left" | "right";
    disabled?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`absolute top-1/2 z-10 transform -translate-y-1/2 bg-background border border-gray-300 shadow transition hover:bg-blue-100 active:scale-95 
        ${position === "left" ? "-left-10" : "-right-10"}
        rounded-full p-2 flex items-center justify-center`}
      style={{
        pointerEvents: disabled ? "none" : "auto",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <svg
        className="w-7 h-7 text-blue-600"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.25}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="11" stroke="currentColor" fill="white" />
        <path strokeLinecap="round" d="M12 8v8M8 12h8" />
      </svg>
    </button>
  );