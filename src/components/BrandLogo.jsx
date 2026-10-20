import logoGns from "../assets/branding/gns-hairstudio-logo.webp";

export default function BrandLogo({ className = "" }) {
  return (
    <img
      className={`brand-logo ${className}`.trim()}
      src={logoGns}
      alt="GNS Hair Studio"
      width="720"
      height="540"
    />
  );
}
