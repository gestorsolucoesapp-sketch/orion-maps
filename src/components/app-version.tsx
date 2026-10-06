import { APP_VERSION } from "@/lib/version";

export default function AppVersion(){
  const sha=process.env.VERCEL_GIT_COMMIT_SHA?.slice(0,7)||"local";
  return <div className="app-version-badge" title={`Orion Maps v${APP_VERSION} · build ${sha}`}>
    <span className="app-version-name">Orion Maps</span>
    <strong>v{APP_VERSION}</strong>
    <span className="app-version-build">build {sha}</span>
  </div>;
}
