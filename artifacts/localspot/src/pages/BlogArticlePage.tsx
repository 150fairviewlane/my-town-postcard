import { useEffect } from "react";
import { Link } from "wouter";
import { ARTICLES, BlogNav } from "./BlogIndexPage";

// ─── Shared prose helpers ──────────────────────────────────────────────────────
function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-sans text-xl font-bold text-[#0f1117] mt-12 mb-4 pl-4 border-l-4 border-[#7C1C2E]">
      {children}
    </h2>
  );
}
function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-sans text-base font-bold text-[#374151] mt-8 mb-2">{children}</h3>
  );
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-5">{children}</p>;
}
function UL({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc ml-6 mb-5 space-y-2">{children}</ul>;
}
function LI({ children }: { children: React.ReactNode }) {
  return <li>{children}</li>;
}
function Callout({
  children,
  gold = false,
}: {
  children: React.ReactNode;
  gold?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-6 my-8 font-sans text-sm leading-relaxed ${
        gold
          ? "bg-[#fdf6e7] border border-[#e8d5a0] text-[#5a3e0a]"
          : "bg-[#f9eaed] border border-[#e8c4cc] text-[#5a1220]"
      }`}
    >
      {children}
    </div>
  );
}
function CalloutTitle({
  children,
  gold = false,
}: {
  children: React.ReactNode;
  gold?: boolean;
}) {
  return (
    <strong
      className={`block text-[11px] tracking-[0.12em] uppercase mb-2 font-bold ${
        gold ? "text-[#C8952A]" : "text-[#7C1C2E]"
      }`}
    >
      {children}
    </strong>
  );
}

// ─── Simple data table ────────────────────────────────────────────────────────
function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto my-7">
      <table className="w-full border-collapse font-sans text-sm">
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className="bg-[#0f1117] text-white text-left px-4 py-3 font-semibold tracking-wide"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`px-4 py-3 border-b border-[#E2DDD6] ${
                    i % 2 === 1 ? "bg-[#f7f5f2]" : ""
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ARTICLE 1 — The $199 Question: Is a Postcard Ad Worth It?
// ═══════════════════════════════════════════════════════════════════════════════
function Article1Body() {
  return (
    <>
      <P>
        You've probably been pitched every kind of advertising at least once. The radio spot. The
        local magazine. The Yelp upgrade. The Google ad package. And somewhere in that pile of
        disappointments, you learned to be skeptical — which is healthy. So when someone tells you
        a postcard ad reaching 5,000 households starts at $199, the right question is: does this
        actually work, or is it just another way to spend money I won't get back?
      </P>
      <P>
        The honest answer is: it depends on your business. Not in a hand-wavy way — in a specific,
        calculable way. Let's run the numbers for a few common business types so you can decide for
        yourself.
      </P>

      <H2>The Only Math That Matters: Cost Per New Customer</H2>
      <P>
        Forget impressions, reach, and engagement. The only number that matters for a local
        business is how much you spend to acquire a paying customer. Everything else is noise.
      </P>
      <P>
        A postcard delivered to 5,000 households will generate a response rate somewhere between
        1% and 5% depending on your offer, your industry, and how compelling your ad is. That's
        50 to 250 people who take some kind of action — visiting your website, calling, or walking
        in. Of those, a percentage become actual customers. Let's use conservative numbers:
      </P>
      <DataTable
        headers={["Business Type", "Ad Cost", "Response Rate", "New Customers", "Cost Per Customer"]}
        rows={[
          ["Restaurant (with coupon)", "$199", "2% (100 visits)", "80 tables", "$2.49"],
          ["HVAC / Plumber", "$299", "0.5% (25 calls)", "8 jobs", "$37"],
          ["Dental (new patient offer)", "$299", "0.5% (25 inquiries)", "5 new patients", "$60"],
          ["Hair Salon", "$199", "1% (50 inquiries)", "15 new clients", "$13"],
          ["Real Estate Agent", "$499", "0.3% (15 contacts)", "1–2 listings", "$250–500"],
        ]}
      />
      <P>
        Now compare those numbers to what you're probably paying elsewhere. The national average
        cost per lead from Facebook ads for home services is over $60. For dental, it's routinely
        $80–150 per lead — before you've converted them into a patient. A Google search ad click
        for a competitive local keyword can run $5–15 per click, with no guarantee of a call.
      </P>
      <P>
        The postcard doesn't look expensive by comparison. It looks cheap.
      </P>

      <H2>The Lifetime Value Multiplier</H2>
      <P>
        Cost per new customer is only half the equation. The other half is how much that customer
        is worth to you over time. This is where postcard advertising becomes genuinely compelling
        for the right businesses.
      </P>
      <P>
        Consider a dentist who pays $299 for an ad and converts five new patients. Each new dental
        patient is worth somewhere between $500 and $2,000 per year in recurring treatment,
        cleanings, and referrals. That $299 ad potentially generates $2,500 to $10,000 in lifetime
        revenue. The return on investment isn't 10x — it might be 30x or 50x.
      </P>
      <P>
        The same logic applies to any business where customers come back repeatedly: salons, HVAC
        companies with maintenance contracts, restaurants, gyms, pediatric practices. One postcard
        that brings in a loyal customer is worth far more than the cost of the ad.
      </P>

      <Callout gold>
        <CalloutTitle gold>The rule of thumb</CalloutTitle>
        If a single new customer is worth more than $100 to your business over their lifetime,
        postcard advertising almost certainly pays for itself. The higher your average customer
        lifetime value, the harder it is to lose money on a $199–$499 ad.
      </Callout>

      <H2>When Postcards Work Best</H2>
      <P>
        Direct mail performs best when three conditions are met: you serve customers who are defined
        by where they live, your average sale is meaningful (not a $5 transaction), and you have
        something specific to offer — a discount, a free consultation, a new patient special — that
        gives people a reason to act now rather than file you away for later.
      </P>
      <P>
        The businesses that see the strongest results are those who treat the postcard as a
        consistent presence rather than a one-time test. A restaurant that appears on the postcard
        every quarter becomes part of the community fabric. A contractor whose face and phone number
        show up regularly gets called when something breaks. Repetition builds trust in a way that
        a single ad — digital or physical — rarely does.
      </P>

      <H2>When Postcards Are a Harder Sell</H2>
      <P>
        There are businesses where the math is tighter. If your average transaction is under $20
        and customers don't return frequently, you'll need a strong volume response to justify the
        spend. If your service area is very narrow (a single apartment complex, for example) and
        doesn't align well with the postcard's geographic footprint, you may be paying to reach
        households who are too far away. And if you have no offer — nothing to motivate someone
        to act — the postcard becomes pure brand awareness, which has value but is harder to measure.
      </P>
      <P>
        In those cases, a smaller ad size and a strong coupon can still make sense. But go in with
        realistic expectations.
      </P>

      <Callout>
        <CalloutTitle>Bottom line</CalloutTitle>
        For most local service businesses — home services, healthcare, food, personal services,
        real estate — a postcard ad is one of the lowest-cost, most measurable ways to reach your
        neighbors. The $199 question usually answers itself once you run your own numbers.
      </Callout>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ARTICLE 2 — Why Your Facebook Ads Aren't Working
// ═══════════════════════════════════════════════════════════════════════════════
function Article2Body() {
  return (
    <>
      <P>
        You set the radius to five miles. You picked "homeowners" and "ages 30–65" and "interested
        in home improvement." You ran the ad for two weeks and spent $300. You got 47 clicks, three
        form fills, and zero actual jobs.
      </P>
      <P>
        Sound familiar? It does to most local business owners who've tried Facebook advertising in
        the last few years. And here's the thing — it's not because you did it wrong. It's because
        Facebook is structurally poorly suited for most local service businesses, and the platform
        has only gotten worse at it as it's scaled up.
      </P>
      <P>
        Understanding why helps you spend your marketing budget on things that actually work.
      </P>

      <H2>The Core Problem: Intent vs. Interruption</H2>
      <P>
        Facebook is an interruption platform. People are there to see photos of their friends'
        kids, argue about politics, and scroll past things they didn't ask to see. Your ad appears
        in that stream uninvited. The person who sees it wasn't looking for a plumber. They weren't
        thinking about their HVAC system. You interrupted something they were doing to show them
        something they didn't want.
      </P>
      <P>
        Compare that to Google search, where someone types "plumber near me" — they have intent,
        they want a result, and your ad appears at the moment of need. Google works for this reason.
        Facebook doesn't, because intent is absent.
      </P>
      <P>
        But Google has its own problem for local businesses: the cost. Competitive local keywords —
        "HVAC repair," "dentist near me," "emergency plumber" — can cost $10–30 per click in many
        markets. For a business owner without a dedicated marketing team optimizing campaigns daily,
        the budget gets chewed up fast with little to show for it.
      </P>

      <H2>Why Facebook Targeting Isn't as Local as You Think</H2>
      <P>
        Facebook lets you set a geographic radius, but the algorithm optimizes for engagement and
        conversions across your entire audience — not necessarily for the people physically closest
        to your business. You may be paying to reach people five miles away when your ideal
        customer is two streets over.
      </P>
      <P>
        More importantly, Facebook's targeting categories are self-reported and behavioral, not
        geographic. "Homeowner" is an interest category based on behavior signals, not an actual
        property record. "Ages 30–55" is accurate, but it doesn't tell you whether those people
        have a leaking roof, need a dentist, or are looking for a new restaurant to try. You're
        targeting a demographic, not a need.
      </P>

      <Callout>
        <CalloutTitle>The data</CalloutTitle>
        Meta's own advertising data shows that the average click-through rate for local service
        ads is 0.9%. That means 99.1% of the people who see your ad don't click. Of those who do
        click, only a fraction convert to actual customers. You're paying for a lot of people to
        ignore you.
      </Callout>

      <H2>What Actually Works for Local Businesses</H2>
      <P>
        The channels that consistently work for local service businesses share one characteristic:
        they reach people based on where they live, not what they clicked on last week.
      </P>
      <H3>Direct mail to every household in your area</H3>
      <P>
        EDDM — Every Door Direct Mail — is the USPS program that delivers to every household on a
        mail route with no mailing list required. A 9×12 postcard lands in every mailbox in your
        target neighborhood. No algorithm decides who sees it. No bid war drives up the cost. Every
        door gets one.
      </P>
      <P>
        The My Town Postcard co-op model makes this affordable for small businesses: 15 local
        advertisers share one oversized postcard, splitting the printing and postage costs. A spot
        starts at $199 for reach to 5,000 households — a fraction of what a solo direct mail
        campaign would cost.
      </P>
      <H3>Nextdoor and local Facebook groups (organic, not paid)</H3>
      <P>
        The irony is that Facebook's paid ads underperform for local businesses, but Facebook
        Groups — particularly buy/sell/trade groups and neighborhood groups — can be highly
        effective for free. A genuine post in a local group ("we're a family-owned HVAC company
        serving this area — happy to answer any questions about your system before the heat hits")
        generates trust and referrals that a paid ad never will.
      </P>
      <H3>Google Business Profile (free)</H3>
      <P>
        If you haven't fully optimized your Google Business Profile — photos, hours, services,
        regular posts, and actively requesting reviews — you're leaving the highest-intent local
        search traffic on the table for free. This should be the first thing you do before spending
        a dollar on any paid channel.
      </P>

      <H2>The Right Way to Think About Your Marketing Mix</H2>
      <P>
        The most effective local marketing strategies combine channels that serve different
        purposes. Google Business Profile captures people actively searching. Direct mail reaches
        people who aren't searching yet but live near you. Word of mouth and reviews convert the
        people who find you through either of those channels.
      </P>
      <P>
        Facebook paid ads can play a role — but for most local service businesses, it should be
        a small one, used for specific retargeting to people who've already visited your website
        rather than cold outreach. Using it as your primary customer acquisition channel is where
        most of the wasted spend happens.
      </P>

      <Callout gold>
        <CalloutTitle gold>The shift worth making</CalloutTitle>
        Move budget from Facebook cold advertising toward channels where geography is the
        primary targeting mechanism — direct mail, local SEO, Google Business optimization. You'll
        reach fewer people, but the people you reach will actually be your neighbors. That's the
        only audience that matters for a local business.
      </Callout>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ARTICLE 3 — 5 Types of Local Businesses That Get the Best Results
// ═══════════════════════════════════════════════════════════════════════════════
function Article3Body() {
  return (
    <>
      <P>
        Direct mail advertising isn't magic. It works extremely well for certain types of
        businesses and less well for others. The difference usually comes down to three factors:
        whether your customers are defined by geography, whether your average sale justifies the
        ad cost, and whether you have a compelling offer that gives people a reason to act.
      </P>
      <P>
        After running postcard campaigns across dozens of local markets, five business categories
        stand out as consistent performers — the ones where the phone reliably rings after the
        postcard hits mailboxes.
      </P>

      <H2>1. Home Services: HVAC, Plumbers, Electricians, Roofers</H2>
      <P>
        Home service companies are the single best fit for neighborhood postcard advertising, and
        the reason is simple: your customer is literally defined by their address. You don't serve
        the whole city — you serve a radius around your base. The postcard's geographic targeting
        is a direct match for your service area.
      </P>
      <P>
        The other reason home services works so well is timing. A homeowner who receives your
        postcard in March might not need you until July when their AC fails. But your name and
        number are on a 9×12 card that might still be stuck to their fridge. When the crisis
        happens — and in home services, it's always a crisis — you're the call they make.
      </P>
      <P>
        The best performing home service ads include a specific seasonal offer ("AC tune-up special
        — $89 before summer"), a clear phone number, and a service area note so readers know you
        actually serve their neighborhood.
      </P>

      <Callout gold>
        <CalloutTitle gold>Real talk</CalloutTitle>
        One HVAC company that advertised on a local postcard campaign reported that a single
        service call from the mailing led to a full system replacement — a $7,000 job — from a
        customer who had held onto the postcard for three months. The ad cost $299.
      </Callout>

      <H2>2. Dental and Medical Practices Accepting New Patients</H2>
      <P>
        Healthcare practices have a specific problem that postcard advertising solves well: they
        need patients who are physically nearby, they accept new patients on a rolling basis, and
        the lifetime value of a single patient is extremely high.
      </P>
      <P>
        A dentist who converts two new patients from a postcard campaign has likely generated
        $1,000–4,000 in first-year revenue and a recurring patient relationship worth thousands
        more over time. The math is almost always favorable — which is why you'll notice that
        dental offices are consistently among the most active direct mail advertisers in any market.
      </P>
      <P>
        The key for healthcare ads is the new patient offer: a free consultation, discounted
        first exam, or specific treatment special. People who aren't actively looking for a new
        dentist need a concrete reason to switch. A good offer provides that reason.
      </P>

      <H2>3. Restaurants — Especially with a Coupon</H2>
      <P>
        Restaurants are a natural fit because their entire business model is geographic. Nobody
        drives forty-five minutes for dinner at a casual local restaurant. Your customers live,
        work, or pass through your immediate area — and those are exactly the households the
        postcard reaches.
      </P>
      <P>
        What separates the restaurants that see strong results from those that don't is usually
        one thing: the offer. A postcard ad that says "Come visit us — great food!" generates
        mild awareness. A postcard ad that says "Buy one entrée, get one 50% off — valid through
        July" gives people a specific, time-bounded reason to choose your restaurant over the
        three others they could visit this weekend.
      </P>
      <P>
        Coupons also give you a measurable way to track the ad's performance. Count the coupons
        redeemed, multiply by your average check, and you can calculate your exact return on the
        ad spend. Most digital advertising can't give you that kind of direct attribution.
      </P>

      <H2>4. Salons, Spas, and Personal Services</H2>
      <P>
        Hair salons, nail salons, massage studios, and similar personal service businesses share
        a key characteristic with healthcare: once you have a customer, they tend to return
        regularly. A new salon client who likes her cut comes back every six weeks. That's eight
        visits a year, potentially for years. The lifetime value of a single new client is
        substantial.
      </P>
      <P>
        Personal service businesses also benefit from the "local discovery" dynamic. People often
        patronize the salon or spa closest to where they live or work out of pure convenience —
        they didn't find it on Google, they just noticed it exists. A postcard that lands in a
        nearby household announces your existence to people who might not have known you were there.
      </P>
      <P>
        New client offers work extremely well in this category: "$20 off your first visit" or
        "complimentary deep conditioning treatment with any haircut" give new customers a low-risk
        reason to try you for the first time.
      </P>

      <H2>5. Real Estate Agents and Mortgage Professionals</H2>
      <P>
        Real estate is a high-ticket, low-frequency purchase where name recognition matters
        enormously. Homeowners don't sell their house every year — but when they do, they call the
        agent whose name they've seen repeatedly. Consistent postcard presence builds exactly that
        kind of recognition over time.
      </P>
      <P>
        The typical real estate postcard strategy isn't about immediate conversion — it's about
        staying top of mind in a specific farm area. An agent who appears on the neighborhood
        postcard quarterly for two years becomes "the local real estate agent" in the minds of
        the households who've seen her face and name dozens of times. When they're ready to list,
        the call is almost automatic.
      </P>
      <P>
        For mortgage professionals and financial advisors, the same logic applies: direct mail
        builds credibility in a category where trust is everything, and physical mail reads as
        more substantive and professional than a Facebook ad.
      </P>

      <H2>The Common Thread</H2>
      <P>
        What all five of these business types share is a customer base defined primarily by
        geography, a lifetime customer value that easily justifies the ad cost, and a natural fit
        with the postcard format — which rewards consistent, repeated presence rather than one-time
        campaigns.
      </P>
      <P>
        If your business fits one of these categories, the question isn't really whether postcard
        advertising works. It's whether your competitors will claim the spot before you do.
      </P>

      <Callout>
        <CalloutTitle>Spots are limited</CalloutTitle>
        Each postcard has 15 ad spots total. Only one business per category is accepted — meaning
        if you're a dentist, your spot blocks every other dentist in the area from advertising on
        that mailing. Category exclusivity is first-come, first-served.
      </Callout>
    </>
  );
}

// ─── Slug → body component map ────────────────────────────────────────────────
const ARTICLE_BODIES: Record<string, React.ComponentType> = {
  "is-a-postcard-ad-worth-it": Article1Body,
  "facebook-ads-not-working": Article2Body,
  "best-businesses-for-direct-mail": Article3Body,
};

function unsplashUrl(id: string, w = 900) {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function BlogArticlePage({ params }: { params: { slug: string } }) {
  const article = ARTICLES.find((a) => a.slug === params.slug);
  const BodyComponent = article ? ARTICLE_BODIES[article.slug] : null;

  useEffect(() => {
    if (article) {
      document.title = `${article.title} — My Town Postcard`;
    }
  }, [article]);

  if (!article || !BodyComponent) {
    return (
      <div className="min-h-screen bg-[#F4F1ED]">
        <BlogNav />
        <div className="max-w-xl mx-auto px-6 py-32 text-center">
          <p className="font-['Bebas_Neue'] text-5xl text-[#0f1117] mb-4">Article not found</p>
          <Link href="/blog">
            <span className="text-[#7C1C2E] font-semibold cursor-pointer hover:underline">
              ← Back to Blog
            </span>
          </Link>
        </div>
      </div>
    );
  }

  const related = ARTICLES.filter((a) => a.slug !== article.slug);

  return (
    <div className="min-h-screen bg-[#F4F1ED]">
      <BlogNav />

      <main className="max-w-3xl mx-auto px-6 py-12 pb-24">
        {/* Back */}
        <Link href="/blog">
          <span className="inline-flex items-center gap-2 text-[#7C1C2E] font-semibold text-sm cursor-pointer hover:underline mb-10">
            ← Back to Blog
          </span>
        </Link>

        {/* Eyebrow + title */}
        <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#C8952A] mb-3">
          {article.tag}
        </p>
        <h1 className="font-['Bebas_Neue'] text-5xl md:text-6xl tracking-wide leading-tight text-[#0f1117] mb-5">
          {article.title}
        </h1>

        {/* Hero image */}
        <img
          src={unsplashUrl(article.unsplashId)}
          alt={article.unsplashAlt}
          className="w-full h-72 object-cover rounded-xl mb-8"
        />

        {/* Byline */}
        <p className="text-sm text-[#6B7280] mb-10 pb-6 border-b-2 border-[#E2DDD6]">
          <strong className="text-[#0f1117]">My Town Postcard</strong> &bull; {article.date} &bull;{" "}
          {article.readMin} min read
        </p>

        {/* Body */}
        <div className="font-['Crimson_Pro'] text-[19px] leading-[1.75] text-[#1a1e28]">
          <BodyComponent />
        </div>

        {/* Related articles */}
        {related.length > 0 && (
          <div className="mt-20 pt-10 border-t-2 border-[#E2DDD6]">
            <p className="font-['Bebas_Neue'] text-2xl tracking-wide text-[#0f1117] mb-6">
              Related Articles
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {related.map((rel) => (
                <Link key={rel.slug} href={`/blog/${rel.slug}`}>
                  <div className="bg-white border border-[#E2DDD6] rounded-xl overflow-hidden flex gap-4 p-4 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer group">
                    <img
                      src={unsplashUrl(rel.unsplashId, 200)}
                      alt={rel.unsplashAlt}
                      className="w-20 h-20 object-cover rounded-lg flex-shrink-0"
                    />
                    <div>
                      <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#7C1C2E] mb-1">
                        {rel.tag}
                      </p>
                      <p className="font-['Bebas_Neue'] text-base tracking-wide leading-tight text-[#0f1117] group-hover:text-[#7C1C2E] transition-colors">
                        {rel.title}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="bg-[#0f1117] rounded-2xl p-10 text-center mt-16">
          <p className="font-['Bebas_Neue'] text-4xl text-white tracking-wide mb-3">
            Ready to Reach 5,000 Households?
          </p>
          <p className="text-[#bbb] text-sm mb-6">
            Ad spots on the next postcard in your area start at $199. Only 15 spots total —
            and only one per business category.
          </p>
          <Link href={article.cta.href}>
            <span className="inline-block bg-[#7C1C2E] hover:bg-[#5a1220] text-white font-bold text-sm px-8 py-4 rounded-lg tracking-wide transition-colors cursor-pointer">
              {article.cta.label} →
            </span>
          </Link>
        </div>
      </main>
    </div>
  );
}
