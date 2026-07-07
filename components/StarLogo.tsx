interface Props {
  size?: number;
}

// Four-pointed star (sparkle) logo — inline SVG so it stays crisp at any size.
export default function StarLogo({ size = 30 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Content OS"
      style={{ display: 'block' }}
    >
      <path d="M50 3 Q53.5 46.5 97 50 Q53.5 53.5 50 97 Q46.5 53.5 3 50 Q46.5 46.5 50 3 Z" fill="#6466E9" />
    </svg>
  );
}
