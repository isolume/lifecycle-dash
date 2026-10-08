import Image from "next/image";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-black/10 bg-footer-bg">
      <div className="mx-auto flex min-h-[132px] max-w-[1500px] items-start justify-between gap-4 px-4 pt-5 pb-10 sm:px-8 sm:pt-6 sm:pb-11 lg:px-10">
        <Image
          src="/southern-company-logo-footer.svg"
          alt="Southern Company"
          width={263}
          height={37}
          className="block h-[30px] w-auto sm:h-[34px]"
        />
        <Link
          href="/methodology"
          className="text-sm font-medium text-white underline decoration-white/70 underline-offset-4 hover:decoration-white"
        >
          Methodology
        </Link>
      </div>
    </footer>
  );
}
