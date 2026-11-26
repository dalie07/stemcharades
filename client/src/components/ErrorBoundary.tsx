import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button, Screen, TextLink, mutedClass } from "./ui";

interface State {
  failed: boolean;
}

/**
 * A rendering bug must not leave a blank page in the middle of a class. Show a way back instead; an online
 * player's seat is kept by the server, so reloading puts them straight back in the game.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("render failed", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Screen centered>
        <h1 className="font-chalk text-3xl">Something went wrong</h1>
        <p className={mutedClass}>Reloading usually fixes it. If you were in an online room, you will keep your seat.</p>
        <Button onClick={() => location.reload()}>Reload</Button>
        <TextLink href="#/" onClick={() => this.setState({ failed: false })}>
          Go to the home screen
        </TextLink>
      </Screen>
    );
  }
}
