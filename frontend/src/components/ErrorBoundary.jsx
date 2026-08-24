import { Component } from "react";

class ErrorBoundary extends Component {

  constructor(props) {

    super(props);

    this.state = { hasError: false };

  }

  static getDerivedStateFromError() {

    return { hasError: true };

  }

  componentDidCatch(error, info) {

    console.error("UNCAUGHT UI ERROR:", error, info);

  }

  render() {

    if (this.state.hasError) {

      return (

        <div className="min-h-screen bg-ink-950 text-white flex items-center justify-center p-8 text-center">

          <div>

            <h1 className="text-2xl font-bold">
              Something went wrong
            </h1>

            <p className="text-slate-400 mt-2">
              Atlas hit an unexpected error. Reloading the page usually fixes it.
            </p>

            <button

              onClick={() => window.location.reload()}

              className="inline-block mt-6 bg-brand-600 hover:bg-brand-500 px-5 py-2 rounded-lg transition"

            >
              Reload
            </button>

          </div>

        </div>

      );

    }

    return this.props.children;

  }

}

export default ErrorBoundary;
