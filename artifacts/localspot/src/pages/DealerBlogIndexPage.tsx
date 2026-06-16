import { useEffect } from "react";
import { Link } from "wouter";
import { DEALER_ARTICLES } from "./dealerBlogData";

function unsplashUrl(id: string, w = 800) {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=75`;
}

// ─── Shared dealer nav ────────────────────────────────────────────────────────
export function DealerBlogNav() {
  return (
    <header className="bg-[#0f1117] border-b-[3px] border-[#7C1C2E] sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/">
          <span className="font-['Bebas_Neue'] text-xl tracking-widest text-white cursor-pointer">
            My Town <span className="text-[#C8A882]">Postcard</span>
          </span>
        </Link>
        <nav className="flex items-center gap-6">
          <Link href="/">
            <span className="text-[#ccc] text-sm font-medium hover:text-white transition-colors cursor-pointer">
              Advertise
            </span>
          </Link>
          <Link href="/blog">
            <span className="text-[#ccc] text-sm font-medium hover:text-white transition-colors cursor-pointer">
              Advertiser Blog
            </span>
          </Link>
          <Link href="/dealers/blog">
            <span className="text-white text-sm font-medium cursor-pointer border-b border-[#C8952A] pb-0.5">
              Dealer Blog
            </span>
          </Link>
          <Link href="/dealers">
            <span className="bg-[#7C1C2E] hover:bg-[#5a1220] text-white text-sm font-semibold px-4 py-2 rounded-md transition-colors cursor-pointer">
              Become a Dealer
            </span>
          </Link>
        </nav>
      </div>
    </header>
  );
}

// ─── Article card ─────────────────────────────────────────────────────────────
function ArticleCard({ article }: { article: (typeof DEALER_ARTICLES)[number] }) {
  return (
    <article className="bg-white border border-[#E2DDD6] rounded-xl overflow-hidden flex flex-col group hover:shadow-lg hover:-translate-y-1 transition-all duration-200">
      <div className="h-48 overflow-hidden">
        <img
          src={unsplashUrl(article.unsplashId, 600)}
          alt={article.unsplashAlt}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />
      </div>
      <div className="p-7 flex flex-col flex-1">
        <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-[#C8952A] mb-2.5">
          {article.tag}
        </p>
        <h2 className="font-['Bebas_Neue'] text-2xl tracking-wide leading-tight text-[#0f1117] mb-3">
          {article.title}
        </h2>
        <p className="text-sm text-[#374151] leading-relaxed flex-1">{article.excerpt}</p>
        <div className="flex items-center justify-between mt-5 pt-4 border-t border-[#E2DDD6]">
          <span className="text-xs text-[#6B7280]">
            {article.date} &bull; {article.readMin} min read
          </span>
          <Link href={`/dealers/blog/${article.slug}`}>
            <span className="bg-[#7C1C2E] hover:bg-[#5a1220] text-white text-sm font-semibold px-4 py-2 rounded-md transition-colors cursor-pointer whitespace-nowrap ml-4">
              Read →
            </span>
          </Link>
        </div>
      </div>
    </article>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DealerBlogIndexPage() {
  useEffect(() => {
    document.title = "Dealer Resources — My Town Postcard";
  }, []);

  return (
    <div className="min-h-screen bg-[#F4F1ED]">
      <DealerBlogNav />

      {/* Hero */}
      <section className="bg-[#0f1117] border-b-[3px] border-[#7C1C2E] py-10 text-center px-6">
        <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#C8952A] mb-3">
          My Town Postcard — Dealer Resources
        </p>
        <h1 className="font-['Bebas_Neue'] text-6xl md:text-7xl tracking-wide text-white leading-none mb-3">
          The Dealer Playbook
        </h1>
        <p className="font-['Crimson_Pro'] italic text-lg text-[#bbb] max-w-lg mx-auto">
          Everything you need to launch, fill, and grow a postcard territory business in your town.
        </p>
      </section>

      {/* Grid */}
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {DEALER_ARTICLES.map((a) => (
            <ArticleCard key={a.slug} article={a} />
          ))}
        </div>
      </main>
    </div>
  );
}
