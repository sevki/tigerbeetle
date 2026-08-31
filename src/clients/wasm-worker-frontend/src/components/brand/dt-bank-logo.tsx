export function DtBankLogo({
  className,
  markOnly = false,
}: {
  className?: string;
  markOnly?: boolean;
}) {
  return (
    <div className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <svg
        width="28"
        height="28"
        viewBox="0 0 28 28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect width="28" height="28" rx="4" className="fill-brand-green" />
        <path
          d="M6.5 6.5H12.2C15.6 6.5 18 9.2 18 14C18 18.8 15.6 21.5 12.2 21.5H6.5V6.5Z"
          fill="white"
          fillOpacity="0.35"
        />
        <path
          d="M5.5 6.5H11C14.3 6.5 16.6 9.2 16.6 14C16.6 18.8 14.3 21.5 11 21.5H5.5V6.5Z"
          fill="white"
        />
        <path
          d="M8.9 9.3H10.7C12.5 9.3 13.7 11 13.7 14C13.7 17 12.5 18.7 10.7 18.7H8.9V9.3Z"
          className="fill-brand-green"
        />
        <path
          d="M15.6 6.5H21.5V9.1H19.6V21.5H17.5V9.1H15.6V6.5Z"
          fill="white"
        />
      </svg>
      {!markOnly && (
        <span className="text-xl font-extrabold tracking-tight text-brand-dark dark:text-foreground">
          Bank
        </span>
      )}
    </div>
  );
}
