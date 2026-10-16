import logoGns from "../assets/branding/gns-hairstudio-logo.png";

export default function BrandLogo({ className = "" }) {
  return (
    <img
      className={`brand-logo ${className}`.trim()}
      src={logoGns}
      alt="GNS Hair Studio"
    />
  );
}
