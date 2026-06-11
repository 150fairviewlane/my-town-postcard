import { useEffect } from "react";
import { Link } from "wouter";
import { ARTICLES, BlogNav } from "./BlogIndexPage";

// ─── Shared article prose helpers ─────────────────────────────────────────────
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
function Callout({ children, gold = false }: { children: React.ReactNode; gold?: boolean }) {
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
function CalloutTitle({ children, gold = false }: { children: React.ReactNode; gold?: boolean }) {
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

// ─── Revenue table ─────────────────────────────────────────────────────────────
function RevTable({ rows, total }: { rows: string[][]; total: string[] }) {
  const headers = rows[0];
  const body = rows.slice(1);
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
          {body.map((row, i) => (
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
          <tr>
            {total.map((cell, j) => (
              <td
                key={j}
                className="px-4 py-3 bg-[#f9eaed] font-bold text-[#7C1C2E]"
              >
                {cell}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── Article bodies ────────────────────────────────────────────────────────────

function Article1Body() {
  return (
    <>
      <P>
        Ask any small business owner how they feel about Facebook ads and you'll get an earful. The
        targeting that used to work doesn't anymore. The costs keep rising. The results are harder
        to measure than ever. And every week there's a new platform demanding their attention.
      </P>
      <P>
        Meanwhile, the postcard sitting on a kitchen counter? Nobody's charging extra to show it to
        more people. There's no algorithm deciding whether it gets seen. It just sits there,
        working, until someone throws it away — and even then, 68% of people read every piece of
        direct mail before discarding it.
      </P>
      <P>
        That statistic isn't from 2005. It's from recent USPS consumer research. And it's why
        savvy local business owners are quietly shifting budget back to physical mail.
      </P>

      <H2>What EDDM Actually Is (And Why It's Different)</H2>
      <P>
        EDDM stands for Every Door Direct Mail. It's a USPS program that lets mailers send
        postcards to every household on a specific mail carrier route — no mailing list required.
        You pick the ZIP codes, the USPS delivers to every door.
      </P>
      <P>
        This is fundamentally different from targeted digital advertising. You're not trying to
        guess which Facebook users match your customer profile. You're reaching everyone in a
        geographic area — which, for a local service business, is exactly the right approach. Your
        customers are your neighbors. They live nearby. EDDM reaches all of them.
      </P>
      <P>
        The My Town Postcard model takes this a step further by turning a single mailer into a
        shared community resource: 15 local businesses share space on one oversized 9×12 postcard,
        each paying a fraction of what a solo mailer would cost, and all 5,000 households on the
        route receive it.
      </P>

      <H2>The Attention Economy Has a Physical Escape Hatch</H2>
      <P>
        Here's something worth sitting with: the average American sees between 4,000 and 10,000
        digital ads per day. Banner ads, pre-roll video, sponsored posts, retargeted product
        listings — all competing for the same eyeballs at the same moment.
      </P>
      <P>
        The result is banner blindness. People have trained themselves to not see digital ads. They
        scroll past them. They install blockers. Their attention drifts.
      </P>
      <P>
        Mail doesn't work that way. It's physical. It has to be picked up, looked at, and made a
        decision about. Nobody can "scroll past" a postcard. It requires an active choice to
        discard — and before that choice is made, it gets seen.
      </P>
      <Callout>
        <CalloutTitle>By the numbers</CalloutTitle>
        According to USPS research, direct mail achieves a 4.4% average response rate versus 0.12%
        for email. For local service businesses — contractors, dentists, restaurants, real estate
        agents — physical mail routinely outperforms digital on a cost-per-acquisition basis.
      </Callout>

      <H2>Why Local Businesses Specifically Benefit</H2>
      <P>
        Digital advertising is increasingly a game for brands with big budgets and dedicated
        marketing teams. Targeting options, creative testing, retargeting pixels, lookalike
        audiences — this machinery works, but it takes expertise and ongoing investment to operate
        well.
      </P>
      <P>
        A co-op postcard, by contrast, is simple: your ad, printed beautifully, delivered to 5,000
        households in your service area. No learning curve. No account manager. No weekly budget
        adjustments. Just presence in your community, in people's hands, repeatedly.
      </P>
      <P>
        And repetition is where direct mail earns its keep. Most purchases — especially for service
        businesses — don't happen immediately. Someone who gets your plumber's ad today might not
        need a plumber for six months. But when they do, they'll remember the postcard. They might
        even have kept it.
      </P>

      <H2>The Co-Op Advantage</H2>
      <P>
        The most common objection to direct mail is cost. A solo EDDM campaign to 5,000 homes —
        design, printing, postage, fulfillment — can easily run $3,000–$5,000. That's out of reach
        for most small businesses.
      </P>
      <P>
        The shared postcard model solves this entirely. When 15 businesses split the production and
        postage costs, each pays a fraction of what a solo mailer would cost. A Small ad on My Town
        Postcard starts at $199. That's less than the cost of a one-day Facebook campaign that most
        business owners can't measure.
      </P>
      <P>
        And because the postcard goes to every door in a defined area, advertisers don't need to
        know anything about digital targeting. They choose their size, upload their ad, and let the
        postcard do the work.
      </P>

      <H2>The Format Matters Too</H2>
      <P>
        A 9×12 postcard is large. Considerably larger than a typical piece of mail. It doesn't get
        lost in an envelope. It doesn't require opening. It commands attention the moment it comes
        out of the mailbox — which is the entire point.
      </P>
      <P>
        When that oversized postcard features beautiful, professional advertising from local
        businesses people actually recognize — the diner down the street, the HVAC company they've
        seen around town, the dentist in the nearby strip mall — it becomes something worth looking
        at. Not junk mail. A local business directory in print.
      </P>

      <H2>What This Means for Local Advertisers</H2>
      <P>If you're a local business owner trying to reach your community, the math is simple:</P>
      <UL>
        <LI>
          <strong>Digital ads</strong> are expensive, hard to measure, and increasingly ignored.
        </LI>
        <LI>
          <strong>Solo direct mail</strong> is effective but costs thousands per campaign.
        </LI>
        <LI>
          <strong>A co-op postcard</strong> gives you the reach of direct mail at a fraction of the
          cost, with zero technical overhead.
        </LI>
      </UL>
      <P>
        The best local advertisers treat the postcard like a recurring billboard in their
        neighbors' homes. They book a spot, renew it each mailing, and think of it as part of
        their fixed marketing budget rather than a one-time experiment. Over time, that consistency
        builds the kind of recognition that no algorithm can replicate.
      </P>
      <Callout gold>
        <CalloutTitle gold>Ready to advertise?</CalloutTitle>
        Find your town's current postcard campaign and reserve your ad spot. Spaces are limited to
        15 per postcard — and they fill up. Browse available spots at mytownpostcard.com.
      </Callout>
    </>
  );
}

function Article2Body() {
  return (
    <>
      <P>
        When most people hear "local advertising business," they picture a salesperson driving from
        business to business, pitching reluctant owners, and working entirely on commission. That
        model is exhausting, unpredictable, and increasingly outdated.
      </P>
      <P>
        The new version looks different. You claim a territory. You set up a landing page that does
        the selling. Local businesses find you online, browse the available ad sizes and prices, pay
        by credit card, and book their spot — all without a single phone call. You collect the
        revenue. The postcard gets printed and mailed.
      </P>
      <P>
        That's the My Town Postcard dealer model, and this article breaks down exactly how it
        works, who it's right for, and how to get started.
      </P>

      <H2>What a Dealer Actually Does</H2>
      <P>
        As a My Town Postcard dealer, you own the exclusive rights to sell advertising on the
        postcard in your territory. Your territory is defined by geography — typically a town or
        cluster of ZIP codes with a defined household count.
      </P>
      <P>
        Your primary job is getting local businesses to discover your postcard campaign. Once they
        find your landing page, the platform handles everything else: presenting ad sizes and
        pricing, collecting payment via Stripe, confirming the order, and logging the spot as sold.
        You never have to quote a price, send an invoice, or chase a payment.
      </P>
      <P>
        When the postcard fills up (or gets close), you notify My Town Postcard headquarters. They
        coordinate printing and EDDM delivery through the USPS. The postcard goes out. The
        businesses get the exposure they paid for. You move on to filling the next issue.
      </P>

      <H2>Who This Is a Good Fit For</H2>
      <P>
        The dealers who do best with this model share a few common traits. They don't need to be
        salespeople. They do need to be:
      </P>
      <UL>
        <LI>
          <strong>Community-connected.</strong> You don't need to know every business owner
          personally, but being a known face in your town — at the Chamber of Commerce, at
          community events, in local Facebook groups — gives you a running start.
        </LI>
        <LI>
          <strong>Comfortable with basic digital outreach.</strong> Posting in local Facebook
          groups, sending a simple email to business owners, running a small Facebook ad — that's
          the ceiling of the technical skill required.
        </LI>
        <LI>
          <strong>Interested in recurring revenue.</strong> This model builds. Each mailing cycle,
          return advertisers rebook. Over time, a portion of your ad inventory renews automatically,
          and you spend less time filling each postcard than the one before.
        </LI>
      </UL>

      <H2>The Setup Process</H2>
      <H3>1. Claim your territory</H3>
      <P>
        Use the interactive territory map to find available territories. Enter your ZIP code and see
        what's open near you. Each territory is exclusive — once claimed, no other dealer can sell
        ads in that area.
      </P>
      <H3>2. Pay the setup fee and monthly subscription</H3>
      <P>
        There's a one-time setup fee plus a modest monthly subscription. Both are charged at signup
        through Stripe. This covers your territory license, your dealer landing page, access to the
        dealer portal, and ongoing platform support.
      </P>
      <H3>3. Your landing page goes live</H3>
      <P>
        Within minutes of your payment clearing, My Town Postcard automatically creates a branded
        campaign landing page for your territory. It shows the postcard layout, available ad sizes
        and prices, and a live "spots remaining" counter. Businesses can browse it, pick their spot
        size, and pay — without any involvement from you.
      </P>
      <H3>4. Drive traffic to your page</H3>
      <P>
        This is the bulk of the dealer's work: getting local business owners to visit the landing
        page. More on this below.
      </P>
      <H3>5. Collect revenue as spots sell</H3>
      <P>
        Every paid spot generates revenue. You keep the spread between what advertisers pay and what
        you owe to My Town Postcard for production and delivery.
      </P>

      <H2>How to Fill Your Postcard Without Cold Calling</H2>
      <H3>Facebook &amp; Nextdoor</H3>
      <P>
        Local business owner groups on Facebook are gold. A genuine post — not an ad — explaining
        what you're doing and inviting businesses to claim a spot generates real interest. Keep it
        short, personal, and specific: "I'm launching a direct mail postcard campaign for [Town
        Name] — 5,000 households, 15 spots, filling fast. Here's the link if you want to check it
        out."
      </P>
      <P>
        Nextdoor is increasingly used by small business owners to promote their services. An
        introduction there, from a community member running a local marketing initiative, reads very
        differently than a cold solicitation.
      </P>
      <H3>Email outreach (not cold calling)</H3>
      <P>
        Pull a list of local businesses from Google Maps in your target categories — restaurants,
        contractors, dental offices, real estate agents, salons. Send a brief, plain-text email with
        your landing page link. No pitch, no pressure — just: "Here's what this is, here's what it
        costs, here's how to grab a spot." A 5–10% click rate on a list of 200 businesses generates
        meaningful interest.
      </P>
      <H3>Leverage your personal network</H3>
      <P>
        The first spot you sell is always the hardest. The easiest way to get it is to think of one
        business owner you know — a friend, a neighbor, someone you frequent — and offer them the
        first spot at a small discount in exchange for a testimonial. Once one real business is on
        board, word spreads naturally.
      </P>
      <H3>Small paid ads</H3>
      <P>
        A $100–200 Facebook ad targeted at business owners within your ZIP codes, with the headline
        "Advertise to 5,000 households in [Town] for $199," will generate leads you wouldn't
        otherwise reach. This isn't a requirement, but it's a high-leverage option once you've done
        the free outreach.
      </P>

      <H2>What Ongoing Operations Look Like</H2>
      <P>
        After your first postcard mails, the rhythm gets easier. Businesses that advertised once and
        saw results will rebook. You'll have a roster of warm contacts who already understand the
        product. Each subsequent issue requires less outreach than the last.
      </P>
      <P>
        The platform handles renewals, payment collection, and campaign status tracking. Your dealer
        portal shows you exactly how many spots are sold, which are still available, and your
        running revenue total. You can check it from your phone in two minutes.
      </P>
      <Callout gold>
        <CalloutTitle gold>Is your territory available?</CalloutTitle>
        Use the territory finder to see if your town has an open dealer slot. Territories are
        claimed on a first-come, first-served basis — and once they're gone, they're gone.
      </Callout>
    </>
  );
}

function Article3Body() {
  return (
    <>
      <P>
        Business opportunities live and die by their numbers. Vague promises about "unlimited
        income potential" don't tell you anything useful. What you actually need to know is: what
        does a realistic scenario look like, what does it cost to get started, and what happens if
        it goes slower than expected?
      </P>
      <P>This article answers all three questions with real numbers from the My Town Postcard model.</P>

      <H2>The Postcard Layout: 15 Spots, 4 Price Points</H2>
      <P>
        Each My Town Postcard is a 9×12 oversized mailer delivered to 5,000 households via USPS
        Every Door Direct Mail. The front and back of the postcard together contain 15 advertising
        spots, organized by size:
      </P>
      <RevTable
        rows={[
          ["Ad Size", "Price per Issue", "Best For"],
          ["Small", "$199", "Coupons, simple service listings"],
          ["Medium", "$299", "Restaurants, retail, salons"],
          ["Large", "$399", "Contractors, dental, medical"],
          ["XL", "$499", "Anchor advertisers, real estate"],
        ]}
        total={["", "", ""]}
      />

      <H2>Revenue Scenarios</H2>
      <H3>Scenario A: Conservative mix (mostly Small/Medium)</H3>
      <RevTable
        rows={[
          ["Size", "Qty", "Price", "Revenue"],
          ["Small", "6", "$199", "$1,194"],
          ["Medium", "5", "$299", "$1,495"],
          ["Large", "3", "$399", "$1,197"],
          ["XL", "1", "$499", "$499"],
        ]}
        total={["Total (15 spots)", "", "", "$4,385"]}
      />

      <H3>Scenario B: Premium mix (more Large/XL)</H3>
      <RevTable
        rows={[
          ["Size", "Qty", "Price", "Revenue"],
          ["Small", "3", "$199", "$597"],
          ["Medium", "4", "$299", "$1,196"],
          ["Large", "5", "$399", "$1,995"],
          ["XL", "3", "$499", "$1,497"],
        ]}
        total={["Total (15 spots)", "", "", "$5,285"]}
      />

      <H2>What the Dealer Keeps</H2>
      <P>
        As a dealer, you earn the spread between what advertisers pay and what My Town Postcard
        charges for production and delivery. Production and postage for a 9×12 EDDM mailer to
        5,000 homes — printing, fulfillment, USPS costs — typically runs in the $1,500–2,000 range
        depending on volume and vendor.
      </P>
      <Callout gold>
        <CalloutTitle gold>Example per-postcard profit</CalloutTitle>
        $4,385 gross revenue − $1,800 production − $99 monthly platform fee = approximately{" "}
        <strong>$2,486 net</strong> per mailing cycle. With 4 mailings per year, that's roughly{" "}
        <strong>$9,900 annually</strong> from a single territory.
      </Callout>

      <H2>The Cost to Get Started</H2>
      <P>Dealer pricing includes two components:</P>
      <UL>
        <LI>
          <strong>One-time setup fee: $99</strong> — covers territory licensing and landing page
          creation.
        </LI>
        <LI>
          <strong>Monthly subscription: $99/month</strong> — covers platform access, dealer portal,
          campaign management tools, and ongoing support.
        </LI>
      </UL>
      <P>
        Your total first-year cost to run the platform is $99 + ($99 × 12) = $1,287. Against the
        revenue potential above, payback on that investment happens within the first
        partially-filled postcard.
      </P>

      <H2>What Happens If You Don't Fill Every Spot?</H2>
      <RevTable
        rows={[
          ["Spots Sold", "Est. Revenue", "Less Production", "Net"],
          ["15 of 15 (sold out)", "~$4,400", "$1,800", "~$2,600"],
          ["12 of 15 (80%)", "~$3,500", "$1,800", "~$1,700"],
          ["10 of 15 (67%)", "~$2,900", "$1,800", "~$1,100"],
          ["8 of 15 (53%)", "~$2,300", "$1,800", "~$500"],
        ]}
        total={["", "", "", ""]}
      />
      <P>
        A postcard won't go to print without sufficient spots sold to cover costs. This protects
        dealers from running a mailing at a loss on their first few issues while they build their
        advertiser base.
      </P>

      <H2>The Compounding Effect of Renewals</H2>
      <P>
        The number that makes this model genuinely compelling isn't the first postcard — it's the
        third or fourth. Once advertisers see results (tracked via QR code scan analytics built into
        every ad), they renew. Once a business owner renews once, they become a near-automatic
        renewal on subsequent issues.
      </P>
      <P>
        A dealer who fills their first postcard with 10 advertisers might see 7 of them rebook for
        the second issue. By the fourth or fifth mailing, the postcard might be 80–90% pre-sold to
        returning advertisers. That's when the business starts to feel genuinely passive.
      </P>

      <H2>Is This the Right Opportunity for You?</H2>
      <P>It's a fit if you're looking for:</P>
      <UL>
        <LI>A side business that builds recurring revenue over time</LI>
        <LI>Something rooted in your local community, not a generic online hustle</LI>
        <LI>Low startup cost relative to the income potential</LI>
        <LI>A platform that handles the operational complexity so you focus on relationships</LI>
      </UL>
      <P>
        It's not a fit if you need immediate, guaranteed income from day one, or if you're
        unwilling to do any community outreach in the early stages. The first postcard requires
        effort. The fifth postcard, much less so.
      </P>
      <Callout>
        <CalloutTitle>Transparency note</CalloutTitle>
        These numbers are illustrative, based on the platform's pricing tiers and typical EDDM
        production costs. Actual results depend on territory size, advertiser mix, fill rate, and
        local market dynamics. We encourage every prospective dealer to run their own numbers before
        signing up.
      </Callout>
    </>
  );
}

// Map slug → body component
const ARTICLE_BODIES: Record<string, React.ComponentType> = {
  "eddm-vs-digital": Article1Body,
  "start-local-ad-business": Article2Body,
  "numbers-breakdown": Article3Body,
};

// ─── Unsplash helper ──────────────────────────────────────────────────────────
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

  // Related articles = everything except the current one
  const related = ARTICLES.filter((a) => a.slug !== article.slug);

  return (
    <div className="min-h-screen bg-[#F4F1ED]">
      <BlogNav />

      <main className="max-w-3xl mx-auto px-6 py-12 pb-24">
        {/* Back link */}
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

        {/* Article body */}
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

        {/* Article CTA */}
        <div className="bg-[#0f1117] rounded-2xl p-10 text-center mt-16">
          <p className="font-['Bebas_Neue'] text-4xl text-white tracking-wide mb-3">
            {article.cta.label === "See Available Spots"
              ? "Advertise in Your Town"
              : "Claim Your Territory"}
          </p>
          <p className="text-[#bbb] text-sm mb-6">
            {article.cta.label === "See Available Spots"
              ? "Reserve a spot on the next postcard in your area. Starting at $199 for 5,000 households."
              : "See if your town is available. Setup takes minutes — your landing page goes live automatically."}
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
