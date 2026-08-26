import { useState } from "react";
import { Copy, Check, ExternalLink, MessageSquare } from "lucide-react";

function PublicLinkCard({
  business,
  path = "/talk",
  title = (<><MessageSquare size={20} /> Your Public Chat Link</>),
  description = "Share this link anywhere — your website, texts, a QR code — so customers can chat with Atlas directly, no login needed."
}) {

  const [copied, setCopied] = useState(false);

  if (!business?.slug) {
    return null;
  }

  const link = `${window.location.origin}${path}/${business.slug}`;

  const handleCopy = async () => {

    try {

      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);

    } catch (error) {

      console.error("COPY LINK ERROR:", error);

    }

  };

  return (

    <div className="rounded-2xl border border-ink-700 bg-ink-900/60 p-6">

      <h2 className="text-xl font-bold flex items-center gap-2">
        {title}
      </h2>

      <p className="mt-2 text-sm text-slate-400">
        {description}
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">

        <div className="min-w-0 flex-1 truncate rounded-lg border border-ink-700 bg-ink-800 p-3 text-sm text-slate-300">
          {link}
        </div>

        <div className="flex shrink-0 gap-2">

          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500"
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? "Copied" : "Copy"}
          </button>

          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold transition hover:bg-ink-800"
          >
            <ExternalLink size={15} />
            Preview
          </a>

        </div>

      </div>

    </div>

  );

}

export default PublicLinkCard;
