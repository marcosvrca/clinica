type BrandLockupProps = {
  subtitle: string;
};

export function BrandLockup({ subtitle }: BrandLockupProps) {
  return (
    <div className="login-brand">
      <div className="brand-icon" aria-hidden>
        <img src="/favicon.svg" alt="" width={36} height={36} />
      </div>
      <div>
        <h1>mvFlow Psi</h1>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}
