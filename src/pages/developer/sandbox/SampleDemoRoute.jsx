import { SandboxProvider } from './SandboxContext';
import SampleDemoTab from './SampleDemoTab';

// Single default-exported entry point so App.jsx can lazy-load this whole
// experimental-only route (provider + tab) in one chunk instead of bundling
// both eagerly into every user's initial load.
export default function SampleDemoRoute() {
  return (
    <SandboxProvider>
      <SampleDemoTab />
    </SandboxProvider>
  );
}
