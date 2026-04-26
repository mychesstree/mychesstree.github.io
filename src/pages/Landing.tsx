import { Link } from 'react-router-dom'
import { 
  ChevronRight,
  CheckCircle
} from 'lucide-react'
import ReviewHeatmap from '../components/ReviewHeatmap'


export default function Landing() {


  return (
    <div className="landing-page">
      {/* Hero Section */}
      <section className="hero">
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
            <Link to="/demo" className="btn btn-secondary btn-large">
              View Demo
            </Link>
          </div>
        </div>
        <div className="hero-visual">
          <div className="demo-image-container-large">
            <img src="/demo.png" alt="chesstr.ee Demo" className="demo-image-large" />
          </div>
        </div>
      </section>


      {/* Activity Preview */}
      <section className="activity-preview">
        <div className="container">
          <h2 className="section-title">Track Your Progress</h2>
          <div className="activity-content">
            <div className="activity-description">
              <h3>Spaced Repetition System</h3>
              <p>Our intelligent scheduling ensures you review positions at the optimal time for memory retention. Track your daily practice habits and watch your opening knowledge grow.</p>
              <div className="activity-features">
                <div className="activity-feature">
                  <CheckCircle size={20} />
                  <span>Smart scheduling based on forgetting curves</span>
                </div>
                <div className="activity-feature">
                  <CheckCircle size={20} />
                  <span>Visual progress tracking</span>
                </div>
                <div className="activity-feature">
                  <CheckCircle size={20} />
                  <span>Daily review reminders</span>
                </div>
              </div>
            </div>
            <div className="heatmap-demo">
              <h4>Sample Activity Calendar</h4>
              <ReviewHeatmap />
              <p className="heatmap-caption">Color intensity shows review frequency - pink for past, gray for scheduled</p>
            </div>
          </div>
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
