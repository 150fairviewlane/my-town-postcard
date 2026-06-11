import { useEffect } from "react";
import { Link } from "wouter";
import { DEALER_ARTICLES, DealerBlogNav } from "./DealerBlogIndexPage";

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
function OL({ children }: { children: React.ReactNode }) {
  return <ol className="list-decimal ml-6 mb-5 space-y-2">{children}</ol>;
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
function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto my-7">
      <table className="w-full border-collapse font-sans text-sm">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} className="bg-[#0f1117] text-white text-left px-4 py-3 font-semibold tracking-wide">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className={`px-4 py-3 border-b border-[#E2DDD6] ${i % 2 === 1 ? "bg-[#f7f5f2]" : ""}`}>
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
// ARTICLE 1 — Why the Shared Postcard Model Wins
// ═══════════════════════════════════════════════════════════════════════════════
function Article1Body() {
  return (
    <>
      <P>
        Most people who think about starting a local advertising business imagine doing it alone:
        selling a product or service exclusively, managing all the production, handling all the
        logistics. That model can work, but it puts every risk on a single pair of shoulders.
        If you don't sell enough, you lose money. If production costs spike, your margin shrinks.
        If one customer cancels, you feel it immediately.
      </P>
      <P>
        The shared postcard model works differently. And once you understand why, the economics
        start to look almost unfairly good.
      </P>

      <H2>The Core Mechanic: Risk Pooling</H2>
      <P>
        Each 9×12 My Town Postcard has 15 advertising spots. When those spots are sold to 15
        different local businesses, the production and mailing costs are effectively divided across
        all of them. No single advertiser bears the full cost of reaching 5,000 households — and
        neither do you as the dealer.
      </P>
      <P>
        Compare this to a solo direct mail product. If you were selling a single-advertiser mailer,
        your customer would need to pay $2,000–4,000 to cover production and postage for 5,000
        homes. Most small businesses won't spend that. But $199 to $499 for a spot on a shared
        postcard? That's a budget line item almost any local business can justify.
      </P>
      <P>
        Lower price point means more potential customers. More potential customers means faster
        sales cycles. Faster sales cycles means a filled postcard, which means revenue in your
        pocket — without waiting for a big-ticket buyer to commit.
      </P>

      <H2>Why 15 Spots Is the Magic Number</H2>
      <P>
        Fifteen spots is enough to generate meaningful revenue from a single postcard while keeping
        each advertiser's cost in the accessible range. It's also small enough that the postcard
        doesn't feel cluttered — each business gets visible, professional real estate on an
        oversized format that commands attention.
      </P>
      <P>
        At a conservative average of $299 per spot, a sold-out postcard generates roughly $4,500
        in gross revenue. Against production and mailing costs in the $1,500–2,000 range, a dealer
        pockets somewhere between $2,000 and $3,000 per mailing — for a part-time effort that
        mostly involved sending emails and posting in a few Facebook groups.
      </P>

      <Callout gold>
        <CalloutTitle gold>The math at a glance</CalloutTitle>
        15 spots × avg $299 = $4,485 gross. Less ~$1,800 production and postage = ~$2,685 dealer
        net per mailing. Four mailings per year = ~$10,000+ from a single territory, working
        part-time.
      </Callout>

      <H2>The Compounding Advantage</H2>
      <P>
        Here's the part of the model that most people don't appreciate until they've run a few
        postcards: renewals. When a business advertises and gets results — tracked via QR code
        scans built into every ad — they come back. Not maybe. Regularly. A dentist who picks up
        three new patients from the mailing doesn't think twice about rebooking for the next issue.
      </P>
      <P>
        What this means practically is that each successive postcard is easier to fill than the
        one before. After your first mailing, some percentage of those advertisers rebook
        automatically. After your third, you might start each cycle with 8 or 10 spots
        pre-committed — which means you only need to find 5 or 7 new advertisers to fill the
        postcard completely. The heavy lifting gets lighter every time.
      </P>
      <P>
        By the time you're running a mature territory — 6 to 12 months in — your primary job
        becomes managing renewals and backfilling the occasional open spot, not starting from
        scratch every cycle.
      </P>

      <H2>Category Exclusivity: Your Built-In Sales Tool</H2>
      <P>
        Each postcard accepts only one advertiser per business category. One dentist. One HVAC
        company. One real estate agent. This creates a natural scarcity that makes your sales
        conversations much easier.
      </P>
      <P>
        When you approach a local dentist, you're not asking whether they want to advertise. You're
        telling them their competitor hasn't claimed the dental spot yet — but could at any time.
        That's a fundamentally different conversation, and it's one that creates urgency without
        any manufactured pressure. The scarcity is real.
      </P>

      <H2>Why This Beats Most Side Business Options</H2>
      <DataTable
        headers={["Model", "Startup Cost", "Revenue Potential", "Passive Over Time?"]}
        rows={[
          ["My Town Postcard Dealer", "~$300", "$8K–15K/yr per territory", "Yes — renewals build"],
          ["Freelance graphic design", "$0", "$5K–20K/yr", "No — always trading time"],
          ["Dropshipping store", "$500–2K", "Highly variable", "Partially"],
          ["Solo direct mail product", "$2K–5K per run", "$2K–4K/yr", "No"],
          ["Franchise", "$50K–500K", "Varies widely", "Partially"],
        ]}
      />
      <P>
        The combination of low startup cost, accessible price point, recurring revenue, and
        geographic exclusivity is genuinely unusual. Most side businesses either require a lot of
        capital upfront or trade time directly for money with no compounding. This one does neither.
      </P>

      <Callout>
        <CalloutTitle>The window</CalloutTitle>
        Territories are claimed on a first-come, first-served basis. The dealer who claims a town
        first owns it exclusively. If you've been thinking about this, now is when that thinking
        becomes valuable.
      </Callout>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ARTICLE 2 — How to Fill Your Postcard Without Cold Calling
// ═══════════════════════════════════════════════════════════════════════════════
function Article2Body() {
  return (
    <>
      <P>
        The most common reason people hesitate to become a dealer is the assumption that the job
        requires cold calling — driving from business to business, pitching reluctant owners,
        getting doors slammed. If that sounds like your nightmare, here's some good news: it's
        not how this works.
      </P>
      <P>
        The dealers who fill their postcards fastest do almost no cold outreach in the traditional
        sense. What they do instead is systematic, repeatable, and something most people can do
        in a few hours a week. Here's the exact playbook.
      </P>

      <H2>Step 1: Set Up Your Landing Page First</H2>
      <P>
        Before you contact a single business, make sure your campaign landing page is live. My Town
        Postcard automatically creates this for you when your territory activates — it shows the
        postcard layout, ad sizes and prices, the spot counter, and a checkout flow that works
        without you being involved at all.
      </P>
      <P>
        This is crucial: your outreach shouldn't be a sales pitch, it should be a pointer. "Here's
        the page, here's what's available, here's the price — grab a spot before they're gone."
        That's it. The page does the selling. You just direct traffic to it.
      </P>

      <H2>Step 2: Start with Warm Contacts</H2>
      <P>
        Your first advertiser is almost always someone you already know. Think through your personal
        network: do you have a dentist, a contractor, a restaurant owner, a real estate agent
        among your contacts? One text or email to someone who trusts you is worth a hundred cold
        approaches to strangers.
      </P>
      <P>
        Offer your first advertiser a small discount — say $20 or $30 off — in exchange for a
        quick testimonial you can use in your outreach. Once one real business is on the postcard,
        your credibility with every subsequent prospect goes up dramatically.
      </P>

      <H2>Step 3: The Email Approach (Not Cold Calls)</H2>
      <P>
        Pull a list of local businesses in your target categories from Google Maps. Focus on the
        categories that perform best on direct mail: HVAC, plumbing, dental, restaurants, salons,
        real estate. Most of these businesses have email addresses on their website or Google
        Business Profile.
      </P>
      <P>
        Send a short, plain-text email. No design. No attachments. Just this:
      </P>
      <Callout>
        <CalloutTitle>Sample outreach email</CalloutTitle>
        Subject: Advertising opportunity in [Town Name] — 5,000 households<br /><br />
        Hi [Name],<br /><br />
        I'm launching a direct mail postcard campaign for [Town Name] this season. It goes to
        5,000 households in the area, and I have a few ad spots available — starting at $199.<br /><br />
        Here's the campaign page if you want to take a look: [your landing page URL]<br /><br />
        Happy to answer any questions. Spots are limited and going quickly.<br /><br />
        [Your name]
      </Callout>
      <P>
        That's the whole email. No hard sell. No pressure. A 5–10% click rate on a list of 100
        businesses gives you 5–10 interested prospects — more than enough to fill a postcard.
      </P>

      <H2>Step 4: Facebook and Nextdoor Posts (Free)</H2>
      <P>
        Most towns have active local Facebook groups — buy/sell/trade groups, community groups,
        local business groups. A genuine post (not a paid ad) in these groups generates real
        interest. Keep it short and community-minded:
      </P>
      <Callout gold>
        <CalloutTitle gold>Sample Facebook group post</CalloutTitle>
        "Hey [Town] business owners — I'm putting together a direct mail postcard campaign for
        our area this season. It goes to 5,000 local households. I have 15 spots available for
        local businesses, starting at $199. Only one business per category (so if you're a
        dentist, you'd be the only dentist on the postcard). Here's the link if you want to
        check it out: [URL]. Feel free to DM me with questions!"
      </Callout>
      <P>
        Nextdoor works similarly. A post from a community member running a local marketing
        initiative reads very differently than a corporate ad — people respond to it.
      </P>

      <H2>Step 5: The Follow-Up Sequence</H2>
      <P>
        Most advertisers don't buy on the first exposure. They click the link, look at the page,
        and then life happens. A simple two-step follow-up turns browsers into buyers:
      </P>
      <OL>
        <LI>
          <strong>Day 3 after initial outreach:</strong> "Just checking in — wanted to make sure
          you saw this. The [category] spot is still available but we're filling up."
        </LI>
        <LI>
          <strong>Day 7:</strong> "Last chance on this — we're close to full and I wanted to give
          you first right of refusal on the [category] spot before I reach out to others."
        </LI>
      </OL>
      <P>
        That's it. Two follow-ups, then move on. You're not pestering anyone — you're providing
        information they actually need to make a decision. The scarcity is real and the timeline
        is genuine, which makes the follow-up feel helpful rather than pushy.
      </P>

      <H2>Step 6: Let the Platform Handle the Close</H2>
      <P>
        When someone is ready to buy, send them directly to your landing page. They pick their
        spot size, enter their payment information, and the transaction completes without you
        involved. No invoice. No check to deposit. No chasing payment. The platform handles
        everything — you just get paid.
      </P>
      <P>
        This is the part of the model most dealers underestimate until they experience it. The
        first time a business you've never spoken to finds your landing page, picks a spot, and
        pays while you're asleep — that's when the model clicks.
      </P>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ARTICLE 3 — Who Makes a Great Dealer
// ═══════════════════════════════════════════════════════════════════════════════
function Article3Body() {
  return (
    <>
      <P>
        When people picture a local advertising salesperson, they usually imagine someone with a
        thick skin, a high tolerance for rejection, and a gift for closing deals under pressure.
        That person exists — and they'd probably do fine as a My Town Postcard dealer. But they're
        not actually the best fit.
      </P>
      <P>
        The dealers who build the most successful territories tend to come from entirely different
        backgrounds. Here's what actually predicts success — and why you might already have exactly
        what it takes.
      </P>

      <H2>The Community Connector</H2>
      <P>
        The most naturally successful dealer profile is someone who's already embedded in the
        social and professional fabric of their town. Not necessarily famous — just known.
        The person who's been on the Chamber of Commerce board. The parent who coaches Little
        League and knows half the business owners in town through their kids' activities. The
        longtime local who can walk into most restaurants or shops and get recognized by name.
      </P>
      <P>
        These people don't need a sales pitch. They need a product worth talking about. When they
        mention the postcard campaign to a business owner friend over coffee, it lands as a
        recommendation from a trusted neighbor — not a cold solicitation. Their relationships do
        most of the work.
      </P>

      <H2>The Local Business Owner (or Former One)</H2>
      <P>
        Someone who has owned or operated a local business understands the advertiser's perspective
        from the inside. They know the frustration of wasting money on ads that don't convert.
        They understand cash flow concerns and why a $199 commitment feels very different from a
        $2,000 one. They speak the language.
      </P>
      <P>
        This empathy is genuinely valuable in the dealer role. When you can say "I've been in your
        position and here's what I wish I'd known about local advertising," the conversation
        changes. You're not a vendor — you're a peer.
      </P>

      <H2>The Stay-at-Home Parent or Semi-Retired Professional</H2>
      <P>
        This is a big one. The dealer model is designed to work in part-time hours — a few hours
        a week of outreach, checking the portal, and managing renewals. For someone who wants
        meaningful income without the commitment of a full-time job, the structure fits naturally.
      </P>
      <P>
        Stay-at-home parents often have deep community networks from school involvement, sports
        teams, and neighborhood groups — networks that overlap heavily with the local business
        owner community. Semi-retired professionals bring credibility, organizational skills, and
        the patience to build something that grows over time rather than needing immediate returns.
      </P>

      <H2>The Real Estate Agent or Mortgage Professional</H2>
      <P>
        Real estate agents already understand the logic of geographic farming — consistent
        presence in a defined area builds name recognition over time. The postcard model is
        essentially the same concept applied to a different product. Agents who already send
        direct mail to their farm areas will immediately grasp why the co-op model is more
        cost-effective, and they can position themselves as offering a service to their business
        owner clients in the same breath.
      </P>
      <P>
        Mortgage professionals, insurance agents, and financial advisors fit a similar profile —
        relationship-oriented, community-rooted, and comfortable talking about value propositions
        with business owners.
      </P>

      <H2>The Marketing-Savvy Side Hustler</H2>
      <P>
        Someone who already understands digital marketing — social media, email outreach, basic
        content creation — can build a dealer territory almost entirely online. They don't need
        existing relationships because they know how to create visibility from scratch through
        Facebook groups, targeted ads, and local hashtags. For this person, the territory is a
        product they know how to market, and the platform is the infrastructure they'd otherwise
        have to build themselves.
      </P>

      <H2>What You Don't Need</H2>
      <P>
        You don't need a background in media sales. You don't need to be an extrovert. You don't
        need graphic design skills (the platform handles ad creation tools). You don't need
        experience with direct mail, printing, or logistics (My Town Postcard handles production
        and USPS fulfillment). You don't need a large upfront investment.
      </P>
      <P>
        What you do need is a genuine connection to your community, enough persistence to follow
        up with prospective advertisers two or three times, and the patience to let the renewal
        flywheel build over the first few mailing cycles. That's a much lower bar than most
        people assume.
      </P>

      <Callout gold>
        <CalloutTitle gold>The honest test</CalloutTitle>
        Ask yourself: do I know at least five local business owners personally or by reputation?
        Could I send a genuine email to each of them about this postcard without it feeling weird?
        If yes, you already have more than you need to get started.
      </Callout>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ARTICLE 4 — Social Media for Dealers
// ═══════════════════════════════════════════════════════════════════════════════
function Article4Body() {
  return (
    <>
      <P>
        Every dealer has the same goal: get local business owners to the landing page and let the
        platform do the selling. Social media — used correctly — is one of the fastest, lowest-cost
        ways to make that happen. The key word is "correctly." There's a big difference between
        social media that works for this model and social media that burns time and money.
      </P>
      <P>
        Here's a platform-by-platform breakdown of what actually moves the needle.
      </P>

      <H2>Facebook: Your Highest-ROI Platform</H2>
      <P>
        Facebook is still the most valuable platform for dealer outreach, and for a specific reason:
        local groups. Nearly every town of any size has multiple active Facebook groups — community
        groups, buy/sell groups, local business groups, neighborhood association pages. These are
        concentrated pools of exactly the people you want to reach.
      </P>
      <H3>Free: Post in local groups</H3>
      <P>
        Join every local Facebook group you can find in your territory. Then post — not an ad, but
        a genuine community announcement. "I'm launching a postcard campaign for [Town] this season
        and have a few ad spots left for local businesses. Starting at $199 for 5,000 households."
        Add your landing page link. That's it.
      </P>
      <P>
        Do this in three to five groups and you'll generate inquiries within hours. The posts work
        because they're local, specific, and useful — members recognize the town name, they know
        business owners who might benefit, and they share or tag accordingly.
      </P>
      <H3>Paid: Facebook ads targeting business owners</H3>
      <P>
        Once you've done the free outreach, a small paid campaign can fill in the gaps. Create a
        Facebook ad with the headline "Advertise to 5,000 households in [Town] — from $199."
        Target by location (your territory ZIP codes), age 30–60, and the interest categories
        "small business owners" or "entrepreneurship." Budget $5–10 per day for two weeks.
      </P>
      <P>
        This isn't a huge reach campaign — it's surgical. You're trying to reach maybe 200–400
        business owners in a defined area, and $100–150 in ad spend is usually enough to generate
        several qualified inquiries.
      </P>

      <H2>Instagram: Visual Proof and Local Discovery</H2>
      <P>
        Instagram works differently than Facebook for this purpose. Rather than direct outreach,
        use it to build credibility and local discovery through content.
      </P>
      <H3>Show the postcard</H3>
      <P>
        Post images of the actual postcard design — the mock-up, the finished print, photos of it
        in a mailbox. Local people scroll past a lot of generic content; a photo of something they
        recognize (their town name, businesses they know) stops the thumb. Use local hashtags
        like #[TownName]businesses, #[TownName]local, and #supportlocal[Town].
      </P>
      <H3>Spotlight advertisers</H3>
      <P>
        After each mailing, post a short story or reel featuring one of your advertisers. "This
        month's postcard featured [Business Name] — congratulations on joining [X] other local
        businesses reaching 5,000 households." Tag the business. They'll often reshare it to their
        own audience, which puts your postcard in front of their followers — many of whom are other
        local business owners.
      </P>

      <H2>TikTok: Underrated for Local Business Reach</H2>
      <P>
        TikTok's algorithm is unusually good at surfacing content to local audiences, and the
        local business community on TikTok is larger than most people realize. Short videos work
        especially well here — and they don't need to be polished.
      </P>
      <H3>The "behind the process" video</H3>
      <P>
        Film a 30–60 second video showing the postcard layout, explaining how it works, and showing
        the territory map. Something like: "Here's how I help local businesses in [Town] reach
        5,000 households for under $200." Casual, direct, specific. TikTok's algorithm will show
        this to people in your geographic area, including business owners who use the platform.
      </P>
      <H3>The results video</H3>
      <P>
        After a mailing goes out, film a quick video showing the physical postcard next to a QR
        code scan analytics screenshot. "We just mailed 5,000 of these in [Town] — here are the
        results after two weeks." Social proof is powerful, and showing real scan data makes the
        product tangible in a way that text can't.
      </P>

      <H2>LinkedIn: Underused and Underrated for This Market</H2>
      <P>
        LinkedIn is the most overlooked platform for dealer recruitment of both advertisers and
        other potential dealers. The audience skews toward business owners, professionals, and
        people thinking about income diversification — which is exactly your market.
      </P>
      <H3>For advertiser recruitment</H3>
      <P>
        Search LinkedIn for business owners, practice managers, and marketing contacts in your
        territory ZIP codes. A direct LinkedIn message with your landing page link converts
        surprisingly well because the platform context signals professionalism. Keep it brief:
        "Hi [Name] — I run a direct mail postcard campaign serving [Town] and have a spot open
        in your category. Wanted to give you first look before it fills up: [URL]."
      </P>
      <H3>For dealer recruitment (if you want to expand)</H3>
      <P>
        Long-form LinkedIn articles about your experience as a dealer — how you built your
        territory, what the income looks like, what worked — will attract people who are actively
        looking for side income opportunities. This is a longer play but one that compounds well
        over time.
      </P>

      <H2>The Platform Priority Stack</H2>
      <DataTable
        headers={["Platform", "Best Use", "Time Investment", "Cost"]}
        rows={[
          ["Facebook Groups", "Direct advertiser outreach", "2–3 hrs/week", "Free"],
          ["Facebook Ads", "Reach business owners at scale", "1 hr setup", "$100–150/cycle"],
          ["Instagram", "Credibility + local discovery", "1–2 hrs/week", "Free"],
          ["TikTok", "Local reach + social proof", "1–2 hrs/week", "Free"],
          ["LinkedIn", "Professional outreach + dealer recruits", "1 hr/week", "Free"],
        ]}
      />

      <Callout gold>
        <CalloutTitle gold>Start here</CalloutTitle>
        Don't try all five platforms at once. Start with Facebook groups (free, immediate results)
        and LinkedIn direct messages. Add Instagram after your first postcard mails and you have
        something visual to show. Add TikTok when you're ready to invest in short-form video.
        Stack platforms over time rather than spreading thin on day one.
      </Callout>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ARTICLE 5 — Maximize Dealer Revenue
// ═══════════════════════════════════════════════════════════════════════════════
function Article5Body() {
  return (
    <>
      <P>
        Most dealers focus on filling their first postcard. That's the right instinct — you need
        proof before you can build. But the dealers who generate real, consistent income shift their
        focus quickly from "how do I fill this one?" to "how do I build a business that fills
        itself?" The path from first postcard to recurring income has a clear structure. Here's
        what it looks like.
      </P>

      <H2>The Renewal Engine: Your Most Important Asset</H2>
      <P>
        Every advertiser who renews is an advertiser you didn't have to sell again. That sounds
        obvious, but the operational implication is significant: each mailing cycle that generates
        renewals is a cycle where you spend less time selling and more time managing a business
        that runs.
      </P>
      <P>
        The renewal rate on a well-run territory is high because the product works. QR code scan
        analytics give every advertiser concrete data on how many people engaged with their ad.
        A business that can see 47 scans after a mailing — not abstract impressions, actual
        engagement — has a reason to rebook. Make sure every advertiser knows their scan numbers
        after each mailing. That data is your best retention tool.
      </P>
      <Callout gold>
        <CalloutTitle gold>Renewal target</CalloutTitle>
        Aim for 60–70% renewal after your first mailing, 75–80% after your second. By your
        fourth mailing, a renewal rate in that range means you're only hunting for 3–5 new
        advertisers per cycle instead of 15. That's a fundamentally different workload.
      </Callout>

      <H2>Upsell: Bigger Spots Mean Higher Revenue Per Advertiser</H2>
      <P>
        Not every advertiser needs to stay in a Small spot forever. As they see results, some will
        want more visibility — a larger ad, a premium position on the front of the postcard, or
        both. Upgrading a Small advertiser ($199) to a Large ($399) doubles that slot's revenue
        without adding a new customer.
      </P>
      <P>
        The upgrade conversation is natural and non-pushy: "Your scans were strong last mailing —
        have you thought about going bigger to give your ad more visual impact? The Large and XL
        spots are getting more attention." You're offering them something genuinely valuable, not
        pushing a product they don't need.
      </P>

      <H2>Subscription Advertisers: The Gold Standard</H2>
      <P>
        The highest-value advertisers aren't one-time buyers — they're businesses that commit to
        multiple mailings upfront. A business that buys three or six issues in advance gives you
        predictable, pre-sold inventory and cash flow security before each cycle begins.
      </P>
      <P>
        Offer a modest incentive for multi-issue commitments — a small discount or a complimentary
        ad design refresh on the third issue. The exact offer matters less than the habit of
        asking for it. "Would you want to lock in your spot for the next three issues at a slight
        discount?" is a question most satisfied advertisers will at least consider.
      </P>

      <H2>Adding a Second Territory</H2>
      <P>
        Once your first territory is running smoothly with a strong renewal base, the leverage
        move is adding an adjacent territory. The infrastructure is already built — you know the
        outreach process, you have the email templates, you have social proof from your first
        successful mailing. The second territory takes significantly less time to launch than the
        first because you're not learning the model, you're applying it.
      </P>
      <DataTable
        headers={["Territory Count", "Avg Annual Revenue", "Weekly Time Commitment"]}
        rows={[
          ["1 territory (new)", "~$6,000–10,000", "5–8 hrs"],
          ["1 territory (mature, high renewal)", "~$10,000–15,000", "2–4 hrs"],
          ["2 territories (one mature, one new)", "~$16,000–25,000", "6–10 hrs"],
          ["3 territories (all maturing)", "~$25,000–40,000", "8–12 hrs"],
        ]}
      />
      <P>
        The numbers above assume 4 mailings per year per territory and a mix of ad sizes. Your
        actual results will vary based on territory size, fill rate, and how aggressively you
        pursue upsells and multi-issue commitments. But the structure holds: more territories,
        compounding renewals, and higher average spot prices over time all push revenue in the
        same direction.
      </P>

      <H2>Community Presence: The Long Game</H2>
      <P>
        The dealers with the highest renewal rates and the easiest fills are almost always the
        ones who've become known as the local postcard person. Not through aggressive marketing —
        through presence. They show up at Chamber of Commerce breakfasts. They post the
        postcard on their personal social media. They congratulate advertisers publicly. They
        become part of the community's awareness of itself.
      </P>
      <P>
        That kind of presence is hard to quantify but easy to build gradually, and it pays
        dividends for as long as you run the territory. A business owner who sees your name
        connected to the postcard for a year doesn't need much convincing when they're ready
        to advertise. You've already done the work.
      </P>

      <Callout>
        <CalloutTitle>The one-sentence version</CalloutTitle>
        Fill your first postcard, show every advertiser their scan data, ask every satisfied
        advertiser to rebook, and show up in your community. Do those four things consistently
        and the business builds itself.
      </Callout>
    </>
  );
}

// ─── Slug → body map ──────────────────────────────────────────────────────────
const ARTICLE_BODIES: Record<string, React.ComponentType> = {
  "why-shared-postcard-model-wins": Article1Body,
  "how-to-fill-your-postcard": Article2Body,
  "who-makes-a-great-dealer": Article3Body,
  "social-media-for-dealers": Article4Body,
  "maximize-dealer-revenue": Article5Body,
};

function unsplashUrl(id: string, w = 900) {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DealerBlogArticlePage({ params }: { params: { slug: string } }) {
  const article = DEALER_ARTICLES.find((a) => a.slug === params.slug);
  const BodyComponent = article ? ARTICLE_BODIES[article.slug] : null;

  useEffect(() => {
    if (article) {
      document.title = `${article.title} — My Town Postcard`;
    }
  }, [article]);

  if (!article || !BodyComponent) {
    return (
      <div className="min-h-screen bg-[#F4F1ED]">
        <DealerBlogNav />
        <div className="max-w-xl mx-auto px-6 py-32 text-center">
          <p className="font-['Bebas_Neue'] text-5xl text-[#0f1117] mb-4">Article not found</p>
          <Link href="/dealers/blog">
            <span className="text-[#7C1C2E] font-semibold cursor-pointer hover:underline">
              ← Back to Dealer Blog
            </span>
          </Link>
        </div>
      </div>
    );
  }

  const related = DEALER_ARTICLES.filter((a) => a.slug !== article.slug).slice(0, 2);

  return (
    <div className="min-h-screen bg-[#F4F1ED]">
      <DealerBlogNav />

      <main className="max-w-3xl mx-auto px-6 py-12 pb-24">
        {/* Back */}
        <Link href="/dealers/blog">
          <span className="inline-flex items-center gap-2 text-[#7C1C2E] font-semibold text-sm cursor-pointer hover:underline mb-10">
            ← Back to Dealer Blog
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
                <Link key={rel.slug} href={`/dealers/blog/${rel.slug}`}>
                  <div className="bg-white border border-[#E2DDD6] rounded-xl overflow-hidden flex gap-4 p-4 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer group">
                    <img
                      src={unsplashUrl(rel.unsplashId, 200)}
                      alt={rel.unsplashAlt}
                      className="w-20 h-20 object-cover rounded-lg flex-shrink-0"
                    />
                    <div>
                      <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#C8952A] mb-1">
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
            Ready to Claim Your Territory?
          </p>
          <p className="text-[#bbb] text-sm mb-6">
            Territories are claimed first-come, first-served. Find out if yours is still available.
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
