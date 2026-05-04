import { Component, ErrorInfo, ReactNode } from 'react'
import { captureError } from '@/lib/sentry'
import AppError from '@/pages/AppError'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureError(error, { componentStack: info.componentStack ?? undefined })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined })
  }

  render() {
    if (this.state.hasError) {
      return <AppError error={this.state.error} onReset={this.handleReset} />
    }
    return this.props.children
  }
}
