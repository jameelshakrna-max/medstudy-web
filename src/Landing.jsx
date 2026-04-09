import { Link } from 'react-router-dom'
import styles from './Landing.module.css'

const features = [
  { icon:'📚', title:'460+ AMBOSS Topics', desc:'Pre-loaded across 19 systems. Organized, flagged, and ready.' },
  { icon:'📈', title:'Auto Completion Rollup', desc:'Update a subtopic — watch it flow up through Topic, Subject, System, Year.' },
  { icon:'🃏', title:'Anki SM-2 Tracking', desc:'Due Status, Card Maturity, Review Urgency — all calculated automatically.' },
  { icon:'📊', title:'UWorld Analytics', desc:'Log every block. See your weakest systems. Track readiness in real time.' },
  { icon:'🍅', title:'Built-in Pomodoro', desc:'Real timer, never throttled. Every session saves automatically.' },
  { icon:'🎯', title:'Priority View', desc:'Always know exactly what to study next. In Progress floats to top.' },
]

const plans = [
  { name:'Free', price:'$0', color:'var(--sage)', features:['Daily Dashboard','Study Sessions + Pomodoro','Weekly Summary','460+ AMBOSS Topic List'], missing:['Full Curriculum','Anki System','UWorld Tracker'] },
  { name:'Core', price:'$19', color:'var(--teal)', popular:true, features:['Everything in Free','5-Level Curriculum Hierarchy','Priority View + Gap Analysis','Topic Stats + Mastery Level'], missing:['Anki SM-2 System','UWorld Tracker'] },
  { name:'Pro', price:'$39', color:'var(--gold)', features:['Everything in Core','Anki SM-2 Flashcard System','UWorld Question Tracker','Step Readiness Dashboard','Priority Email Support'], missing:[] },
]

export default function Landing() {
  return (
    <div className={styles.page}>
      {/* Background */}
      <div className={styles.bg}>
        <div className={styles.blob1} />
        <div className={styles.blob2} />
      </div>

      {/* Nav */}
      <nav className={styles.nav}>
        <div className={styles.logo}>🏥 MedStudy OS</div>
        <div className={styles.navLinks}>
          <Link to="/login"  className={styles.navBtn}>Sign In</Link>
          <Link to="/signup" className={`${styles.navBtn} ${styles.navBtnPrimary}`}>Get Started Free</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles.heroTag}>🏥 Built for Medical Students</div>
        <h1 className={styles.heroTitle}>
          Stop juggling<br/>
          <span className={styles.heroAccent}>5 different apps.</span>
        </h1>
        <p className={styles.heroSub}>
          MedStudy OS is a complete study system — curriculum tracker, Anki SM-2, UWorld analytics, and a built-in Pomodoro timer. Everything connected. Everything automatic.
        </p>
        <div className={styles.heroCta}>
          <Link to="/signup" className={styles.ctaPrimary}>Start Free — No Credit Card</Link>
          <Link to="/login"  className={styles.ctaSecondary}>Sign In →</Link>
        </div>
        <div className={styles.heroStats}>
          <div className={styles.stat}><span className={styles.statN}>460+</span><span className={styles.statL}>AMBOSS Topics</span></div>
          <div className={styles.statDiv} />
          <div className={styles.stat}><span className={styles.statN}>19</span><span className={styles.statL}>Systems</span></div>
          <div className={styles.statDiv} />
          <div className={styles.stat}><span className={styles.statN}>5</span><span className={styles.statL}>Levels Deep</span></div>
          <div className={styles.statDiv} />
          <div className={styles.stat}><span className={styles.statN}>SM-2</span><span className={styles.statL}>Anki Algorithm</span></div>
        </div>
      </section>

      {/* Features */}
      <section className={styles.features}>
        <h2 className={styles.sectionTitle}>Everything in one system</h2>
        <p className={styles.sectionSub}>Every feature exists because a real study problem needed solving.</p>
        <div className={styles.featureGrid}>
          {features.map((f, i) => (
            <div className={styles.featureCard} key={i}>
              <div className={styles.featureIcon}>{f.icon}</div>
              <h3 className={styles.featureTitle}>{f.title}</h3>
              <p className={styles.featureDesc}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className={styles.howItWorks}>
        <h2 className={styles.sectionTitle}>Daily workflow — 5 steps</h2>
        <div className={styles.steps}>
          {[
            ['Open Dashboard','Start every morning from one page — everything you need is already there.'],
            ['Pick Your Topic','Priority View shows the most important topic to study. In Progress floats to top automatically.'],
            ['Study & Log','Update Subtopic completion as you go. Completion rolls up to Year automatically.'],
            ['Log Pomodoros','Built-in timer saves every 25-minute session directly to your database.'],
            ['Review Progress','Weekly Summary groups sessions automatically. UWorld shows your weakest systems.'],
          ].map(([t, d], i) => (
            <div className={styles.step} key={i}>
              <div className={styles.stepNum}>{i+1}</div>
              <div>
                <div className={styles.stepTitle}>{t}</div>
                <div className={styles.stepDesc}>{d}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className={styles.pricing}>
        <h2 className={styles.sectionTitle}>Three versions. One system.</h2>
        <p className={styles.sectionSub}>Start free. Upgrade when you are ready.</p>
        <div className={styles.planGrid}>
          {plans.map((plan, i) => (
            <div className={`${styles.planCard} ${plan.popular ? styles.planPopular : ''}`} key={i}
              style={{'--plan-color': plan.color}}>
              {plan.popular && <div className={styles.popularBadge}>Most Popular</div>}
              <div className={styles.planName}>{plan.name}</div>
              <div className={styles.planPrice}>{plan.price}</div>
              <div className={styles.planPriceSub}>one-time · lifetime access</div>
              <div className={styles.planFeatures}>
                {plan.features.map((f, j) => (
                  <div className={styles.planFeature} key={j}>
                    <span className={styles.checkmark}>✅</span> {f}
                  </div>
                ))}
                {plan.missing.map((f, j) => (
                  <div className={`${styles.planFeature} ${styles.planMissing}`} key={j}>
                    <span>—</span> {f}
                  </div>
                ))}
              </div>
              <Link to="/signup" className={styles.planCta}>
                {plan.price === '$0' ? 'Get Free Access' : `Get ${plan.name}`}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className={styles.finalCta}>
        <h2 className={styles.finalTitle}>Start today. Free forever.</h2>
        <p className={styles.finalSub}>No credit card. No setup. Just sign up and your curriculum is ready in 30 seconds.</p>
        <Link to="/signup" className={styles.ctaPrimary}>Create Your Account →</Link>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerLogo}>🏥 MedStudy OS</div>
        <div className={styles.footerSub}>Built for the physician you are becoming.</div>
      </footer>
    </div>
  )
}
