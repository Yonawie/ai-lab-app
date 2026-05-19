import type { SVGProps } from "react";

function baseIcon(props: SVGProps<SVGSVGElement>) {
  return {
    xmlns: "http://www.w3.org/2000/svg",
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
    ...props,
  };
}

export function UsersIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseIcon({ width: 20, height: 20, ...props })}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function UserCheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseIcon({ width: 20, height: 20, ...props })}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <polyline points="16 11 18 13 22 9" />
    </svg>
  );
}

export function TrendingUpIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseIcon({ width: 20, height: 20, ...props })}>
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

export function BookOpenIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseIcon({ width: 20, height: 20, ...props })}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

export function MoreHorizontalIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseIcon({ width: 16, height: 16, ...props })}>
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  );
}

export function AlertCircleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseIcon({ width: 16, height: 16, ...props })}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </svg>
  );
}

export function CheckCircle2Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseIcon({ width: 16, height: 16, ...props })}>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function ClockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseIcon({ width: 16, height: 16, ...props })}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export function ChevronRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseIcon({ width: 16, height: 16, ...props })}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function ArrowUpRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseIcon({ width: 16, height: 16, ...props })}>
      <path d="M7 17 17 7" />
      <polyline points="7 7 17 7 17 17" />
    </svg>
  );
}

export function ArrowDownRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseIcon({ width: 16, height: 16, ...props })}>
      <path d="m7 7 10 10" />
      <polyline points="17 7 17 17 7 17" />
    </svg>
  );
}
