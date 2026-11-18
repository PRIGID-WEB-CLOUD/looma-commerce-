import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";

export default function AdminRegisterPage() {
  const [storeName, setStoreName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const { user, loading: authLoading, refetch } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!authLoading && (user?.role === "ADMIN" || user?.role === "SUPER_ADMIN" || user?.role === "PLATFORM_ADMIN")) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  const previewSlug = storeName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "your-store";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setInfo("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/seller/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeName: storeName.trim(),
          name: name.trim(),
          email: email.trim(),
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Unable to create seller store. Please review your details.");
        setLoading(false);
        return;
      }

      if (data.token) {
        localStorage.setItem("luxe_admin_token", data.token);
      }
      if (data.slug) {
        document.cookie = `prigid_store_slug=${encodeURIComponent(data.slug)}; path=/; max-age=86400; SameSite=Lax`;
      }

      setInfo("Storefront created! Redirecting to your seller command center...");

      const host = typeof window !== "undefined" ? window.location.hostname : "";
      const isProdDomain = host === "prigidcommerce.com" || host.endsWith(".prigidcommerce.com");
      if (isProdDomain && data.canonicalUrl) {
        const target = data.canonicalUrl.endsWith("/seller")
          ? `${data.canonicalUrl}/dashboard`
          : `${data.canonicalUrl.replace(/\/$/, "")}/seller/dashboard`;
        window.location.href = target;
        return;
      }

      await refetch();
      navigate("/");
    } catch {
      setError("Network error while creating your store. Please try again.");
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0a0f0d] flex items-center justify-center">
        <div className="w-7 h-7 border-2 border-[#006c49] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex font-[Manrope]">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-[55%] flex-col bg-[#080e0b] relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "linear-gradient(#ffffff 1px,transparent 1px),linear-gradient(90deg,#ffffff 1px,transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="absolute top-[-120px] left-[-80px] w-[520px] h-[520px] bg-[#006c49] opacity-[0.12] rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-80px] right-[-60px] w-[360px] h-[360px] bg-[#006c49] opacity-[0.08] rounded-full blur-[100px] pointer-events-none" />

        <div className="relative z-10 p-12">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#006c49] rounded flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-[18px]">storefront</span>
            </div>
            <span className="text-white font-[Manrope] font-bold text-[13px] tracking-[0.22em] uppercase">Prigid Commerce</span>
          </div>
        </div>

        <div className="relative z-10 flex-1 flex flex-col justify-center px-16 pb-16">
          <div className="space-y-6 max-w-[440px]">
            <div className="inline-flex items-center gap-2 bg-[#006c49]/15 border border-[#006c49]/30 px-4 py-2 rounded-full">
              <span className="material-symbols-outlined text-[#4edea3] text-[14px]">rocket_launch</span>
              <span className="text-[#4edea3] text-[11px] font-bold tracking-[0.18em] uppercase">Multi-Tenant Onboarding</span>
            </div>
            <h1 className="font-serif text-white text-[42px] leading-[1.1] font-semibold">Launch your<br />own storefront.</h1>
            <p className="text-white/50 text-[15px] leading-relaxed">
              Every merchant receives an isolated database tenant, dedicated subdomain, custom branding suite, and omnichannel integrations.
            </p>
          </div>

          <div className="mt-14 max-w-[440px] space-y-5">
            <p className="text-white/30 text-[11px] font-bold tracking-[0.18em] uppercase">Included On Creation</p>
            {[
              { icon: "language", title: "Dedicated Subdomain", body: `Your store launches live at https://${previewSlug}.prigidcommerce.com` },
              { icon: "shield", title: "Isolated Merchant Data", body: "Products, orders, API keys, media, and customers remain strictly separated." },
              { icon: "payments", title: "Bring Your Own Gateways", body: "Connect Stripe, Paystack, Flutterwave, or PayPal directly in Settings." },
            ].map((item) => (
              <div key={item.icon} className="flex gap-4 items-start">
                <div className="w-8 h-8 rounded-full border border-[#006c49]/40 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[#4edea3] text-[16px]">{item.icon}</span>
                </div>
                <div>
                  <p className="text-white/80 font-bold text-sm mb-0.5">{item.title}</p>
                  <p className="text-white/35 text-xs leading-relaxed">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 px-12 py-8 border-t border-white/[0.06] flex items-center justify-between">
          <p className="text-white/25 text-[11px] tracking-widest uppercase">Instant Tenant Provisioning</p>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#4edea3] animate-pulse" />
            <span className="text-white/30 text-[11px]">Platform Ready</span>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 bg-[#f8f9ff] flex flex-col">
        <div className="lg:hidden flex items-center gap-3 p-8 border-b border-slate-100 bg-white">
          <div className="w-8 h-8 bg-[#006c49] rounded flex items-center justify-center">
            <span className="material-symbols-outlined text-white text-[18px]">storefront</span>
          </div>
          <span className="font-bold text-[13px] tracking-[0.22em] uppercase text-[#0a0f0d]">Prigid Commerce</span>
          <span className="ml-auto text-[10px] font-bold tracking-widest uppercase text-[#006c49] bg-[#006c49]/10 px-3 py-1 rounded-full">Create Store</span>
        </div>

        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-[440px] space-y-7">
            <div className="space-y-1.5">
              <h2 className="font-serif text-[30px] text-[#0a0f0d] font-semibold leading-tight">Create Your Store</h2>
              <p className="text-[#7c839b] text-sm">Set up your independent merchant portal in seconds.</p>
            </div>

            {error && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
                <span className="material-symbols-outlined text-red-500 text-[18px] shrink-0 mt-0.5">error</span>
                <p className="text-red-700 text-sm font-semibold">{error}</p>
              </div>
            )}

            {info && !error && (
              <div className="flex items-start gap-3 bg-[#f0faf6] border border-[#c3eed8] rounded-xl p-4">
                <span className="material-symbols-outlined text-[#006c49] text-[18px] shrink-0 mt-0.5">check_circle</span>
                <p className="text-[#006c49] text-sm font-semibold">{info}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-widest text-[#45464d]">Store Name</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="Atelier Solis"
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-sm outline-none focus:border-[#006c49] focus:ring-2 focus:ring-[#006c49]/10 transition-all placeholder:text-slate-300"
                />
                <p className="text-[11px] text-[#7c839b]">
                  Storefront URL: <span className="font-mono text-[#006c49] font-semibold">{previewSlug}.prigidcommerce.com</span>
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-widest text-[#45464d]">Owner Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Elena Rostova"
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-sm outline-none focus:border-[#006c49] focus:ring-2 focus:ring-[#006c49]/10 transition-all placeholder:text-slate-300"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-widest text-[#45464d]">Work Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="owner@yourboutique.com"
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-sm outline-none focus:border-[#006c49] focus:ring-2 focus:ring-[#006c49]/10 transition-all placeholder:text-slate-300"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-widest text-[#45464d]">Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-sm outline-none focus:border-[#006c49] focus:ring-2 focus:ring-[#006c49]/10 transition-all placeholder:text-slate-300"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#0a0f0d] text-white py-4 rounded-xl font-bold text-[12px] tracking-[0.18em] uppercase hover:bg-[#006c49] transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2.5 shadow-lg shadow-black/10"
              >
                {loading ? (
                  <><span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>Provisioning Store…</>
                ) : (
                  <><span className="material-symbols-outlined text-[16px]">store</span>Launch My Store</>
                )}
              </button>
            </form>

            <p className="text-center text-[12px] text-[#7c839b]">
              Already have a seller account?{" "}
              <Link href="/login" className="text-[#006c49] font-bold hover:underline">
                Sign In
              </Link>
            </p>
          </div>
        </div>

        <div className="px-8 py-5 border-t border-slate-100 bg-white">
          <p className="text-center text-[11px] text-slate-400">
            © {new Date().getFullYear()} Prigid Commerce — Multi-Tenant Seller Portal
          </p>
        </div>
      </div>
    </div>
  );
}
