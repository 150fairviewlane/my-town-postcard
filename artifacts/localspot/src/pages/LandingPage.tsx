import React from 'react';

function HowItWorks() {
  const steps = [
    { n: "1", icon: "🛡️", title: "Exclusive Categories",
      desc: "Only one business per category on each postcard. No direct competition on your ad." },
    { n: "2", icon: "🎨", title: "Done-for-You Design",
      desc: "Polished professional ad design that makes your business stand out." },
    { n: "3", icon: "✉️", title: "Printed & Mailed for You",
      desc: "5,000 postcards printed and delivered to Habersham homes via USPS." },
    { n: "4", icon: "🎯", title: "Instant Local Reach",
      desc: "Your ad reaches 5,000 local homes — real customers, not clicks." },
  ];
  return (
    <section id="how-it-works" style={{ background: "#fff", padding: "80px 32px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h2 style={{ textAlign: "center", fontSize: 36, fontWeight: 900, color: "#111",
          fontFamily: "Georgia,serif", marginBottom: 10 }}>How It Works</h2>
      </div>
    </section>
  );
}

export default HowItWorks;
