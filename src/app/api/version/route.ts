export const dynamic = "force-dynamic";

export async function GET(){
  const build=process.env.VERCEL_GIT_COMMIT_SHA?.slice(0,7)||"local";
  return Response.json(
    {build,version:"0.3.7"},
    {headers:{"Cache-Control":"no-store, no-cache, must-revalidate, proxy-revalidate","Pragma":"no-cache","Expires":"0"}}
  );
}
