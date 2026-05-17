type WVisionLogoProps = {
  className?: string;
};

export default function WVisionLogo({ className }: WVisionLogoProps) {
  return (
    <img
      src="/wvision-logo.png"
      alt="WVision"
      className={className}
      loading="eager"
      decoding="async"
    />
  );
}
