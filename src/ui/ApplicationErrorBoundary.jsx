import { Component } from "react";

export default class ApplicationErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, details) {
    globalThis.console?.error?.("Nightforge render failure", error, details);
  }

  reload = () => {
    if (typeof this.props.onReload === "function") this.props.onReload();
    else globalThis.location?.reload?.();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="app nf-state-responsive-shell nf-state-fatal-root">
        <main className="viewport">
          <section className="void-state nf-state-fatal-error" role="alert">
            <span className="void-orb" aria-hidden="true">!</span>
            <span className="kicker kicker-brass">Nightforge recovery</span>
            <h1>The forge lost its footing</h1>
            <p>An unexpected display error stopped this view. Your last verified browser save remains intact.</p>
            <button className="btn btn-key" type="button" onClick={this.reload}>
              Reload Nightforge
            </button>
          </section>
        </main>
      </div>
    );
  }
}
