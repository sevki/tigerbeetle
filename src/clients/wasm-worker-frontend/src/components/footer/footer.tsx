import * as React from "react";

export interface FooterProps {
  companyName?: string;
  companyNumber?: string;
  companyNumberUrl?: string;
  className?: string;
  children?: React.ReactNode;
}

export default function Footer({
  companyName = "Devtools Ltd",
  companyNumber = "16372953",
  companyNumberUrl = "https://find-and-update.company-information.service.gov.uk/company/16372953",
  className = "",
  children,
}: FooterProps) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className={`text-muted-foreground text-center p-4 ${className}`}>
      {children ? (
        children
      ) : (
        <small>
          &copy; {currentYear} {companyName}. All rights reserved.
          <br />
          {companyName} is a limited company registered in England (№{" "}
          <a
            href={companyNumberUrl}
            className="text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {companyNumber}
          </a>
          ).
        </small>
      )}
    </footer>
  );
}
