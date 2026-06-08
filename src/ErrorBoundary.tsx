import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

/**
 * Top-level error boundary. Without this, any throw inside the React tree
 * (HandLandmarker init failure, Canvas API rejection, JSON.parse, etc.)
 * will black-screen the whole app. With this, the user sees a friendly
 * fallback and a "reload" button instead.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface the error so the user can copy it when reporting issues.
    // This is client-side only, never persisted or sent off-device.
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  private handleReload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="error-boundary" role="alert">
        <h1>页面出了点问题</h1>
        <p>刚刚发生了一个意外错误。你可以试试：</p>
        <ul>
          <li>刷新页面重新开始</li>
          <li>刷新后切到「鼠标 / 键盘」模式继续体验</li>
        </ul>
        <pre className="error-boundary-detail">{this.state.error.message}</pre>
        <button type="button" className="error-boundary-retry" onClick={this.handleReload}>
          刷新页面
        </button>
      </div>
    )
  }
}
