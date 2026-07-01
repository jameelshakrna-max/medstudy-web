import { Link } from 'react-router-dom'
import {
  BookOpen, TrendingUp, BrainCircuit,
  BarChart3, Timer, Target,
  Check, ArrowRight, Layers,
  GraduationCap, Sparkles
} from 'lucide-react'
import styles from './Landing.module.css'

const features = [
  { icon: BookOpen, title: '460+ AMBOSS Topics', desc: 'Pre-loaded across 19 systems. Organized, flagged, and ready for Step 1 prep.' },
  { icon: TrendingUp, title: 'Auto Completion Rollup', desc: 'Update a subtopic — progress flows up through Topic, Subject, System, and Year.' },
  { icon: BrainCircuit, title: 'Anki FSRS-5 Tracking', desc: 'Due status, card maturity, and review urgency — all calculated automatically.' },
  { icon: BarChart3, title: 'UWorld Analytics', desc: 'Log every block. Identify weakest systems. Track readiness in real time.' },
  { icon: Timer, title: 'Built-in Pomodoro', desc: 'Real timer, never throttled. Every session saves directly to your database.' },
  { icon: Target, title: 'Priority View', desc: 'Always know what to study next. In Progress topics float to the top automatically.' },
]

const plans = [
  { name: 'Free', price: '$0', color: 'var(--emerald)', features: ['Daily Dashboard', 'Study Sessions + Pomodoro', 'Weekly Summary', '460+ AMBOSS Topic List'], missing: ['Full Curriculum', 'Anki System', 'UWorld Tracker'] },
  { name: 'Core', price: '$19', color: 'var(--blue)', popular: true, features: ['Everything in Free', '5-Level Curriculum Hierarchy', 'Priority View + Gap Analysis', 'Topic Stats + Mastery Level'], missing: ['Anki FSRS-5 System', 'UWorld Tracker'] },
  { name: 'Pro', price: '$39', color: 'var(--amber)', features: ['Everything in Core', 'Anki FSRS-5 Flashcard System', 'UWorld Question Tracker', 'Step Readiness Dashboard', 'Priority Email Support'], missing: [] },
]

const steps = [
  { title: 'Open Dashboard', desc: 'Start every morning from one page — everything you need is already there. No setup, no tabs.' },
  { title: 'Pick Your Topic', desc: 'Priority View shows the most important topic to study. In Progress floats to top automatically.' },
  { title: 'Study & Log Progress', desc: 'Update subtopic completion as you go. Every change rolls up through the hierarchy.' },
  { title: 'Log Pomodoros', desc: 'Built-in timer saves every session directly to your database. No more manual tracking.' },
  { title: 'Review & Improve', desc: 'Weekly summaries, UWorld analytics, and Anki reviews — all connected in one system.' },
]

export default function Landing() {
  return (
    <div className={styles.page}>
      <div className={styles.bg}>
        <div className={styles.blob1} />
        <div className={styles.blob2} />
        <div className={styles.blob3} />
      </div>

      <nav className={styles.nav}>
        <div className={styles.logo}>
          <GraduationCap size={22} strokeWidth={1.5} className={styles.logoIcon} />
          <span>MedStudy OS</span>
        </div>
        <div className={styles.navLinks}>
          <Link to="/login" className={styles.navBtn}>Sign In</Link>
          <Link to="/signup" className={`${styles.navBtn} ${styles.navBtnPrimary}`}>Get Started Free</Link>
        </div>
      </nav>

      <section className={styles.hero}>
        <div className={styles.heroTag}>
          <Sparkles size={12} strokeWidth={1.5} />
          Built for Medical Students
        </div>
        <h1 className={styles.heroTitle}>
          Stop juggling<br />
          <span className={styles.heroAccent}>5 different apps.</span>
        </h1>
        <p className={styles.heroSub}>
          MedStudy OS is a complete study system — curriculum tracker, Anki FSRS-5,
          UWorld analytics, and a built-in Pomodoro timer. Everything connected.
          Everything automatic.
        </p>
        <div className={styles.heroCta}>
          <Link to="/signup" className={styles.ctaPrimary}>
            Start Free — No Credit Card
            <ArrowRight size={16} strokeWidth={2} />
          </Link>
          <Link to="/login" className={styles.ctaSecondary}>Sign In</Link>
        </div>
        <div className={styles.heroStats}>
          {[
            { n: '460+', l: 'AMBOSS Topics' },
            { n: '19', l: 'Systems' },
            { n: '5', l: 'Levels Deep' },
            { n: 'FSRS-5', l: 'Anki Algorithm' },
          ].map((s, i) => (
            <div className={styles.stat} key={i}>
              <span className={styles.statN}>{s.n}</span>
              <span className={styles.statL}>{s.l}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.features}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Everything in one system</h2>
          <p className={styles.sectionSub}>Every feature exists because a real study problem needed solving.</p>
        </div>
        <div className={styles.featureGrid}>
          {features.map((f, i) => {
            const Icon = f.icon
            return (
              <div className={styles.featureCard} key={i}>
                <div className={styles.featureIconWrap}>
                  <Icon size={22} strokeWidth={1.5} />
                </div>
                <h3 className={styles.featureTitle}>{f.title}</h3>
                <p className={styles.featureDesc}>{f.desc}</p>
              </div>
            )
          })}
        </div>
      </section>

      <section className={styles.howItWorks}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Your daily workflow</h2>
          <p className={styles.sectionSub}>Five steps. One system. Zero friction.</p>
        </div>
        <div className={styles.steps}>
          {steps.map((s, i) => (
            <div className={styles.step} key={i}>
              <div className={styles.stepNum}>
                <Layers size={14} strokeWidth={2} />
                <span>{String(i + 1).padStart(2, '0')}</span>
              </div>
              <div className={styles.stepContent}>
                <div className={styles.stepTitle}>{s.title}</div>
                <div className={styles.stepDesc}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.pricing}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>One price. Full access.</h2>
          <p className={styles.sectionSub}>Start free. Upgrade when you are ready.</p>
        </div>
        <div className={styles.planGrid}>
          {plans.map((plan, i) => (
            <div className={`${styles.planCard} ${plan.popular ? styles.planPopular : ''}`} key={i}
              style={{ '--plan-color': plan.color }}>
              {plan.popular && <div className={styles.popularBadge}>Most Popular</div>}
              <div className={styles.planName}>{plan.name}</div>
              <div className={styles.planPrice}>{plan.price}</div>
              <div className={styles.planPriceSub}>one-time &middot; lifetime access</div>
              <div className={styles.planFeatures}>
                {plan.features.map((f, j) => (
                  <div className={styles.planFeature} key={j}>
                    <Check size={14} strokeWidth={2} className={styles.checkIcon} />
                    {f}
                  </div>
                ))}
                {plan.missing.map((f, j) => (
                  <div className={`${styles.planFeature} ${styles.planMissing}`} key={j}>
                    <span className={styles.missingDash}>—</span>
                    {f}
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

      <section className={styles.finalCta}>
        <h2 className={styles.finalTitle}>Start today. Free forever.</h2>
        <p className={styles.finalSub}>No credit card. No setup. Just sign up and your curriculum is ready in 30 seconds.</p>
        <Link to="/signup" className={styles.ctaPrimary}>
          Create Your Account
          <ArrowRight size={16} strokeWidth={2} />
        </Link>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerLogo}>
            <GraduationCap size={16} strokeWidth={1.5} />
            MedStudy OS
          </div>
          <div className={styles.footerSub}>Built for the physician you are becoming.</div>
        </div>
      </footer>
    </div>
  )
}