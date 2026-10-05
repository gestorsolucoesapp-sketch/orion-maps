export default function AppVersion(){
  const sha=process.env.VERCEL_GIT_COMMIT_SHA?.slice(0,7)||"local";
  return <div className="app-version-badge" title={`Orion Maps v0.3.12 · build ${sha}`}>
    <span className="app-version-name">Orion Maps</span>
    <strong>v0.3.12</strong>
    <span className="app-version-build">build {sha}</span>
  </div>;
}
