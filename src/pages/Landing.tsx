import { Link } from 'react-router-dom'
import {
  ChevronRight,
  CheckCircle,
  GitBranch
} from 'lucide-react'
import SEO from '../components/SEO'
import LandingForceTree from '../components/LandingForceTree'
import LandingReviewHeatmap from '../components/LandingReviewHeatmap'


export default function Landing() {


  return (
    <div className="landing-page">
      <SEO
        title="chesstr.ee | Chess Opening Repertoire Trainer"
        description="Build, visualize, and memorize your chess opening repertoire with interactive opening trees, PGN import, and spaced repetition review."
        path="/"
        structuredData={{
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: 'chesstr.ee',
          applicationCategory: 'EducationalApplication',
          operatingSystem: 'Web',
          url: 'https://chesstr.ee/',
          description: 'A chess opening repertoire trainer for building visual opening trees, importing PGNs, and reviewing lines with spaced repetition.',
          image: 'https://chesstr.ee/demo.png',
          offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'USD',
          },
        }}
      />
      {/* Hero Section */}
      <section className="hero">
        <LandingForceTree />
        <div className="hero-content">
          <h1 className="hero-title">
            Master Your Openings with
            <span className="brand-name">
              {' '}chesstr<span className="brand-suffix">.ee</span>
            </span>
          </h1>
          <p className="hero-subtitle">
            Build, organize, and perfect your chess opening repertoire with intelligent tree visualization
            and spaced repetition learning.
          </p>
          <div className="hero-actions">
            <Link to="/login" className="btn btn-primary btn-large">
              Get Started Free
              <ChevronRight size={20} />
            </Link>
            <Link to="/editor/839fc96f-edfd-477b-b114-390e1a6f52e2" className="btn btn-secondary btn-large">
              Explore Tree
              <GitBranch size={20} />
            </Link>
          </div>
        </div>
      </section>


      {/* Activity Preview */}
      <section className="activity-preview" style={{ position: 'relative' }}>
        <LandingReviewHeatmap />   {/* sits in the background */}
        <div className="container" style={{ position: 'relative', zIndex: 1, height: '500px'}}>
          <h2 className="hero-title" >
            Spaced Repetition
          </h2>
          Remember your lines and play with confidence
        </div>
      </section>

      {/* How It Works */}
      <section className="how-it-works">
        <div className="container">
          <h2 className="section-title">How It Works</h2>
          <div className="steps">
            <div className="step">
              <div className="step-number">1</div>
              <h3>Create Your Tree</h3>
              <p>Start with your first opening line or import existing games</p>
            </div>
            <div className="step">
              <div className="step-number">2</div>
              <h3>Build & Explore</h3>
              <p>Add variations, master games, and your own analysis</p>
            </div>
            <div className="step">
              <div className="step-number">3</div>
              <h3>Practice & Review</h3>
              <p>Use spaced repetition to reinforce your knowledge</p>
            </div>
          </div>
        </div>
      </section>


      {/* CTA Section */}
      <section className="cta">
        <div className="container">
          <h2 className="cta-title">Ready to Transform Your Opening Play?</h2>
          <p className="cta-subtitle">
            Join thousands of players who have improved their chess with chesstr.ee
          </p>
          <div className="cta-actions">
            <Link to="/login" className="btn btn-primary btn-large">
              Start Free Today
              <ChevronRight size={20} />
            </Link>
            <Link to="/pricing" className="btn btn-secondary btn-large">
              View Pricing
            </Link>
          </div>
          <div className="cta-features">
            <div className="cta-feature">
              <CheckCircle size={20} />
              <span>Free forever for basic features</span>
            </div>
            <div className="cta-feature">
              <CheckCircle size={20} />
              <span>No credit card required</span>
            </div>
            <div className="cta-feature">
              <CheckCircle size={20} />
              <span>Cancel anytime</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
