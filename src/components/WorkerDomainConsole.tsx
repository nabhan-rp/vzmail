import {
  CheckCircle2,
  Copy,
  Download,
  Globe,
  Plus,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Language } from '../data/i18n';
import { getOrSeedDomains, saveDomainOption } from '../utils/localMailDb';
import type { MailDomainOption } from '../utils/mailIdentity';

interface WorkerDomainConsoleProps {
  lang: Language;
  username: string;
}

const WORKER_DEPLOY_SNIPPET = `// cloudflare/worker-mail-links.ts (2-in-1 Worker: mail.vz.gay + links.vz.gay + *.imy.li)
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();

    // 1. Shortlink Redirector: imy.li/s/$URL
    if (url.pathname.startsWith('/s/')) {
      const slug = url.pathname.replace(/^\\/s\\//, '').split('/')[0];
      const target = await env.LINKS_KV.get(\`short:\${slug}\`, 'text');
      if (target) return Response.redirect(target, 301);
    }

    // 2. Wildcard Static Link-in-Bio: $USERNAME.imy.li (Zero Cookie Collision)
    if (host.endsWith('.imy.li') && host !== 'www.imy.li') {
      const resp = await env.ASSETS.fetch(request);
      const headers = new Headers(resp.headers);
      headers.delete('Set-Cookie');
      return new Response(resp.body, { status: resp.status, headers });
    }

    return env.ASSETS.fetch(request);
  },

  // 3. Inbound Cloudflare Email Routing -> Ephemeral Pop-and-Purge Queue
  async email(message, env) {
    const [local, domain] = message.to.toLowerCase().split('@');
    const [base, plusTag] = local.split('+');
    const canonicalUser = base.replace(/\\./g, '');
    const id = \`\${Date.now()}-\${Math.random().toString(36).slice(2, 8)}\`;

    await env.MAIL_TRANSIT_KV.put(
      \`q:\${canonicalUser}:\${id}\`,
      JSON.stringify({
        id,
        canonicalUser,
        fromAddress: message.from,
        toAddress: message.to,
        plusTag: plusTag || null,
        subject: message.headers.get('subject') || '(No Subject)',
        bodyText: await new Response(message.raw).text(),
        receivedAt: new Date().toISOString(),
      }),
      { expirationTtl: 72 * 3600 }
    );
  }
};`;

const WRANGLER_ROUTES_SNIPPET = `name = "vz-mail-and-links"
main = "cloudflare/worker-mail-links.ts"
compatibility_date = "2025-01-01"

routes = [
  { pattern = "mail.vz.gay/*", zone_name = "vz.gay" },
  { pattern = "links.vz.gay/*", zone_name = "vz.gay" },
  { pattern = "imy.li/*", zone_name = "imy.li" },
  { pattern = "*.imy.li/*", zone_name = "imy.li" }
]

[[send_email]]
name = "SEND_EMAIL"

[[kv_namespaces]]
binding = "MAIL_TRANSIT_KV"
id = "<EPHEMERAL_TRANSIT_KV_ID>"

[[kv_namespaces]]
binding = "LINKS_KV"
id = "<SHORTLINKS_KV_ID>"`;

export function WorkerDomainConsole({
  lang,
  username,
}: WorkerDomainConsoleProps) {
  const [domains, setDomains] = useState<MailDomainOption[]>([]);
  const [newDomainInput, setNewDomainInput] = useState('');
  const [copiedMsg, setCopiedMsg] = useState<string | null>(null);

  const loadDomains = async () => {
    const list = await getOrSeedDomains();
    setDomains(list);
  };

  useEffect(() => {
    loadDomains();
  }, []);

  const flashCopied = (text: string) => {
    setCopiedMsg(text);
    window.setTimeout(() => setCopiedMsg(null), 3000);
  };

  const handleToggleDomainStatus = async (item: MailDomainOption) => {
    if (item.isPrimaryDefault) return;
    const nextStatus =
      item.status === 'active' ? 'ready_to_add' : 'active';
    await saveDomainOption({ ...item, status: nextStatus });
    await loadDomains();
    flashCopied(
      `${item.domain} -> ${nextStatus === 'active' ? 'Active in Production Registry' : 'Paused'}`
    );
  };

  const handleAddFutureDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newDomainInput
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '');
    if (!cleaned || !cleaned.includes('.')) return;

    const tld = '.' + cleaned.split('.').slice(-1)[0];
    const opt: MailDomainOption = {
      domain: cleaned,
      tld,
      status: 'ready_to_add',
      isPrimaryDefault: false,
      registryLabel: `Custom Production Expansion (${tld})`,
      deliverabilityNote: {
        id: 'Domain tambahan yang didaftarkan siap dihubungkan ke Cloudflare Email Routing & Workers.',
        en: 'Additional domain registered for Cloudflare Email Routing & Workers expansion.',
      },
      supportsBioSubdomain: true,
      supportsShortlinkPath: true,
      addedAt: new Date().toISOString().slice(0, 10),
    };
    await saveDomainOption(opt);
    setNewDomainInput('');
    await loadDomains();
    flashCopied(`Domain ${cleaned} ditambahkan ke registry.`);
  };

  const handleCopy = (label: string, code: string) => {
    navigator.clipboard?.writeText(code).catch(() => {});
    flashCopied(`${label} disalin ke clipboard.`);
  };

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-8 space-y-8">
      {copiedMsg && (
        <div className="bg-slate-900 dark:bg-blue-950 text-white border border-slate-700 dark:border-blue-800 rounded-lg px-4 py-2.5 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{copiedMsg}</span>
        </div>
      )}

      {/* Header */}
      <div className="space-y-2">
        <div className="text-xs font-mono text-slate-500">
          <span>2-in-1 Cloudflare Worker</span>
          <span aria-hidden="true"> · </span>
          <span>mail.vz.gay + links.vz.gay + *.imy.li</span>
          <span aria-hidden="true"> · </span>
          <span>Zero VPS Architecture</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-display">
          {lang === 'id'
            ? 'Konsol Domain @imy.li, DNS Deliverability & Cloudflare Worker'
            : '@imy.li Domain Registry, DNS Deliverability & Cloudflare Worker'}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-[75ch]">
          {lang === 'id'
            ? 'Saat ini produksi berfokus pada @imy.li sebagai domain utama (reputasi SWITCH bersih). Anda dapat menambah atau mengaktifkan domain baru kapan saja seiring pertumbuhan pengguna, sambil menyebarkan mail.vz.gay dan links.vz.gay dari 1 Cloudflare Worker.'
            : 'Production launches focused on @imy.li (clean SWITCH registry reputation). You can register and toggle additional domains anytime as the network grows while deploying mail.vz.gay and links.vz.gay from one unified Cloudflare Worker.'}
        </p>
      </div>

      {/* Section 1: Extensible Live Domain Registry */}
      <section className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
              {lang === 'id'
                ? 'Registry Domain Email & Identitas (Ekspansi Bertahap)'
                : 'Email & Identity Domain Registry (Grow-As-You-Go)'}
            </h2>
          </div>

          <form
            onSubmit={handleAddFutureDomain}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={newDomainInput}
              onChange={(e) => setNewDomainInput(e.target.value)}
              placeholder="domainbaru.pm / brand.id"
              className="px-3 py-1.5 text-xs font-mono bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{lang === 'id' ? 'Tambah Domain' : 'Add Domain'}</span>
            </button>
          </form>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#232732] text-slate-500">
                <th className="py-2.5 pr-4 font-medium">Domain</th>
                <th className="py-2.5 px-4 font-medium">Registry & Catatan</th>
                <th className="py-2.5 px-4 font-medium">Identitas & Rute</th>
                <th className="py-2.5 px-4 font-medium">Status</th>
                <th className="py-2.5 pl-4 text-right font-medium">Kontrol</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-[#232732]">
              {domains.map((item) => (
                <tr key={item.domain} className="h-12">
                  <td className="py-3 pr-4 font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                    @{item.domain}
                    {item.isPrimaryDefault && (
                      <div className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">
                        Primary Launch Domain
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 max-w-md">
                    <div className="font-medium text-slate-800 dark:text-slate-200">
                      {item.registryLabel}
                    </div>
                    <div className="text-slate-500 dark:text-slate-400">
                      {item.deliverabilityNote[lang]}
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    <div>
                      {username}@{item.domain}
                    </div>
                    {item.supportsBioSubdomain && (
                      <div>
                        {username}.{item.domain} · {item.domain}/s/*
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono whitespace-nowrap">
                    {item.status === 'active' ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                        Active
                      </span>
                    ) : (
                      <span className="text-slate-500">Ready to Enable</span>
                    )}
                  </td>
                  <td className="py-3 pl-4 text-right whitespace-nowrap">
                    {item.isPrimaryDefault ? (
                      <span className="text-[11px] font-mono text-slate-400">
                        Locked Default
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleToggleDomainStatus(item)}
                        className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        {item.status === 'active' ? 'Pause' : 'Enable Now'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 2: DNS Records & Deliverability Checklist for imy.li */}
      <section className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
            DNS &amp; Deliverability Blueprint (`imy.li` + `vz.gay`)
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#232732] text-slate-500 font-sans">
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 px-4">Host / Name</th>
                <th className="py-2 px-4">Target / Value</th>
                <th className="py-2 pl-4">Fungsi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-[#232732] text-[11px]">
              <tr className="h-10">
                <td className="py-2 pr-4 font-bold text-blue-600 dark:text-blue-400">
                  MX
                </td>
                <td className="py-2 px-4">imy.li</td>
                <td className="py-2 px-4">
                  route1.mx.cloudflare.net (prio 10) · route2/route3
                </td>
                <td className="py-2 pl-4 font-sans text-slate-500">
                  Catch-All Email Routing -&gt; Worker `email()`
                </td>
              </tr>
              <tr className="h-10">
                <td className="py-2 pr-4 font-bold text-blue-600 dark:text-blue-400">
                  TXT (SPF)
                </td>
                <td className="py-2 px-4">imy.li</td>
                <td className="py-2 px-4">
                  v=spf1 include:_spf.mx.cloudflare.net ~all
                </td>
                <td className="py-2 pl-4 font-sans text-slate-500">
                  Otorisasi pengiriman Cloudflare Email Sending
                </td>
              </tr>
              <tr className="h-10">
                <td className="py-2 pr-4 font-bold text-blue-600 dark:text-blue-400">
                  TXT (DMARC)
                </td>
                <td className="py-2 px-4">_dmarc.imy.li</td>
                <td className="py-2 px-4">
                  v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s;
                </td>
                <td className="py-2 pl-4 font-sans text-slate-500">
                  Proteksi anti-spoofing ketat untuk reputasi @imy.li
                </td>
              </tr>
              <tr className="h-10">
                <td className="py-2 pr-4 font-bold text-emerald-600 dark:text-emerald-400">
                  CNAME
                </td>
                <td className="py-2 px-4">*.imy.li</td>
                <td className="py-2 px-4">
                  vz-mail-and-links.workers.dev (Proxied Orange Cloud)
                </td>
                <td className="py-2 pl-4 font-sans text-slate-500">
                  Wildcard SSL otomatis untuk $USERNAME.imy.li Bio
                </td>
              </tr>
              <tr className="h-10">
                <td className="py-2 pr-4 font-bold text-emerald-600 dark:text-emerald-400">
                  ROUTE
                </td>
                <td className="py-2 px-4">
                  mail.vz.gay/* · links.vz.gay/* · imy.li/s/*
                </td>
                <td className="py-2 px-4">vz-mail-and-links (2-in-1 Worker)</td>
                <td className="py-2 pl-4 font-sans text-slate-500">
                  Menyatukan VZ Mail, VZ Links &amp; Shortlinks dalam 1 deploy
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 3: Copy-Ready 2-in-1 Cloudflare Worker & Wrangler Config */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-[#232732] flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-mono font-semibold text-slate-800 dark:text-slate-200">
              <Server className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>cloudflare/worker-mail-links.ts</span>
            </div>
            <button
              type="button"
              onClick={() => handleCopy('Worker Code', WORKER_DEPLOY_SNIPPET)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Worker</span>
            </button>
          </div>
          <pre className="p-4 text-[11px] font-mono text-slate-800 dark:text-slate-200 bg-[#FAFAFA] dark:bg-[#0B0D11] overflow-x-auto leading-relaxed">
            {WORKER_DEPLOY_SNIPPET}
          </pre>
        </div>

        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl overflow-hidden flex-1">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-[#232732] flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-slate-800 dark:text-slate-200">
                wrangler.toml (Multi-Route 2-in-1)
              </span>
              <button
                type="button"
                onClick={() =>
                  handleCopy('wrangler.toml', WRANGLER_ROUTES_SNIPPET)
                }
                className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </button>
            </div>
            <pre className="p-4 text-[11px] font-mono text-slate-800 dark:text-slate-200 bg-[#FAFAFA] dark:bg-[#0B0D11] overflow-x-auto leading-relaxed">
              {WRANGLER_ROUTES_SNIPPET}
            </pre>
          </div>

          <div className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-5 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs font-bold text-slate-900 dark:text-white font-display">
                Optional PHP Webhook Relay Reference
              </div>
              <div className="text-[11px] font-mono text-slate-500">
                cloudflare_imy_mail_links_relay.php.txt
              </div>
            </div>
            <a
              href="/cloudflare_imy_mail_links_relay.php.txt"
              download="cloudflare_imy_mail_links_relay.php.txt"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-[#1B202B] hover:bg-slate-200 rounded-lg whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download .php.txt</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
