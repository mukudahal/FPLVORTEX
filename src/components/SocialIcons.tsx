export function YouTubeBrandLogo({ size = 18 }: { size?: number }) {
  const height = Math.round(size * 0.72);
  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 28 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="vx-social-svg vx-social-svg--yt"
    >
      <path
        d="M27.4 3.12A3.51 3.51 0 0 0 24.93.64C22.75.05 14 .05 14 .05S5.25.05 3.07.64A3.51 3.51 0 0 0 .6 3.12C.02 5.31.02 10 .02 10s0 4.69.58 6.88a3.51 3.51 0 0 0 2.47 2.48c2.18.59 10.93.59 10.93.59s8.75 0 10.93-.59a3.51 3.51 0 0 0 2.47-2.48c.58-2.19.58-6.88.58-6.88s0-4.69-.58-6.88Z"
        fill="#FF0000"
      />
      <path d="M11.2 14.28V5.72L18.48 10l-7.28 4.28Z" fill="#FFFFFF" />
    </svg>
  );
}

export function XBrandLogo({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="vx-social-svg vx-social-svg--x"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}
