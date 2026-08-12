import { cookies } from "next/headers";
import { SwaggerWorkspace } from "@/components/swagger-workspace";
import { AUTH_TOKEN_COOKIE, isTokenValid } from "@/lib/auth";

export default async function Home() {
  const cookieStore = await cookies();
  const isAuthenticated = isTokenValid(
    cookieStore.get(AUTH_TOKEN_COOKIE)?.value,
  );

  return (
    <div className="flex w-full flex-1 px-4 py-8 md:px-8 lg:px-10">
      <SwaggerWorkspace initialIsAuthenticated={isAuthenticated} />
    </div>
  );
}
