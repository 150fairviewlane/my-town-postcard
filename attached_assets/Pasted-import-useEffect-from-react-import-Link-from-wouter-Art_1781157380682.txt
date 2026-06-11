import { useEffect } from "react";
import { Link } from "wouter";

// ─── Article metadata ──────────────────────────────────────────────────────────
// Add new articles here. The BlogArticlePage component reads the same array
// to render the article and related-articles section.
export const ARTICLES = [
  {
    slug: "eddm-vs-digital",
    tag: "Local Advertising",
    title: "Why EDDM Postcards Still Beat Digital for Local Businesses",
    excerpt:
      "Every door gets one. No algorithms, no ad blockers, no competing for attention in a feed. Here's why direct mail is quietly having its moment again — and why local businesses are winning with it.",
    date: "June 2026",
    readMin: 6,
    // Unsplash photo IDs — deterministic, free, no API key needed at render time
    unsplashId: "photo-1586769852044-692d6e3703f0", // mailbox / postal
    unsplashAlt: "Neighborhood mailboxes on a sunny street",
    cta: { label: "See Available Spots", href: "/" },
  },
  {
    slug: "start-local-ad-business",
    tag: "Dealer Opportunity",
    title: "How to Start a Local Advertising Business with No Sales Experience",
    excerpt:
      "You don't need a media sales background, a big upfront investment, or a talent for cold calling. Here's the blueprint for running a hyperlocal postcard business from your town — mostly on autopilot.",
    date: "June 2026",
    readMin: 8,
    unsplashId: "photo-1449824913935-59a10b8d2000", // town main street
    unsplashAlt: "Main street of a small American town",
    cta: { label: "Check Territory Availability", href: "/dealers" },
  },
  {
    slug: "numbers-breakdown",
    tag: "Business Model",
    title: "The EDDM Postcard Business Opportunity: A Real Numbers Breakdown",
    excerpt:
      "What does a sold-out postcard actually earn? What does it cost? And what's realistic for a dealer working their local market? We run the numbers so you can make an informed decision.",
    date: "June 2026",
    readMin: 7,
    unsplashId: "photo-1554224155-6726b3ff858f", // financial planning / notebook
    unsplashAlt: "Person reviewing financial planning documents",
    cta: { label: "See Dealer Details", href: "/dealers" },
  },
];

function unsplashUrl(id: string, w = 800) {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=75`;
}

// ─── Shared nav used by both blog pages ───────────────────────────────────────
export function BlogNav() {
  return (
    <header className="bg-[#0f1117] border-b-[3px] border-[#7C1C2E] sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/">
          <span className="font-['Bebas_Neue'] text-xl tracking-widest text-white cursor-pointer">
            My Town <span className="text-[#C8A882]">Postcard</span>
          </span>
        </Link>
        <nav className="flex items-center gap-6">
          <Link href="/blog">
            <span className="text-[#ccc] text-sm font-medium hover:text-white transition-colors cursor-pointer">
              Blog
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
function ArticleCard({ article }: { article: (typeof ARTICLES)[number] }) {
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
        <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-[#7C1C2E] mb-2.5">
          {article.tag}
        </p>
        <h2 className="font-['Bebas_Neue'] text-2xl tracking-wide leading-tight text-[#0f1117] mb-3">
          {article.title}
        </h2>
        <p className="text-sm text-[#374151] leading-relaxed flex-1">{article.excerpt}</p>
        <div className="flex items-center mt-5 pt-4 border-t border-[#E2DDD6]">
          <span className="text-xs text-[#6B7280]">
            {article.date} &bull; {article.readMin} min read
          </span>
          <Link href={`/blog/${article.slug}`}>
            <span className="ml-auto bg-[#7C1C2E] hover:bg-[#5a1220] text-white text-sm font-semibold px-4 py-2 rounded-md transition-colors cursor-pointer">
              Read →
            </span>
          </Link>
        </div>
      </div>
    </article>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function BlogIndexPage() {
  useEffect(() => {
    document.title = "Blog — My Town Postcard";
  }, []);

  return (
    <div className="min-h-screen bg-[#F4F1ED]">
      <BlogNav />

      {/* Hero */}
      <section className="bg-[#0f1117] border-b-[3px] border-[#7C1C2E] py-20 text-center px-6">
        <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#C8952A] mb-4">
          My Town Postcard — Resources
        </p>
        <h1 className="font-['Bebas_Neue'] text-6xl md:text-7xl tracking-wide text-white leading-none mb-4">
          The Local Advertising Playbook
        </h1>
        <p className="font-['Crimson_Pro'] italic text-lg text-[#bbb] max-w-lg mx-auto">
          Everything you need to know about EDDM postcards, local marketing, and
          building a business in your own backyard.
        </p>
      </section>

      {/* Grid */}
      <main className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {ARTICLES.map((a) => (
            <ArticleCard key={a.slug} article={a} />
          ))}
        </div>
      </main>
    </div>
  );
}
