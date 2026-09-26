// A 3D view that can't start (no WebGL: blocked or missing graphics driver) shows what to do
// instead of taking the whole window down with it.
import { Component, type ReactNode } from "react";

export class GlBoundary extends Component<{ what: string; children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  render() {
    if (!this.state.error) return this.props.children;
    const webgl = /webgl|context/i.test(this.state.error);
    return (
      <div className="gl-error">
        <h3>The {this.props.what} can't be shown</h3>
        {webgl ? (
          <>
            <p>This computer didn't give FLL Sim a working 3D (WebGL2) graphics context.</p>
            <ul>
              <li>Update the graphics driver (on Ubuntu: <code>sudo apt install mesa-utils libgl1-mesa-dri</code>, then restart).</li>
              <li>On WSL: update WSL from Windows (<code>wsl --update</code>) and the Windows graphics driver, then restart WSL (<code>wsl --shutdown</code>).</li>
              <li>In a virtual machine: turn on 3D acceleration in its display settings.</li>
            </ul>
            <p className="muted">Programs still run and the rest of the app works; only this view is missing.</p>
          </>
        ) : null}
        <p className="muted small">Details: {this.state.error}</p>
      </div>
    );
  }
}
