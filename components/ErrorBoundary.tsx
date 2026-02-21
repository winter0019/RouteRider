import React from "react";

type Props = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

type State = {
  hasError: boolean;
  error?: any;
};

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, info: any) {
    console.error("❌ UI Crash:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-red-700 font-bold">
            <div className="text-lg font-black">Page crashed</div>
            <div className="text-xs mt-2 whitespace-pre-wrap">
              {String(this.state.error?.message || this.state.error || "Unknown error")}
            </div>
            <div className="text-[10px] mt-4 text-red-600">
              Open Console → copy the first red error line and send it to me.
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
